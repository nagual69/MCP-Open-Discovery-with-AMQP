// SPDX-License-Identifier: MPL-2.0
// tools/plugins/utils/hash-utils.js
// Hash utilities for plugin integrity verification.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Compute sha256:<hex> over all files in a dist directory.
 * Files are sorted lexicographically by their path relative to distDir.
 * Each file contributes: relative-path + newline + file-bytes.
 *
 * @param {string} distDir - Absolute path to the dist directory
 * @returns {string} Hash string in format "sha256:<64-hex>"
 */
function computeDistHash(distDir) {
  const files = collectFiles(distDir).sort();
  if (files.length === 0) {
    throw new Error(`No files found in dist directory: ${distDir}`);
  }

  const hasher = crypto.createHash('sha256');
  for (const filePath of files) {
    const relative = path.relative(distDir, filePath).split(path.sep).join('/');
    hasher.update(relative + '\n');
    hasher.update(fs.readFileSync(filePath));
  }
  return `sha256:${hasher.digest('hex')}`;
}

/**
 * Recursively collect all non-hidden files under a directory.
 * @param {string} dir
 * @returns {string[]} Absolute file paths
 */
function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(fullPath));
    else results.push(fullPath);
  }
  return results;
}

module.exports = { computeDistHash, collectFiles };
