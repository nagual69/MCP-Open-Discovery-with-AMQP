'use strict';

const http = require('http');
const assert = require('node:assert/strict');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const {
  startConfiguredTransports,
  stopConfiguredTransports,
} = require('../dist-ts/src/transports/core/transport-manager.js');
const { NativeAmqpRuntimeAdapter } = require('../dist-ts/src/transports/amqp/amqp-server-transport.js');

function buildConfig() {
  return {
    nodeEnv: 'test',
    transportModes: ['http', 'amqp'],
    port: 3006,
    host: '127.0.0.1',
    pluginsRoot: './plugins',
    dataDir: './data',
    logLevel: 'info',
    requireSignatures: false,
    allowRuntimeDependencies: true,
    strictCapabilities: false,
    strictIntegrity: false,
    oauth: {
      enabled: false,
      realm: 'test',
      protectedEndpoints: [],
      supportedScopes: [],
      authorizationServer: null,
      introspectionEndpoint: null,
      clientId: null,
      clientSecret: null,
      resourceServerUri: 'http://127.0.0.1:3006',
      tokenCacheTtl: 300,
      requireHttps: false,
    },
    amqp: {
      enabled: true,
      url: 'amqp://guest:guest@localhost:5672',
      exchange: 'test.exchange',
      queuePrefix: 'test.queue',
      prefetch: 1,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      messageTTL: 60000,
      queueTTL: 120000,
      autoRecoveryEnabled: true,
      recoveryRetryInterval: 100,
      recoveryMaxRetries: 2,
      recoveryBackoffMultiplier: 1,
      recoveryMaxRetryInterval: 100,
    },
  };
}

function fetchHealth() {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: '127.0.0.1', port: 3006, path: '/health' },
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
      },
    );

    request.on('error', reject);
    request.end();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const server = new McpServer({ name: 'typed-amqp-health-recovery', version: '1.0.0' });
  const adapter = new NativeAmqpRuntimeAdapter();
  let creationCount = 0;

  adapter._transportFactory = () => {
    const instanceId = ++creationCount;
    let connected = false;

    return {
      ontransportclosed: undefined,
      async start() {
        if (instanceId === 1) {
          throw new Error('broker unavailable');
        }

        await wait(250);
        connected = true;
      },
      async close() {
        connected = false;
      },
      getStatus() {
        return {
          enabled: true,
          connected,
          exchange: 'test.exchange',
          queuePrefix: 'test.queue',
          error: connected ? undefined : 'broker unavailable',
        };
      },
    };
  };

  const config = buildConfig();
  const { results, managed } = await startConfiguredTransports(server, config, { amqpRuntime: adapter });

  try {
    assert.equal(results.transports.find((transport) => transport.mode === 'http')?.started, true, 'HTTP transport should start');
    assert.equal(results.transports.find((transport) => transport.mode === 'amqp')?.started, false, 'AMQP should fail initial start and recover in background');

    await wait(20);
    const waitingHealth = await fetchHealth();
    assert.equal(waitingHealth.amqp.connected, false, 'AMQP should still be disconnected while waiting to retry');
    assert.equal(waitingHealth.amqp.recovery.enabled, true, 'AMQP recovery should be enabled');
    assert.equal(waitingHealth.amqp.recovery.state, 'waiting', 'Health should expose the waiting recovery state');

    await wait(140);
    const attemptingHealth = await fetchHealth();
    assert.equal(attemptingHealth.amqp.connected, false, 'AMQP should still be disconnected while retrying');
    assert.equal(attemptingHealth.amqp.recovery.state, 'attempting', 'Health should expose the attempting recovery state');

    await wait(220);
    const recoveredHealth = await fetchHealth();
    assert.equal(recoveredHealth.amqp.connected, true, 'AMQP should reconnect after recovery');
    assert.equal(recoveredHealth.amqp.recovery.state, 'idle', 'Recovery state should return to idle after success');

    console.log('Waiting health:', JSON.stringify(waitingHealth));
    console.log('Attempting health:', JSON.stringify(attemptingHealth));
    console.log('Recovered health:', JSON.stringify(recoveredHealth));
    console.log('PASS test_amqp_health_recovery');
  } finally {
    await stopConfiguredTransports(managed);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});