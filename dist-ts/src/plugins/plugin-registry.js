"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialize = initialize;
exports.bootstrapBuiltinPlugins = bootstrapBuiltinPlugins;
exports.getStats = getStats;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const plugin_db_1 = require("./db/plugin-db");
const plugin_manager_1 = require("./plugin-manager");
let stats = {
    totalPlugins: 0,
    activePlugins: 0,
    activeTools: 0,
    activeResources: 0,
    activePrompts: 0,
};
let initialized = false;
const BUILTIN_SOURCE_ROOT = path_1.default.join(process.cwd(), 'plugins', 'src');
function refreshStats() {
    const database = (0, plugin_db_1.getDb)();
    stats = {
        totalPlugins: database.prepare('SELECT COUNT(*) AS count FROM plugins').get().count,
        activePlugins: database.prepare("SELECT COUNT(*) AS count FROM plugins WHERE lifecycle_state = 'active'").get().count,
        activeTools: (0, plugin_db_1.getActiveToolNames)().length,
        activeResources: database.prepare('SELECT COUNT(*) AS count FROM plugin_resources WHERE is_active = 1').get().count,
        activePrompts: (0, plugin_db_1.getPromptCounts)(),
    };
}
async function initialize(server) {
    if (initialized) {
        refreshStats();
        return { loaded: [], failed: [] };
    }
    (0, plugin_manager_1.setMcpServer)(server);
    const activePlugins = (0, plugin_db_1.getActivePlugins)();
    const loaded = [];
    const failed = [];
    for (const plugin of activePlugins) {
        try {
            const activation = await (0, plugin_manager_1.activate)(plugin.id, { actor: 'system_startup' });
            loaded.push({
                id: plugin.id,
                tools: activation.toolCount ?? 0,
                resources: activation.resourceCount ?? 0,
                prompts: activation.promptCount ?? 0,
            });
        }
        catch (error) {
            failed.push({ id: plugin.id, error: error instanceof Error ? error.message : 'Activation failed' });
        }
    }
    refreshStats();
    initialized = true;
    return {
        loaded,
        failed,
        stats: {
            toolsRegistered: (0, plugin_db_1.getActiveToolNames)().length,
            resourcesRegistered: stats.activeResources,
            promptsRegistered: (0, plugin_db_1.getPromptCounts)(),
            invalidTools: 0,
            warnings: 0,
        },
    };
}
async function bootstrapBuiltinPlugins() {
    if (!fs_1.default.existsSync(BUILTIN_SOURCE_ROOT)) {
        return;
    }
    const pluginRoots = fs_1.default
        .readdirSync(BUILTIN_SOURCE_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path_1.default.join(BUILTIN_SOURCE_ROOT, entry.name));
    for (const pluginRoot of pluginRoots) {
        const manifestPath = path_1.default.join(pluginRoot, 'mcp-plugin.json');
        if (!fs_1.default.existsSync(manifestPath)) {
            continue;
        }
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf8'));
        const pluginId = `${manifest.name}@${manifest.version}`;
        const existing = (0, plugin_db_1.getPlugin)(pluginId);
        if (!existing) {
            await (0, plugin_manager_1.install)(pluginRoot, { actor: 'system', isBuiltin: true, autoActivate: true });
            continue;
        }
        if (existing.lifecycle_state !== 'active') {
            await (0, plugin_manager_1.activate)(pluginId, { actor: 'system_bootstrap' });
        }
    }
    refreshStats();
}
function getStats() {
    refreshStats();
    return stats;
}
//# sourceMappingURL=plugin-registry.js.map