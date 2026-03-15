import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import axios from 'axios';
import crypto from 'crypto';
import fsSync from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import type {
  MarketplacePlugin,
  PluginActivateOptions,
  PluginActivateResult,
  PluginDeactivateResult,
  PluginHotSwapResult,
  PluginInstallOptions,
  PluginInstallResult,
  PluginManifestV2,
  PluginSummary,
  PluginUninstallResult,
} from '../types';
import {
  auditLog,
  deletePlugin,
  getAllPlugins,
  getCurrentExtraction,
  getPlugin,
  getPluginByName,
  insertPlugin,
  saveExtractionRecord,
  setPluginLifecycleState,
} from './db/plugin-db';
import { loadAndRegisterPlugin, type CapturedRegistrations } from './plugin-loader';
import { verifySignatures } from './integrity/signature-verifier';
import { MarketplaceClient } from './marketplace/marketplace-client';
import { importPluginFromFile } from './marketplace/local-import';
import {
  publishPromptsListChanged,
  publishResourcesListChanged,
  publishToolsListChanged,
} from '../runtime/notifications';

let mcpServerRef: McpServer | null = null;
const activeRegistrations = new Map<string, CapturedRegistrations>();

const PLUGINS_ROOT = process.env.PLUGINS_ROOT || path.join(process.cwd(), 'plugins');
const EXTRACT_ROOT = path.join(PLUGINS_ROOT, '.installed');
const BUILTIN_SOURCE_ROOT = path.join(process.cwd(), 'plugins', 'src');

interface InstalledArtifact {
  manifest: PluginManifestV2;
  bundle: Buffer;
  extractedPath: string;
  payloadChecksumVerified: boolean;
  payloadSignatureVerified: boolean;
  sourceUrl: string | null;
  sourceType: 'marketplace' | 'local';
}

interface ExtendedMcpServer extends McpServer {
  unregisterTool?: (name: string) => Promise<void> | void;
  unregisterResource?: (name: string) => Promise<void> | void;
  unregisterPrompt?: (name: string) => Promise<void> | void;
}

function pluginId(manifest: PluginManifestV2): string {
  return `${manifest.name}@${manifest.version}`;
}

