// Quick test: activate plugins with force:true on a fresh McpServer
'use strict';
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const pm = require('../tools/plugins/plugin-manager');
const { getDb } = require('../tools/plugins/db/plugin-db');

const server = new McpServer({ name: 'test', version: '1.0.0' });
pm.setMcpServer(server);

const db = getDb();
const plugins = db.prepare("SELECT id FROM plugins WHERE lifecycle_state = 'active' OR lifecycle_state = 'updating'").all();
console.log('Plugins in DB:', plugins.map(p => p.id));

(async () => {
  for (const p of plugins) {
    try {
      const result = await pm.activate(p.id, { actor: 'test', force: true });
      console.log('Activated', p.id, '->', JSON.stringify(result));
    } catch (e) {
      console.error('FAILED', p.id, e.message);
    }
  }

  const toolNames = Object.keys(server._registeredTools || {});
  console.log('\nTotal tools registered on McpServer:', toolNames.length);
  toolNames.slice(0, 10).forEach(t => console.log(' ', t));
})().catch(e => { console.error(e); process.exit(1); });
