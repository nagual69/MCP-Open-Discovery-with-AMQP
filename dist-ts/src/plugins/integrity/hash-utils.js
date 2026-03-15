"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDistHashDetailed = computeDistHashDetailed;
exports.computeDistHash = computeDistHash;
exports.computeDistHashFromZip = computeDistHashFromZip;
exports.verifyDistHash = verifyDistHash;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function collectOrderedFiles(rootDir) {
    const files = [];
    function walk(currentDir) {
        for (const entry of fs_1.default.readdirSync(currentDir, { withFileTypes: true })) {
            const absolutePath = path_1.default.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(absolutePath);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            const stats = fs_1.default.statSync(absolutePath);
            files.push({
                relativePath: path_1.default.relative(rootDir, absolutePath).replace(/\\/g, '/'),
                absolutePath,
                bytes: stats.size,
            });
        }
    }
    walk(rootDir);
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return files;
}
function buildHashHex(files) {
    const hash = crypto_1.default.createHash('sha256');
    for (const file of files) {
        hash.update(file.relativePath);
        hash.update('\n');
        hash.update(file.content ?? fs_1.default.readFileSync(file.absolutePath));
    }
    return hash.digest('hex');
}
function computeDistHashDetailed(distDir) {
    const files = collectOrderedFiles(distDir);
    const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
    const hashHex = buildHashHex(files);
    return {
        hash: `sha256:${hashHex}`,
        fileCount: files.length,
        totalBytes,
        files: files.map((file) => file.relativePath),
    };
}
function computeDistHash(distDir) {
    const { hash, fileCount, totalBytes } = computeDistHashDetailed(distDir);
    return { hash, fileCount, totalBytes };
}
function computeDistHashFromZip(zip) {
    const files = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory && entry.entryName.startsWith('dist/'))
        .map((entry) => ({
        relativePath: entry.entryName.slice('dist/'.length),
        bytes: entry.header.size,
        content: entry.getData(),
    }))
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return `sha256:${buildHashHex(files)}`;
}
function verifyDistHash(distDir, expectedHash) {
    return computeDistHash(distDir).hash.toLowerCase() === expectedHash.toLowerCase();
}
//# sourceMappingURL=hash-utils.js.map