/**
 * Integration smoke test for the typed transport manager with a real MCP server.
 */

const http = require('http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const {
  startConfiguredTransports,
  stopConfiguredTransports,
  getTransportStatus,
} = require('../dist-ts/src/transports/core/transport-manager.js');

function buildConfig(modes) {
  return {
    nodeEnv: 'test',
    transportModes: modes,
    port: 3004,
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
}

function fetchRootPayload() {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: 3004, path: '/' }, (response) => {
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
    });

    request.on('error', reject);
    request.end();
  });
}

async function main() {
  const server = new McpServer({
    name: 'typed-transport-integration',
    version: '1.0.0',
  });

  const config = buildConfig(['http']);
  const { results, managed } = await startConfiguredTransports(server, config);

  try {
    const httpStarted = results.transports.some(
      (transport) => transport.mode === 'http' && transport.started
    );

    if (!httpStarted) {
      throw new Error('Expected HTTP transport to start with real MCP server');
    }

    const status = getTransportStatus(config, managed);
    const rootPayload = await fetchRootPayload();

    if (!status.active.includes('http')) {
      throw new Error('Expected HTTP transport to be active');
    }

    if (rootPayload.service !== 'MCP Open Discovery 3 Server') {
      throw new Error(`Unexpected root payload service value: ${rootPayload.service}`);
    }

    console.log('Integration results:', JSON.stringify(results));
    console.log('Integration status:', JSON.stringify(status));
    console.log('Root payload:', JSON.stringify(rootPayload));
    console.log('PASS test_transport_integration');
  } finally {
    await stopConfiguredTransports(managed);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});