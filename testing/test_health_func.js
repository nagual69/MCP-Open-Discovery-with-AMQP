'use strict';
// Reproduce the exact server startup to test if getHealthData is wired correctly
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const pluginRegistry = require('../tools/plugins/plugin-registry');
const {
  startAllTransports,
  detectEnvironment,
  createTransportConfig,
  parseTransportMode
} = require('../tools/transports/core/transport-manager');

const http = require('http');

function getHealthData() {
  const stats = pluginRegistry.getStats();
  console.log('[getHealthData] called — stats:', JSON.stringify(stats));
  return {
    status: 'healthy',
    version: '2.0.0',
    registry: stats,
    uptime: process.uptime()
  };
}

(async () => {
  const server = new McpServer({ name: 'test', version: '1.0.0' });

  await pluginRegistry.initialize(server);
  console.log('Initialized. Stats:', JSON.stringify(pluginRegistry.getStats()));

  const env = detectEnvironment();
  const cfg = createTransportConfig(env, {
    HTTP_PORT: 7777,
    getHealthData: getHealthData
  });

  console.log('cfg.getHealthData is:', typeof cfg.getHealthData, cfg.getHealthData === getHealthData ? '(same ref)' : '(DIFFERENT ref!)');

  await startAllTransports(server, ['http'], cfg);
  console.log('Transport started. Checking health...');

  await new Promise(r => setTimeout(r, 1000));

  const req = http.request({ hostname: 'localhost', port: 7777, path: '/health' }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      console.log('Health response:', d);
      process.exit(0);
    });
  });
  req.end();
})().catch(e => { console.error(e); process.exit(1); });
