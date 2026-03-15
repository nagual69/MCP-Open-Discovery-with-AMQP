"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPluginManager = getPluginManager;
exports.getPluginDb = getPluginDb;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function loadModule(candidates) {
    for (const candidate of candidates) {
        if (node_fs_1.default.existsSync(candidate)) {
            return require(candidate);
        }
    }
    throw new Error(`Unable to locate host module. Tried: ${candidates.join(', ')}`);
}
function normalizeBoolean(value) {
    return value === true || value === 1 || value === '1';
}
function toUnknownRecord(value) {
    return value;
}
function getPluginManager() {
    const typedPath = node_path_1.default.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'plugin-manager.js');
    const legacyPath = node_path_1.default.join(process.cwd(), 'tools', 'plugins', 'plugin-manager.js');
    const module = loadModule([typedPath, legacyPath]);
    return {
        list(filter) {
            return module.list(filter).map((plugin) => ({
                id: String(toUnknownRecord(plugin).id ?? ''),
                name: String(toUnknownRecord(plugin).name ?? ''),
                version: String(toUnknownRecord(plugin).version ?? ''),
                lifecycle_state: String(toUnknownRecord(plugin).lifecycle_state ?? ''),
                is_builtin: normalizeBoolean(toUnknownRecord(plugin).is_builtin),
            }));
        },
        listAvailableFromMarketplace() {
            return module.listAvailableFromMarketplace();
        },
        install(source, options) {
            return module.install(source, options);
        },
        activate(pluginId, options) {
            return module.activate(pluginId, options);
        },
        deactivate(pluginId, options) {
            return module.deactivate(pluginId, options);
        },
        update(pluginName, source, options) {
            return module.update(pluginName, source, options);
        },
    };
}
function getPluginDb() {
    const typedPath = node_path_1.default.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'db', 'plugin-db.js');
    const legacyPath = node_path_1.default.join(process.cwd(), 'tools', 'plugins', 'db', 'plugin-db.js');
    return loadModule([typedPath, legacyPath]);
}
//# sourceMappingURL=host-adapter.js.map