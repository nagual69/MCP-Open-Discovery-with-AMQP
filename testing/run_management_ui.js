// Simple harness to start the Management UI, query endpoints, and stop
const { registerAllTools, getRegistry, cleanup } = require('../tools/registry/index.js');
const { ManagementUI } = require('../tools/registry/management_ui.js');

async function main() {
  const keepAlive = process.argv.includes('--serve');
  const port = process.env.MGMT_UI_PORT ? Number(process.env.MGMT_UI_PORT) : 8080;

  // Minimal mock MCP server for registry registration
  const mockServer = {
    tools: {},
    registerTool(name, config, handler) { this.tools[name] = { config, handler }; },
  };

  // Register known tools so UI has data to display
  await registerAllTools(mockServer);
  const registry = getRegistry();

  const ui = new ManagementUI(registry, { port, enabled: true });
  await ui.start();

  if (keepAlive) {
    console.log(`[UI Test] Management UI running at http://localhost:${port} (Ctrl+C to stop)`);
    return; // do not stop
  }

  // One-shot validation: fetch /api/status and print
  const fetch = require('node-fetch');
  const res = await fetch(`http://localhost:${port}/api/status`);
  const json = await res.json();
  console.log('[UI Test] /api/status response:');
  console.log(JSON.stringify(json, null, 2));

  await ui.stop();
  await cleanup();
}

main().catch(async (err) => {
  console.error('[UI Test] Error:', err);
  try { await cleanup(); } catch {}
  process.exit(1);
});
