// Comprehensive plugin integrity & policy tests (Phase 4)
// Covers: integrity cache reuse, policy enforcement errors, capability mismatch, checksum duplication.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { computeDistHashDetailed, loadSpecPlugin } = require('../tools/registry/plugin_loader');
const { IntegrityError, PolicyError, CapabilityMismatchError } = require('../tools/registry/errors');

// Minimal mock server capturing registrations
function makeServer() {
  return { tools: {}, registerTool(name, cfg, handler){ this.tools[name] = { cfg, handler }; } };
}

async function writeFile(p, c){ await fs.promises.mkdir(path.dirname(p), { recursive: true }); await fs.promises.writeFile(p, c, 'utf8'); }

function buildManifest(overrides={}) {
  return {
    manifestVersion: '2',
    name: overrides.name || 'test-plugin',
    version: '0.0.1',
    entry: 'dist/index.cjs',
    dependenciesPolicy: overrides.dependenciesPolicy || 'bundled-only',
    externalDependencies: overrides.externalDependencies,
    capabilities: overrides.capabilities,
    permissions: overrides.permissions || {},
    dist: overrides.dist || { hash: 'sha256:PLACEHOLDER' }
  };
}

(async () => {
  const tmp = path.join(os.tmpdir(), 'mcpod-int-tests-' + Date.now());
  await fs.promises.mkdir(tmp, { recursive: true });
  const distDir = path.join(tmp, 'dist');
  await fs.promises.mkdir(distDir, { recursive: true });
  const indexPath = path.join(distDir, 'index.cjs');
  await writeFile(indexPath, 'module.exports.createPlugin = (s)=>{ s.registerTool("demo_tool", { description: "demo" }, async()=>({ ok:true })); };');

  // 1. Compute initial hash & confirm cache reuse
  const first = computeDistHashDetailed(distDir);
  const second = computeDistHashDetailed(distDir);
  if (first.hashHex !== second.hashHex) {
    console.error('FAIL: hash changed unexpectedly between cached calls');
    process.exit(1);
  }

  // Build manifest with real hash
  const manifest = buildManifest({ dist: { hash: 'sha256:' + first.hashHex, fileCount: first.fileCount, totalBytes: first.totalBytes } });

  // 2. Load success path
  const server = makeServer();
  try {
    await loadSpecPlugin(server, tmp, manifest, {});
  } catch (e) {
    console.error('FAIL: expected successful load, got error', e);
    process.exit(1);
  }
  if (!server.tools['demo_tool']) {
    console.error('FAIL: demo_tool not registered');
    process.exit(1);
  }

  // 3. PolicyError: external deps without flag
  const manifestExt = buildManifest({ name: 'ext-plugin', externalDependencies: ['leftpad'], dependenciesPolicy: 'external-allowed', dist: { hash: manifest.dist.hash } });
  try {
    await loadSpecPlugin(makeServer(), tmp, manifestExt, {});
    console.error('FAIL: expected PolicyError for external deps without flag');
    process.exit(1);
  } catch (e) {
    if (!(e instanceof PolicyError)) {
      console.error('FAIL: expected PolicyError, got', e.name, e.message);
      process.exit(1);
    }
  }

  // 4. Capability mismatch when STRICT_CAPABILITIES=1
  process.env.STRICT_CAPABILITIES = '1';
  const manifestCap = buildManifest({ name: 'cap-plugin', capabilities: { tools: [{ name: 'declared_tool' }] }, dist: { hash: manifest.dist.hash } });
  try {
    await loadSpecPlugin(makeServer(), tmp, manifestCap, {});
    console.error('FAIL: expected CapabilityMismatchError');
    process.exit(1);
  } catch (e) {
    if (!(e instanceof CapabilityMismatchError)) {
      console.error('FAIL: expected CapabilityMismatchError, got', e.name);
      process.exit(1);
    }
  }
  delete process.env.STRICT_CAPABILITIES;

  // 5. IntegrityError on hash mismatch
  const badManifest = buildManifest({ name: 'bad-hash', dist: { hash: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' } });
  try {
    await loadSpecPlugin(makeServer(), tmp, badManifest, {});
    console.error('FAIL: expected IntegrityError for hash mismatch');
    process.exit(1);
  } catch (e) {
    if (!(e instanceof IntegrityError)) {
      console.error('FAIL: expected IntegrityError, got', e.name);
      process.exit(1);
    }
  }

  // 6. Duplicate checksum entry triggers IntegrityError
  const checksumManifest = buildManifest({ name: 'dup-checksum', dist: { hash: manifest.dist.hash, checksums: { files: [ { path: 'index.cjs', sha256: first.hashHex }, { path: 'index.cjs', sha256: first.hashHex } ] } } });
  try {
    await loadSpecPlugin(makeServer(), tmp, checksumManifest, {});
    console.error('FAIL: expected IntegrityError for duplicate checksum');
    process.exit(1);
  } catch (e) {
    if (!(e instanceof IntegrityError)) {
      console.error('FAIL: expected IntegrityError duplicate checksum, got', e.name);
      process.exit(1);
    }
  }

  console.log('Plugin integrity & policy tests: PASS');
  try { await fs.promises.rm(tmp, { recursive: true, force: true }); } catch {}
  process.exit(0);
})();
