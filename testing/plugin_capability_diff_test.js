// testing/plugin_capability_diff_test.js
// Integration test: verifies that removing a tool/resource/prompt from a spec plugin
// and reloading applies diff removals via real MCP server + registry + plugin manager.

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
  // Use modern MCP SDK methods (server.tool/resource/prompt). Fallback to legacy register* if present.
  const toolRegistrations = tools.map(t => `  server.registerTool('${t}', { description: 'Test plugin tool ${t} does simple ok response.', inputSchema: { type:'object', properties:{}, additionalProperties:false } }, async () => ({ content:[{ type:'text', text:'ok'}] }));`).join('\n');
  const resourceRegistrations = resources.map(r => `  if (server.resource) { server.resource('${r}', 'memory://${r}', async () => ({ contents:[{ uri:'memory://${r}', mimeType:'text/plain', text:'res ${r}'}] })); } else if (server.registerResource) { server.registerResource('${r}', 'memory://${r}', { description:'test resource ${r}' }, async () => ({ contents:[{ uri:'memory://${r}', mimeType:'text/plain', text:'res ${r}'}] })); }`).join('\n');
  const promptRegistrations = prompts.map(p => `  if (server.prompt) { server.prompt('${p}', { description:'Prompt ${p} returns static text.' }, async () => ({ messages:[{ role:'user', content:[{ type:'text', text:'prompt ${p}'}] }] })); } else if (server.registerPrompt) { server.registerPrompt('${p}', { description:'Prompt ${p} returns static text.' }, async () => ({ content:[{ type:'text', text:'prompt ${p}'}] })); }`).join('\n');
  const entryJs = `export async function createPlugin(server){\n${toolRegistrations}\n${resourceRegistrations}\n${promptRegistrations}\n}`;
  fs.writeFileSync(path.join(distDir, 'index.mjs'), entryJs, 'utf8');
  const distHash = computeDistHash(distDir);
  const manifest = {
    manifestVersion: '2',
    name: 'diff-test-plugin',
    version: '1.0.0',
    entry: 'dist/index.mjs',
    dist: { hash: `sha256:${distHash}` },
    permissions: {}
  };
  fs.writeFileSync(path.join(dir, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

async function run() {
  const projectPlugins = path.join(process.cwd(), 'plugins');
  if (!fs.existsSync(projectPlugins)) fs.mkdirSync(projectPlugins);
  const pluginDir = path.join(projectPlugins, 'diff-test-plugin');
  // Ensure plugin does NOT exist prior to server startup so initial discovery skips it
  if (fs.existsSync(pluginDir)) fs.rmSync(pluginDir, { recursive: true, force: true });

  // Start server (plugin not present yet)
  await createMcpServer();
  const reg = getRegistry();
  const pm = getPluginManager();

  // Now create initial plugin contents
  fs.mkdirSync(pluginDir, { recursive: true });
  const initial = { tools: ['t_keep', 't_remove'], resources: ['r_keep', 'r_remove'], prompts: ['p_keep', 'p_remove'] };
  await writePlugin(pluginDir, initial);
  await pm.refresh(); // discover new plugin
  await pm.loadPlugin('diff-test-plugin');
  // Confirm registration state via registry
  assert(reg.registeredTools.has('t_keep'), 't_keep missing after load');
  assert(reg.registeredTools.has('t_remove'), 't_remove missing after load');
  assert(reg.registeredResources.has('r_keep'), 'r_keep missing after load');
  assert(reg.registeredResources.has('r_remove'), 'r_remove missing after load');
  assert(reg.registeredPrompts.has('p_keep'), 'p_keep missing after load');
  assert(reg.registeredPrompts.has('p_remove'), 'p_remove missing after load');

  // Modify plugin: remove *_remove entries
  const updated = { tools: ['t_keep'], resources: ['r_keep'], prompts: ['p_keep'] };
  await writePlugin(pluginDir, updated);
  await pm.reloadPlugin('diff-test-plugin');

  // Assertions after diff applied
  assert(!reg.registeredTools.has('t_remove'), 't_remove still present after reload');
  assert(!reg.registeredResources.has('r_remove'), 'r_remove still present after reload');
  assert(!reg.registeredPrompts.has('p_remove'), 'p_remove still present after reload');
  assert(reg.registeredTools.has('t_keep'), 't_keep missing after reload');
  console.log('Integration capability diff test passed');
  process.exit(0);
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}
