"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMcpServer = setMcpServer;
exports.install = install;
exports.activate = activate;
exports.deactivate = deactivate;
exports.update = update;
exports.uninstall = uninstall;
exports.list = list;
exports.listAvailableFromMarketplace = listAvailableFromMarketplace;
exports.getMcpServer = getMcpServer;
exports.getActiveRegistrations = getActiveRegistrations;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const plugin_db_1 = require("./db/plugin-db");
const plugin_loader_1 = require("./plugin-loader");
const signature_verifier_1 = require("./integrity/signature-verifier");
const marketplace_client_1 = require("./marketplace/marketplace-client");
const local_import_1 = require("./marketplace/local-import");
let mcpServerRef = null;
const activeRegistrations = new Map();
const PLUGINS_ROOT = process.env.PLUGINS_ROOT || path_1.default.join(process.cwd(), 'plugins');
const EXTRACT_ROOT = path_1.default.join(PLUGINS_ROOT, '.installed');
const BUILTIN_SOURCE_ROOT = path_1.default.join(process.cwd(), 'plugins', 'src');
function pluginId(manifest) {
    return `${manifest.name}@${manifest.version}`;
}
async function ensureDirectory(directoryPath) {
    await promises_1.default.mkdir(directoryPath, { recursive: true });
}
async function copyDirectory(sourceDir, destinationDir) {
    await ensureDirectory(destinationDir);
    for (const entry of await promises_1.default.readdir(sourceDir, { withFileTypes: true })) {
        const sourcePath = path_1.default.join(sourceDir, entry.name);
        const destinationPath = path_1.default.join(destinationDir, entry.name);
        if (entry.isDirectory()) {
            await copyDirectory(sourcePath, destinationPath);
            continue;
        }
        if (entry.isFile()) {
            await promises_1.default.copyFile(sourcePath, destinationPath);
        }
    }
}
function findBuiltinPluginRoot(pluginName) {
    const candidate = path_1.default.join(BUILTIN_SOURCE_ROOT, pluginName);
    return fs_1.default.existsSync(candidate) ? candidate : null;
}
function resolvePluginRoot(pluginIdValue, manifest) {
    const extraction = (0, plugin_db_1.getCurrentExtraction)(pluginIdValue);
    if (extraction?.extraction_path && fs_1.default.existsSync(extraction.extraction_path)) {
        return extraction.extraction_path;
    }
    const builtinRoot = findBuiltinPluginRoot(manifest.name);
    if (builtinRoot) {
        return builtinRoot;
    }
    throw new Error(`No plugin root available for ${pluginIdValue}`);
}
async function unregisterCaptured(pluginIdValue) {
    const captured = activeRegistrations.get(pluginIdValue);
    if (!captured || !mcpServerRef) {
        return;
    }
    const extendedServer = mcpServerRef;
    for (const tool of captured.tools) {
        if (typeof extendedServer.unregisterTool === 'function') {
            try {
                await extendedServer.unregisterTool(tool.name);
            }
            catch {
            }
        }
    }
    for (const resource of captured.resources) {
        if (typeof extendedServer.unregisterResource === 'function') {
            try {
                await extendedServer.unregisterResource(resource.name);
            }
            catch {
            }
        }
    }
    for (const prompt of captured.prompts) {
        if (typeof extendedServer.unregisterPrompt === 'function') {
            try {
                await extendedServer.unregisterPrompt(prompt.name);
            }
            catch {
            }
        }
    }
    activeRegistrations.delete(pluginIdValue);
}
function verifyPayloadChecksum(bundle, checksum, algorithm) {
    const resolvedAlgorithm = algorithm ?? checksum.split(':', 1)[0] ?? 'sha256';
    const expectedChecksum = checksum.includes(':') ? checksum.split(':').slice(1).join(':') : checksum;
    const computedChecksum = crypto_1.default.createHash(resolvedAlgorithm).update(bundle).digest('hex');
    if (computedChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
        throw new Error(`Payload checksum verification failed: expected ${resolvedAlgorithm}:${expectedChecksum}, got ${resolvedAlgorithm}:${computedChecksum}`);
    }
    return true;
}
function verifyPayloadSignature(bundle, signature, publicKeyPem, algorithm = 'RSA-SHA256') {
    const signatureBuffer = Buffer.from(signature, 'base64');
    if (algorithm === 'Ed25519') {
        if (!crypto_1.default.verify(null, bundle, publicKeyPem, signatureBuffer)) {
            throw new Error('Payload signature verification failed');
        }
        return true;
    }
    const verifier = crypto_1.default.createVerify('RSA-SHA256');
    verifier.update(bundle);
    verifier.end();
    if (!verifier.verify(publicKeyPem, signatureBuffer)) {
        throw new Error('Payload signature verification failed');
    }
    return true;
}
function validateInstallOverrideShape(options) {
    if (options.signature && !options.publicKey) {
        throw new Error('publicKey is required when signature is provided');
    }
    if (options.publicKey && !options.signature) {
        throw new Error('signature is required when publicKey is provided');
    }
    if (options.signatureAlgorithm && !options.signature) {
        throw new Error('signature is required when signatureAlgorithm is provided');
    }
    if (options.checksumAlgorithm && !options.checksum) {
        throw new Error('checksum is required when checksumAlgorithm is provided');
    }
}
async function loadInstallArtifact(source, options = {}) {
    validateInstallOverrideShape(options);
    if (/^https?:\/\//i.test(source)) {
        const response = await axios_1.default.get(source, { responseType: 'arraybuffer' });
        const bundle = Buffer.from(response.data);
        const payloadChecksumVerified = options.checksum
            ? verifyPayloadChecksum(bundle, options.checksum, options.checksumAlgorithm)
            : false;
        const payloadSignatureVerified = options.signature && options.publicKey
            ? verifyPayloadSignature(bundle, options.signature, options.publicKey, options.signatureAlgorithm ?? 'RSA-SHA256')
            : false;
        const tempFile = path_1.default.join(await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'mcpod-remote-')), 'plugin.zip');
        await promises_1.default.writeFile(tempFile, bundle);
        const imported = await (0, local_import_1.importPluginFromFile)(tempFile);
        return {
            manifest: imported.manifest,
            bundle: imported.archiveData,
            extractedPath: imported.extractedPath,
            payloadChecksumVerified,
            payloadSignatureVerified,
            sourceUrl: source,
            sourceType: 'marketplace',
        };
    }
    const sourcePath = path_1.default.resolve(source);
    const stats = await promises_1.default.stat(sourcePath);
    if (stats.isDirectory()) {
        if (options.checksum || options.checksumAlgorithm || options.signature || options.publicKey || options.signatureAlgorithm) {
            throw new Error('Checksum and signature install overrides are supported for plugin archives, not directory installs');
        }
        const imported = await (0, local_import_1.importPluginFromFile)(sourcePath);
        return {
            manifest: imported.manifest,
            bundle: imported.archiveData,
            extractedPath: imported.extractedPath,
            payloadChecksumVerified: false,
            payloadSignatureVerified: false,
            sourceUrl: null,
            sourceType: 'local',
        };
    }
    const bundle = await promises_1.default.readFile(sourcePath);
    const payloadChecksumVerified = options.checksum
        ? verifyPayloadChecksum(bundle, options.checksum, options.checksumAlgorithm)
        : false;
    const payloadSignatureVerified = options.signature && options.publicKey
        ? verifyPayloadSignature(bundle, options.signature, options.publicKey, options.signatureAlgorithm ?? 'RSA-SHA256')
        : false;
    const imported = await (0, local_import_1.importPluginFromFile)(sourcePath);
    return {
        manifest: imported.manifest,
        bundle: imported.archiveData,
        extractedPath: imported.extractedPath,
        payloadChecksumVerified,
        payloadSignatureVerified,
        sourceUrl: null,
        sourceType: 'local',
    };
}
function setMcpServer(server) {
    mcpServerRef = server;
}
async function install(source, options = {}) {
    const artifact = await loadInstallArtifact(source, options);
    const manifest = artifact.manifest;
    const id = pluginId(manifest);
    if (options.pluginId && options.pluginId !== id) {
        throw new Error(`Installed plugin ID mismatch: expected ${options.pluginId}, got ${id}`);
    }
    if ((0, plugin_db_1.getPlugin)(id)) {
        throw new Error(`Plugin already installed: ${id}`);
    }
    const signatureStatus = (0, signature_verifier_1.verifySignatures)(manifest);
    const installTarget = path_1.default.join(EXTRACT_ROOT, id);
    await ensureDirectory(EXTRACT_ROOT);
    (0, plugin_db_1.insertPlugin)({
        id,
        name: manifest.name,
        version: manifest.version,
        manifest_json: JSON.stringify(manifest),
        bundle_blob: artifact.bundle,
        dist_hash: manifest.dist.hash,
        bundle_size_bytes: artifact.bundle.byteLength,
        signature_data: manifest.signatures ? JSON.stringify(manifest.signatures) : null,
        signature_verified: signatureStatus.verified ? 1 : 0,
        signer_key_id: signatureStatus.keyId,
        signer_type: signatureStatus.keyType,
        lifecycle_state: options.autoActivate ? 'active' : 'installed',
        is_builtin: options.isBuiltin ? 1 : 0,
        installed_at: new Date().toISOString(),
        installed_by: options.actor ?? 'system',
        source_url: artifact.sourceUrl,
        source_type: artifact.sourceType,
    });
    if (artifact.bundle.byteLength > 0) {
        await copyDirectory(artifact.extractedPath, installTarget);
        (0, plugin_db_1.saveExtractionRecord)(id, installTarget, manifest.dist.hash);
    }
    else {
        (0, plugin_db_1.saveExtractionRecord)(id, artifact.extractedPath, manifest.dist.hash);
    }
    if (options.autoActivate) {
        await activate(id, { actor: options.actor });
    }
    return {
        pluginId: id,
        manifest,
        signatureVerified: signatureStatus.verified,
        payloadChecksumVerified: artifact.payloadChecksumVerified,
        payloadSignatureVerified: artifact.payloadSignatureVerified,
    };
}
async function activate(pluginIdValue, options = {}) {
    const plugin = (0, plugin_db_1.getPlugin)(pluginIdValue);
    if (!plugin) {
        throw new Error(`Plugin not found: ${pluginIdValue}`);
    }
    if (plugin.lifecycle_state === 'active') {
        const manifest = JSON.parse(plugin.manifest_json);
        return {
            activated: true,
            pluginId: pluginIdValue,
            toolCount: manifest.capabilities?.tools?.length,
            resourceCount: manifest.capabilities?.resources?.length,
            promptCount: manifest.capabilities?.prompts?.length,
            alreadyActive: true,
        };
    }
    const manifest = JSON.parse(plugin.manifest_json);
    if (mcpServerRef) {
        const rootDir = resolvePluginRoot(pluginIdValue, manifest);
        const loadResult = await (0, plugin_loader_1.loadAndRegisterPlugin)(mcpServerRef, rootDir, manifest);
        activeRegistrations.set(pluginIdValue, loadResult.captured);
    }
    (0, plugin_db_1.setPluginLifecycleState)(pluginIdValue, 'active');
    (0, plugin_db_1.auditLog)(plugin.id, plugin.name, plugin.version, 'activated', options.actor ?? 'system');
    return {
        activated: true,
        pluginId: pluginIdValue,
        toolCount: manifest.capabilities?.tools?.length,
        resourceCount: manifest.capabilities?.resources?.length,
        promptCount: manifest.capabilities?.prompts?.length,
    };
}
async function deactivate(pluginIdValue, options = {}) {
    const plugin = (0, plugin_db_1.getPlugin)(pluginIdValue);
    if (!plugin) {
        throw new Error(`Plugin not found: ${pluginIdValue}`);
    }
    await unregisterCaptured(pluginIdValue);
    (0, plugin_db_1.setPluginLifecycleState)(pluginIdValue, 'inactive');
    (0, plugin_db_1.auditLog)(plugin.id, plugin.name, plugin.version, 'deactivated', options.actor ?? 'system');
    return { deactivated: true, pluginId: pluginIdValue };
}
async function update(pluginName, newSource, options = {}) {
    const previous = (0, plugin_db_1.getPluginByName)(pluginName);
    if (!previous) {
        throw new Error(`Plugin not found: ${pluginName}`);
    }
    (0, plugin_db_1.setPluginLifecycleState)(previous.id, 'updating');
    (0, plugin_db_1.auditLog)(previous.id, previous.name, previous.version, 'hot_swap_started', options.actor ?? 'system');
    const installed = await install(newSource, { actor: options.actor, autoActivate: true });
    const current = (0, plugin_db_1.getPlugin)(installed.pluginId);
    if (!current) {
        throw new Error(`Installed plugin not found after update: ${installed.pluginId}`);
    }
    await deactivate(previous.id, options);
    (0, plugin_db_1.auditLog)(current.id, current.name, current.version, 'hot_swap_completed', options.actor ?? 'system', {
        previousVersion: previous.id,
    });
    return {
        hotSwapped: true,
        previousVersion: previous.id,
        newVersion: current.id,
    };
}
async function uninstall(pluginIdValue, options = {}) {
    const plugin = (0, plugin_db_1.getPlugin)(pluginIdValue);
    if (!plugin) {
        throw new Error(`Plugin not found: ${pluginIdValue}`);
    }
    await unregisterCaptured(pluginIdValue);
    (0, plugin_db_1.setPluginLifecycleState)(pluginIdValue, 'uninstalling');
    (0, plugin_db_1.deletePlugin)(pluginIdValue);
    (0, plugin_db_1.auditLog)(plugin.id, plugin.name, plugin.version, 'uninstalled', options.actor ?? 'system');
    return { uninstalled: true, pluginId: pluginIdValue };
}
function list(filter) {
    return (0, plugin_db_1.getAllPlugins)(filter?.state ? { state: filter.state } : undefined);
}
async function listAvailableFromMarketplace() {
    const baseUrl = process.env.MARKETPLACE_URL;
    if (!baseUrl) {
        return [];
    }
    const client = new marketplace_client_1.MarketplaceClient({
        baseUrl,
        token: process.env.MARKETPLACE_TOKEN ?? null,
    });
    return client.listAvailable();
}
function getMcpServer() {
    return mcpServerRef;
}
function getActiveRegistrations() {
    return activeRegistrations;
}
//# sourceMappingURL=plugin-manager.js.map