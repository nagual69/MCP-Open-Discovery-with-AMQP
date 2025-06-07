const http = require('http');

// Function to make a JSON-RPC request to the MCP server
function callTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const requestId = Date.now();
    const requestData = JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
        _meta: {
          progressToken: requestId
        }
      }
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(requestData);
    req.end();
  });
}

async function testProxmoxCredsAdd() {
  try {
    console.log("Testing proxmox_creds_add...");
    
    // Test adding credentials
    const addResult = await callTool('proxmox_creds_add', {
      id: 'test_proxmox1',
      hostname: '192.168.200.10',
      port: 8006,
      username: 'root',
      password: 'testpassword',
      verify_ssl: true
    });
      console.log("Result:", JSON.stringify(addResult, null, 2));
    
    if (addResult.result && !addResult.result.isError) {
      console.log("✅ Credential added successfully!");
    } else {
      console.log("❌ Failed to add credential:", 
        addResult.result ? addResult.result.content[0].text : "Unknown error");
    }
    
    // List credentials to verify
    console.log("\nListing credentials...");
    const listResult = await callTool('proxmox_creds_list', {});
    console.log("Result:", JSON.stringify(listResult, null, 2));
    
    // Clean up - remove the test credential
    console.log("\nCleaning up - removing test credential...");
    const removeResult = await callTool('proxmox_creds_remove', {
      id: 'test_proxmox1'
    });
    console.log("Result:", JSON.stringify(removeResult, null, 2));
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testProxmoxCredsAdd();
