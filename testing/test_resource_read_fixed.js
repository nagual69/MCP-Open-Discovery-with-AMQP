const http = require('http');

// Test resources/read with the fix
async function testResourceRead() {
  console.log('=== TESTING RESOURCE READ (FIXED) ===');

  // Step 1: Initialize session
  const initOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/mcp',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
  };

  const initData = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        resources: { subscribe: true },
        tools: { listChanged: true }
      },
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  });

  const sessionId = await new Promise((resolve, reject) => {
    const req = http.request(initOptions, (res) => {
      console.log(`Init Status code: ${res.statusCode}`);
      
      const sessionId = res.headers['x-session-id'];
      console.log(`Session ID: ${sessionId}`);
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (sessionId) {
          console.log('✅ Session initialized');
          resolve(sessionId);
        } else {
          reject(new Error('No session ID'));
        }
      });
    });

    req.on('error', reject);
    req.write(initData);
    req.end();
  });

  // Step 2: Read resource
  const readOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/mcp',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-Session-ID': sessionId
    }
  };

  const readData = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "resources/read",
    params: {
      uri: "credentials://audit/log"
    }
  });

  return new Promise((resolve, reject) => {
    const req = http.request(readOptions, (res) => {
      console.log(`\nResource Read Status code: ${res.statusCode}`);

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Parse SSE events
        const events = data.split('\n\n').filter(event => event.trim());
        console.log(`SSE Events: ${events.length}`);
        
        for (const event of events) {
          const lines = event.split('\n');
          let eventData = null;
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                eventData = JSON.parse(line.substring(6));
                break;
              } catch (e) {
                console.log('Failed to parse line:', line);
              }
            }
          }
          
          if (eventData) {
            if (eventData.result && eventData.result.contents) {
              console.log('✅ Resource read successful!');
              console.log(`Contents array length: ${eventData.result.contents.length}`);
              const content = eventData.result.contents[0];
              console.log(`Content URI: ${content.uri}`);
              console.log(`Content MIME Type: ${content.mimeType}`);
              console.log(`Content Text Length: ${content.text?.length || 0}`);
              console.log('First 200 chars:', content.text?.substring(0, 200));
            } else if (eventData.error) {
              console.log('❌ Resource read error:', eventData.error);
            }
          }
        }
        
        resolve();
      });
    });

    req.on('error', reject);
    req.write(readData);
    req.end();
  });
}

// Wait for server to be ready
setTimeout(() => {
  testResourceRead().catch(console.error);
}, 5000);
