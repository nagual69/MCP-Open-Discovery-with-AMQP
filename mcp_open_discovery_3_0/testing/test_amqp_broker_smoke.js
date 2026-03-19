const assert = require('node:assert/strict');
const amqplib = require('amqplib');

const AMQP_URL = process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672';
const EXCHANGE = process.env.AMQP_EXCHANGE || 'mcp-open-discovery-3.notifications';
const SERVER_QUEUE_PREFIX = process.env.AMQP_QUEUE_PREFIX || 'mcp-open-discovery-3.discovery';
const ROUTING_EXCHANGE = `${EXCHANGE}.mcp.routing`;

function routingKey(method, messageType = 'request') {
  return `mcp.${messageType}.${String(method).replace(/\//g, '.')}`;
}

async function waitForResponse(channel, queue, correlationId, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      void channel.checkQueue(queue).then((status) => {
        reject(new Error(`Timed out waiting for response ${correlationId}; reply queue ${queue} has ${status.messageCount} pending messages and ${status.consumerCount} consumers`));
      }).catch(() => {
        reject(new Error(`Timed out waiting for response ${correlationId}`));
      });
    }, timeoutMs);

    channel.consume(
      queue,
      (message) => {
        if (!message) {
          return;
        }

        try {
          if (message.properties.correlationId !== correlationId) {
            channel.nack(message, false, true);
            return;
          }

          const payload = JSON.parse(message.content.toString('utf8'));
          channel.ack(message);
          clearTimeout(timer);
          void channel.cancel(consumerTag);
          resolve(payload);
        } catch (error) {
          channel.nack(message, false, false);
          clearTimeout(timer);
          void channel.cancel(consumerTag);
          reject(error);
        }
      },
      { noAck: false },
    ).then(({ consumerTag }) => {
      resolve({ consumerTag, ready: true });
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function sendRequest(channel, replyQueue, id, method, params = {}) {
  const correlationId = `broker-smoke-${id}`;
  let resolveResponse;
  let rejectResponse;
  const responsePromise = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });

  const registration = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out registering consumer for ${correlationId}`));
    }, 5000);

    channel.consume(
      replyQueue,
      (message) => {
        if (!message) {
          return;
        }

        try {
          if (message.properties.correlationId !== correlationId) {
            channel.nack(message, false, true);
            return;
          }

          const payload = JSON.parse(message.content.toString('utf8'));
          channel.ack(message);
          clearTimeout(timer);
          resolveResponse(payload);
        } catch (error) {
          channel.nack(message, false, false);
          clearTimeout(timer);
          rejectResponse(error);
        }
      },
      { noAck: false },
    ).then(({ consumerTag }) => {
      clearTimeout(timer);
      resolve({ consumerTag });
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  const responseTimeout = setTimeout(async () => {
    try {
      const status = await channel.checkQueue(replyQueue);
      rejectResponse(new Error(`Timed out waiting for response ${correlationId}; reply queue ${replyQueue} has ${status.messageCount} pending messages and ${status.consumerCount} consumers`));
    } catch {
      rejectResponse(new Error(`Timed out waiting for response ${correlationId}`));
    }
  }, 10000);

  const message = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };

  channel.publish(
    ROUTING_EXCHANGE,
    routingKey(method),
    Buffer.from(JSON.stringify(message)),
    {
      correlationId,
      replyTo: replyQueue,
      contentType: 'application/json',
      timestamp: Date.now(),
      persistent: false,
    },
  );

  try {
    return await responsePromise;
  } finally {
    clearTimeout(responseTimeout);
    await channel.cancel(registration.consumerTag);
  }
}

async function sendNotification(channel, method, params = {}) {
  const message = {
    jsonrpc: '2.0',
    method,
    params,
  };

  channel.publish(
    ROUTING_EXCHANGE,
    routingKey(method, 'notification'),
    Buffer.from(JSON.stringify(message)),
    {
      contentType: 'application/json',
      timestamp: Date.now(),
      persistent: false,
    },
  );
}

async function main() {
  const connection = await amqplib.connect(AMQP_URL);
  const channel = await connection.createChannel();

  try {
    await channel.assertExchange(ROUTING_EXCHANGE, 'topic', { durable: true });
    const responseQueue = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: false,
      arguments: {
        'x-message-ttl': 60000,
        'x-expires': 120000,
      },
    });

    const initializeResponse = await sendRequest(channel, responseQueue.queue, 1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'amqp-broker-smoke', version: '1.0.0' },
    });

    assert.equal(initializeResponse.jsonrpc, '2.0');
    assert.equal(initializeResponse.id, 1);
    assert.ok(initializeResponse.result, 'initialize should return a result');
    assert.equal(initializeResponse.result.serverInfo?.name, 'mcp-open-discovery-3');

    await sendNotification(channel, 'notifications/initialized', {});

    const toolsListResponse = await sendRequest(channel, responseQueue.queue, 2, 'tools/list', {});
    assert.equal(toolsListResponse.jsonrpc, '2.0');
    assert.equal(toolsListResponse.id, 2);
    assert.ok(toolsListResponse.result, 'tools/list should return a result');
    assert.ok(Array.isArray(toolsListResponse.result.tools), 'tools/list result should include a tools array');

    console.log(JSON.stringify({
      initialize: initializeResponse.result,
      toolsCount: toolsListResponse.result.tools.length,
      sampleTools: toolsListResponse.result.tools.slice(0, 5).map((tool) => tool.name),
      exchange: EXCHANGE,
      queuePrefix: SERVER_QUEUE_PREFIX,
    }, null, 2));
    console.log('PASS test_amqp_broker_smoke');
  } finally {
    await channel.close();
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});