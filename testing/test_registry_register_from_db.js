/**
 * Test: CoreRegistry loads tools from DB and registers via server.registerTool
 */
const path = require('path');

(async () => {
  const idx = require('../tools/registry/index.js');
  const reg = idx.getRegistry();
  await reg.initialize();

  // Monkey-patch DB to a tiny controlled dataset pointing at an existing module
  // Use registry_tools_sdk and one tool for deterministic behavior
  const moduleName = 'registry_tools_sdk';
  const toolName = 'registry_get_status';

  reg.db.getModules = async () => ([{ id: 1, module_name: moduleName, category: 'Registry', created_at: new Date().toISOString() }]);
  reg.db.getTools = async () => ([{ id: 1, module_id: 1, module_name: moduleName, tool_name: toolName, category: 'Registry', created_at: new Date().toISOString() }]);

  const calls = [];
  const mockServer = {
    registerTool: (name, cfg, handler) => {
      calls.push({ name, cfgOk: !!cfg && typeof cfg === 'object', handlerOk: typeof handler === 'function' });
    }
  };

  await reg.loadToolsFromDatabase(mockServer);

  const ok = calls.length === 1 && calls[0].name === toolName && calls[0].cfgOk && calls[0].handlerOk;
  if (!ok) {
    console.error('Assertion failed:', calls);
    process.exit(1);
  }
  console.log('PASS test_registry_register_from_db');
  await idx.cleanup();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
