// Test script for MCP Open Discovery prompts
const http = require('http');

let sessionId = null;

async function testPromptsAPI() {
  console.log('🧪 Testing MCP Open Discovery Prompts...\n');

  // Initialize session first
  console.log('🔌 Initializing MCP session...');
  try {
    const initResult = await makeRequest({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          prompts: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    });
    
    if (initResult.result) {
      sessionId = initResult.sessionId; // Extract session ID
      console.log('✅ Session initialized successfully');
      console.log('🆔 Session ID:', sessionId);
      console.log('🔍 Server capabilities:', JSON.stringify(initResult.result.capabilities, null, 2));
    } else {
      console.log('❌ Failed to initialize session:', initResult.error);
      return;
    }
  } catch (error) {
    console.log(`❌ Error initializing session: ${error.message}`);
    return;
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 1: List all prompts
  console.log('📋 Test 1: Listing all available prompts');
  try {
    const listResult = await makeRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'prompts/list',
      params: {}
    }, sessionId);
    
    console.log('🔍 Raw response:', JSON.stringify(listResult, null, 2));
    
    if (listResult.result && listResult.result.prompts) {
      console.log(`✅ Found ${listResult.result.prompts.length} prompts:`);
      listResult.result.prompts.forEach(prompt => {
        console.log(`   - ${prompt.name}: ${prompt.description}`);
      });
    } else if (listResult.result) {
      console.log('⚠️ Got result but no prompts array:', listResult.result);
    } else if (listResult.error) {
      console.log('❌ Error in response:', listResult.error);
    } else {
      console.log('❌ Unexpected response format');
    }
  } catch (error) {
    console.log(`❌ Error listing prompts: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 2: Test CMDB CI Classification prompt
  console.log('🏗️ Test 2: Testing CMDB CI Classification prompt');
  try {
    const cmdbResult = await makeRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'prompts/get',
      params: {
        name: 'cmdb_ci_classification',
        arguments: {
          deviceType: 'server',
          discoveredData: 'Linux server, 16GB RAM, Intel Xeon CPU, running Apache web server on port 80'
        }
      }
    }, sessionId);
    
    console.log('🔍 CMDB Raw response:', JSON.stringify(cmdbResult, null, 2));
    
    if (cmdbResult.result) {
      console.log('✅ CMDB CI Classification prompt executed successfully');
      console.log('📝 Prompt content preview:');
      const content = cmdbResult.result.messages[0].content.text;
      console.log(content.substring(0, 300) + '...');
    } else if (cmdbResult.error) {
      console.log('❌ CMDB prompt error:', cmdbResult.error);
    } else {
      console.log('❌ CMDB prompt failed - unexpected response format');
    }
  } catch (error) {
    console.log(`❌ Error testing CMDB prompt: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 3: Test Network Topology Analysis prompt
  console.log('🌐 Test 3: Testing Network Topology Analysis prompt');
  try {
    const networkResult = await makeRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'prompts/get',
      params: {
        name: 'network_topology_analysis',
        arguments: {
          networkData: 'Router 192.168.1.1, Switch 192.168.1.2, Server 192.168.1.10',
          subnet: '192.168.1.0/24'
        }
      }
    });
    
    if (networkResult.result) {
      console.log('✅ Network Topology Analysis prompt executed successfully');
      console.log('📝 Prompt content preview:');
      const content = networkResult.result.messages[0].content.text;
      console.log(content.substring(0, 300) + '...');
    } else {
      console.log('❌ Network topology prompt failed');
    }
  } catch (error) {
    console.log(`❌ Error testing network topology prompt: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 4: Test Infrastructure Health Assessment prompt
  console.log('💚 Test 4: Testing Infrastructure Health Assessment prompt');
  try {
    const healthResult = await makeRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'prompts/get',
      params: {
        name: 'infrastructure_health_assessment',
        arguments: {
          healthData: 'CPU: 85%, Memory: 78%, Disk: 65%, Network: Normal',
          systemType: 'server'
        }
      }
    });
    
    if (healthResult.result) {
      console.log('✅ Infrastructure Health Assessment prompt executed successfully');
      console.log('📝 Prompt content preview:');
      const content = healthResult.result.messages[0].content.text;
      console.log(content.substring(0, 300) + '...');
    } else {
      console.log('❌ Health assessment prompt failed');
    }
  } catch (error) {
    console.log(`❌ Error testing health assessment prompt: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 5: Test Compliance Gap Analysis prompt
  console.log('🔒 Test 5: Testing Compliance Gap Analysis prompt');
  try {
    const complianceResult = await makeRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'prompts/get',
      params: {
        name: 'compliance_gap_analysis',
        arguments: {
          configData: 'SSH enabled, root login allowed, no firewall configured',
          complianceFramework: 'PCI-DSS'
        }
      }
    });
    
    if (complianceResult.result) {
      console.log('✅ Compliance Gap Analysis prompt executed successfully');
      console.log('📝 Prompt content preview:');
      const content = complianceResult.result.messages[0].content.text;
      console.log(content.substring(0, 300) + '...');
    } else {
      console.log('❌ Compliance gap analysis prompt failed');
    }
  } catch (error) {
    console.log(`❌ Error testing compliance gap analysis prompt: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 6: Test Incident Analysis Guidance prompt
  console.log('🚨 Test 6: Testing Incident Analysis Guidance prompt');
  try {
    const incidentResult = await makeRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'prompts/get',
      params: {
        name: 'incident_analysis_guidance',
        arguments: {
          incidentData: 'Web server down, users cannot access application, error 500',
          severity: 'High'
        }
      }
    });
    
    if (incidentResult.result) {
      console.log('✅ Incident Analysis Guidance prompt executed successfully');
      console.log('📝 Prompt content preview:');
      const content = incidentResult.result.messages[0].content.text;
      console.log(content.substring(0, 300) + '...');
    } else {
      console.log('❌ Incident analysis guidance prompt failed');
    }
  } catch (error) {
    console.log(`❌ Error testing incident analysis guidance prompt: ${error.message}`);
  }

  console.log('\n🎉 Prompt testing complete!');
}

function makeRequest(data, sessionId = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(postData)
    };
    
    // Add session ID if available
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: headers
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          // Handle SSE format response
          if (typeof responseData === 'string' && responseData.includes('event: message')) {
            const dataMatch = responseData.match(/data: ({.*})/);
            if (dataMatch) {
              const parsed = JSON.parse(dataMatch[1]);
              const newSessionId = res.headers['mcp-session-id'];
              resolve({ 
                ...parsed, 
                sessionId: newSessionId 
              });
            } else {
              reject(new Error('Failed to parse SSE data'));
            }
          } else {
            // Handle regular JSON response
            const parsed = JSON.parse(responseData);
            const newSessionId = res.headers['mcp-session-id'];
            resolve({ 
              ...parsed, 
              sessionId: newSessionId 
            });
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message} - Data: ${responseData.substring(0, 100)}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Run the tests
testPromptsAPI().catch(console.error);
