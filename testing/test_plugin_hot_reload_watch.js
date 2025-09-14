// testing/test_plugin_hot_reload_watch.js
// Verifies spec plugin dist watcher triggers automatic reload on changes.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getRegistry, getPluginManager } = require('../tools/registry');
const { computeDistHash } = require('../tools/registry/plugin_loader');
const { createMcpServer } = require('../mcp_open_discovery_server');

async function writePlugin(dir, { tools, resources, prompts }) {
  const distDir = path.join(dir, 'dist');
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  const toolRegs = tools.map(t => `  server.registerTool('${t}', { description: 'Tool ${t}', inputSchema: { type:'object', properties:{}, additionalProperties:false } }, async () => ({ content:[{ type:'text', text:'ok'}] }));`).join('\n');
  const resRegs = resources.map(r => `  if (server.resource) { server.resource('${r}', 'memory://${r}', async () => ({ contents:[{ uri:'memory://${r}', mimeType:'text/plain', text:'res ${r}'}] })); } else if (server.registerResource) { server.registerResource('${r}', 'memory://${r}', { description:'res ${r}' }, async () => ({ contents:[{ uri:'memory://${r}', mimeType:'text/plain', text:'res ${r}'}] })); }`).join('\n');
  const promptRegs = prompts.map(p => `  if (server.prompt) { server.prompt('${p}', { description:'Prompt ${p}' }, async () => ({ messages:[{ role:'user', content:[{ type:'text', text:'prompt ${p}'}] }] })); } else if (server.registerPrompt) { server.registerPrompt('${p}', { description:'Prompt ${p}' }, async () => ({ content:[{ type:'text', text:'prompt ${p}'}] })); }`).join('\n');
  const entry = `export async function createPlugin(server){\n${toolRegs}\n${resRegs}\n${promptRegs}\n}`;
  fs.writeFileSync(path.join(distDir, 'index.mjs'), entry, 'utf8');
  const distHash = computeDistHash(distDir);
  const manifest = {
    manifestVersion: '2',
    name: 'hot-reload-watch-plugin',
    version: '1.0.0',
    entry: 'dist/index.mjs',
    dist: { hash: `sha256:${distHash}` },
    permissions: {}
  };
  fs.writeFileSync(path.join(dir, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const pluginsRoot = path.join(process.cwd(), 'plugins');
  if (!fs.existsSync(pluginsRoot)) fs.mkdirSync(pluginsRoot);
  const dir = path.join(pluginsRoot, 'hot-reload-watch-plugin');
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  await createMcpServer();
  const reg = getRegistry();
  const pm = getPluginManager();

  // initial plugin
  fs.mkdirSync(dir, { recursive: true });
  await writePlugin(dir, { tools: ['w_keep', 'w_remove'], resources: [], prompts: [] });
  await pm.refresh();
  await pm.loadPlugin('hot-reload-watch-plugin');

  // sanity
  assert(reg.registeredTools.has('w_keep'), 'w_keep not registered');
  assert(reg.registeredTools.has('w_remove'), 'w_remove not registered');

  // update plugin: remove w_remove
  await writePlugin(dir, { tools: ['w_keep'], resources: [], prompts: [] });

  // Wait for watcher-triggered reload (allow up to 4 seconds; watcher debounce is 400ms)
  let ok = false; const start = Date.now();
  while (Date.now() - start < 4000) {
    await sleep(250);
    if (!reg.registeredTools.has('w_remove') && reg.registeredTools.has('w_keep')) { ok = true; break; }
  }
  assert(ok, 'Watcher did not trigger reload to remove w_remove');

  console.log('PASS: plugin hot-reload watcher triggered reload');
  process.exit(0);
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}
