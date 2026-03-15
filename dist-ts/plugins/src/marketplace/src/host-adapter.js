"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPluginDb = getPluginDb;
exports.getPluginManager = getPluginManager;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function loadTypedModule(modulePath) {
    if (!node_fs_1.default.existsSync(modulePath)) {
        throw new Error(`Unable to locate typed host module at ${modulePath}. Build the typed host before loading this plugin.`);
    }
    return require(modulePath);
}
function normalizeBoolean(value) {
    return value === true || value === 1 || value === '1';
}
function normalizePluginRecord(record) {
    return {
        id: String(record.id ?? ''),
        name: String(record.name ?? ''),
        version: String(record.version ?? ''),
        lifecycle_state: String(record.lifecycle_state ?? ''),
        is_builtin: normalizeBoolean(record.is_builtin),
        installed_at: String(record.installed_at ?? ''),
        source_type: String(record.source_type ?? ''),
        bundle_size_bytes: Number(record.bundle_size_bytes ?? 0),
        manifest_json: String(record.manifest_json ?? '{}'),
    };
}
function normalizePluginSummary(record) {
    return {
        id: String(record.id ?? ''),
        name: String(record.name ?? ''),
        version: String(record.version ?? ''),
        lifecycle_state: String(record.lifecycle_state ?? ''),
        is_builtin: normalizeBoolean(record.is_builtin),
        installed_at: String(record.installed_at ?? ''),
        source_type: String(record.source_type ?? ''),
        bundle_size_bytes: Number(record.bundle_size_bytes ?? 0),
    };
}
function getPluginDb() {
    const typedPath = node_path_1.default.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'db', 'plugin-db.js');
    const module = loadTypedModule(typedPath);
    return {
        getPlugin(pluginId) {
            const record = module.getPlugin(pluginId);
            if (!record) {
                return undefined;
            }
            return 'manifest_json' in record ? record : normalizePluginRecord(record);
        },
        getAllPlugins(filter) {
            return module.getAllPlugins(filter);
        },
        getCurrentExtraction(pluginId) {
            return module.getCurrentExtraction(pluginId);
        },
    };
}
function getPluginManager() {
    const typedPath = node_path_1.default.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'plugin-manager.js');
    const module = loadTypedModule(typedPath);
    return {
        async install(source, options) {
            return module.install(source, options);
        },
        async uninstall(pluginId, options) {
            const result = await module.uninstall(pluginId, options);
            return {
                uninstalled: normalizeBoolean(result.uninstalled),
                pluginId: String(result.pluginId ?? pluginId),
            };
        },
    };
}
//# sourceMappingURL=host-adapter.js.map