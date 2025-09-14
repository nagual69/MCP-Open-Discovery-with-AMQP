// This is a lightweight mock-style test to exercise the strict failure condition in _verifyPluginSignatureIfRequired
const path = require('path');
const { PluginManager } = require('../tools/registry/plugin_manager');

(async () => {
  const pm = new PluginManager({ getServerInstance: ()=>({}) }, { policy: { requireSignature: true } });
  const plugin = { id: 'sig-test', manifest: { name: 'sig-test', version: '0.0.1', dist: { hash: 'sha256:' + 'a'.repeat(64) } } };
  let failed = false;
  try {
    await pm._verifyPluginSignatureIfRequired(plugin, path.resolve('.'));
  } catch (e) { failed = true; }
  if (!failed) { console.error('FAIL: required signature did not fail when no signatures present'); process.exit(1); }
  console.log('PASS: signature strictness path triggers failure without signatures');
})();
