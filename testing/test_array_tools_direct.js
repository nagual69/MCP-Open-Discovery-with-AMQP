#!/usr/bin/env node

/**
 * Direct test of array parameter tools via stdio
 */

const { spawn } = require('child_process');

async function testArrayTools() {
    console.log('🧪 Testing Array Parameter Tools via stdio');
    
    const server = spawn('node', ['mcp_server_multi_transport_sdk.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MCP_TRANSPORT: 'stdio' }
    });

    let responseBuffer = '';
    let initialized = false;
    
    server.stdout.on('data', (data) => {
        const text = data.toString();
        responseBuffer += text;
        
        // Look for JSON responses
        const lines = responseBuffer.split('\n');
        for (const line of lines) {
            if (line.trim() && line.includes('"jsonrpc"')) {
                try {
                    const response = JSON.parse(line.trim());
                    console.log('📥 Response:', JSON.stringify(response, null, 2));
                } catch (e) {
                    // Not JSON, continue
                }
            }
        }
    });

    server.stderr.on('data', (data) => {
        // Ignore debug logs for this test
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Initialize
    console.log('🔄 Initializing...');
    server.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
            protocolVersion: "2024-11-05",
            capabilities: {
                tools: {}
            },
            clientInfo: {
                name: "test-client",
                version: "1.0.0"
            }
        }
    }) + '\n');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test snmp_get tool
    console.log('🧪 Testing snmp_get with array parameter...');
    server.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
            name: "snmp_get",
            arguments: {
                sessionId: "test-session",
                oids: ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.3.0"]
            }
        }
    }) + '\n');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test zabbix_get_alerts tool
    console.log('🧪 Testing zabbix_get_alerts with array parameter...');
    server.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
            name: "zabbix_get_alerts",
            arguments: {
                baseUrl: "http://test-zabbix.local",
                username: "test",
                password: "test",
                actionIds: ["1", "2", "3"]
            }
        }
    }) + '\n');

    await new Promise(resolve => setTimeout(resolve, 2000));

    server.kill();
    console.log('✅ Test completed');
}

testArrayTools().catch(console.error);
