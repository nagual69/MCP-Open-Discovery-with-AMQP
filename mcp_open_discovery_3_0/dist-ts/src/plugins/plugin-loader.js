"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAndRegisterPlugin = loadAndRegisterPlugin;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const module_1 = __importDefault(require("module"));
const hash_utils_1 = require("./integrity/hash-utils");
const RESTRICTED_MODULES = ['fs', 'child_process', 'net', 'dgram', 'tls', 'http', 'https', 'dns'];
function envFlag(name, defaultValue = false) {
    const value = process.env[name];
    if (typeof value === 'undefined') {
        return defaultValue;
    }
    return /^(1|true|yes|on)$/i.test(value);
}
function isRelativeRequest(request) {
    return request.startsWith('./') || request.startsWith('../') || request.startsWith('/') || request.startsWith('file:');
}
function isCoreModule(request) {
    return module_1.default.builtinModules.includes(request);
}
function getCapabilityNames(values) {
    return new Set(values ?? []);
}
function getGlobalDependencyAllowlist() {
    try {
        const allowFile = path_1.default.resolve(process.cwd(), 'tools', 'plugins', 'allowlist-deps.json');
        if (!fs_1.default.existsSync(allowFile)) {
            return null;
        }
        const raw = JSON.parse(fs_1.default.readFileSync(allowFile, 'utf8'));
        if (Array.isArray(raw)) {
            return new Set(raw.filter((value) => typeof value === 'string'));
        }
        if (raw && typeof raw === 'object') {
            const record = raw;
            if (Array.isArray(record.allow)) {
                return new Set(record.allow.filter((value) => typeof value === 'string'));
            }
            if (Array.isArray(record.dependencies)) {
                return new Set(record.dependencies.filter((value) => typeof value === 'string'));
            }
        }
    }
    catch {
    }
    return null;
}
function validateDependencyPolicy(manifest) {
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
function staticSecurityScan(distDir, manifest) {
    const permissions = manifest.permissions ?? {};
    const allowedModules = new Set();
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
    const violations = [];
    const allowNative = envFlag('PLUGIN_ALLOW_NATIVE');
    function walk(directory) {
        for (const entry of fs_1.default.readdirSync(directory, { withFileTypes: true })) {
            const fullPath = path_1.default.join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }
            if (!entry.isFile() || !/\.(m?js|cjs|js)$/i.test(entry.name)) {
                continue;
            }
            const source = fs_1.default.readFileSync(fullPath, 'utf8');
            const relativePath = path_1.default.relative(distDir, fullPath).replace(/\\/g, '/');
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
function reconcileCapabilities(manifest, captured) {
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
    const diff = (left, right) => ({
        missing: [...left].filter((value) => !right.has(value)),
        extra: [...right].filter((value) => !left.has(value)),
    });
    const toolDiff = diff(declared.tools, actual.tools);
    const resourceDiff = diff(declared.resources, actual.resources);
    const promptDiff = diff(declared.prompts, actual.prompts);
    if (toolDiff.missing.length === 0 &&
        toolDiff.extra.length === 0 &&
        resourceDiff.missing.length === 0 &&
        resourceDiff.extra.length === 0 &&
        promptDiff.missing.length === 0 &&
        promptDiff.extra.length === 0) {
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
async function runCreatePluginWithRuntimeGuards(server, rootDir, manifest, createPlugin) {
    const captured = { tools: [], resources: [], prompts: [] };
    const proxy = createCaptureProxy(server, captured);
    const pluginRoot = path_1.default.resolve(rootDir);
    const policy = manifest.dependenciesPolicy ?? 'bundled-only';
    const allowRuntimeDeps = envFlag('PLUGIN_ALLOW_RUNTIME_DEPS');
    const strictIntegrity = envFlag('STRICT_INTEGRITY');
    const allowNative = envFlag('PLUGIN_ALLOW_NATIVE');
    const permissions = manifest.permissions ?? {};
    const allowedRestrictedModules = new Set();
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
    const moduleWithPrivateLoad = module_1.default;
    const originalLoad = moduleWithPrivateLoad._load;
    try {
        moduleWithPrivateLoad._load = function patchedLoad(request, parent, isMain) {
            const parentFile = parent?.filename ?? '';
            if (parentFile.startsWith(pluginRoot)) {
                if (RESTRICTED_MODULES.includes(request) && !allowedRestrictedModules.has(request)) {
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
    }
    finally {
        moduleWithPrivateLoad._load = originalLoad;
    }
    reconcileCapabilities(manifest, captured);
    return captured;
}
function normalizePromptConfig(descriptionOrConfig, schemaOrHandler) {
    if (typeof descriptionOrConfig === 'string') {
        return {
            description: descriptionOrConfig,
            argsSchema: schemaOrHandler,
        };
    }
    return descriptionOrConfig;
}
function createCaptureProxy(server, captured) {
    return new Proxy(server, {
        get(target, property, receiver) {
            if (property === 'registerTool') {
                return (name, config, handler) => {
                    captured.tools.push({ name, config, handler });
                    return true;
                };
            }
            if (property === 'tool') {
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
            if (property === 'resource') {
                return (name, uriOrTemplate, reader) => {
                    captured.resources.push({ name, uriOrTemplate, metadata: { uri: uriOrTemplate }, reader });
                    return true;
                };
            }
            if (property === 'registerPrompt') {
                return (name, config, handler) => {
                    captured.prompts.push({ name, config, handler });
                    return true;
                };
            }
            if (property === 'prompt') {
                return (name, descriptionOrConfig, schemaOrHandler, handler) => {
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
    validateDependencyPolicy(manifest);
    staticSecurityScan(distDir, manifest);
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
        else if (typeof extendedServer.tool === 'function') {
            extendedServer.tool(tool.name, tool.config, tool.handler);
        }
    }
    for (const resource of captured.resources) {
        if (typeof extendedServer.registerResource === 'function') {
            extendedServer.registerResource(resource.name, resource.uriOrTemplate, resource.metadata, resource.reader);
        }
        else if (typeof extendedServer.resource === 'function') {
            extendedServer.resource(resource.name, resource.uriOrTemplate, resource.reader);
        }
    }
    for (const prompt of captured.prompts) {
        if (typeof extendedServer.registerPrompt === 'function') {
            extendedServer.registerPrompt(prompt.name, prompt.config, prompt.handler);
        }
        else if (typeof extendedServer.prompt === 'function') {
            const promptConfig = prompt.config;
            if (promptConfig && typeof promptConfig === 'object' && ('description' in promptConfig || 'argsSchema' in promptConfig)) {
                extendedServer.prompt(prompt.name, promptConfig.description, promptConfig.argsSchema, prompt.handler);
            }
            else {
                extendedServer.prompt(prompt.name, prompt.config, prompt.handler);
            }
        }
    }
}
async function loadAndRegisterPlugin(server, rootDir, manifest) {
    validatePluginRoot(rootDir, manifest);
    const entryPath = resolvePluginEntry(rootDir, manifest);
    const moduleExports = await importPluginModule(entryPath);
    const createPlugin = extractCreatePlugin(moduleExports);
    const captured = await runCreatePluginWithRuntimeGuards(server, rootDir, manifest, createPlugin);
    await forwardCapturedRegistrations(server, captured);
    return { captured };
}
//# sourceMappingURL=plugin-loader.js.map