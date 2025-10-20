const path = require('path');
const fs = require('fs');
const os = require('os');

async function ensureDir(p) { await fs.promises.mkdir(p, { recursive: true }); }
async function rimraf(p) { try { await fs.promises.rm(p, { recursive: true, force: true }); } catch {} }

async function writeFile(p, data) { await ensureDir(path.dirname(p)); await fs.promises.writeFile(p, data, 'utf8'); }

function computeDistHash(distDir) {
  const crypto = require('crypto');
  const files = [];
  (function walk(dir){
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full); else if (st.isFile()) files.push(path.relative(distDir, full).replace(/\\/g,'/'));
    }
  })(distDir);
  files.sort();
  const h = crypto.createHash('sha256');
  for (const rel of files) {
    h.update(rel);
    h.update('\0');
    h.update(fs.readFileSync(path.join(distDir, rel)));
  }
  return h.digest('hex');
}

async function createSpecPluginAt(destDir, { id, entryCode, manifestExtras = {} }) {
  await ensureDir(destDir);
  const distDir = path.join(destDir, 'dist');
  const entryPath = path.join(distDir, 'index.js');
  await writeFile(entryPath, entryCode);
  const hashHex = computeDistHash(distDir);
  const manifest = Object.assign({
    manifestVersion: '2',
    name: id,
    version: '1.0.0',
    entry: 'dist/index.js',
    dist: { hash: `sha256:${hashHex}` }
  }, manifestExtras || {});
  await writeFile(path.join(destDir, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2));
}

async function main() {
  const { registerAllTools, getRegistry, getPluginManager, cleanup } = require('../tools/registry');

  // Minimal mock server compatible with registry
  const mockServer = { tools: {}, registerTool(name, cfg, handler) { this.tools[name] = { cfg, handler }; } };
  await registerAllTools(mockServer);
  const pm = getPluginManager();

  const toolsRoot = pm.categorizedDirs ? pm.categorizedDirs.tools : (pm.defaultInstallDir || path.join(__dirname, '..', 'tools', 'plugins'));

  const created = [];
  let failures = 0;

  // 1) STRICT_CAPABILITIES: declared capability not registered => expect failure
  try {
    process.env.STRICT_CAPABILITIES = 'true';
    const id = 'cap-mismatch';
    const dest = path.join(toolsRoot, id);
    await rimraf(dest);
    await createSpecPluginAt(dest, {
      id,
      entryCode: `module.exports.createPlugin = async (server)=>{ /* intentionally register different name */ server.registerTool('other_tool', { inputSchema: { type:'object' } }, async ()=>({content:[{type:'text', text:'ok'}]})); };`,
      manifestExtras: { capabilities: { tools: ['cap_tool'] } }
    });
    await pm.refresh();
    const ok = await pm.loadPlugin(id);
    if (ok) throw new Error('Expected STRICT_CAPABILITIES failure');
  } catch (e) {
    const msg = String(e && e.message || e);
    if (!/Capability mismatch|strict/i.test(msg)) { console.error('Unexpected error for STRICT_CAPABILITIES:', msg); failures++; }
  } finally {
    process.env.STRICT_CAPABILITIES = '';
  }

  // 2) sandbox-required with SANDBOX_AVAILABLE=false => expect failure
  try {
    delete process.env.SANDBOX_AVAILABLE;
    const id = 'sandbox-required-no';
    const dest = path.join(toolsRoot, id);
    await rimraf(dest);
    await createSpecPluginAt(dest, {
      id,
      entryCode: `module.exports.createPlugin = async ()=>{ return; };`,
      manifestExtras: { dependenciesPolicy: 'sandbox-required' }
    });
    await pm.refresh();
    const ok = await pm.loadPlugin(id);
    if (ok) throw new Error('Expected sandbox-required availability failure');
  } catch (e) {
    const msg = String(e && e.message || e);
    if (!/sandbox-required|sandbox not available/i.test(msg)) { console.error('Unexpected error for sandbox-required:', msg); failures++; }
  }

  // 3) Native addon gate with PLUGIN_ALLOW_NATIVE=false => expect failure
  try {
    process.env.PLUGIN_ALLOW_NATIVE = '';
    const id = 'native-denied';
    const dest = path.join(toolsRoot, id);
    await rimraf(dest);
    await createSpecPluginAt(dest, {
      id,
      entryCode: `module.exports.createPlugin = async ()=>{ require('addon.node'); };`,
      manifestExtras: {}
    });
    await pm.refresh();
    const ok = await pm.loadPlugin(id);
    if (ok) throw new Error('Expected native addon gate failure');
  } catch (e) {
    const msg = String(e && e.message || e);
    if (!/native addon|PLUGIN_ALLOW_NATIVE|Native addon requires/i.test(msg)) { console.error('Unexpected error for native gate:', msg); failures++; }
  } finally {
    process.env.PLUGIN_ALLOW_NATIVE = '';
  }

  // 4) SCHEMA_PATH sanity: set to the bundled v2 schema and load minimal plugin successfully
  try {
    const schemaPath = path.resolve(__dirname, '..', 'docs', 'mcp-od-marketplace', 'specs', 'schemas', 'mcp-plugin.schema.v2.json');
    process.env.SCHEMA_PATH = schemaPath;
    const id = 'schema-path-ok';
    const dest = path.join(toolsRoot, id);
    await rimraf(dest);
    await createSpecPluginAt(dest, {
      id,
      entryCode: `module.exports.createPlugin = async (server)=>{ server.registerTool('ok_tool', { inputSchema: { type:'object' } }, async ()=>({content:[{type:'text', text:'ok'}]})); };`,
      manifestExtras: {}
    });
    await pm.refresh();
    const ok = await pm.loadPlugin(id);
    if (!ok) throw new Error('Expected SCHEMA_PATH load success');
  } catch (e) {
    console.error('Unexpected SCHEMA_PATH behavior:', e.message || e); failures++;
  } finally {
    delete process.env.SCHEMA_PATH;
  }

  if (failures > 0) {
    console.error(`Policy enforcements test: FAIL (${failures} failure(s))`);
    try { const { cleanup } = require('../tools/registry'); await cleanup(); } catch {}
    process.exit(1);
  } else {
    console.log('Policy enforcements test: PASS');
    try { const { cleanup } = require('../tools/registry'); await cleanup(); } catch {}
    process.exit(0);
  }
}

main().catch(async (e) => { console.error('Policy enforcements test: FAIL', e); try { const { cleanup } = require('../tools/registry'); await cleanup(); } catch {} process.exit(1); });
