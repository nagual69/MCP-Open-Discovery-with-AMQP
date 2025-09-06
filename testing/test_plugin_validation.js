// Minimal test to ensure PluginManager blocks invalid tool-module via ToolValidationManager in strict mode
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ToolValidationManager } = require('../tools/registry/tool_validation_manager');
const { PluginManager } = require('../tools/registry/plugin_manager');

(async () => {
  const tmpDir = path.join(os.tmpdir(), `mcpod-plugin-test-${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const pluginFile = path.join(tmpDir, 'bad_plugin.js');

  const badPluginSource = `
  /**
   * PLUGIN_MANIFEST
   * {"id":"bad_plugin","name":"Bad Plugin","version":"0.0.1","type":"tool-module"}
   */
  module.exports = {
    tools: [
      { name: "1bad", description: "Too short", inputSchema: { type: "object", properties: {} } },
      { name: "validName", description: "short", inputSchema: { type: "object", properties: {} } }
    ],
    handleToolCall: async (name, args) => ({ ok: true, name, args })
  };
  `;
  await fs.promises.writeFile(pluginFile, badPluginSource, 'utf8');

  const vm = new ToolValidationManager();
  vm.updateConfig({ strictMode: true });
  const pm = new PluginManager({/* registry placeholder */}, {
    pluginDirs: [tmpDir],
    defaultInstallDir: tmpDir,
    validationManager: vm,
  });

  await pm.initialize();
  const listed = pm.listPlugins();
  if (!listed.find(p => p.id === 'bad_plugin')) {
    console.error('FAIL: bad_plugin not discovered');
    process.exit(1);
  }
  const ok = await pm.loadPlugin('bad_plugin');
  if (ok) {
    console.error('FAIL: loadPlugin should have failed but returned true');
    process.exit(1);
  }
  const info = pm.getPlugin('bad_plugin');
  if (!info || !info.error) {
    console.error('FAIL: expected plugin error to be set');
    process.exit(1);
  }
  console.log('PASS: Validation blocked plugin load:', info.error);
  try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch {}
  process.exit(0);
})();
