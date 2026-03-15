import fs from 'node:fs';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import { computeDistHashDetailed } from './hash-utils';
import { getPluginDb, getPluginManager } from './host-adapter';
import { buildErrorResponse, buildJsonResponse, buildTextResponse, getErrorMessage, type ToolResponse } from './shared';
import {
  InstallAnnotations,
  InstallInputShape,
  ListInputShape,
  PluginManifest,
  PluginRecord,
  ReadAnnotations,
  RemoveAnnotations,
  RemoveInputShape,
  RescanInputShape,
  SearchInputShape,
  ShowInputShape,
  VerifyInputShape,
} from './types';

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations: Record<string, unknown>;
  handler: (...args: any[]) => Promise<ToolResponse>;
};

type UnknownRecord = Record<string, unknown>;
type HostPluginRecord = PluginRecord & { manifest: PluginManifest };

function parseManifest(manifestJson: string): PluginManifest {
  try {
    return JSON.parse(manifestJson) as PluginManifest;
  } catch {
    return {};
  }
}

function getPlugin(pluginId: string): HostPluginRecord | undefined {
  const record = getPluginDb().getPlugin(pluginId);
  if (!record) {
    return undefined;
  }

  return {
    ...record,
    manifest: parseManifest(record.manifest_json),
  };
}

function getAllPlugins(): HostPluginRecord[] {
  const db = getPluginDb();
  return db
    .getAllPlugins()
    .map((summary) => getPlugin(summary.id))
    .filter((plugin): plugin is HostPluginRecord => Boolean(plugin));
}

function getExtractionPath(pluginId: string, pluginName: string, pluginVersion: string): string {
  const extraction = getPluginDb().getCurrentExtraction(pluginId);
  if (extraction?.extraction_path) {
    return extraction.extraction_path;
  }

  return path.join(process.cwd(), 'data', 'plugin_extractions', `${pluginName}_at_${pluginVersion}`);
}

function toMarkdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(' | ')} |`;
  const divider = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return [header, divider, body].filter(Boolean).join('\n');
}

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_store_list',
    description: 'List all installed plugins and their status with statistics.',
    inputSchema: ListInputShape,
    annotations: ReadAnnotations,
    handler: async ({ response_format }) => {
      try {
        const plugins = getAllPlugins();
        const data = {
          stats: {
            total: plugins.length,
            active: plugins.filter((plugin) => plugin.lifecycle_state === 'active').length,
            inactive: plugins.filter((plugin) => plugin.lifecycle_state === 'inactive').length,
            installed: plugins.filter((plugin) => plugin.lifecycle_state === 'installed').length,
            error: plugins.filter((plugin) => plugin.lifecycle_state === 'error').length,
          },
          plugins: plugins.map((plugin) => ({
            id: plugin.id,
            name: plugin.name,
            version: plugin.version,
            state: plugin.lifecycle_state,
            is_builtin: plugin.is_builtin,
            description: plugin.manifest.description || '',
            tools: plugin.manifest.capabilities?.tools?.length ?? 0,
          })),
        };
        const rows = data.plugins.map((plugin) => [plugin.id, plugin.state, `${plugin.tools} tools`, plugin.description]);
        const markdown = `## Installed Plugins (${data.stats.total} total, ${data.stats.active} active)\n\n${toMarkdownTable(['ID', 'State', 'Tools', 'Description'], rows)}`;
        return buildTextResponse(data, markdown, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_store_list_policies',
    description: 'Show active plugin security policy and feature flags.',
    inputSchema: ListInputShape,
    annotations: ReadAnnotations,
    handler: async ({ response_format }) => {
      try {
        const data = {
          flags: {
            PLUGIN_ALLOW_RUNTIME_DEPS: process.env.PLUGIN_ALLOW_RUNTIME_DEPS || 'false',
            STRICT_CAPABILITIES: process.env.STRICT_CAPABILITIES || 'false',
            REQUIRE_SIGNATURES: process.env.REQUIRE_SIGNATURES || 'false',
            PLUGIN_REQUIRE_SIGNED: process.env.PLUGIN_REQUIRE_SIGNED || 'false',
            SANDBOX_AVAILABLE: process.env.SANDBOX_AVAILABLE || 'false',
            STRICT_SBOM: process.env.STRICT_SBOM || 'false',
            STRICT_INTEGRITY: process.env.STRICT_INTEGRITY || 'false',
            PLUGIN_ALLOW_NATIVE: process.env.PLUGIN_ALLOW_NATIVE || 'false',
            PLUGINS_ROOT: process.env.PLUGINS_ROOT || path.join(process.cwd(), 'plugins'),
            SCHEMA_PATH: process.env.SCHEMA_PATH || '(default)',
          },
        };
        const rows = Object.entries(data.flags).map(([key, value]) => [key, String(value)]);
        const markdown = `## Plugin Security Policies\n\n${toMarkdownTable(['Flag', 'Value'], rows)}`;
        return buildTextResponse(data, markdown, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_store_search',
    description: 'Search installed plugins by name, description, or type.',
    inputSchema: SearchInputShape,
    annotations: ReadAnnotations,
    handler: async ({ query, response_format, type }) => {
      try {
        const queryText = typeof query === 'string' ? query.toLowerCase() : '';
        const typeText = typeof type === 'string' ? type.toLowerCase() : '';
        const results = getAllPlugins()
          .filter((plugin) => {
            const haystack = `${plugin.name} ${plugin.id} ${plugin.manifest.description || ''}`.toLowerCase();
            const manifestType = (plugin.manifest.type || 'tool-module').toLowerCase();
            const queryMatch = !queryText || haystack.includes(queryText);
            const typeMatch = !typeText || manifestType === typeText;
            return queryMatch && typeMatch;
          })
          .map((plugin) => ({
            id: plugin.id,
            name: plugin.name,
            version: plugin.version,
            state: plugin.lifecycle_state,
            description: plugin.manifest.description || '',
            type: plugin.manifest.type || 'tool-module',
          }));
        const data = { count: results.length, results };
        const rows = results.map((plugin) => [plugin.id, plugin.state, plugin.description]);
        const markdown = `## Search Results (${data.count})\n\n${toMarkdownTable(['ID', 'State', 'Description'], rows)}`;
        return buildTextResponse(data, markdown, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_store_verify',
    description: 'Verify plugin dist hash, per-file checksums, and signature status.',
    inputSchema: VerifyInputShape,
    annotations: ReadAnnotations,
    handler: async ({ pluginId, strictIntegrity }) => {
      try {
        const plugin = getPlugin(pluginId);
        if (!plugin) {
          return buildErrorResponse(`Plugin not found: ${pluginId}`);
        }
        if (!plugin.manifest.dist?.hash) {
          return buildErrorResponse('Missing dist.hash in plugin manifest');
        }
        const rootDir = getExtractionPath(plugin.id, plugin.name, plugin.version);
        const distDir = path.join(rootDir, 'dist');
        if (!fs.existsSync(distDir)) {
          return buildErrorResponse(`dist directory not found at ${distDir}`);
        }

        const report: UnknownRecord = { pluginId: plugin.id, issues: [] as string[] };
        const { fileCount, files, hashHex, totalBytes } = computeDistHashDetailed(distDir);
        const declared = String(plugin.manifest.dist.hash).replace(/^sha256:/, '');
        const issues = report.issues as string[];
        report.hash = { declared, recomputed: hashHex, match: hashHex.toLowerCase() === declared.toLowerCase() };
        report.counts = {
          fileCountDeclared: plugin.manifest.dist.fileCount ?? null,
          totalBytesDeclared: plugin.manifest.dist.totalBytes ?? null,
          fileCountActual: fileCount,
          totalBytesActual: totalBytes,
        };

        const checksumEntries = plugin.manifest.dist.checksums?.files ?? [];
        const seen = new Set<string>();
        const mismatches: Array<Record<string, string>> = [];
        for (const entry of checksumEntries) {
          if (!entry.path || !entry.sha256) {
            continue;
          }
          const normalizedPath = entry.path.replace(/^dist\//, '').replace(/^\.\//, '');
          const absolutePath = path.join(distDir, normalizedPath);
          if (!fs.existsSync(absolutePath)) {
            issues.push(`Checksum path missing: ${entry.path}`);
            continue;
          }
          const actualHash = require('node:crypto').createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
          if (actualHash.toLowerCase() !== entry.sha256.toLowerCase()) {
            mismatches.push({ path: entry.path, declared: entry.sha256, actual: actualHash });
          }
          seen.add(normalizedPath);
        }
        report.checksums = { mismatchesCount: mismatches.length, mismatches: mismatches.slice(0, 5) };
        if (mismatches.length) {
          issues.push(`${mismatches.length} checksum mismatches`);
        }
        const requireCoverage = strictIntegrity === true || /^(1|true)$/i.test(process.env.STRICT_INTEGRITY || '');
        if (plugin.manifest.dist.coverage === 'all') {
          const missing = files.filter((file) => !seen.has(file));
          report.coverage = { required: true, missingCount: missing.length, sampleMissing: missing.slice(0, 5) };
          if (missing.length && requireCoverage) {
            issues.push(`coverage=all: ${missing.length} files lack checksums`);
          }
        } else {
          report.coverage = { required: false };
        }

        let lock: UnknownRecord | null = null;
        const lockPath = path.join(rootDir, 'install.lock.json');
        if (fs.existsSync(lockPath)) {
          try {
            lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as UnknownRecord;
          } catch {
            lock = null;
          }
        }
        report.signature = {
          lockVerified: lock?.signatureVerified === true,
          lockSignerKeyId: lock?.signerKeyId ?? null,
        };
        return buildJsonResponse(report);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_store_install',
    description: 'Install a plugin from an HTTP(S) URL or local file path.',
    inputSchema: InstallInputShape,
    annotations: InstallAnnotations,
    handler: async (args) => {
      try {
        const source = typeof args.url === 'string' && args.url ? args.url : typeof args.filePath === 'string' ? args.filePath : undefined;
        if (!source) {
          return buildErrorResponse('Either url or filePath is required');
        }
        const result = await getPluginManager().install(source, {
          actor: 'agent',
          autoActivate: args.autoLoad === true,
          pluginId: typeof args.pluginId === 'string' ? args.pluginId : undefined,
          checksum: typeof args.checksum === 'string' ? args.checksum : undefined,
          checksumAlgorithm: typeof args.checksumAlgorithm === 'string' ? args.checksumAlgorithm : undefined,
          signature: typeof args.signature === 'string' ? args.signature : undefined,
          publicKey: typeof args.publicKey === 'string' ? args.publicKey : undefined,
          signatureAlgorithm:
            args.signatureAlgorithm === 'Ed25519' || args.signatureAlgorithm === 'RSA-SHA256'
              ? args.signatureAlgorithm
              : undefined,
        });
        return buildJsonResponse(result);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_store_remove',
    description: 'Uninstall a plugin by ID.',
    inputSchema: RemoveInputShape,
    annotations: RemoveAnnotations,
    handler: async ({ pluginId }) => {
      try {
        return buildJsonResponse(await getPluginManager().uninstall(pluginId, { actor: 'agent' }));
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_store_show',
    description: 'Show detailed metadata for a plugin: manifest, lock file, and capabilities.',
    inputSchema: ShowInputShape,
    annotations: ReadAnnotations,
    handler: async ({ pluginId, response_format }) => {
      try {
        const plugin = getPlugin(pluginId);
        if (!plugin) {
          return buildErrorResponse(`Plugin not found: ${pluginId}`);
        }
        const rootDir = getExtractionPath(plugin.id, plugin.name, plugin.version);
        const lockPath = path.join(rootDir, 'install.lock.json');
        let lock: UnknownRecord | null = null;
        if (fs.existsSync(lockPath)) {
          try {
            lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as UnknownRecord;
          } catch {
            lock = null;
          }
        }
        const data = {
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          lifecycle_state: plugin.lifecycle_state,
          is_builtin: plugin.is_builtin,
          installed_at: plugin.installed_at,
          manifest: plugin.manifest,
          lock,
          capabilities: {
            tools: plugin.manifest.capabilities?.tools ?? [],
            resources: plugin.manifest.capabilities?.resources ?? [],
            prompts: plugin.manifest.capabilities?.prompts ?? [],
          },
        };
        return buildTextResponse(data, JSON.stringify(data, null, 2), response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_store_rescan',
    description: 'Recompute dist hash for a plugin and compare with the declared value.',
    inputSchema: RescanInputShape,
    annotations: ReadAnnotations,
    handler: async ({ pluginId, response_format }) => {
      try {
        const plugin = getPlugin(pluginId);
        if (!plugin) {
          return buildErrorResponse(`Plugin not found: ${pluginId}`);
        }
        if (!plugin.manifest.dist?.hash) {
          return buildErrorResponse('Plugin missing dist metadata');
        }
        const rootDir = getExtractionPath(plugin.id, plugin.name, plugin.version);
        const distDir = path.join(rootDir, 'dist');
        if (!fs.existsSync(distDir)) {
          return buildErrorResponse(`dist directory not found: ${distDir}`);
        }
        const { hashHex, fileCount, totalBytes } = computeDistHashDetailed(distDir);
        const declared = plugin.manifest.dist.hash.replace(/^sha256:/, '');
        const data = {
          pluginId: plugin.id,
          recomputed: { hash: `sha256:${hashHex}`, fileCount, totalBytes },
          declared: `sha256:${declared}`,
          match: hashHex.toLowerCase() === declared.toLowerCase(),
        };
        return buildTextResponse(data, JSON.stringify(data, null, 2), response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_store_security_report',
    description: 'Show an aggregated security report across all installed plugins.',
    inputSchema: ListInputShape,
    annotations: ReadAnnotations,
    handler: async ({ response_format }) => {
      try {
        const plugins = getAllPlugins();
        const details = plugins.map((plugin) => {
          const rootDir = getExtractionPath(plugin.id, plugin.name, plugin.version);
          const lockPath = path.join(rootDir, 'install.lock.json');
          let lockVerified = false;
          if (fs.existsSync(lockPath)) {
            try {
              const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as UnknownRecord;
              lockVerified = lock.signatureVerified === true;
            } catch {
              lockVerified = false;
            }
          }
          return {
            id: plugin.id,
            state: plugin.lifecycle_state,
            dependenciesPolicy: plugin.manifest.dependenciesPolicy || 'legacy',
            permissions: plugin.manifest.permissions || {},
            hasLock: fs.existsSync(lockPath),
            lockVerified,
            manifestVersion: plugin.manifest.manifestVersion || 'legacy',
          };
        });
        const data = {
          totalPlugins: plugins.length,
          activePlugins: plugins.filter((plugin) => plugin.lifecycle_state === 'active').length,
          policies: {
            REQUIRE_SIGNATURES: /^(1|true)$/i.test(process.env.REQUIRE_SIGNATURES || ''),
            STRICT_INTEGRITY: /^(1|true)$/i.test(process.env.STRICT_INTEGRITY || ''),
            STRICT_CAPABILITIES: /^(1|true)$/i.test(process.env.STRICT_CAPABILITIES || ''),
            SANDBOX_AVAILABLE: /^(1|true)$/i.test(process.env.SANDBOX_AVAILABLE || ''),
          },
          pluginDetails: details,
          summary: {
            unsignedPlugins: details.filter((detail) => !detail.lockVerified).length,
            legacyPlugins: details.filter((detail) => detail.manifestVersion === 'legacy').length,
          },
        };
        return buildTextResponse(data, JSON.stringify(data, null, 2), response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
];

export async function createPlugin(server: McpServer): Promise<void> {
  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      tool.handler as never,
    );
  }
}