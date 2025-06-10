// Simple MCP test client
const http = require('http');

const SERVER_URL = 'http://localhost:3000';

// Test MCP initialize
function testInitialize() {
  console.log('Testing MCP initialize...');
  
  const data = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: { sampling: {}, roots: { listChanged: true } },
      clientInfo: { name: 'mcp-test-client', version: '1.0.0' }
    }
  });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  
  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
      console.log(`BODY CHUNK: ${chunk}`);
    });
    
    res.on('end', () => {
      console.log('RESPONSE COMPLETED');
      console.log(`FULL RESPONSE: ${responseData}`);
      try {
        const parsed = JSON.stringify(JSON.parse(responseData), null, 2);
        console.log(`PARSED RESPONSE: ${parsed}`);
      } catch (e) {
        console.error(`Error parsing response: ${e.message}`);
      }
    });
  });
  
  req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
  });
  
  console.log(`SENDING: ${data}`);
  req.write(data);
  req.end();
}

// Run the test
testInitialize();
