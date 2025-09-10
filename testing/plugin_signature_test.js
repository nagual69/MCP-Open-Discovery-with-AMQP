// testing/plugin_signature_test.js
// Verifies strict signature enforcement for v2 spec plugins.
// Generates an RSA key pair, stores public key via credentials manager (certificate type),
// creates a minimal plugin with mcp-plugin.json + dist dir, computes hash, signs it,
// writes mcp-plugin.sig, and attempts load with PLUGIN_REQUIRE_SIGNED + allowlist.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PluginManager } = require('../tools/registry/plugin_manager');
const credentialsManager = require('../tools/credentials_manager');
const { CoreRegistry } = require('../tools/registry/core_registry');

async function main() {
  const tempRoot = path.join(process.cwd(), 'plugins', 'signed-test-plugin');
  if (fs.existsSync(tempRoot)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(tempRoot, 'dist'), { recursive: true });

  // Create simple dist file
  const distFile = path.join(tempRoot, 'dist', 'index.js');
  fs.writeFileSync(distFile, 'module.exports = { tools: [], handleToolCall: async () => ({}) };');

  // Compute dist hash replicating computeDistHash algorithm (sorted, path + NUL + content)
  function computeDistHashLocal(dir) {
    const entries = [];
    function walk(d) {
      for (const item of fs.readdirSync(d)) {
        const p = path.join(d, item);
        const rel = path.relative(dir, p).replace(/\\/g, '/');
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p); else entries.push(rel);
      }
    }
    walk(dir);
    entries.sort();
    const hash = crypto.createHash('sha256');
    for (const rel of entries) {
      const content = fs.readFileSync(path.join(dir, rel));
      hash.update(rel + '\0');
      hash.update(content);
    }
    return hash.digest('hex');
  }

  const distHash = computeDistHashLocal(path.join(tempRoot, 'dist'));

  // Manifest
  const manifest = {
    manifestVersion: '2',
    name: 'signed-test-plugin',
    id: 'signed-test-plugin',
    version: '1.0.0',
    entry: './dist/index.js',
    dist: { hash: `sha256:${distHash}` },
    capabilities: { tools: [] }
  };
  fs.writeFileSync(path.join(tempRoot, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2));

  // Generate RSA key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pubPem = publicKey.export({ type: 'pkcs1', format: 'pem' });
  const privPem = privateKey.export({ type: 'pkcs1', format: 'pem' });

  // Store public key as credential
  const keyId = 'test-signing-key';
  try { credentialsManager.removeCredential(keyId); } catch {}
  credentialsManager.addCredential(keyId, 'certificate', { certificate: pubPem });

  // Sign dist hash
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(manifest.dist.hash);
  signer.end();
  const signatureB64 = signer.sign(privPem).toString('base64');
  fs.writeFileSync(path.join(tempRoot, 'mcp-plugin.sig'), signatureB64 + '\n');

  // Configure env for strict mode
  process.env.PLUGIN_REQUIRE_SIGNED = 'true';
  process.env.PLUGIN_TRUSTED_KEY_IDS = keyId;

  // Minimal registry mock
  const registry = new CoreRegistry({ server: { /* mock */ } });
  const pm = new PluginManager(registry, { pluginDirs: [ path.join(process.cwd(), 'plugins') ] });
  await pm.initialize();
  const result = await pm.loadPlugin('signed-test-plugin');
  if (!result) {
    console.error('Plugin failed to load under signature enforcement');
    process.exit(1);
  }
  const p = pm.getPlugin('signed-test-plugin');
  if (!p._signatureVerified) {
    console.error('Signature not marked as verified');
    process.exit(1);
  }
  console.log('Signature test passed: plugin loaded and verified with signer key id', p._signerKeyId);
}

main().catch(e => { console.error(e); process.exit(1); });
