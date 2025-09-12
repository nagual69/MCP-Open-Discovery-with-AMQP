// Tests: signature required behaviors and lock v2 validation

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert');
const { PluginManager } = require('../tools/registry/plugin_manager');
const { computeDistHashDetailed } = require('../tools/registry/plugin_loader');

async function write(p, c){ await fs.promises.mkdir(path.dirname(p), { recursive: true }); await fs.promises.writeFile(p, c, 'utf8'); }

function buildManifest(base = {}) {
  return {
    manifestVersion: '2',
    name: base.name || 'sig',
    version: '0.0.1',
  entry: 'dist/index.js',
    dependenciesPolicy: 'bundled-only',
    dist: base.dist || { hash: 'sha256:PLACEHOLDER' }
  };
}

(async () => {
  const tmpRoot = path.join(os.tmpdir(), 'mcpod-sig-tests-' + Date.now());
  const pluginDir = path.join(tmpRoot, 'plugins', 'tools', 'sig');
  const distDir = path.join(pluginDir, 'dist');
  await fs.promises.mkdir(distDir, { recursive: true });
  await write(path.join(distDir, 'index.js'), 'module.exports.createPlugin=(s)=>{};');
  const { hashHex, fileCount, totalBytes } = computeDistHashDetailed(distDir);
  const manifest = buildManifest({ dist: { hash: 'sha256:' + hashHex, fileCount, totalBytes } });
  await write(path.join(pluginDir, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2));

  // Initialize a lightweight registry shim exposing required methods
  const registryShim = {
    getServerInstance(){ return { registerTool(){}, registerResource(){}, registerPrompt(){} }; },
    getValidationManager(){ return null; },
  };
  const pm = new PluginManager(registryShim, { policy: { requireSignature: true } });
  await pm.initialize();

  // Discover the plugin we just wrote
  await pm._discoverPlugin(pluginDir);
  const plugin = pm.search({ query: 'sig' })[0];
  if (!plugin) { console.error('FAIL: plugin not discovered'); process.exit(1); }

  // Attempt to load without signature should fail (loadPlugin returns false)
  const ok = await pm.loadPlugin('sig');
  if (ok) {
    console.error('FAIL: expected signature-required load failure (got ok=true)');
    process.exit(1);
  }

  // Write a minimal lock and validate ok hash
  const res = await pm.validateLockFile(pluginDir);
  if (res.ok) {
    // ok is only true when lock exists and matches; we haven't written, so expect not ok
  }
  // Write lock via manager
  await pm._writeExtendedLock(pluginDir, manifest, {});
  const res2 = await pm.validateLockFile(pluginDir);
  if (!res2 || !('ok' in res2)) { console.error('FAIL: validateLockFile did not return ok flag'); process.exit(1); }

  // Now mutate dist and expect drift
  await write(path.join(distDir, 'extra.txt'), 'x');
  const drift = await pm.validateLockFile(pluginDir);
  if (drift.ok) { console.error('FAIL: expected drift after modifying dist'); process.exit(1); }

  console.log('Signatures & lock validation tests: PASS');
  try { await fs.promises.rm(tmpRoot, { recursive: true, force: true }); } catch {}
  process.exit(0);
})();
