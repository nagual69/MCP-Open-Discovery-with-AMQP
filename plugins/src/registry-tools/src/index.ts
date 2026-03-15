import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import { getPluginDb, getPluginManager } from './host-adapter';
import { buildErrorResponse, buildJsonResponse, buildTextResponse, getErrorMessage, type ToolResponse } from './shared';
import {
  AuditLogInputShape,
  InstallInputShape,
  ListPluginsInputShape,
  OpenReadAnnotations,
  PluginIdInputShape,
  ReadAnnotations,
  ReadOnlyResponseInputShape,
  RemoveAnnotations,
  SigningKeyInputShape,
  UpdateInputShape,
  WriteAnnotations,
} from './types';

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations: Record<string, unknown>;
  handler: (...args: any[]) => Promise<ToolResponse>;
};

function paginateResults<T>(items: T[], limit = 50, offset = 0): {
  total_count: number;
  count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  next_offset: number | null;
  items: T[];
} {
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  const hasMore = offset + limit < total;
  return {
    total_count: total,
    count: page.length,
    offset,
    limit,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
    items: page,
  };
}

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_registry_list_plugins',
    description: 'List all installed plugins and their lifecycle state.',
    inputSchema: ListPluginsInputShape,
    annotations: ReadAnnotations,
    handler: async ({ filter_state, limit, offset, response_format }) => {
      try {
        const plugins = getPluginManager().list(filter_state === 'all' ? {} : { state: filter_state });
        const paginated = paginateResults(plugins, limit, offset);
        const markdownLines = paginated.items.map((plugin) =>
          `**${plugin.name}@${plugin.version}** [${plugin.lifecycle_state}]${plugin.is_builtin ? ' *(built-in)*' : ''}`,
        );
        return buildTextResponse(
          paginated,
          `## Installed Plugins (${paginated.total_count})\n${markdownLines.join('\n') || 'No plugins installed'}`,
          response_format,
        );
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_registry_list_available',
    description: 'Fetch list of plugins available from the marketplace.',
    inputSchema: ReadOnlyResponseInputShape,
    annotations: OpenReadAnnotations,
    handler: async ({ response_format }) => {
      try {
        const available = await getPluginManager().listAvailableFromMarketplace();
        const markdownLines = available.map((plugin) => `- **${plugin.name}** v${plugin.version}: ${plugin.description || ''}`);
        return buildTextResponse(
          { count: available.length, plugins: available },
          `## Available from Marketplace (${available.length})\n${markdownLines.join('\n')}`,
          response_format,
        );
      } catch (error) {
        return buildErrorResponse(`Marketplace error: ${getErrorMessage(error)}`);
      }
    },
  },
  {
    name: 'mcp_od_registry_install',
    description: 'Install a plugin from a marketplace URL or local file path.',
    inputSchema: InstallInputShape,
    annotations: WriteAnnotations,
    handler: async ({ auto_activate, source }) => {
      try {
        const result = await getPluginManager().install(source, { actor: 'agent', autoActivate: auto_activate });
        return buildJsonResponse({
          message: `Installed ${String((result as Record<string, unknown>).pluginId ?? '')}${auto_activate ? ' and activated' : ''}`,
          ...result,
        });
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_registry_activate',
    description: 'Activate an installed plugin.',
    inputSchema: PluginIdInputShape,
    annotations: WriteAnnotations,
    handler: async ({ plugin_id }) => {
      try {
        const result = await getPluginManager().activate(plugin_id, { actor: 'agent' });
        return buildJsonResponse({ message: `Activated ${plugin_id}`, ...result });
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_registry_deactivate',
    description: 'Deactivate an active plugin while keeping it installed.',
    inputSchema: PluginIdInputShape,
    annotations: RemoveAnnotations,
    handler: async ({ plugin_id }) => {
      try {
        const result = await getPluginManager().deactivate(plugin_id, { actor: 'agent' });
        return buildJsonResponse({ message: `Deactivated ${plugin_id}`, ...result });
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_registry_update',
    description: 'Install a new plugin version and hot-swap it for the running version.',
    inputSchema: UpdateInputShape,
    annotations: WriteAnnotations,
    handler: async ({ plugin_name, source }) => {
      try {
        const result = await getPluginManager().update(plugin_name, source, { actor: 'agent' });
        return buildJsonResponse({ message: `Hot-swapped ${plugin_name}`, ...result });
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_registry_audit_log',
    description: 'Retrieve the lifecycle audit log for a specific plugin.',
    inputSchema: AuditLogInputShape,
    annotations: ReadAnnotations,
    handler: async ({ limit, plugin_id, response_format }) => {
      try {
        const entries = getPluginDb().getAuditLog(plugin_id, limit);
        const markdownLines = entries.map(
          (entry) => `- **${entry.event}** by ${entry.actor} at ${entry.occurred_at}${entry.detail ? `: ${entry.detail}` : ''}`,
        );
        return buildTextResponse(
          { plugin_id, count: entries.length, entries },
          `## Audit Log: ${plugin_id}\n${markdownLines.join('\n') || 'No entries'}`,
          response_format,
        );
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_registry_add_signing_key',
    description: 'Add an enterprise signing key to trust for plugin signature verification.',
    inputSchema: SigningKeyInputShape,
    annotations: WriteAnnotations,
    handler: async ({ algorithm, enterprise_id, key_id, owner, public_key_pem }) => {
      try {
        getPluginDb().insertTrustedKey({
          id: key_id,
          key_type: 'enterprise',
          algorithm,
          public_key_pem,
          owner,
          enterprise_id: enterprise_id || null,
          added_at: new Date().toISOString(),
          added_by: 'operator',
        });
        return buildJsonResponse({ key_id, key_type: 'enterprise', owner, message: `Trusted signing key added: ${key_id}` });
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