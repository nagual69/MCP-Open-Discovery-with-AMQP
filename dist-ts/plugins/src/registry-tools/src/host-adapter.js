"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPluginManager = getPluginManager;
exports.getPluginDb = getPluginDb;
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
function toUnknownRecord(value) {
    return value;
}
function getPluginManager() {
    const typedPath = node_path_1.default.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'plugin-manager.js');
    const module = loadTypedModule(typedPath);
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
    return loadTypedModule(typedPath);
}
//# sourceMappingURL=host-adapter.js.map