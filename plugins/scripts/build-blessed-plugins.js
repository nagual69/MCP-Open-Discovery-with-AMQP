#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// plugins/scripts/build-blessed-plugins.js
// Build all blessed source plugins into .zip files under plugins/builtin/.
// Usage: node plugins/scripts/build-blessed-plugins.js

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Try AdmZip; fall back to a pure-Node fallback using yazl if available.
let AdmZip;
try { AdmZip = require('adm-zip'); } catch { /* handled below */ }

const ROOT        = path.resolve(__dirname, '..', '..');
const SRC_DIR     = path.join(ROOT, 'plugins', 'src');
const BUILTIN_DIR = path.join(ROOT, 'plugins', 'builtin');

if (!AdmZip) {
  console.error('adm-zip is not installed. Run: npm install adm-zip');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function collectFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push({ full, rel: path.relative(base, full).replace(/\\/g, '/') });
    }
  }
  return results;
}

/**
 * Compute sha256 over (relPath + '\n' + fileBytes) for every file in distDir,
 * files sorted by absolute path (matches tools/plugins/utils/hash-utils.js exactly).
 */
function computeDistHash(distDir) {
  // Collect as absolute paths then sort — same as hash-utils.js
  const absFiles = collectFiles(distDir).map(f => f.full).sort();
  const h = crypto.createHash('sha256');
  for (const full of absFiles) {
    const rel = path.relative(distDir, full).split(path.sep).join('/');
    h.update(rel + '\n');
    h.update(fs.readFileSync(full));
  }
  return 'sha256:' + h.digest('hex');
}

// ── Build each plugin ──────────────────────────────────────────────────────

if (!fs.existsSync(BUILTIN_DIR)) fs.mkdirSync(BUILTIN_DIR, { recursive: true });

const pluginDirs = fs.readdirSync(SRC_DIR).filter(d =>
  fs.statSync(path.join(SRC_DIR, d)).isDirectory()
);

let built = 0;
let failed = 0;

for (const dir of pluginDirs) {
  const pluginDir     = path.join(SRC_DIR, dir);
  const manifestPath  = path.join(pluginDir, 'mcp-plugin.json');
  const distDir       = path.join(pluginDir, 'dist');

  if (!fs.existsSync(manifestPath)) {
    console.warn(`[SKIP] ${dir}: no mcp-plugin.json`);
    continue;
  }
  if (!fs.existsSync(distDir)) {
    console.warn(`[SKIP] ${dir}: no dist/ directory`);
    continue;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const { name, version } = manifest;

    // 1. Compute real dist hash and update manifest in-place
    const hash = computeDistHash(distDir);
    manifest.dist = manifest.dist || {};
    manifest.dist.hash = hash;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // 2. Count files and bytes for manifest.dist metadata
    const distFiles = collectFiles(distDir);
    manifest.dist.fileCount   = distFiles.length;
    manifest.dist.totalBytes  = distFiles.reduce((s, f) => s + fs.statSync(f.full).size, 0);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // 3. Zip: include mcp-plugin.json at root + everything inside dist/
    const zip = new AdmZip();
    zip.addLocalFile(manifestPath, '');                   // mcp-plugin.json at root
    for (const { full, rel } of distFiles) {
      zip.addLocalFile(full, path.dirname(path.join('dist', rel)));
    }

    const zipName  = `${name}@${version}.zip`;
    const zipPath  = path.join(BUILTIN_DIR, zipName);
    zip.writeZip(zipPath);

    const zipSizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
    console.log(`[OK]   ${zipName}  (${zipSizeKb} KB, hash=${hash.slice(0, 20)}…)`);
    built++;
  } catch (err) {
    console.error(`[FAIL] ${dir}: ${err.message}`);
    failed++;
  }
}

console.log(`\nBuilt ${built} plugin(s)${failed ? `, ${failed} failed` : ''} → ${BUILTIN_DIR}`);
if (failed) process.exit(1);
