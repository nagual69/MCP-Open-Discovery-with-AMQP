const http = require('http');
const fs = require('fs');

// Parse Server-Sent Events format
function parseSSE(data) {
  const lines = data.split('\n');
  const events = [];
  let currentEvent = {};
  
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent.event = line.substring(7);
    } else if (line.startsWith('data: ')) {
      const jsonData = line.substring(6);
      try {
        currentEvent.data = JSON.parse(jsonData);
      } catch (err) {
        currentEvent.data = jsonData;
      }
    } else if (line === '' && Object.keys(currentEvent).length > 0) {
      events.push(currentEvent);
      currentEvent = {};
    }
  }
  
  // Add last event if not empty
  if (Object.keys(currentEvent).length > 0) {
    events.push(currentEvent);
  }
  
  return events;
}

// Step 1: Initialize a session first
async function initializeSession() {
  return new Promise((resolve, reject) => {
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    });

    console.log('=== STEP 1: INITIALIZING SESSION ===');

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(initRequest)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      console.log('Init Status code:', res.statusCode);
      console.log('Init Content-Type:', res.headers['content-type']);
      
      const sessionId = res.headers['mcp-session-id'];
      console.log('Session ID from header:', sessionId);
      
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.headers['content-type']?.includes('text/event-stream')) {
            // Parse SSE format
            const events = parseSSE(data);
            console.log('SSE Events:', events.length);
            
            // Look for response event
            const responseEvent = events.find(e => e.event === 'message' && e.data?.result);
            if (responseEvent) {
              console.log('✅ Session initialized successfully');
              console.log('Capabilities:', JSON.stringify(responseEvent.data.result.capabilities, null, 2));
              resolve(sessionId);
            } else {
              console.log('❓ No response event found in SSE:', events);
              resolve(sessionId); // Still try to use the session ID
            }
          } else {
            // Regular JSON response
            const response = JSON.parse(data);
            console.log('Init response:', JSON.stringify(response, null, 2));
            
            if (response.error) {
              reject(new Error('Init failed: ' + response.error.message));
            } else {
              console.log('✅ Session initialized with ID:', sessionId);
              resolve(sessionId);
            }
          }
        } catch (err) {
          console.error('Parse error:', err.message);
          console.log('Raw data (first 200 chars):', data.substring(0, 200));
          // Still try to use the session if we got one
          if (sessionId) {
            console.log('Using session ID from header despite parse error');
            resolve(sessionId);
          } else {
            reject(err);
          }
        }
      });
    });

    req.on('error', reject);
    req.write(initRequest);
    req.end();
  });
}

// Step 2: Use the session to list tools
async function listToolsWithSession(sessionId) {
  return new Promise((resolve, reject) => {
    const toolsRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });

    console.log('\n=== STEP 2: LISTING TOOLS WITH SESSION ===');
    console.log('Session ID:', sessionId);

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(toolsRequest),
        'mcp-session-id': sessionId
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      console.log('Tools Status code:', res.statusCode);
      console.log('Tools Content-Type:', res.headers['content-type']);
      
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.headers['content-type']?.includes('text/event-stream')) {
            // Parse SSE format
            const events = parseSSE(data);
            console.log('SSE Events for tools:', events.length);
            
            // Look for response event
            const responseEvent = events.find(e => e.event === 'message' && e.data?.result);
            if (responseEvent && responseEvent.data.result.tools) {
              const response = responseEvent.data;
              console.log('✅ Got tools response from SSE');
              console.log('Total tools:', response.result.tools.length);
              
              // Check first 3 tools
              for (let i = 0; i < Math.min(3, response.result.tools.length); i++) {
                const tool = response.result.tools[i];
                console.log(`\nTool ${i + 1}:`, {
                  name: tool.name,
                  description: tool.description ? tool.description.substring(0, 80) + '...' : 'No description',
                  hasInputSchema: !!tool.inputSchema,
                  inputSchemaType: tool.inputSchema ? tool.inputSchema.type : null,
                  inputSchemaProperties: tool.inputSchema && tool.inputSchema.properties ? Object.keys(tool.inputSchema.properties) : null,
                  required: tool.inputSchema && tool.inputSchema.required ? tool.inputSchema.required : null
                });
                
                // Show full schema for first tool
                if (i === 0 && tool.inputSchema) {
                  console.log('First tool full schema:', JSON.stringify(tool.inputSchema, null, 2));
                }
              }
              
              // Save full response for analysis
              fs.writeFileSync('tools_list_response.json', JSON.stringify(response, null, 2));
              console.log('\n📁 Full response saved to tools_list_response.json');
              resolve(response);
            } else {
              console.log('❓ No tools response found in SSE events:');
              events.forEach((event, i) => {
                console.log(`Event ${i + 1}:`, JSON.stringify(event, null, 2));
              });
              reject(new Error('No tools response in SSE'));
            }
          } else {
            // Regular JSON response
            const response = JSON.parse(data);
            if (response.error) {
              console.log('❌ Error response:', JSON.stringify(response.error, null, 2));
              reject(new Error(response.error.message));
            } else if (response.result && response.result.tools) {
              console.log('✅ Got tools response from JSON');
              console.log('Total tools:', response.result.tools.length);
              resolve(response);
            } else {
              console.log('❓ Unexpected response structure:', JSON.stringify(response, null, 2));
              reject(new Error('Unexpected response structure'));
            }
          }
        } catch (err) {
          console.error('❌ Parse error:', err.message);
          console.log('Raw response (first 500 chars):', data.substring(0, 500));
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(toolsRequest);
    req.end();
  });
}

// Main test flow
async function runTest() {
  try {
    const sessionId = await initializeSession();
    await listToolsWithSession(sessionId);
    console.log('\n🎉 Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTest();
