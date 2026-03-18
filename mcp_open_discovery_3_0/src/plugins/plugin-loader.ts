import fs from 'fs';
import path from 'path';
import Module from 'module';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { PluginManifestV2 } from '../types';
import { verifyDistHash } from './integrity/hash-utils';

const RESTRICTED_MODULES = ['fs', 'child_process', 'net', 'dgram', 'tls', 'http', 'https', 'dns'] as const;

function envFlag(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (typeof value === 'undefined') {
    return defaultValue;
  }

  return /^(1|true|yes|on)$/i.test(value);
}

function isRelativeRequest(request: string): boolean {
  return request.startsWith('./') || request.startsWith('../') || request.startsWith('/') || request.startsWith('file:');
}

function isCoreModule(request: string): boolean {
  return Module.builtinModules.includes(request);
}

function getCapabilityNames(values: string[] | undefined): Set<string> {
  return new Set(values ?? []);
}

function getGlobalDependencyAllowlist(): Set<string> | null {
  try {
    const allowFile = path.resolve(process.cwd(), 'tools', 'plugins', 'allowlist-deps.json');
    if (!fs.existsSync(allowFile)) {
      return null;
    }

    const raw = JSON.parse(fs.readFileSync(allowFile, 'utf8')) as unknown;
    if (Array.isArray(raw)) {
      return new Set(raw.filter((value): value is string => typeof value === 'string'));
    }
    if (raw && typeof raw === 'object') {
      const record = raw as { allow?: unknown; dependencies?: unknown };
      if (Array.isArray(record.allow)) {
        return new Set(record.allow.filter((value): value is string => typeof value === 'string'));
      }
      if (Array.isArray(record.dependencies)) {
        return new Set(record.dependencies.filter((value): value is string => typeof value === 'string'));
      }
    }
  } catch {
  }

  return null;
}

function validateDependencyPolicy(manifest: PluginManifestV2): void {
  const policy = manifest.dependenciesPolicy ?? 'bundled-only';
  const allowRuntimeDeps = envFlag('PLUGIN_ALLOW_RUNTIME_DEPS');
  const strictIntegrity = envFlag('STRICT_INTEGRITY');

  if (policy === 'external-allowed' && !allowRuntimeDeps) {
    throw new Error('Plugin expects external dependencies but runtime deps are disabled');
  }

  if (policy === 'external-allowlist' && !allowRuntimeDeps) {
    throw new Error('external-allowlist policy requires PLUGIN_ALLOW_RUNTIME_DEPS=true');
  }

  if (policy === 'sandbox-required' && !envFlag('SANDBOX_AVAILABLE')) {
    throw new Error("dependenciesPolicy 'sandbox-required' but SANDBOX_AVAILABLE=false");
  }

  if ((manifest.externalDependencies?.length ?? 0) > 0 && policy === 'bundled-only') {
    throw new Error("externalDependencies provided but dependenciesPolicy is 'bundled-only'");
  }

  if (policy === 'external-allowlist' && strictIntegrity) {
    const missingIntegrity = (manifest.externalDependencies ?? []).filter((dependency) => {
      return !dependency.integrity && !(Array.isArray(dependency.integrities) && dependency.integrities.length > 0);
    });
    if (missingIntegrity.length > 0) {
      throw new Error(`STRICT_INTEGRITY: ${missingIntegrity.length} allowlisted externalDependencies missing integrity`);
    }
  }
}

