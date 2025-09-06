const path = require('path');
const fs = require('fs');
const os = require('os');
const { registerAllTools, getRegistry, getPluginManager, getServerInstance, cleanup } = require('../tools/registry');
const { ManagementUI } = require('../tools/registry/management_ui');

async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(s, d);
    } else if (e.isFile()) {
      await fs.promises.copyFile(s, d);
    }
  }
}

async function main() {
  // Mock server compatible with registry expectations
  const mockServer = { tools: {}, registerTool(name, cfg, handler) { this.tools[name] = { cfg, handler }; } };
  await registerAllTools(mockServer);

  const registry = getRegistry();
  const pm = getPluginManager();
  const ui = new ManagementUI(registry, { port: 8081 });
  await ui.start();

  // Copy minimal spec plugin into install dir and load
  const pluginRoot = path.resolve(__dirname, 'fixtures', 'spec-plugin-minimal');
  const installDir = pm.defaultInstallDir || path.join(__dirname, '..', 'tools', 'plugins');
  const destDir = path.join(installDir, 'spec-minimal');
  // Clean any previous run
  try { await fs.promises.rm(destDir, { recursive: true, force: true }); } catch {}
  await copyDir(pluginRoot, destDir);
  await pm.refresh();
  const loadOk = await pm.loadPlugin('spec-minimal');
  if (!loadOk) throw new Error('Load failed');

  // Confirm tool is registered via server mock
  const server = getServerInstance();
  if (!server.tools || !server.tools['spec_echo']) throw new Error('spec_echo not registered');

  // Call the tool via test endpoint
  const fetch = require('node-fetch');
  const resp = await fetch('http://localhost:8081/api/test-tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'spec_echo', args: { msg: 'hi' } }) });
  const json = await resp.json();
  if (!json.success) throw new Error('Tool test failed: ' + JSON.stringify(json));
  if (!String(json.result.content?.[0]?.text || '').includes('echo:hi')) throw new Error('Unexpected tool response');

  console.log('Spec plugin E2E: PASS');
  await ui.stop();
  await cleanup();
}

main().catch(async (e) => { console.error('Spec plugin E2E: FAIL', e); try { await cleanup(); } catch {} process.exit(1); });