async function publishCapabilityListChanged(manifest: PluginManifestV2): Promise<void> {
  const tasks: Array<Promise<boolean>> = [];

  if ((manifest.capabilities?.tools?.length ?? 0) > 0) {
    tasks.push(publishToolsListChanged());
  }
  if ((manifest.capabilities?.resources?.length ?? 0) > 0) {
    tasks.push(publishResourcesListChanged());
  }
  if ((manifest.capabilities?.prompts?.length ?? 0) > 0) {
    tasks.push(publishPromptsListChanged());
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

async function ensureDirectory(directoryPath: string): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function copyDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  await ensureDirectory(destinationDir);
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }
    if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

function findBuiltinPluginRoot(pluginName: string): string | null {
  const candidate = path.join(BUILTIN_SOURCE_ROOT, pluginName);
  return fsSync.existsSync(candidate) ? candidate : null;
}

function resolvePluginRoot(pluginIdValue: string, manifest: PluginManifestV2): string {
  const extraction = getCurrentExtraction(pluginIdValue);
  if (extraction?.extraction_path && fsSync.existsSync(extraction.extraction_path)) {
    return extraction.extraction_path;
  }

  const builtinRoot = findBuiltinPluginRoot(manifest.name);
  if (builtinRoot) {
    return builtinRoot;
  }

  throw new Error(`No plugin root available for ${pluginIdValue}`);
}

async function unregisterCaptured(pluginIdValue: string): Promise<void> {
  const captured = activeRegistrations.get(pluginIdValue);
  if (!captured || !mcpServerRef) {
    return;
  }

  const extendedServer = mcpServerRef as ExtendedMcpServer;

  for (const tool of captured.tools) {
    if (typeof extendedServer.unregisterTool === 'function') {
      try {
        await extendedServer.unregisterTool(tool.name);
      } catch {
      }
    }
  }

  for (const resource of captured.resources) {
    if (typeof extendedServer.unregisterResource === 'function') {
      try {
        await extendedServer.unregisterResource(resource.name);
      } catch {
      }
    }
  }

  for (const prompt of captured.prompts) {
    if (typeof extendedServer.unregisterPrompt === 'function') {
      try {
        await extendedServer.unregisterPrompt(prompt.name);
      } catch {
      }
    }
  }

  activeRegistrations.delete(pluginIdValue);
}

function verifyPayloadChecksum(bundle: Buffer, checksum: string, algorithm?: string): boolean {
  const resolvedAlgorithm = algorithm ?? checksum.split(':', 1)[0] ?? 'sha256';
  const expectedChecksum = checksum.includes(':') ? checksum.split(':').slice(1).join(':') : checksum;
  const computedChecksum = crypto.createHash(resolvedAlgorithm).update(bundle).digest('hex');
  if (computedChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    throw new Error(
      `Payload checksum verification failed: expected ${resolvedAlgorithm}:${expectedChecksum}, got ${resolvedAlgorithm}:${computedChecksum}`,
    );
  }
  return true;
}

function verifyPayloadSignature(
  bundle: Buffer,
  signature: string,
  publicKeyPem: string,
  algorithm: NonNullable<PluginInstallOptions['signatureAlgorithm']> = 'RSA-SHA256',
): boolean {
  const signatureBuffer = Buffer.from(signature, 'base64');
  if (algorithm === 'Ed25519') {
    if (!crypto.verify(null, bundle, publicKeyPem, signatureBuffer)) {
      throw new Error('Payload signature verification failed');
    }
    return true;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(bundle);
  verifier.end();
  if (!verifier.verify(publicKeyPem, signatureBuffer)) {
    throw new Error('Payload signature verification failed');
  }
  return true;
}

function validateInstallOverrideShape(options: PluginInstallOptions): void {
  if (options.signature && !options.publicKey) {
    throw new Error('publicKey is required when signature is provided');
  }
  if (options.publicKey && !options.signature) {
    throw new Error('signature is required when publicKey is provided');
  }
  if (options.signatureAlgorithm && !options.signature) {
    throw new Error('signature is required when signatureAlgorithm is provided');
  }
  if (options.checksumAlgorithm && !options.checksum) {
    throw new Error('checksum is required when checksumAlgorithm is provided');
  }
}

async function loadInstallArtifact(source: string, options: PluginInstallOptions = {}): Promise<InstalledArtifact> {
  validateInstallOverrideShape(options);

  if (/^https?:\/\//i.test(source)) {
    const response = await axios.get<ArrayBuffer>(source, { responseType: 'arraybuffer' });
    const bundle = Buffer.from(response.data);
    const payloadChecksumVerified = options.checksum
      ? verifyPayloadChecksum(bundle, options.checksum, options.checksumAlgorithm)
      : false;
    const payloadSignatureVerified = options.signature && options.publicKey
      ? verifyPayloadSignature(bundle, options.signature, options.publicKey, options.signatureAlgorithm ?? 'RSA-SHA256')
      : false;
    const tempFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mcpod-remote-')), 'plugin.zip');
    await fs.writeFile(tempFile, bundle);
    const imported = await importPluginFromFile(tempFile);
    return {
      manifest: imported.manifest,
      bundle: imported.archiveData,
      extractedPath: imported.extractedPath,
      payloadChecksumVerified,
      payloadSignatureVerified,
      sourceUrl: source,
      sourceType: 'marketplace',
    };
  }

  const sourcePath = path.resolve(source);
  const stats = await fs.stat(sourcePath);
  if (stats.isDirectory()) {
    if (options.checksum || options.checksumAlgorithm || options.signature || options.publicKey || options.signatureAlgorithm) {
      throw new Error('Checksum and signature install overrides are supported for plugin archives, not directory installs');
    }

    const imported = await importPluginFromFile(sourcePath);
    return {
      manifest: imported.manifest,
      bundle: imported.archiveData,
      extractedPath: imported.extractedPath,
      payloadChecksumVerified: false,
      payloadSignatureVerified: false,
      sourceUrl: null,
      sourceType: 'local',
    };
  }

  const bundle = await fs.readFile(sourcePath);
  const payloadChecksumVerified = options.checksum
    ? verifyPayloadChecksum(bundle, options.checksum, options.checksumAlgorithm)
    : false;
  const payloadSignatureVerified = options.signature && options.publicKey
    ? verifyPayloadSignature(bundle, options.signature, options.publicKey, options.signatureAlgorithm ?? 'RSA-SHA256')
    : false;
  const imported = await importPluginFromFile(sourcePath);
  return {
    manifest: imported.manifest,
    bundle: imported.archiveData,
    extractedPath: imported.extractedPath,
    payloadChecksumVerified,
    payloadSignatureVerified,
    sourceUrl: null,
    sourceType: 'local',
  };
}

export function setMcpServer(server: McpServer): void {
  mcpServerRef = server;
}

export async function install(source: string, options: PluginInstallOptions = {}): Promise<PluginInstallResult> {
  const artifact = await loadInstallArtifact(source, options);
  const manifest = artifact.manifest;
  const id = pluginId(manifest);
  if (options.pluginId && options.pluginId !== id) {
    throw new Error(`Installed plugin ID mismatch: expected ${options.pluginId}, got ${id}`);
  }
  if (getPlugin(id)) {
    throw new Error(`Plugin already installed: ${id}`);
  }

  const signatureStatus = verifySignatures(manifest);
  const installTarget = path.join(EXTRACT_ROOT, id);
  await ensureDirectory(EXTRACT_ROOT);

  insertPlugin({
    id,
    name: manifest.name,
    version: manifest.version,
    manifest_json: JSON.stringify(manifest),
    bundle_blob: artifact.bundle,
    dist_hash: manifest.dist.hash,
    bundle_size_bytes: artifact.bundle.byteLength,
    signature_data: manifest.signatures ? JSON.stringify(manifest.signatures) : null,
    signature_verified: signatureStatus.verified ? 1 : 0,
    signer_key_id: signatureStatus.keyId,
    signer_type: signatureStatus.keyType,
    lifecycle_state: options.autoActivate ? 'active' : 'installed',
    is_builtin: options.isBuiltin ? 1 : 0,
    installed_at: new Date().toISOString(),
    installed_by: options.actor ?? 'system',
    source_url: artifact.sourceUrl,
    source_type: artifact.sourceType,
  });

  if (artifact.bundle.byteLength > 0) {
    await copyDirectory(artifact.extractedPath, installTarget);
    saveExtractionRecord(id, installTarget, manifest.dist.hash);
  } else {
    saveExtractionRecord(id, artifact.extractedPath, manifest.dist.hash);
  }

  if (options.autoActivate) {
    await activate(id, { actor: options.actor });
  }

  return {
    pluginId: id,
    manifest,
    signatureVerified: signatureStatus.verified,
    payloadChecksumVerified: artifact.payloadChecksumVerified,
    payloadSignatureVerified: artifact.payloadSignatureVerified,
  };
}

export async function activate(pluginIdValue: string, options: PluginActivateOptions = {}): Promise<PluginActivateResult> {
  const plugin = getPlugin(pluginIdValue);
  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginIdValue}`);
  }
  if (plugin.lifecycle_state === 'active') {
    const manifest = JSON.parse(plugin.manifest_json) as PluginManifestV2;
    return {
      activated: true,
      pluginId: pluginIdValue,
      toolCount: manifest.capabilities?.tools?.length,
      resourceCount: manifest.capabilities?.resources?.length,
      promptCount: manifest.capabilities?.prompts?.length,
      alreadyActive: true,
    };
  }

  const manifest = JSON.parse(plugin.manifest_json) as PluginManifestV2;
  if (mcpServerRef) {
    const rootDir = resolvePluginRoot(pluginIdValue, manifest);
    const loadResult = await loadAndRegisterPlugin(mcpServerRef, rootDir, manifest);
    activeRegistrations.set(pluginIdValue, loadResult.captured);
  }
  setPluginLifecycleState(pluginIdValue, 'active');
  auditLog(plugin.id, plugin.name, plugin.version, 'activated', options.actor ?? 'system');
  await publishCapabilityListChanged(manifest);
  return {
    activated: true,
    pluginId: pluginIdValue,
    toolCount: manifest.capabilities?.tools?.length,
    resourceCount: manifest.capabilities?.resources?.length,
    promptCount: manifest.capabilities?.prompts?.length,
  };
}

export async function deactivate(
  pluginIdValue: string,
  options: PluginActivateOptions = {},
): Promise<PluginDeactivateResult> {
  const plugin = getPlugin(pluginIdValue);
  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginIdValue}`);
  }

  await unregisterCaptured(pluginIdValue);
  setPluginLifecycleState(pluginIdValue, 'inactive');
  auditLog(plugin.id, plugin.name, plugin.version, 'deactivated', options.actor ?? 'system');
  await publishCapabilityListChanged(JSON.parse(plugin.manifest_json) as PluginManifestV2);
  return { deactivated: true, pluginId: pluginIdValue };
}

