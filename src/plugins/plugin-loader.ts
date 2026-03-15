import fs from 'fs';
import path from 'path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { PluginManifestV2 } from '../types';
import { verifyDistHash } from './integrity/hash-utils';

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
  const captured: CapturedRegistrations = { tools: [], resources: [], prompts: [] };
  const proxy = createCaptureProxy(server, captured);

  await createPlugin(proxy);
  await forwardCapturedRegistrations(server, captured);

  return { captured };
}