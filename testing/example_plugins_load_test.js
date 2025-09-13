// testing/example_plugins_load_test.js
// Creates example plugins of three types and validates they load via PluginManager

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { createMcpServer } = require('../mcp_open_discovery_server');
const { getPluginManager } = require('../tools/registry');

function computeDistHashLocal(dir) {
  const crypto = require('crypto');
  function listFilesRecursive(root) {
    const result = [];
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const abs = path.join(d, entry.name);
        if (entry.isDirectory()) walk(abs); else if (entry.isFile()) result.push(abs);
      }
    };
    walk(root);
    return result.map(f => path.relative(root, f)).sort();
  }
  const files = listFilesRecursive(dir);
  const hash = require('crypto').createHash('sha256');
  for (const rel of files) {
    const data = fs.readFileSync(path.join(dir, rel));
    hash.update(Buffer.from(rel));
    hash.update(Buffer.from([0])); // NUL separator
    hash.update(data);
  }
  return hash.digest('hex');
}

async function createSpecV2Plugin(rootDir, name) {
  const distDir = path.join(rootDir, name, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const entry = `export async function createPlugin(server){
  server.registerTool('${name}_echo', { description: 'echo', inputSchema: { type:'object', properties:{ msg:{ type:'string' } }, required:[], additionalProperties:false } }, async (toolName, args)=>({ content:[{ type:'text', text: args.msg ? String(args.msg) : 'ok' }] }));
}`;
  fs.writeFileSync(path.join(distDir, 'index.mjs'), entry, 'utf8');
  const hash = computeDistHashLocal(distDir);
  const manifest = {
    manifestVersion: '2',
    name,
    version: '1.0.0',
    entry: 'dist/index.mjs',
    dist: { hash: `sha256:${hash}` },
    permissions: {}
  };
  fs.writeFileSync(path.join(rootDir, name, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2));
  return path.join(rootDir, name);
}

async function createLegacyModulePlugin(rootDir, id) {
  const dir = path.join(rootDir, `${id}.js`);
  const code = `module.exports = {
  tools: [{ name: '${id}_legacy', description: 'legacy tool', inputSchema: { type:'object', properties:{}, additionalProperties:false } }],
  async handleToolCall(name, args){ return { content:[{ type:'text', text:'ok'}] }; }
};`;
  fs.writeFileSync(dir, code, 'utf8');
  return dir;
}

async function createRemoteSpecZip(tempRoot, name) {
  // Build a spec plugin in temp and then ZIP it if adm-zip is available, else return dir
  const pluginDir = path.join(tempRoot, name);
  fs.mkdirSync(pluginDir, { recursive: true });
  const distDir = path.join(pluginDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.mjs'), `export async function createPlugin(server){ server.registerTool('${name}_t', { description:'t', inputSchema:{ type:'object', properties:{}, additionalProperties:false } }, async()=>({ content:[{ type:'text', text:'ok'}] })); }`);
  const hash = computeDistHashLocal(distDir);
  fs.writeFileSync(path.join(pluginDir, 'mcp-plugin.json'), JSON.stringify({ manifestVersion:'2', name, version:'1.0.0', entry:'dist/index.mjs', dist:{ hash:`sha256:${hash}` }, permissions:{} }, null, 2));
  let zipPath = null;
  try {
    const AdmZip = require('adm-zip');
    const tmpZip = path.join(tempRoot, `${name}.zip`);
    const zip = new AdmZip();
    const addDirRecursive = (base, rel='') => {
      for (const e of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
        const r = path.join(rel, e.name);
        const abs = path.join(base, r);
        if (e.isDirectory()) addDirRecursive(base, r);
        else zip.addFile(r.replace(/\\/g,'/'), fs.readFileSync(abs));
      }
    };
    addDirRecursive(pluginDir);
    zip.writeZip(tmpZip);
    zipPath = tmpZip;
  } catch {
    return { type: 'dir', srcPath: pluginDir };
  }
  return { type: 'zip', srcPath: zipPath };
}

async function run() {
  // Ensure working plugin dir exists and is clean for our test IDs BEFORE server starts
  const pluginRoot = path.join(process.cwd(), 'plugins');
  fs.mkdirSync(pluginRoot, { recursive: true });
  for (const id of ['spec-v2-demo','legacy-demo','remote-demo']) {
    const p = path.join(pluginRoot, id);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    const js = path.join(pluginRoot, `${id}.js`);
    if (fs.existsSync(js)) fs.rmSync(js, { force: true });
  }

  await createMcpServer();
  const pm = getPluginManager();

  // 1) Spec v2 plugin in-place under plugins/
  const specDir = await createSpecV2Plugin(pluginRoot, 'spec-v2-demo');

  // 2) Legacy single-file tool module under plugins/
  await createLegacyModulePlugin(pluginRoot, 'legacy-demo');

  // 3) Remote-style install from temp zip (or dir fallback)
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcpod-remote-'));
  const staged = await createRemoteSpecZip(tempRoot, 'remote-demo');

  // Discover and load
  await pm.refresh();
  // Load spec and legacy discovered directly
  assert(await pm.loadPlugin('spec-v2-demo'), 'Failed to load spec-v2-demo');
  assert(await pm.loadPlugin('legacy-demo'), 'Failed to load legacy-demo');

  // Install remote and auto-load
  if (staged.type === 'zip') {
    const res = await pm.installFromFile(staged.srcPath, { autoLoad: true, pluginId: 'remote-demo' });
    assert(res.success, 'Remote zip install failed');
  } else {
    // Fallback: copy dir into plugins and load
    const dest = path.join(pluginRoot, 'remote-demo');
    fs.mkdirSync(dest, { recursive: true });
    const copyDir = async (src, dst) => {
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); await copyDir(s, d); }
        else fs.copyFileSync(s, d);
      }
    };
    await copyDir(staged.srcPath, dest);
    await pm.refresh();
    assert(await pm.loadPlugin('remote-demo'), 'Failed to load remote-demo');
  }

  // Basic assertions on plugin list
  const list = pm.listPlugins();
  const ids = list.map(p => p.id);
  assert(ids.includes('spec-v2-demo'), 'spec-v2-demo not listed');
  assert(ids.includes('legacy-demo'), 'legacy-demo not listed');
  assert(ids.includes('remote-demo'), 'remote-demo not listed');

  console.log('Example plugins load test passed');
  // Explicitly exit 0 to signal success in CI/terminal runners
  process.exit(0);
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}
