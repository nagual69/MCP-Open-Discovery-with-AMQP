"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importPluginFromFile = importPluginFromFile;
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const hash_utils_1 = require("../integrity/hash-utils");
async function importPluginFromDirectory(directoryPath) {
    const manifestPath = path_1.default.join(directoryPath, 'mcp-plugin.json');
    if (!fs_1.default.existsSync(manifestPath)) {
        throw new Error('Plugin directory is missing mcp-plugin.json');
    }
    const manifest = JSON.parse(await promises_1.default.readFile(manifestPath, 'utf8'));
    if (manifest.manifestVersion !== '2') {
        throw new Error('Plugin directory must contain a v2 manifest');
    }
    const distDir = path_1.default.join(directoryPath, 'dist');
    const computedHash = (0, hash_utils_1.computeDistHash)(distDir).hash;
    if (computedHash.toLowerCase() !== manifest.dist.hash.toLowerCase()) {
        throw new Error(`dist hash mismatch: manifest=${manifest.dist.hash} computed=${computedHash}`);
    }
    return {
        manifest,
        archiveData: Buffer.alloc(0),
        extractedPath: directoryPath,
    };
}
function findPluginRoot(entries) {
    const topLevel = Array.from(new Set(entries.map((entry) => entry.split('/')[0]).filter(Boolean)));
    return topLevel.length === 1 ? topLevel[0] : '';
}
async function importPluginFromFile(filePath) {
    const stats = await promises_1.default.stat(filePath);
    if (stats.isDirectory()) {
        return importPluginFromDirectory(filePath);
    }
    const archiveData = await promises_1.default.readFile(filePath);
    const zip = new adm_zip_1.default(archiveData);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    const rootPrefix = findPluginRoot(entryNames);
    const manifestEntry = zip.getEntry(rootPrefix ? `${rootPrefix}/mcp-plugin.json` : 'mcp-plugin.json');
    if (!manifestEntry) {
        throw new Error('Plugin archive is missing mcp-plugin.json');
    }
    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    if (manifest.manifestVersion !== '2') {
        throw new Error('Plugin archive must contain a v2 manifest');
    }
    const computedHash = (0, hash_utils_1.computeDistHashFromZip)(zip);
    if (computedHash.toLowerCase() !== manifest.dist.hash.toLowerCase()) {
        throw new Error(`dist hash mismatch: manifest=${manifest.dist.hash} computed=${computedHash}`);
    }
    const tempRoot = await promises_1.default.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'mcpod-plugin-'));
    zip.extractAllTo(tempRoot, true);
    return {
        manifest,
        archiveData,
        extractedPath: rootPrefix ? path_1.default.join(tempRoot, rootPrefix) : tempRoot,
    };
}
//# sourceMappingURL=local-import.js.map