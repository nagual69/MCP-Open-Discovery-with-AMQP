const assert = require('node:assert/strict');

const { AmqpServerTransport, NativeAmqpRuntimeAdapter } = require('../dist-ts/src/transports/amqp/amqp-server-transport.js');

function createMockChannel() {
  const consumers = new Map();
  const events = new Map();

  return {
    published: [],
    sentToQueue: [],
    assertedExchanges: [],
    assertedQueues: [],
    bindings: [],
    acked: [],
    nacked: [],
    prefetchCount: null,
    on(event, listener) {
      events.set(event, listener);
    },
    emit(event, value) {
      const listener = events.get(event);
      if (listener) {
        listener(value);
      }
    },
    async prefetch(count) {
      this.prefetchCount = count;
    },
    async assertExchange(exchange, type, options) {
      this.assertedExchanges.push({ exchange, type, options });
    },
    async assertQueue(queue, options) {
      const resolvedQueue = queue || `amq.gen-${this.assertedQueues.length + 1}`;
      this.assertedQueues.push({ queue: resolvedQueue, options });
      return { queue: resolvedQueue };
    },
    async bindQueue(queue, exchange, pattern) {
      this.bindings.push({ queue, exchange, pattern });
    },
    async consume(queue, handler) {
      consumers.set(queue, handler);
      return { consumerTag: `consumer-${queue}` };
    },
    publish(exchange, routingKey, content, options) {
      this.published.push({ exchange, routingKey, content, options });
      return true;
    },
    sendToQueue(queue, content, options) {
      this.sentToQueue.push({ queue, content, options });
      return true;
    },
    ack(message) {
      this.acked.push(message);
    },
    nack(message, allUpTo, requeue) {
      this.nacked.push({ message, allUpTo, requeue });
    },
    async close() {},
    deliver(queue, content, properties = {}) {
      const handler = consumers.get(queue);
      if (!handler) {
        throw new Error(`No consumer registered for ${queue}`);
      }
      handler({ content, properties });
    },
  };
}

function createMockConnection(channel, { emitCloseOnClose = false } = {}) {
  const events = new Map();
  return {
    async createChannel() {
      return channel;
    },
    on(event, listener) {
      events.set(event, listener);
    },
    emit(event, value) {
      const listener = events.get(event);
      if (listener) {
        listener(value);
      }
    },
    async close() {
      if (emitCloseOnClose) {
        this.emit('close');
      }
    },
  };
}

async function startTransport(options = {}) {
  const channel = createMockChannel();
  const connection = createMockConnection(channel, options.connectionOptions);
  const transport = new AmqpServerTransport({
    amqpUrl: 'amqp://guest:guest@localhost:5672',
    exchangeName: 'test.exchange',
    queuePrefix: 'test.queue',
    messageTTL: 60_000,
    queueTTL: 120_000,
  });
  transport._connectFn = async () => connection;
  await transport.start();
  return { transport, channel, connection };
}

async function testResponseRoutingUsesRelatedRequestId() {
  const { transport, channel } = await startTransport();
  const queueName = `test.queue.requests.${transport.sessionId}`;
  const received = [];
  transport.onmessage = (message) => {
    received.push(message);
  };

  channel.deliver(
    queueName,
    Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'tools/list' })),
    { correlationId: 'corr-42', replyTo: 'reply-queue' },
  );

  assert.equal(received.length, 1, 'request should reach onmessage');

  await transport.send(
    { jsonrpc: '2.0', id: 42, result: { ok: true } },
    { relatedRequestId: 42 },
  );

  assert.equal(channel.sentToQueue.length, 1, 'response should be sent to reply queue');
  assert.equal(channel.sentToQueue[0].queue, 'reply-queue');
  assert.equal(channel.sentToQueue[0].options.correlationId, 'corr-42');
  assert.equal(channel.sentToQueue[0].options.contentType, 'application/json');

  await transport.close();
}

async function testNotificationRouting() {
  const { transport, channel } = await startTransport();

  await transport.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });

  assert.equal(channel.published.length, 1, 'notification should be published');
  assert.equal(channel.published[0].exchange, 'test.exchange.mcp.routing');
  assert.equal(channel.published[0].routingKey, 'mcp.notification.notifications.tools.list_changed');
  assert.equal(channel.published[0].options.contentType, 'application/json');

  await transport.close();
}

