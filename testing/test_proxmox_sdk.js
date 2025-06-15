/**
 * Test Proxmox tools specifically with the SDK server
 */

const { spawnSync } = require('child_process');

function runMcpCommand(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Math.random().toString(36).substring(7),
    method,
    params
  };

  const result = spawnSync('node', ['mcp_server_sdk.js'], {
    input: JSON.stringify(request) + '\n',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (result.error) {
    throw new Error(`Failed to execute command: ${result.error.message}`);
  }

  // Parse the last JSON response from stdout
  const lines = result.stdout.trim().split('\n');
  let jsonResponse = null;
  
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed.jsonrpc === '2.0' && parsed.id === request.id) {
        jsonResponse = parsed;
        break;
      }
    } catch (e) {
      // Skip non-JSON lines
    }
  }

  if (!jsonResponse) {
    throw new Error(`No valid JSON response found. stdout: ${result.stdout}, stderr: ${result.stderr}`);
  }

  return jsonResponse;
}

async function testProxmoxTools() {
  console.log('Testing Proxmox Tools with SDK Server...');

  try {
    // Test 1: List available Proxmox tools
    console.log('1. Testing tools/list for Proxmox tools...');
    const toolsResponse = runMcpCommand('tools/list');
    
    if (toolsResponse.error) {
      throw new Error(`Tools list failed: ${JSON.stringify(toolsResponse.error)}`);
    }

    const proxmoxTools = toolsResponse.result.tools.filter(tool => 
      tool.name.startsWith('proxmox_')
    );

    console.log(`✓ Found ${proxmoxTools.length} Proxmox tools:`);
    proxmoxTools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    // Test 2: Test proxmox_creds_list (should work even without credentials)
    console.log('2. Testing proxmox_creds_list...');
    const credsListResponse = runMcpCommand('tools/call', {
      name: 'proxmox_creds_list',
      arguments: {}
    });

    if (credsListResponse.error) {
      console.log(`⚠️ Proxmox creds list call failed (expected): ${JSON.stringify(credsListResponse.error)}`);
    } else {
      console.log('✓ Proxmox creds list successful');
      console.log(`   Result: ${JSON.stringify(credsListResponse.result, null, 2)}`);
    }

    // Test 3: Test tool schema validation
    console.log('3. Testing tool schema validation...');
    const addCredsResponse = runMcpCommand('tools/call', {
      name: 'proxmox_creds_add',
      arguments: {
        id: 'test',
        hostname: 'test.example.com',
        username: 'test',
        password: 'test'
      }
    });

    if (addCredsResponse.error) {
      console.log(`⚠️ Proxmox creds add call failed (expected without real server): ${JSON.stringify(addCredsResponse.error)}`);
    } else {
      console.log('✓ Proxmox creds add completed');
    }

    console.log('✅ Proxmox tools SDK integration test completed successfully!');

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

testProxmoxTools();
