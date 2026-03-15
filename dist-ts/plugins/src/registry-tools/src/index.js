"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const host_adapter_1 = require("./host-adapter");
const shared_1 = require("./shared");
const types_1 = require("./types");
function paginateResults(items, limit = 50, offset = 0) {
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
const toolDefinitions = [
    {
        name: 'mcp_od_registry_list_plugins',
        description: 'List all installed plugins and their lifecycle state.',
        inputSchema: types_1.ListPluginsInputShape,
        annotations: types_1.ReadAnnotations,
        handler: async ({ filter_state, limit, offset, response_format }) => {
            try {
                const plugins = (0, host_adapter_1.getPluginManager)().list(filter_state === 'all' ? {} : { state: filter_state });
                const paginated = paginateResults(plugins, limit, offset);
                const markdownLines = paginated.items.map((plugin) => `**${plugin.name}@${plugin.version}** [${plugin.lifecycle_state}]${plugin.is_builtin ? ' *(built-in)*' : ''}`);
                return (0, shared_1.buildTextResponse)(paginated, `## Installed Plugins (${paginated.total_count})\n${markdownLines.join('\n') || 'No plugins installed'}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_registry_list_available',
        description: 'Fetch list of plugins available from the marketplace.',
        inputSchema: types_1.ReadOnlyResponseInputShape,
        annotations: types_1.OpenReadAnnotations,
        handler: async ({ response_format }) => {
            try {
                const available = await (0, host_adapter_1.getPluginManager)().listAvailableFromMarketplace();
                const markdownLines = available.map((plugin) => `- **${plugin.name}** v${plugin.version}: ${plugin.description || ''}`);
                return (0, shared_1.buildTextResponse)({ count: available.length, plugins: available }, `## Available from Marketplace (${available.length})\n${markdownLines.join('\n')}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(`Marketplace error: ${(0, shared_1.getErrorMessage)(error)}`);
            }
        },
    },
    {
        name: 'mcp_od_registry_install',
        description: 'Install a plugin from a marketplace URL or local file path.',
        inputSchema: types_1.InstallInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async ({ auto_activate, source }) => {
            try {
                const result = await (0, host_adapter_1.getPluginManager)().install(source, { actor: 'agent', autoActivate: auto_activate });
                return (0, shared_1.buildJsonResponse)({
                    message: `Installed ${String(result.pluginId ?? '')}${auto_activate ? ' and activated' : ''}`,
                    ...result,
                });
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_registry_activate',
        description: 'Activate an installed plugin.',
        inputSchema: types_1.PluginIdInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async ({ plugin_id }) => {
            try {
                const result = await (0, host_adapter_1.getPluginManager)().activate(plugin_id, { actor: 'agent' });
                return (0, shared_1.buildJsonResponse)({ message: `Activated ${plugin_id}`, ...result });
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_registry_deactivate',
        description: 'Deactivate an active plugin while keeping it installed.',
        inputSchema: types_1.PluginIdInputShape,
        annotations: types_1.RemoveAnnotations,
        handler: async ({ plugin_id }) => {
            try {
                const result = await (0, host_adapter_1.getPluginManager)().deactivate(plugin_id, { actor: 'agent' });
                return (0, shared_1.buildJsonResponse)({ message: `Deactivated ${plugin_id}`, ...result });
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_registry_update',
        description: 'Install a new plugin version and hot-swap it for the running version.',
        inputSchema: types_1.UpdateInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async ({ plugin_name, source }) => {
            try {
                const result = await (0, host_adapter_1.getPluginManager)().update(plugin_name, source, { actor: 'agent' });
                return (0, shared_1.buildJsonResponse)({ message: `Hot-swapped ${plugin_name}`, ...result });
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_registry_audit_log',
        description: 'Retrieve the lifecycle audit log for a specific plugin.',
        inputSchema: types_1.AuditLogInputShape,
        annotations: types_1.ReadAnnotations,
        handler: async ({ limit, plugin_id, response_format }) => {
            try {
                const entries = (0, host_adapter_1.getPluginDb)().getAuditLog(plugin_id, limit);
                const markdownLines = entries.map((entry) => `- **${entry.event}** by ${entry.actor} at ${entry.occurred_at}${entry.detail ? `: ${entry.detail}` : ''}`);
                return (0, shared_1.buildTextResponse)({ plugin_id, count: entries.length, entries }, `## Audit Log: ${plugin_id}\n${markdownLines.join('\n') || 'No entries'}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_registry_add_signing_key',
        description: 'Add an enterprise signing key to trust for plugin signature verification.',
        inputSchema: types_1.SigningKeyInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async ({ algorithm, enterprise_id, key_id, owner, public_key_pem }) => {
            try {
                (0, host_adapter_1.getPluginDb)().insertTrustedKey({
                    id: key_id,
                    key_type: 'enterprise',
                    algorithm,
                    public_key_pem,
                    owner,
                    enterprise_id: enterprise_id || null,
                    added_at: new Date().toISOString(),
                    added_by: 'operator',
                });
                return (0, shared_1.buildJsonResponse)({ key_id, key_type: 'enterprise', owner, message: `Trusted signing key added: ${key_id}` });
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
];
async function createPlugin(server) {
    for (const tool of toolDefinitions) {
        server.registerTool(tool.name, {
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
        }, tool.handler);
    }
}
//# sourceMappingURL=index.js.map