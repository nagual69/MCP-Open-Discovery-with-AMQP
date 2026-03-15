import fsSync from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

import type { PluginManifestV2 } from '../../types';
import { computeDistHash, computeDistHashFromZip } from '../integrity/hash-utils';

export interface LocalImportResult {
  manifest: PluginManifestV2;
  archiveData: Buffer;
  extractedPath: string;
}

async function importPluginFromDirectory(directoryPath: string): Promise<LocalImportResult> {
  const manifestPath = path.join(directoryPath, 'mcp-plugin.json');
  if (!fsSync.existsSync(manifestPath)) {
    throw new Error('Plugin directory is missing mcp-plugin.json');
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as PluginManifestV2;
  if (manifest.manifestVersion !== '2') {
    throw new Error('Plugin directory must contain a v2 manifest');
  }

  const distDir = path.join(directoryPath, 'dist');
  const computedHash = computeDistHash(distDir).hash;
  if (computedHash.toLowerCase() !== manifest.dist.hash.toLowerCase()) {
    throw new Error(`dist hash mismatch: manifest=${manifest.dist.hash} computed=${computedHash}`);
  }

  return {
    manifest,
    archiveData: Buffer.alloc(0),
    extractedPath: directoryPath,
  };
}

function findPluginRoot(entries: string[]): string {
  const topLevel = Array.from(new Set(entries.map((entry) => entry.split('/')[0]).filter(Boolean)));
  return topLevel.length === 1 ? topLevel[0] : '';
}

export async function importPluginFromFile(filePath: string): Promise<LocalImportResult> {
  const stats = await fs.stat(filePath);
  if (stats.isDirectory()) {
    return importPluginFromDirectory(filePath);
  }

  const archiveData = await fs.readFile(filePath);
  const zip = new AdmZip(archiveData);
  const entryNames = zip.getEntries().map((entry) => entry.entryName);
  const rootPrefix = findPluginRoot(entryNames);
  const manifestEntry = zip.getEntry(rootPrefix ? `${rootPrefix}/mcp-plugin.json` : 'mcp-plugin.json');
  if (!manifestEntry) {
    throw new Error('Plugin archive is missing mcp-plugin.json');
  }

  const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as PluginManifestV2;
  if (manifest.manifestVersion !== '2') {
    throw new Error('Plugin archive must contain a v2 manifest');
  }

  const computedHash = computeDistHashFromZip(zip);
  if (computedHash.toLowerCase() !== manifest.dist.hash.toLowerCase()) {
    throw new Error(`dist hash mismatch: manifest=${manifest.dist.hash} computed=${computedHash}`);
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpod-plugin-'));
  zip.extractAllTo(tempRoot, true);
  return {
    manifest,
    archiveData,
    extractedPath: rootPrefix ? path.join(tempRoot, rootPrefix) : tempRoot,
  };
}