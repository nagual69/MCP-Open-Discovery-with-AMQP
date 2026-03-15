/**
 * Typed transport manager smoke test.
 */

const {
  determineEnabledTransports,
  startConfiguredTransports,
  stopConfiguredTransports,
  getTransportStatus,
} = require('../dist-ts/src/transports/core/transport-manager.js');

function buildConfig(modes) {
  return {
    nodeEnv: 'test',
    transportModes: modes,
    port: 3003,
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

async function main() {
  const enabled = determineEnabledTransports(buildConfig(['stdio', 'http']));
  const mockServer = {
    async connect() {},
  };

  const config = buildConfig(['http']);
  const { results, managed } = await startConfiguredTransports(mockServer, config);

  try {
    if (enabled.join(',') !== 'stdio,http') {
      throw new Error(`Unexpected enabled transport list: ${enabled.join(',')}`);
    }

    if (!results.transports.some((transport) => transport.mode === 'http' && transport.started)) {
      throw new Error('Expected HTTP transport to start');
    }

    const status = getTransportStatus(config, managed);
    if (!status.active.includes('http')) {
      throw new Error('Expected HTTP transport to be active');
    }

    console.log('Enabled transports:', enabled.join(','));
    console.log('Start results:', JSON.stringify(results));
    console.log('Status:', JSON.stringify(status));
    console.log('PASS test_transport_manager');
  } finally {
    await stopConfiguredTransports(managed);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});