#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// plugins/scripts/build-blessed-plugins.js
// Build all blessed source plugins into .zip files under plugins/builtin/.
// Usage: node plugins/scripts/build-blessed-plugins.js

'use strict';

const fs   = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

// Try AdmZip; fall back to a pure-Node fallback using yazl if available.
let AdmZip;
try { AdmZip = require('adm-zip'); } catch { /* handled below */ }

const ROOT        = path.resolve(__dirname, '..', '..');
const SRC_DIR     = path.join(ROOT, 'plugins', 'src');
const BUILTIN_DIR = path.join(ROOT, 'plugins', 'builtin');
const HOST_PROVIDED_PACKAGES = new Set(['@modelcontextprotocol/sdk']);
const BUILTIN_MODULES = new Set(Module.builtinModules.map(name => name.replace(/^node:/, '')));

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

function ensurePosixPath(value) {
  return value.replace(/\\/g, '/');
}

function copyDirectory(sourceDir, destinationDir) {
  fs.cpSync(sourceDir, destinationDir, { recursive: true, force: true, dereference: true });
}

function getPackageNameFromSpecifier(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return null;
  }

  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }

  return specifier.split('/')[0];
}

function scanRuntimeDependencies(distDir) {
  const jsFiles = collectFiles(distDir)
    .map(file => file.full)
    .filter(file => file.endsWith('.js'));

  const specifiers = new Set();
  const patterns = [
    /require\((['"])([^'"]+)\1\)/g,
    /import\((['"])([^'"]+)\1\)/g,
    /from\s+(['"])([^'"]+)\1/g,
  ];

  for (const file of jsFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const packageName = getPackageNameFromSpecifier(match[2]);
        if (!packageName) continue;
        const normalized = packageName.replace(/^node:/, '');
        if (BUILTIN_MODULES.has(normalized) || HOST_PROVIDED_PACKAGES.has(packageName)) continue;
        specifiers.add(packageName);
      }
    }
  }

  return Array.from(specifiers).sort();
}

function resolvePackageRoot(packageName) {
  const manifestPath = require.resolve(`${packageName}/package.json`, { paths: [ROOT] });
  return path.dirname(manifestPath);
}

function collectRecursiveRuntimePackages(initialPackages) {
  const queue = [...initialPackages];
  const resolved = new Map();

  while (queue.length > 0) {
    const packageName = queue.shift();
    if (!packageName || resolved.has(packageName) || HOST_PROVIDED_PACKAGES.has(packageName)) {
      continue;
    }

    const packageRoot = resolvePackageRoot(packageName);
    const packageManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    resolved.set(packageName, packageRoot);

    for (const dependencyName of Object.keys({
      ...(packageManifest.dependencies || {}),
      ...(packageManifest.optionalDependencies || {}),
    })) {
      if (!resolved.has(dependencyName) && !HOST_PROVIDED_PACKAGES.has(dependencyName)) {
        queue.push(dependencyName);
      }
    }
  }

  return resolved;
}

function vendorRuntimeDependencies(distDir, packageMap) {
  if (packageMap.size === 0) {
    return [];
  }

  const stagedNodeModules = path.join(distDir, 'node_modules');
  fs.mkdirSync(stagedNodeModules, { recursive: true });

  for (const [packageName, packageRoot] of packageMap.entries()) {
    const destination = path.join(stagedNodeModules, ...packageName.split('/'));
    copyDirectory(packageRoot, destination);
  }

  return Array.from(packageMap.keys()).sort();
}

/**
 * Compute sha256 over (relPath + '\n' + fileBytes) for every file in distDir,
 * files sorted by relative POSIX path (matches src/plugins/integrity/hash-utils.ts exactly).
 */
function computeDistHash(distDir) {
  const files = collectFiles(distDir).sort((left, right) => left.rel.localeCompare(right.rel));
  const h = crypto.createHash('sha256');
  for (const file of files) {
    h.update(file.rel + '\n');
    h.update(fs.readFileSync(file.full));
  }
  return 'sha256:' + h.digest('hex');
}

function writeManifest(manifestPath, manifest, distDir) {
  const { hash, fileCount, totalBytes } = computeDistHashDetailed(distDir);
  const nextManifest = {
    ...manifest,
    dist: {
      ...(manifest.dist || {}),
      hash,
      fileCount,
      totalBytes,
    },
  };
  fs.writeFileSync(manifestPath, JSON.stringify(nextManifest, null, 2));
  return nextManifest;
}

function computeDistHashDetailed(distDir) {
  const distFiles = collectFiles(distDir);
  return {
    hash: computeDistHash(distDir),
    fileCount: distFiles.length,
    totalBytes: distFiles.reduce((sum, file) => sum + fs.statSync(file.full).size, 0),
  };
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
    const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sourceManifestWithHash = writeManifest(manifestPath, sourceManifest, distDir);
    const { name, version } = sourceManifestWithHash;

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `mcpod-blessed-${dir}-`));
    try {
      const stagedDistDir = path.join(tempRoot, 'dist');
      copyDirectory(distDir, stagedDistDir);

      const directRuntimeDeps = scanRuntimeDependencies(stagedDistDir);
      const runtimePackages = collectRecursiveRuntimePackages(directRuntimeDeps);
      const bundledDependencies = vendorRuntimeDependencies(stagedDistDir, runtimePackages);
      const zippedManifest = {
        ...sourceManifestWithHash,
        build: {
          ...(sourceManifestWithHash.build || {}),
          bundledRuntimeDependencies: bundledDependencies,
        },
      };
      const zippedManifestWithHash = {
        ...zippedManifest,
        dist: {
          ...(zippedManifest.dist || {}),
          ...computeDistHashDetailed(stagedDistDir),
        },
      };

      // 3. Zip: include mcp-plugin.json at root + everything inside staged dist/
    const zip = new AdmZip();
      zip.addFile('mcp-plugin.json', Buffer.from(JSON.stringify(zippedManifestWithHash, null, 2), 'utf8'));
      for (const { full, rel } of collectFiles(stagedDistDir)) {
        zip.addLocalFile(full, path.dirname(ensurePosixPath(path.join('dist', rel))));
      }

      const zipName  = `${name}@${version}.zip`;
      const zipPath  = path.join(BUILTIN_DIR, zipName);
      zip.writeZip(zipPath);

      const zipSizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
      const depLabel = bundledDependencies.length ? `, deps=${bundledDependencies.join(',')}` : '';
      console.log(`[OK]   ${zipName}  (${zipSizeKb} KB, hash=${zippedManifestWithHash.dist.hash.slice(0, 20)}…${depLabel})`);
      built++;
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`[FAIL] ${dir}: ${err.message}`);
    failed++;
  }
}

console.log(`\nBuilt ${built} plugin(s)${failed ? `, ${failed} failed` : ''} → ${BUILTIN_DIR}`);
if (failed) process.exit(1);