function staticSecurityScan(distDir: string, manifest: PluginManifestV2): void {
  const permissions = manifest.permissions ?? {};
  const allowedModules = new Set<string>();
  const policy = manifest.dependenciesPolicy ?? 'bundled-only';

  if (permissions.network) {
    ['net', 'dns', 'http', 'https', 'tls'].forEach((moduleName) => allowedModules.add(moduleName));
  }
  if (permissions.fsRead || permissions.fsWrite) {
    allowedModules.add('fs');
  }
  if (permissions.exec) {
    allowedModules.add('child_process');
  }

  const violations: string[] = [];
  const allowNative = envFlag('PLUGIN_ALLOW_NATIVE');

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !/\.(m?js|cjs|js)$/i.test(entry.name)) {
        continue;
      }

      const source = fs.readFileSync(fullPath, 'utf8');
      const relativePath = path.relative(distDir, fullPath).replace(/\\/g, '/');

      for (const restrictedModule of RESTRICTED_MODULES) {
        const escaped = restrictedModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!allowedModules.has(restrictedModule)) {
          if (new RegExp(`require\\(\\s*['\"]${escaped}['\"]\\s*\\)`).test(source)) {
            violations.push(`${restrictedModule} import in ${relativePath}`);
          }
          if (new RegExp(`from\\s+['\"]${escaped}['\"]`).test(source)) {
            violations.push(`${restrictedModule} import in ${relativePath}`);
          }
        }
      }

      if (!allowNative && /require\(\s*['\"][^'\"]+\.node['\"]\s*\)/i.test(source)) {
        violations.push(`native addon (.node) require in ${relativePath} (PLUGIN_ALLOW_NATIVE=false)`);
      }

      if (policy === 'sandbox-required') {
        if (/\beval\s*\(/.test(source)) {
          violations.push(`eval() usage in ${relativePath}`);
        }
        if (/new\s+Function\s*\(/.test(source)) {
          violations.push(`new Function() usage in ${relativePath}`);
        }
      }
    }
  }

  walk(distDir);

  if (violations.length > 0) {
    throw new Error(`Security scan failed: ${violations.join('; ')}`);
  }
}

function reconcileCapabilities(manifest: PluginManifestV2, captured: CapturedRegistrations): void {
  if (!manifest.capabilities) {
    return;
  }

  const strictCapabilities = envFlag('STRICT_CAPABILITIES') || envFlag('PLUGIN_STRICT_CAPABILITIES');
  const declared = {
    tools: getCapabilityNames(manifest.capabilities.tools),
    resources: getCapabilityNames(manifest.capabilities.resources),
    prompts: getCapabilityNames(manifest.capabilities.prompts),
  };
  const actual = {
    tools: new Set(captured.tools.map((tool) => tool.name)),
    resources: new Set(captured.resources.map((resource) => resource.name)),
    prompts: new Set(captured.prompts.map((prompt) => prompt.name)),
  };

  const diff = (left: Set<string>, right: Set<string>) => ({
    missing: [...left].filter((value) => !right.has(value)),
    extra: [...right].filter((value) => !left.has(value)),
  });

  const toolDiff = diff(declared.tools, actual.tools);
  const resourceDiff = diff(declared.resources, actual.resources);
  const promptDiff = diff(declared.prompts, actual.prompts);

  if (
    toolDiff.missing.length === 0 &&
    toolDiff.extra.length === 0 &&
    resourceDiff.missing.length === 0 &&
    resourceDiff.extra.length === 0 &&
    promptDiff.missing.length === 0 &&
    promptDiff.extra.length === 0
  ) {
    return;
  }

  const message = `[Plugin Loader] Capability mismatch for '${manifest.name}': ` +
    `tools missing=${toolDiff.missing.join(',')} extra=${toolDiff.extra.join(',')} ` +
    `resources missing=${resourceDiff.missing.join(',')} extra=${resourceDiff.extra.join(',')} ` +
    `prompts missing=${promptDiff.missing.join(',')} extra=${promptDiff.extra.join(',')}`;

  if (strictCapabilities) {
    throw new Error(message);
  }

  console.warn(message);
}

async function runCreatePluginWithRuntimeGuards(
  server: McpServer,
  rootDir: string,
  manifest: PluginManifestV2,
  createPlugin: (server: McpServer) => Promise<void> | void,
): Promise<CapturedRegistrations> {
  const captured: CapturedRegistrations = { tools: [], resources: [], prompts: [] };
  const proxy = createCaptureProxy(server, captured);
  const pluginRoot = path.resolve(rootDir);
  const policy = manifest.dependenciesPolicy ?? 'bundled-only';
  const allowRuntimeDeps = envFlag('PLUGIN_ALLOW_RUNTIME_DEPS');
  const strictIntegrity = envFlag('STRICT_INTEGRITY');
  const allowNative = envFlag('PLUGIN_ALLOW_NATIVE');
  const permissions = manifest.permissions ?? {};
  const allowedRestrictedModules = new Set<string>();
  const externalAllowlist = new Set((manifest.externalDependencies ?? []).map((dependency) => dependency.name));
  const globalAllowlist = getGlobalDependencyAllowlist();

  if (permissions.network) {
    ['net', 'dns', 'http', 'https', 'tls'].forEach((moduleName) => allowedRestrictedModules.add(moduleName));
  }
  if (permissions.fsRead || permissions.fsWrite) {
    allowedRestrictedModules.add('fs');
  }
  if (permissions.exec) {
    allowedRestrictedModules.add('child_process');
  }

  type ModuleLoad = (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
  const moduleWithPrivateLoad = Module as unknown as { _load: ModuleLoad };
  const originalLoad = moduleWithPrivateLoad._load;

  try {
    moduleWithPrivateLoad._load = function patchedLoad(request, parent, isMain) {
      const parentFile = parent?.filename ?? '';
      if (parentFile.startsWith(pluginRoot)) {
        if (RESTRICTED_MODULES.includes(request as (typeof RESTRICTED_MODULES)[number]) && !allowedRestrictedModules.has(request)) {
          throw new Error(`Plugin '${manifest.name}' attempted to require restricted core module '${request}' without permission`);
        }

        if (typeof request === 'string' && /\.node$/i.test(request) && !allowNative) {
          throw new Error(`Native addon requires are disabled (PLUGIN_ALLOW_NATIVE=false): ${request}`);
        }

        if (typeof request === 'string' && !isCoreModule(request) && !isRelativeRequest(request)) {
          if (!allowRuntimeDeps) {
            throw new Error(`External dependency '${request}' denied (PLUGIN_ALLOW_RUNTIME_DEPS disabled)`);
          }

          if (policy !== 'external-allowed' && policy !== 'external-allowlist' && policy !== 'sandbox-required') {
            throw new Error(`External dependency '${request}' denied by dependenciesPolicy='${policy}'`);
          }

          if ((policy === 'external-allowlist' || policy === 'sandbox-required') && !externalAllowlist.has(request)) {
            throw new Error(`External dependency '${request}' not in manifest.externalDependencies allowlist`);
          }

          if (globalAllowlist && !globalAllowlist.has(request)) {
            const message = `External dependency '${request}' not in global allowlist`;
            if (strictIntegrity) {
              throw new Error(message);
            }
            console.warn(`[Plugin Loader] ${message}`);
          }
        }
      }

      return originalLoad.call(this, request, parent, isMain);
    };

    await createPlugin(proxy);
  } finally {
    moduleWithPrivateLoad._load = originalLoad;
  }

  reconcileCapabilities(manifest, captured);
  return captured;
}

export interface CapturedRegistrations {
  tools: Array<{ name: string; config: unknown; handler: unknown }>;
  resources: Array<{ name: string; uriOrTemplate: unknown; metadata: unknown; reader: unknown }>;
  prompts: Array<{ name: string; config: unknown; handler: unknown }>;
}

export interface PluginLoadResult {
  captured: CapturedRegistrations;
}

type ExtendedMcpServer = McpServer & {
  tool?: (name: string, config: unknown, handler: unknown) => unknown;
  resource?: (name: string, uriOrTemplate: unknown, reader: unknown) => unknown;
  prompt?: (name: string, descriptionOrConfig: unknown, schemaOrHandler: unknown, handler?: unknown) => unknown;
  registerResource?: (name: string, uriOrTemplate: unknown, metadata: unknown, reader: unknown) => unknown;
  registerPrompt?: (name: string, config: unknown, handler: unknown) => unknown;
};

function normalizePromptConfig(descriptionOrConfig: unknown, schemaOrHandler: unknown): unknown {
  if (typeof descriptionOrConfig === 'string') {
    return {
      description: descriptionOrConfig,
      argsSchema: schemaOrHandler,
    };
  }

  return descriptionOrConfig;
}

function createCaptureProxy(server: McpServer, captured: CapturedRegistrations): McpServer {
  return new Proxy(server, {
    get(target, property, receiver) {
      if (property === 'registerTool') {
        return (name: string, config: unknown, handler: unknown) => {
          captured.tools.push({ name, config, handler });
          return true;
        };
      }

      if (property === 'tool') {
        return (name: string, config: unknown, handler: unknown) => {
          captured.tools.push({ name, config, handler });
          return true;
        };
      }

      if (property === 'registerResource') {
        return (name: string, uriOrTemplate: unknown, metadata: unknown, reader: unknown) => {
          captured.resources.push({ name, uriOrTemplate, metadata, reader });
          return true;
        };
      }

      if (property === 'resource') {
        return (name: string, uriOrTemplate: unknown, reader: unknown) => {
          captured.resources.push({ name, uriOrTemplate, metadata: { uri: uriOrTemplate }, reader });
          return true;
        };
      }

      if (property === 'registerPrompt') {
        return (name: string, config: unknown, handler: unknown) => {
          captured.prompts.push({ name, config, handler });
          return true;
        };
      }

      if (property === 'prompt') {
        return (name: string, descriptionOrConfig: unknown, schemaOrHandler: unknown, handler?: unknown) => {
          const promptHandler = handler ?? schemaOrHandler;
          const promptConfig = handler
            ? normalizePromptConfig(descriptionOrConfig, schemaOrHandler)
            : descriptionOrConfig;
          captured.prompts.push({ name, config: promptConfig, handler: promptHandler });
          return true;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  }) as McpServer;
}

function resolvePluginEntry(rootDir: string, manifest: PluginManifestV2): string {
  const entryPath = path.join(rootDir, manifest.entry);
  if (!fs.existsSync(entryPath)) {
    throw new Error(`Plugin entry not found: ${entryPath}`);
  }
  return entryPath;
}

function validatePluginRoot(rootDir: string, manifest: PluginManifestV2): void {
  if (manifest.manifestVersion !== '2') {
    throw new Error(`Unsupported manifest version for ${manifest.name}: ${manifest.manifestVersion}`);
  }

  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error(`dist directory missing for plugin ${manifest.name}`);
  }

  if (!verifyDistHash(distDir, manifest.dist.hash)) {
    throw new Error(`dist hash mismatch for plugin ${manifest.name}`);
  }

  validateDependencyPolicy(manifest);
  staticSecurityScan(distDir, manifest);
}

async function importPluginModule(entryPath: string): Promise<Record<string, unknown>> {
  delete require.cache[require.resolve(entryPath)];
  return require(entryPath) as Record<string, unknown>;
}

function extractCreatePlugin(moduleExports: Record<string, unknown>): (server: McpServer) => Promise<void> | void {
  const defaultExport = moduleExports.default as { createPlugin?: unknown } | undefined;
  const createPlugin =
    typeof moduleExports.createPlugin === 'function'
      ? (moduleExports.createPlugin as (server: McpServer) => Promise<void> | void)
      : typeof defaultExport?.createPlugin === 'function'
        ? (defaultExport.createPlugin as (server: McpServer) => Promise<void> | void)
        : null;

  if (!createPlugin) {
    throw new Error('Plugin entry does not export createPlugin(server)');
  }

  return createPlugin;
}

async function forwardCapturedRegistrations(server: McpServer, captured: CapturedRegistrations): Promise<void> {
  const extendedServer = server as ExtendedMcpServer;

  for (const tool of captured.tools) {
    if (typeof server.registerTool === 'function') {
      server.registerTool(tool.name, tool.config as never, tool.handler as never);
    } else if (typeof extendedServer.tool === 'function') {
      extendedServer.tool(tool.name, tool.config, tool.handler);
    }
  }

  for (const resource of captured.resources) {
    if (typeof extendedServer.registerResource === 'function') {
      extendedServer.registerResource(resource.name, resource.uriOrTemplate, resource.metadata, resource.reader);
    } else if (typeof extendedServer.resource === 'function') {
      extendedServer.resource(resource.name, resource.uriOrTemplate, resource.reader);
    }
  }

  for (const prompt of captured.prompts) {
    if (typeof extendedServer.registerPrompt === 'function') {
      extendedServer.registerPrompt(prompt.name, prompt.config, prompt.handler);
    } else if (typeof extendedServer.prompt === 'function') {
      const promptConfig = prompt.config as { description?: unknown; argsSchema?: unknown } | undefined;
      if (promptConfig && typeof promptConfig === 'object' && ('description' in promptConfig || 'argsSchema' in promptConfig)) {
        extendedServer.prompt(prompt.name, promptConfig.description, promptConfig.argsSchema, prompt.handler);
      } else {
        extendedServer.prompt(prompt.name, prompt.config, prompt.handler);
      }
    }
  }
}

export async function loadAndRegisterPlugin(
  server: McpServer,
  rootDir: string,
  manifest: PluginManifestV2,
): Promise<PluginLoadResult> {
  validatePluginRoot(rootDir, manifest);
  const entryPath = resolvePluginEntry(rootDir, manifest);
  const moduleExports = await importPluginModule(entryPath);
  const createPlugin = extractCreatePlugin(moduleExports);
  const captured = await runCreatePluginWithRuntimeGuards(server, rootDir, manifest, createPlugin);
  await forwardCapturedRegistrations(server, captured);

  return { captured };
}