export async function update(
  pluginName: string,
  newSource: string,
  options: PluginActivateOptions = {},
): Promise<PluginHotSwapResult> {
  const previous = getPluginByName(pluginName);
  if (!previous) {
    throw new Error(`Plugin not found: ${pluginName}`);
  }

  setPluginLifecycleState(previous.id, 'updating');
  auditLog(previous.id, previous.name, previous.version, 'hot_swap_started', options.actor ?? 'system');

  const installed = await install(newSource, { actor: options.actor, autoActivate: true });
  const current = getPlugin(installed.pluginId);
  if (!current) {
    throw new Error(`Installed plugin not found after update: ${installed.pluginId}`);
  }

  await deactivate(previous.id, options);
  auditLog(current.id, current.name, current.version, 'hot_swap_completed', options.actor ?? 'system', {
    previousVersion: previous.id,
  });

  return {
    hotSwapped: true,
    previousVersion: previous.id,
    newVersion: current.id,
  };
}

export async function uninstall(
  pluginIdValue: string,
  options: PluginActivateOptions = {},
): Promise<PluginUninstallResult> {
  const plugin = getPlugin(pluginIdValue);
  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginIdValue}`);
  }

  await unregisterCaptured(pluginIdValue);
  setPluginLifecycleState(pluginIdValue, 'uninstalling');
  deletePlugin(pluginIdValue);
  auditLog(plugin.id, plugin.name, plugin.version, 'uninstalled', options.actor ?? 'system');
  await publishCapabilityListChanged(JSON.parse(plugin.manifest_json) as PluginManifestV2);
  return { uninstalled: true, pluginId: pluginIdValue };
}

export function list(filter?: { state?: string }): PluginSummary[] {
  return getAllPlugins(filter?.state ? { state: filter.state as PluginSummary['lifecycle_state'] } : undefined);
}

export async function listAvailableFromMarketplace(): Promise<MarketplacePlugin[]> {
  const baseUrl = process.env.MARKETPLACE_URL;
  if (!baseUrl) {
    return [];
  }

  const client = new MarketplaceClient({
    baseUrl,
    token: process.env.MARKETPLACE_TOKEN ?? null,
  });
  return client.listAvailable();
}

export function getMcpServer(): McpServer | null {
  return mcpServerRef;
}

export function getActiveRegistrations(): Map<string, CapturedRegistrations> {
  return activeRegistrations;
}