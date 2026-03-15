'use strict';

const http = require('http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const {
  startConfiguredTransports,
  stopConfiguredTransports,
  getTransportStatus,
} = require('../dist-ts/src/transports/core/transport-manager.js');

const config = {
  nodeEnv: 'test',
  transportModes: ['http'],
  port: 7777,
  host: '127.0.0.1',
  pluginsRoot: './plugins',
  dataDir: './data',
  requireSignatures: false,
  allowRuntimeDependencies: true,
  strictCapabilities: false,
  strictIntegrity: false,
  oauth: {
    enabled: false,
    realm: 'test',
    protectedEndpoints: [],
  },
};

function fetchHealth() {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: '127.0.0.1', port: 7777, path: '/health' },
      (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on('error', reject);
    request.end();
  });
}

async function main() {
  const server = new McpServer({ name: 'typed-health-test', version: '1.0.0' });
  const { managed } = await startConfiguredTransports(server, config);

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const health = await fetchHealth();
    const status = getTransportStatus(config, managed);

    if (health.status !== 'healthy') {
      throw new Error(`Expected health endpoint status healthy, got ${health.status}`);
    }

    if (!status.active.includes('http')) {
      throw new Error('Expected HTTP transport to be active');
    }

    console.log('Health response:', JSON.stringify(health));
    console.log('Transport status:', JSON.stringify(status));
    console.log('PASS test_health_func');
  } finally {
    await stopConfiguredTransports(managed);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
