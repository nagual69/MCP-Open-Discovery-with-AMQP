// Smoke-test the tool schema for tool_store_install accepts checksum/signature fields
const { tools } = require('../tools/marketplace_tools_sdk');

(async () => {
  const installTool = tools.find(t => t.name === 'tool_store_install');
  if (!installTool) { console.error('FAIL: install tool missing'); process.exit(1); }
  const schema = installTool.inputSchema;
  try {
    // This is zod; parse should exist
    const parsed = schema.parse({
      url: 'https://example.com/plugin.zip',
      pluginId: 'demo',
      autoLoad: false,
      checksum: 'abc123',
      checksumAlgorithm: 'sha256',
      signature: 'YmFzZTY0c2ln',
      publicKey: '-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----',
      signatureAlgorithm: 'RSA-SHA256'
    });
    if (!parsed) throw new Error('no parse result');
    console.log('PASS: marketplace install input schema accepts extended fields');
  } catch (e) {
    console.error('FAIL: zod parse failed', e.message);
    process.exit(1);
  }
})();
