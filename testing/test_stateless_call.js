
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js'); // Or similar
// Actually I'll use a mock transport to see what the server expects.

class MockTransport {
  constructor() {
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  async start() {}
  
  async send(message) {
    console.log('Server sent:', JSON.stringify(message));
  }

  async close() {}

  // Helper to simulate incoming message
  async receive(message) {
    if (this.onmessage) {
      await this.onmessage(message);
    }
  }
}

async function test() {
  const server = new McpServer({
    name: 'test-server',
    version: '1.0.0'
  });

  server.tool('test_tool', {}, async () => {
    return { content: [{ type: 'text', text: 'success' }] };
  });

  const transport = new MockTransport();
  await server.connect(transport);

  console.log('Sending tool call without initialize...');
  try {
    await transport.receive({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'test_tool',
        arguments: {}
      },
      id: 1
    });
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
