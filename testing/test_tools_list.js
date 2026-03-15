'use strict';
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const pm = require('../tools/plugins/plugin-manager');
const { getDb } = require('../tools/plugins/db/plugin-db');

const srv = new McpServer({ name: 't', version: '1.0' });
pm.setMcpServer(srv);

const plugins = getDb().prepare("SELECT id FROM plugins WHERE lifecycle_state='active'").all();

(async () => {
  for (const p of plugins) {
    await pm.activate(p.id, { actor: 'test', force: true });
    console.log('Activated', p.id, '- tools so far:', Object.keys(srv._registeredTools || {}).length);
  }

  // Find which tool has a null schema field
  const { zodToJsonSchema } = require('zod-to-json-schema');
  const { z } = require('zod');
  let badCount = 0;
  for (const [name, toolDef] of Object.entries(srv._registeredTools || {})) {
    try {
      const schema = toolDef.inputSchema;
      if (schema) zodToJsonSchema(z.object(schema));
    } catch (e) {
      badCount++;
      console.log('BAD TOOL:', name, '-', e.message.substring(0, 100));
    }
  }
  if (badCount === 0) {
    console.log('ALL TOOLS PASS schema validation. Total:', Object.keys(srv._registeredTools || {}).length);
  } else {
    console.log('FAILED:', badCount, 'tool(s)');
  }

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
