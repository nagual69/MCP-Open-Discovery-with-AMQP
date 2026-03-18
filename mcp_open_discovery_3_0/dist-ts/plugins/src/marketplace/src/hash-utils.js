"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDistHashDetailed = computeDistHashDetailed;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function collectFiles(directory) {
    const files = [];
    for (const entry of node_fs_1.default.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) {
            continue;
        }
        const fullPath = node_path_1.default.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(fullPath));
            continue;
        }
        if (entry.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}
function computeDistHashDetailed(distDir) {
    const files = collectFiles(distDir)
        .map((filePath) => ({
        abs: filePath,
        rel: node_path_1.default.relative(distDir, filePath).split(node_path_1.default.sep).join('/'),
    }))
        .sort((left, right) => left.rel.localeCompare(right.rel));
    const hash = node_crypto_1.default.createHash('sha256');
    let totalBytes = 0;
    for (const file of files) {
        const data = node_fs_1.default.readFileSync(file.abs);
        hash.update(`${file.rel}\n`);
        hash.update(data);
        totalBytes += data.length;
    }
    return {
        hashHex: hash.digest('hex'),
        fileCount: files.length,
        files: files.map((file) => file.rel),
        totalBytes,
    };
}
//# sourceMappingURL=hash-utils.js.map