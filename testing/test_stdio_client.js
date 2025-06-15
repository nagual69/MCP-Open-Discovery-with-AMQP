/**
 * Simple MCP client test for stdio transport
 * This verifies that our server works with standard MCP clients like MCP Inspector
 */

const { spawn } = require('child_process');
const path = require('path');

async function testStdioTransport() {
  console.log('Testing MCP stdio transport...');
  
  // Start our server
  const serverPath = path.join(__dirname, 'mcp_server_multi_transport_sdk.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TRANSPORT_MODE: 'stdio' }
  });

  let responseData = '';
  
  server.stdout.on('data', (data) => {
    responseData += data.toString();
    console.log('Server response:', data.toString());
  });

  server.stderr.on('data', (data) => {
    console.log('Server stderr:', data.toString());
  });

  // Wait a moment for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Send initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'test-mcp-client',
        version: '1.0.0'
      }
    }
  };

  console.log('Sending initialize request...');
  server.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Send tools/list request
  const listRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  };

  console.log('Sending tools/list request...');
  server.stdin.write(JSON.stringify(listRequest) + '\n');

  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Clean up
  server.kill();
  
  console.log('Test completed. Check output above for any issues.');
}

// Run the test
testStdioTransport().catch(console.error);
