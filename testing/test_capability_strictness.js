const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadSpecPlugin, computeDistHash } = require('../tools/registry/plugin_loader');

(async () => {
  // Build a tiny plugin on disk
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpod-cap-'));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const entry = path.join(dist, 'index.js');
  fs.writeFileSync(entry, 'export async function createPlugin(server){ server.tool("actual_tool", { description:"x", inputSchema:{} }, async()=>({content:[{type:"text", text:"ok"}]})); }');
  const hash = computeDistHash(dist);
  const manifest = {
    manifestVersion: '2',
    name: 'cap-test',
    version: '0.0.1',
    entry: 'dist/index.js',
    dist: { hash: 'sha256:' + hash },
    capabilities: { tools: [{ name: 'declared_tool' }] }
  };
  fs.writeFileSync(path.join(root, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2));
  let threw = false;
  try {
    await loadSpecPlugin({}, root, manifest, { dryRun: true, strictCapabilities: true });
  } catch (e) {
    threw = true;
  }
  if (!threw) { console.error('FAIL: strict capabilities did not throw'); process.exit(1); }
  console.log('PASS: capability strictness throws on mismatch');
})();