async function testReconnectSchedulingIsDeduped() {
  const { transport } = await startTransport();
  const originalSetTimeout = global.setTimeout;
  const scheduled = [];

  global.setTimeout = (callback, delay) => {
    scheduled.push({ callback, delay });
    return { hasRef() { return false; }, refresh() { return this; }, ref() { return this; }, unref() { return this; } };
  };

  try {
    transport.handleConnectionError(new Error('boom'));
    transport.handleConnectionClosed();
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.equal(scheduled.length, 1, 'error and close should schedule only one reconnect');

  await transport.close();
}

async function testExplicitCloseNotifiesOnce() {
  const { transport } = await startTransport({ connectionOptions: { emitCloseOnClose: true } });
  let closed = 0;
  transport.onclose = () => {
    closed += 1;
  };

  await transport.close();

  assert.equal(closed, 1, 'explicit close should emit onclose once');
}

function createMockServer() {
  return {
    connections: [],
    async connect(transport) {
      this.connections.push(transport);
      if (typeof transport.start === 'function') {
        await transport.start();
      }
    },
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testInitialStartSchedulesBackgroundRecovery() {
  const server = createMockServer();
  const adapter = new NativeAmqpRuntimeAdapter();
  let creationCount = 0;

  adapter._transportFactory = () => {
    creationCount += 1;
    let connected = false;

    return {
      async start() {
        if (creationCount === 1) {
          throw new Error('broker unavailable');
        }
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

  const result = await adapter.start(server, {
    enabled: true,
    mode: 'amqp',
    url: 'amqp://guest:guest@localhost:5672',
    exchange: 'test.exchange',
    queuePrefix: 'test.queue',
    reconnectDelay: 5_000,
    maxReconnectAttempts: 10,
    recoveryRetryInterval: 10,
    recoveryMaxRetries: 2,
    recoveryBackoffMultiplier: 1,
    recoveryMaxRetryInterval: 10,
    autoRecoveryEnabled: true,
  });

  assert.equal(result.started, false, 'initial AMQP start should report failure when broker is unavailable');
  assert.match(result.details ?? '', /background recovery scheduled/i);

  await wait(40);

  const status = adapter.getStatus();
  assert.equal(status.connected, true, 'background recovery should connect AMQP after initial failure');
  assert.equal(status.recovery?.state, 'idle', 'recovery state should reset to idle after success');
  assert.equal(server.connections.length, 2, 'server should see a retry connection after the initial failure');

  await adapter.stop();
}

async function testPermanentCloseTriggersBackgroundRecovery() {
  const server = createMockServer();
  const adapter = new NativeAmqpRuntimeAdapter();
  const transports = [];

  adapter._transportFactory = () => {
    let connected = false;
    const transport = {
      ontransportclosed: undefined,
      async start() {
        connected = true;
      },
      async close() {
        connected = false;
        transport.ontransportclosed?.(new Error('closed'));
      },
      getStatus() {
        return {
          enabled: true,
          connected,
          exchange: 'test.exchange',
          queuePrefix: 'test.queue',
          error: connected ? undefined : 'closed',
        };
      },
    };
    transports.push(transport);
    return transport;
  };

  const result = await adapter.start(server, {
    enabled: true,
    mode: 'amqp',
    url: 'amqp://guest:guest@localhost:5672',
    exchange: 'test.exchange',
    queuePrefix: 'test.queue',
    reconnectDelay: 5_000,
    maxReconnectAttempts: 10,
    recoveryRetryInterval: 10,
    recoveryMaxRetries: 2,
    recoveryBackoffMultiplier: 1,
    recoveryMaxRetryInterval: 10,
    autoRecoveryEnabled: true,
  });

  assert.equal(result.started, true, 'initial AMQP start should succeed');

  await transports[0].close();
  await wait(40);

  const status = adapter.getStatus();
  assert.equal(status.connected, true, 'adapter should reconnect after permanent transport closure');
  assert.equal(server.connections.length, 2, 'server should reconnect AMQP after permanent closure');

  await adapter.stop();
}

async function main() {
  await testResponseRoutingUsesRelatedRequestId();
  await testNotificationRouting();
  await testReconnectSchedulingIsDeduped();
  await testExplicitCloseNotifiesOnce();
  await testInitialStartSchedulesBackgroundRecovery();
  await testPermanentCloseTriggersBackgroundRecovery();
  console.log('PASS test_amqp_transport');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});