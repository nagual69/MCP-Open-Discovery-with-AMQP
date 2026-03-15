"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAndRegisterPlugin = loadAndRegisterPlugin;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const hash_utils_1 = require("./integrity/hash-utils");
function createCaptureProxy(server, captured) {
    return new Proxy(server, {
        get(target, property, receiver) {
            if (property === 'registerTool') {
                return (name, config, handler) => {
                    captured.tools.push({ name, config, handler });
                    return true;
                };
            }
            if (property === 'registerResource') {
                return (name, uriOrTemplate, metadata, reader) => {
                    captured.resources.push({ name, uriOrTemplate, metadata, reader });
                    return true;
                };
            }
            if (property === 'registerPrompt') {
                return (name, config, handler) => {
                    captured.prompts.push({ name, config, handler });
                    return true;
                };
            }
            return Reflect.get(target, property, receiver);
        },
    });
}
function resolvePluginEntry(rootDir, manifest) {
    const entryPath = path_1.default.join(rootDir, manifest.entry);
    if (!fs_1.default.existsSync(entryPath)) {
        throw new Error(`Plugin entry not found: ${entryPath}`);
    }
    return entryPath;
}
function validatePluginRoot(rootDir, manifest) {
    if (manifest.manifestVersion !== '2') {
        throw new Error(`Unsupported manifest version for ${manifest.name}: ${manifest.manifestVersion}`);
    }
    const distDir = path_1.default.join(rootDir, 'dist');
    if (!fs_1.default.existsSync(distDir)) {
        throw new Error(`dist directory missing for plugin ${manifest.name}`);
    }
    if (!(0, hash_utils_1.verifyDistHash)(distDir, manifest.dist.hash)) {
        throw new Error(`dist hash mismatch for plugin ${manifest.name}`);
    }
}
async function importPluginModule(entryPath) {
    delete require.cache[require.resolve(entryPath)];
    return require(entryPath);
}
function extractCreatePlugin(moduleExports) {
    const defaultExport = moduleExports.default;
    const createPlugin = typeof moduleExports.createPlugin === 'function'
        ? moduleExports.createPlugin
        : typeof defaultExport?.createPlugin === 'function'
            ? defaultExport.createPlugin
            : null;
    if (!createPlugin) {
        throw new Error('Plugin entry does not export createPlugin(server)');
    }
    return createPlugin;
}
async function forwardCapturedRegistrations(server, captured) {
    const extendedServer = server;
    for (const tool of captured.tools) {
        if (typeof server.registerTool === 'function') {
            server.registerTool(tool.name, tool.config, tool.handler);
        }
    }
    for (const resource of captured.resources) {
        if (typeof extendedServer.registerResource === 'function') {
            extendedServer.registerResource(resource.name, resource.uriOrTemplate, resource.metadata, resource.reader);
        }
    }
    for (const prompt of captured.prompts) {
        if (typeof extendedServer.registerPrompt === 'function') {
            extendedServer.registerPrompt(prompt.name, prompt.config, prompt.handler);
        }
    }
}
async function loadAndRegisterPlugin(server, rootDir, manifest) {
    validatePluginRoot(rootDir, manifest);
    const entryPath = resolvePluginEntry(rootDir, manifest);
    const moduleExports = await importPluginModule(entryPath);
    const createPlugin = extractCreatePlugin(moduleExports);
    const captured = { tools: [], resources: [], prompts: [] };
    const proxy = createCaptureProxy(server, captured);
    await createPlugin(proxy);
    await forwardCapturedRegistrations(server, captured);
    return { captured };
}
//# sourceMappingURL=plugin-loader.js.map