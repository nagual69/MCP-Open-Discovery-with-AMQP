"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const hash_utils_1 = require("./hash-utils");
const host_adapter_1 = require("./host-adapter");
const shared_1 = require("./shared");
const types_1 = require("./types");
function parseManifest(manifestJson) {
    try {
        return JSON.parse(manifestJson);
    }
    catch {
        return {};
    }
}
function getPlugin(pluginId) {
    const record = (0, host_adapter_1.getPluginDb)().getPlugin(pluginId);
    if (!record) {
        return undefined;
    }
    return {
        ...record,
        manifest: parseManifest(record.manifest_json),
    };
}
function getAllPlugins() {
    const db = (0, host_adapter_1.getPluginDb)();
    return db
        .getAllPlugins()
        .map((summary) => getPlugin(summary.id))
        .filter((plugin) => Boolean(plugin));
}
function getExtractionPath(pluginId, pluginName, pluginVersion) {
    const extraction = (0, host_adapter_1.getPluginDb)().getCurrentExtraction(pluginId);
    if (extraction?.extraction_path) {
        return extraction.extraction_path;
    }
    return node_path_1.default.join(process.cwd(), 'data', 'plugin_extractions', `${pluginName}_at_${pluginVersion}`);
}
function hasUnsupportedInstallOverrides(args) {
    const unsupported = [];
    for (const field of ['pluginId', 'checksum', 'checksumAlgorithm', 'signature', 'publicKey', 'signatureAlgorithm']) {
        if (typeof args[field] !== 'undefined') {
            unsupported.push(field);
        }
    }
    return unsupported;
}
function toMarkdownTable(headers, rows) {
    const header = `| ${headers.join(' | ')} |`;
    const divider = `|${headers.map(() => '---').join('|')}|`;
    const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
    return [header, divider, body].filter(Boolean).join('\n');
}
const toolDefinitions = [
    {
        name: 'mcp_od_store_list',
        description: 'List all installed plugins and their status with statistics.',
        inputSchema: types_1.ListInputShape,
        annotations: types_1.ReadAnnotations,
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
                return (0, shared_1.buildTextResponse)(data, markdown, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_store_list_policies',
        description: 'Show active plugin security policy and feature flags.',
        inputSchema: types_1.ListInputShape,
        annotations: types_1.ReadAnnotations,
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
                        PLUGINS_ROOT: process.env.PLUGINS_ROOT || node_path_1.default.join(process.cwd(), 'plugins'),
                        SCHEMA_PATH: process.env.SCHEMA_PATH || '(default)',
                    },
                };
                const rows = Object.entries(data.flags).map(([key, value]) => [key, String(value)]);
                const markdown = `## Plugin Security Policies\n\n${toMarkdownTable(['Flag', 'Value'], rows)}`;
                return (0, shared_1.buildTextResponse)(data, markdown, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_store_search',
        description: 'Search installed plugins by name, description, or type.',
        inputSchema: types_1.SearchInputShape,
        annotations: types_1.ReadAnnotations,
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
                return (0, shared_1.buildTextResponse)(data, markdown, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_store_verify',
        description: 'Verify plugin dist hash, per-file checksums, and signature status.',
        inputSchema: types_1.VerifyInputShape,
        annotations: types_1.ReadAnnotations,
        handler: async ({ pluginId, strictIntegrity }) => {
            try {
                const plugin = getPlugin(pluginId);
                if (!plugin) {
                    return (0, shared_1.buildErrorResponse)(`Plugin not found: ${pluginId}`);
                }
                if (!plugin.manifest.dist?.hash) {
                    return (0, shared_1.buildErrorResponse)('Missing dist.hash in plugin manifest');
                }
                const rootDir = getExtractionPath(plugin.id, plugin.name, plugin.version);
                const distDir = node_path_1.default.join(rootDir, 'dist');
                if (!node_fs_1.default.existsSync(distDir)) {
                    return (0, shared_1.buildErrorResponse)(`dist directory not found at ${distDir}`);
                }
                const report = { pluginId: plugin.id, issues: [] };
                const { fileCount, files, hashHex, totalBytes } = (0, hash_utils_1.computeDistHashDetailed)(distDir);
                const declared = String(plugin.manifest.dist.hash).replace(/^sha256:/, '');
                const issues = report.issues;
                report.hash = { declared, recomputed: hashHex, match: hashHex.toLowerCase() === declared.toLowerCase() };
                report.counts = {
                    fileCountDeclared: plugin.manifest.dist.fileCount ?? null,
                    totalBytesDeclared: plugin.manifest.dist.totalBytes ?? null,
                    fileCountActual: fileCount,
                    totalBytesActual: totalBytes,
                };
                const checksumEntries = plugin.manifest.dist.checksums?.files ?? [];
                const seen = new Set();
                const mismatches = [];
                for (const entry of checksumEntries) {
                    if (!entry.path || !entry.sha256) {
                        continue;
                    }
                    const normalizedPath = entry.path.replace(/^dist\//, '').replace(/^\.\//, '');
                    const absolutePath = node_path_1.default.join(distDir, normalizedPath);
                    if (!node_fs_1.default.existsSync(absolutePath)) {
                        issues.push(`Checksum path missing: ${entry.path}`);
                        continue;
                    }
                    const actualHash = require('node:crypto').createHash('sha256').update(node_fs_1.default.readFileSync(absolutePath)).digest('hex');
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
                }
                else {
                    report.coverage = { required: false };
                }
                let lock = null;
                const lockPath = node_path_1.default.join(rootDir, 'install.lock.json');
                if (node_fs_1.default.existsSync(lockPath)) {
                    try {
                        lock = JSON.parse(node_fs_1.default.readFileSync(lockPath, 'utf8'));
                    }
                    catch {
                        lock = null;
                    }
                }
                report.signature = {
                    lockVerified: lock?.signatureVerified === true,
                    lockSignerKeyId: lock?.signerKeyId ?? null,
                };
                return (0, shared_1.buildJsonResponse)(report);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_store_install',
        description: 'Install a plugin from an HTTP(S) URL or local file path.',
        inputSchema: types_1.InstallInputShape,
        annotations: types_1.InstallAnnotations,
        handler: async (args) => {
            try {
                const source = typeof args.url === 'string' && args.url ? args.url : typeof args.filePath === 'string' ? args.filePath : undefined;
                if (!source) {
                    return (0, shared_1.buildErrorResponse)('Either url or filePath is required');
                }
                const unsupported = hasUnsupportedInstallOverrides(args);
                if (unsupported.length) {
                    return (0, shared_1.buildErrorResponse)(`Typed host plugin manager does not yet support install overrides: ${unsupported.join(', ')}`);
                }
                const result = await (0, host_adapter_1.getPluginManager)().install(source, {
                    actor: 'agent',
                    autoActivate: args.autoLoad === true,
                });
                return (0, shared_1.buildJsonResponse)(result);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_store_remove',
        description: 'Uninstall a plugin by ID.',
        inputSchema: types_1.RemoveInputShape,
        annotations: types_1.RemoveAnnotations,
        handler: async ({ pluginId }) => {
            try {
                return (0, shared_1.buildJsonResponse)(await (0, host_adapter_1.getPluginManager)().uninstall(pluginId, { actor: 'agent' }));
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_store_show',
        description: 'Show detailed metadata for a plugin: manifest, lock file, and capabilities.',
        inputSchema: types_1.ShowInputShape,
        annotations: types_1.ReadAnnotations,
        handler: async ({ pluginId, response_format }) => {
            try {
                const plugin = getPlugin(pluginId);
                if (!plugin) {
                    return (0, shared_1.buildErrorResponse)(`Plugin not found: ${pluginId}`);
                }
                const rootDir = getExtractionPath(plugin.id, plugin.name, plugin.version);
                const lockPath = node_path_1.default.join(rootDir, 'install.lock.json');
                let lock = null;
                if (node_fs_1.default.existsSync(lockPath)) {
                    try {
                        lock = JSON.parse(node_fs_1.default.readFileSync(lockPath, 'utf8'));
                    }
                    catch {
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
                return (0, shared_1.buildTextResponse)(data, JSON.stringify(data, null, 2), response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_store_rescan',
        description: 'Recompute dist hash for a plugin and compare with the declared value.',
        inputSchema: types_1.RescanInputShape,
        annotations: types_1.ReadAnnotations,
        handler: async ({ pluginId, response_format }) => {
            try {
                const plugin = getPlugin(pluginId);
                if (!plugin) {
                    return (0, shared_1.buildErrorResponse)(`Plugin not found: ${pluginId}`);
                }
                if (!plugin.manifest.dist?.hash) {
                    return (0, shared_1.buildErrorResponse)('Plugin missing dist metadata');
                }
                const rootDir = getExtractionPath(plugin.id, plugin.name, plugin.version);
                const distDir = node_path_1.default.join(rootDir, 'dist');
                if (!node_fs_1.default.existsSync(distDir)) {
                    return (0, shared_1.buildErrorResponse)(`dist directory not found: ${distDir}`);
                }
                const { hashHex, fileCount, totalBytes } = (0, hash_utils_1.computeDistHashDetailed)(distDir);
                const declared = plugin.manifest.dist.hash.replace(/^sha256:/, '');
                const data = {
                    pluginId: plugin.id,
                    recomputed: { hash: `sha256:${hashHex}`, fileCount, totalBytes },
                    declared: `sha256:${declared}`,
                    match: hashHex.toLowerCase() === declared.toLowerCase(),
                };
                return (0, shared_1.buildTextResponse)(data, JSON.stringify(data, null, 2), response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_store_security_report',
        description: 'Show an aggregated security report across all installed plugins.',
        inputSchema: types_1.ListInputShape,
        annotations: types_1.ReadAnnotations,
        handler: async ({ response_format }) => {
            try {
                const plugins = getAllPlugins();
                const details = plugins.map((plugin) => {
                    const rootDir = getExtractionPath(plugin.id, plugin.name, plugin.version);
                    const lockPath = node_path_1.default.join(rootDir, 'install.lock.json');
                    let lockVerified = false;
                    if (node_fs_1.default.existsSync(lockPath)) {
                        try {
                            const lock = JSON.parse(node_fs_1.default.readFileSync(lockPath, 'utf8'));
                            lockVerified = lock.signatureVerified === true;
                        }
                        catch {
                            lockVerified = false;
                        }
                    }
                    return {
                        id: plugin.id,
                        state: plugin.lifecycle_state,
                        dependenciesPolicy: plugin.manifest.dependenciesPolicy || 'legacy',
                        permissions: plugin.manifest.permissions || {},
                        hasLock: node_fs_1.default.existsSync(lockPath),
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
                return (0, shared_1.buildTextResponse)(data, JSON.stringify(data, null, 2), response_format);
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