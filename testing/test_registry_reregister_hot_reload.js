/**
 * Test: reregisterModuleTools refreshes handlers after hot reload
 */
const fs = require('fs');
const path = require('path');

const tempDir = path.join(__dirname, '..', 'tools');
const modName = 'temp_test_module_sdk';
const modPath = path.join(tempDir, `${modName}.js`);

function writeModule(handlerText) {
  const content = `
const tools = [
  { name: 'temp_echo', description: 'echo', inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: [] } }
];
async function handleToolCall(name, args) {
  ${handlerText}
}
module.exports = { tools, handleToolCall };
`;
  fs.writeFileSync(modPath, content, 'utf8');
}

(async () => {
  const idx = require('../tools/registry/index.js');
  const reg = idx.getRegistry();
  await reg.initialize();

  // Initial module write
  writeModule("return { content: [{ type: 'text', text: 'v1' }] };");

  const calls = [];
  const mockServer = {
    registerTool: (name, cfg, handler) => {
      calls.push({ name, handler });
    }
  };

  // Initialize registry fully with mock server to set serverInstance
  await idx.registerAllTools(mockServer);

  // Use dynamic loader to register the temp module (v1)
  const result = await idx.dynamicLoadModule({ modulePath: modPath, moduleName: modName, category: 'Test' });
  if (!result || !result.success) { console.error('Dynamic load failed', result); process.exit(1); }

  // Capture the last registration for our temp tool (v1)
  const before = calls.filter(c => c.name === 'temp_echo').slice(-1)[0];
  if (!before) { console.error('Temp tool not registered initially'); process.exit(1); }

  // Modify the module to new behavior (v2)
  writeModule("return { content: [{ type: 'text', text: 'v2' }] };");

  // Ensure HRM has path mapping (dynamicLoadModule should have set it)
  const hrm = idx.getHotReloadManager();
  if (hrm && hrm.moduleFilePaths && !hrm.moduleFilePaths.get(modName)) {
    hrm.moduleFilePaths.set(modName, modPath);
  }

  // Re-register tools after hot-reload
  const rr = await idx.reregisterModuleTools(modName);
  if (!rr || rr.failed) { console.error('Re-register failed', rr); process.exit(1); }

  // Capture the last registration for our temp tool (v2)
  const after = calls.filter(c => c.name === 'temp_echo').slice(-1)[0];
  if (!after) { console.error('Temp tool not registered after re-register'); process.exit(1); }
  if (before.handler === after.handler) {
    console.error('Handler was not refreshed after hot-reload');
    process.exit(1);
  }

  console.log('PASS test_registry_reregister_hot_reload');
  await idx.cleanup();
  try { fs.unlinkSync(modPath); } catch {}
  process.exit(0);
})().catch(err => { console.error(err); try { fs.unlinkSync(modPath); } catch {}; process.exit(1); });
