/**
 * SNMP Tools Test Script
 * 
 * This script tests the SNMP tools in the MCP Open Discovery server.
 * It requires the server to be running on localhost:3000.
 */

const http = require('http');

// Simple function to call an MCP tool
async function callTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: `test-${Date.now()}`
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
          if (response.error) {
            reject(new Error(`Error: ${JSON.stringify(response.error)}`));
          } else {
            resolve(response.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}`));
    });

    req.write(requestData);
    req.end();
  });
}

async function testSnmpTools() {
  console.log('Testing SNMP Tools in MCP Open Discovery Server');
  console.log('==============================================\n');

  try {
    // Test 1: List available tools (should include our new SNMP tools)
    console.log('Test 1: Listing available tools');
    const toolsResponse = await makeRequest({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 'test-list-tools'
    });
    
    const snmpTools = toolsResponse.tools.filter(tool => tool.name.startsWith('snmp_'));
    console.log(`Found ${snmpTools.length} SNMP tools:`);
    snmpTools.forEach(tool => console.log(`- ${tool.name}: ${tool.description}`));
    console.log('\n');

    // Test 2: Test SNMP discovery on local network (if available)
    console.log('Test 2: Testing SNMP discovery on local network');
    console.log('Note: This test will only work if you have SNMP-enabled devices on your network');
    console.log('You may need to modify the network range and community string\n');

    try {
      const discoveryResult = await callTool('snmp_discover', {
        targetRange: '192.168.1.0/24',  // Modify as needed for your network
        community: 'public',
        timeout: 2000  // Short timeout for faster testing
      });

      console.log('SNMP Discovery Result:');
      console.log(JSON.stringify(discoveryResult, null, 2));
    } catch (error) {
      console.log(`SNMP Discovery test failed: ${error.message}`);
      console.log('This is expected if you don\'t have SNMP-enabled devices on your network');
    }
    console.log('\n');

    // Test 3: Test session creation with a real device (if available)
    console.log('Test 3: Testing SNMP session creation');
    console.log('Note: This test requires a device with SNMP enabled');
    console.log('Modify the IP address and community string as needed\n');

    try {
      const sessionResult = await callTool('snmp_create_session', {
        host: '192.168.1.1',  // Modify as needed
        community: 'public',
        version: '2c'
      });

      console.log('SNMP Session Creation Result:');
      console.log(sessionResult);
      
      // Extract session ID from response
      const sessionId = sessionResult.split(' ')[2];
      
      if (sessionId) {
        // Try to get system information with this session
        console.log('\nTesting SNMP GET with created session');
        try {
          const getResult = await callTool('snmp_get', {
            sessionId,
            oids: ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0']  // sysDescr and sysName
          });

          console.log('SNMP GET Result:');
          console.log(getResult);
        } catch (error) {
          console.log(`SNMP GET test failed: ${error.message}`);
        }
        
        // Close the session
        console.log('\nClosing SNMP session');
        try {
          const closeResult = await callTool('snmp_close_session', { sessionId });
          console.log('SNMP Session Close Result:');
          console.log(closeResult);
        } catch (error) {
          console.log(`SNMP session close failed: ${error.message}`);
        }
      }
    } catch (error) {
      console.log(`SNMP Session creation test failed: ${error.message}`);
      console.log('This is expected if you don\'t have SNMP-enabled devices on your network');
    }

    console.log('\nSNMP Tools tests completed');
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
  }
}

// Helper function to make generic MCP requests
function makeRequest(requestObj) {
  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify(requestObj);

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
          if (response.error) {
            reject(new Error(`Error: ${JSON.stringify(response.error)}`));
          } else {
            resolve(response.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}`));
    });

    req.write(requestData);
    req.end();
  });
}

// Run the tests
testSnmpTools().catch(console.error);
