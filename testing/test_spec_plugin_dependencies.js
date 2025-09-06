const path = require('path');
const fs = require('fs');
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
  const mockServer = { tools: {}, registerTool(name, cfg, handler) { this.tools[name] = { cfg, handler }; } };
  await registerAllTools(mockServer);
  const registry = getRegistry();
  const pm = getPluginManager();

  // Install two spec plugins with a dependency relationship
  const libSrc = path.resolve(__dirname, 'fixtures', 'spec-plugin-dep-lib');
  const appSrc = path.resolve(__dirname, 'fixtures', 'spec-plugin-dep-app');
  const installDir = pm.defaultInstallDir || path.join(__dirname, '..', 'tools', 'plugins');
  const libDest = path.join(installDir, 'dep-lib');
  const appDest = path.join(installDir, 'dep-app');
  try { await fs.promises.rm(libDest, { recursive: true, force: true }); } catch {}
  try { await fs.promises.rm(appDest, { recursive: true, force: true }); } catch {}
  await copyDir(libSrc, libDest);
  await copyDir(appSrc, appDest);

  await pm.refresh();
  const result = await pm.loadAllSpecPlugins();
  if (result.failed.length) {
    throw new Error('Dependency batch load failed: ' + JSON.stringify(result.failed));
  }

  const server = getServerInstance();
  if (!server.tools['dep_lib_echo']) throw new Error('dep_lib_echo missing');
  if (!server.tools['dep_app_use_lib']) throw new Error('dep_app_use_lib missing');

  console.log('Spec plugin dependency load: PASS');
  await cleanup();
}

main().catch(async (e) => { console.error('Spec plugin dependency load: FAIL', e); try { await cleanup(); } catch {} process.exit(1); });
