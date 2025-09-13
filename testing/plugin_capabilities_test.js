/**
 * Plugin Capabilities Registration Pipeline Test
 * - Verifies that after registry initialization and plugin manager load,
 *   plugin-declared tools/resources/prompts are reflected in CoreRegistry stats.
 * - Assumes at least one spec plugin is available in plugins/ with mcp-plugin.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { registerAllTools, getRegistry, getPluginManager } = require('../tools/registry');

(async () => {
  try {
    // Mock server with minimal required interface
    const registrations = { tools: [], resources: [], prompts: [] };
    const server = {
      registerTool: (name, cfg, handler) => { registrations.tools.push(name); },
      registerResource: (name, uri, meta, reader) => { registrations.resources.push(name); },
      registerPrompt: (name, cfg, cb) => { registrations.prompts.push(name); }
    };

    // Create a temp spec plugin if none exist to ensure assertions
    const pluginsDir = path.resolve(__dirname, '..', 'tools', 'plugins');
    await fs.promises.mkdir(pluginsDir, { recursive: true });
    const sampleId = 'sample-cap-plugin';
    const sampleDir = path.join(pluginsDir, sampleId);
    if (!fs.existsSync(sampleDir)) {
      await fs.promises.mkdir(sampleDir, { recursive: true });
      // dist directory with entry
      const distDir = path.join(sampleDir, 'dist');
      await fs.promises.mkdir(distDir, { recursive: true });
      const entryCode = `export async function createPlugin(server){\n server.registerTool('sample_echo',{ description:'Echo tool', inputSchema:{ type:'object', properties:{ msg:{type:'string'}}, required:['msg']}}, async (name,args)=>({ content:[{type:'text', text: args.msg}] }));\n server.registerResource('sample_resource','inmemory://sample',{ description:'Sample Resource'}, async ()=>({ type:'text', text:'resource-body'}));\n server.registerPrompt('sample_prompt',{ description:'Sample Prompt', inputSchema:{}}, async ()=>({ messages:[{ role:'user', content:'Hi'}]}));\n }`;
      await fs.promises.writeFile(path.join(distDir, 'entry.js'), entryCode, 'utf8');
      const hash = require('../tools/registry/plugin_loader').computeDistHash(distDir);
      const manifest = {
        manifestVersion: '2',
        name: 'sample-cap-plugin',
        id: 'sample-cap-plugin',
        version: '0.0.1',
        entry: 'dist/entry.js',
        dist: { hash: `sha256:${hash}` },
        permissions: { network: false }
      };
      await fs.promises.writeFile(path.join(sampleDir, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
    }

    await registerAllTools(server, {}); // now should load sample plugin too
    const registry = getRegistry();
    const pm = getPluginManager();

    // Collect plugin capability overview
    const plugins = pm.listPlugins().filter(p => p.type === 'spec-plugin');
    const summary = registry.getStats();

    console.log('[Test] Plugins discovered:', plugins.map(p => p.id));
    console.log('[Test] Registry stats:', summary);
    console.log('[Test] Registered tools:', registrations.tools.length);

    // Recompute after ensuring sample plugin
    const hasSample = plugins.some(p => p.id === 'sample-cap-plugin');
    if (!hasSample) {
      console.error('[Test] ❌ Sample plugin not discovered');
      process.exit(1);
    }
    if (!summary.tools || summary.tools < 1) {
      console.error('[Test] ❌ Expected at least 1 tool registered');
      process.exit(1);
    }
    if (summary.resources === undefined || summary.prompts === undefined) {
      console.error('[Test] ❌ Registry stats missing resource/prompt counts');
      process.exit(1);
    }
    console.log('[Test] ✅ Capability registration pipeline assertions passed:', { tools: summary.tools, resources: summary.resources, prompts: summary.prompts });
    process.exit(0);
  } catch (e) {
    console.error('[Test] ❌ Error running capability pipeline test:', e);
    process.exit(1);
  }
})();
