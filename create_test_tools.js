#!/usr/bin/env node
/**
 * VS Code MCP Tools Test
 * 
 * This script explicitly tests if VS Code can detect tools from our MCP server.
 * It outputs the required format that VS Code expects.
 */

const fs = require('fs');
const path = require('path');

// Create a file with explicit instructions for VS Code MCP integration
console.log('Creating VS Code MCP tools test file...');

const testFilePath = path.join(__dirname, 'vscode_mcp_tools_test.md');

const content = `# VS Code MCP Tools Test

This file contains detailed information to help troubleshoot VS Code MCP integration issues.

## Current Status

VS Code is connecting to our MCP server but not detecting any tools. 

## Expected Format for tools/list Response

VS Code expects the response to the \`tools/list\` method to have a specific format. 
Here's what our server is now returning (MCP spec):

\`\`\`json
{
  "jsonrpc": "2.0",
  "tools": [...],
  "id": 1
}
\`\`\`

- The \`tools\` property is an array of tool definitions.
- There is no \`result\` property in the response.

## Debugging Tips

1. Check the VS Code Developer Tools (Help > Toggle Developer Tools) for network requests
2. Look for requests to http://localhost:3000 and examine the response
3. Check the MCP server logs for any errors or messages
4. Test direct API calls using PowerShell:

\`\`\`powershell
Invoke-RestMethod -Uri "http://localhost:3000" -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"tools/list","id":1}' | ConvertTo-Json -Depth 5
\`\`\`

## Solution Possibilities

1. Make sure the \`tools/list\` response returns only the \`tools\` property (no \`result\`)
2. Try restarting VS Code after server changes
3. Ensure the server properly announces its tools capability in the \`initialize\` response
4. Check for any schema validation issues in the tool definitions

## Tool Test

If VS Code can detect tools, try using ping:

1. Command Palette: "MCP: Execute Tool"
2. Select "mcp-open-discovery-test" server
3. Select "ping" tool
4. Parameters: \`{"host": "example.com", "count": 3}\`

Expected output: Ping results from example.com
`;

fs.writeFileSync(testFilePath, content);
console.log(`Test file created at: ${testFilePath}`);

// Also create a direct test script that VS Code can run
const testScriptPath = path.join(__dirname, 'direct_test_tools.js');

const scriptContent = `#!/usr/bin/env node
/**
 * Direct MCP Tools Test
 * Run with: node direct_test_tools.js
 */

const http = require('http');

// Function to make a JSON-RPC request
function makeRequest(method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id
    });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
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
        } catch (error) {
          reject(new Error(\`Failed to parse response: \${error.message}\`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(requestBody);
    req.end();
  });
}

// Main function to test the MCP server
async function testMCPServer() {
  try {
    console.log('Testing MCP server at http://localhost:3000');
    
    // Test 1: Initialize
    console.log('\\nTest 1: Initialize');
    const initResponse = await makeRequest('initialize');
    console.log('Initialize response:', JSON.stringify(initResponse, null, 2));
    
    // Test 2: Status
    console.log('\\nTest 2: Status');
    const statusResponse = await makeRequest('status');
    console.log('Status response:', JSON.stringify(statusResponse, null, 2));
    
    // Test 3: Tools List
    console.log('\\nTest 3: Tools List');
    const toolsResponse = await makeRequest('tools/list');
    console.log('Tools response:', JSON.stringify(toolsResponse, null, 2));
    
    // Test 4: Ping Tool
    console.log('\\nTest 4: Ping Tool');
    const pingResponse = await makeRequest('tools/call', {
      name: 'ping',
      arguments: {
        host: 'example.com',
        count: 2
      }
    });
    console.log('Ping response:', JSON.stringify(pingResponse, null, 2));
    
    console.log('\\nAll tests completed successfully');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the tests
testMCPServer();
`;

fs.writeFileSync(testScriptPath, scriptContent);
console.log(`Direct test script created at: ${testScriptPath}`);
console.log('Run with: node direct_test_tools.js');
