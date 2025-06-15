#!/usr/bin/env node

/**
 * Container Tool Testing Suite
 * Tests all MCP tools through HTTP transport in the Docker container
 */

const http = require('http');
const util = require('util');

// Configuration
const MCP_URL = 'http://localhost:3000/mcp';
const TIMEOUT = 30000;

// Session state
let sessionId = null;

// Test categories and their tools
const TEST_CATEGORIES = {
    memory: ['memory_get', 'memory_set', 'memory_query', 'memory_merge'],
    network: ['ping', 'nslookup', 'telnet', 'wget'],
    nmap: ['nmap_ping_scan', 'nmap_tcp_connect_scan', 'nmap_tcp_syn_scan'],
    snmp: ['snmp_create_session', 'snmp_get', 'snmp_walk', 'snmp_close_session'],
    proxmox: ['proxmox_creds_list', 'proxmox_list_nodes']
};

// Test results
const results = {
    passed: 0,
    failed: 0,
    errors: [],
    summary: {}
};

/**
 * Make HTTP request to MCP server
 */
async function makeRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        });        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'Accept': 'application/json, text/event-stream'
        };

        // Add session ID header if we have one
        if (sessionId) {
            headers['mcp-session-id'] = sessionId;
        }

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/mcp',
            method: 'POST',
            headers,
            timeout: TIMEOUT
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    
                    // Capture session ID from response if it's an initialize call
                    if (method === 'initialize' && response.result && response.result.sessionId) {
                        sessionId = response.result.sessionId;
                        console.log(`📡 Session initialized: ${sessionId}`);
                    }
                    
                    resolve(response);
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${error.message}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(data);
        req.end();
    });
}

/**
 * Test a specific tool
 */
async function testTool(toolName, params = {}) {
    try {
        console.log(`Testing ${toolName}...`);
        const response = await makeRequest(`tools/call`, {
            name: toolName,
            arguments: params
        });

        if (response.error) {
            throw new Error(`Tool error: ${response.error.message || response.error}`);
        }

        if (!response.result || !response.result.content) {
            throw new Error('Invalid response format - missing content');
        }

        results.passed++;
        console.log(`✓ ${toolName} - PASSED`);
        return true;
    } catch (error) {
        results.failed++;
        results.errors.push({ tool: toolName, error: error.message });
        console.log(`✗ ${toolName} - FAILED: ${error.message}`);
        return false;
    }
}

/**
 * Test memory tools
 */
async function testMemoryTools() {
    console.log('\n=== Testing Memory Tools ===');
    const category = 'memory';
    results.summary[category] = { passed: 0, failed: 0 };

    // Test memory_set
    const setResult = await testTool('memory_set', {
        key: 'test:container',
        value: { message: 'Container test data', timestamp: new Date().toISOString() }
    });
    if (setResult) results.summary[category].passed++;
    else results.summary[category].failed++;

    // Test memory_get
    const getResult = await testTool('memory_get', {
        key: 'test:container'
    });
    if (getResult) results.summary[category].passed++;
    else results.summary[category].failed++;

    // Test memory_query
    const queryResult = await testTool('memory_query', {
        pattern: 'test:*'
    });
    if (queryResult) results.summary[category].passed++;
    else results.summary[category].failed++;
}

/**
 * Test network tools
 */
async function testNetworkTools() {
    console.log('\n=== Testing Network Tools ===');
    const category = 'network';
    results.summary[category] = { passed: 0, failed: 0 };

    // Test ping (use Google DNS)
    const pingResult = await testTool('ping', {
        host: '8.8.8.8',
        count: 2,
        timeout: 5
    });
    if (pingResult) results.summary[category].passed++;
    else results.summary[category].failed++;

    // Test nslookup
    const nslookupResult = await testTool('nslookup', {
        domain: 'google.com',
        type: 'A'
    });
    if (nslookupResult) results.summary[category].passed++;
    else results.summary[category].failed++;

    // Test wget (simple HTTP request)
    const wgetResult = await testTool('wget', {
        url: 'http://httpbin.org/status/200',
        timeout: 10,
        tries: 1
    });
    if (wgetResult) results.summary[category].passed++;
    else results.summary[category].failed++;
}

/**
 * Test NMAP tools
 */
async function testNmapTools() {
    console.log('\n=== Testing NMAP Tools ===');
    const category = 'nmap';
    results.summary[category] = { passed: 0, failed: 0 };

    // Test ping scan (localhost)
    const pingResult = await testTool('nmap_ping_scan', {
        target: '127.0.0.1'
    });
    if (pingResult) results.summary[category].passed++;
    else results.summary[category].failed++;

    // Test TCP connect scan (localhost, port 3000)
    const tcpResult = await testTool('nmap_tcp_connect_scan', {
        target: '127.0.0.1',
        ports: '3000',
        timing_template: 4
    });
    if (tcpResult) results.summary[category].passed++;
    else results.summary[category].failed++;
}

/**
 * Test SNMP tools (basic functionality)
 */
async function testSnmpTools() {
    console.log('\n=== Testing SNMP Tools ===');
    const category = 'snmp';
    results.summary[category] = { passed: 0, failed: 0 };

    // Test SNMP discovery (localhost only)
    const discoverResult = await testTool('snmp_discover', {
        targetRange: '127.0.0.1/32',
        timeout: 5000
    });
    if (discoverResult) results.summary[category].passed++;
    else results.summary[category].failed++;
}

/**
 * Test Proxmox tools (basic functionality)
 */
async function testProxmoxTools() {
    console.log('\n=== Testing Proxmox Tools ===');
    const category = 'proxmox';
    results.summary[category] = { passed: 0, failed: 0 };

    // Test credentials list (should return empty list)
    const credsResult = await testTool('proxmox_creds_list');
    if (credsResult) results.summary[category].passed++;
    else results.summary[category].failed++;
}

/**
 * Initialize MCP session
 */
async function initializeSession() {
    console.log('🔗 Initializing MCP session...');
    try {
        const response = await makeRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {},
                resources: {}
            },
            clientInfo: {
                name: 'Container Test Client',
                version: '1.0.0'
            }
        });

        if (response.error) {
            throw new Error(`Initialize error: ${response.error.message}`);
        }

        if (!response.result) {
            throw new Error('Invalid initialize response');
        }

        console.log(`✓ Session initialized successfully`);
        return true;
    } catch (error) {
        console.log(`✗ Session initialization failed: ${error.message}`);
        throw error;
    }
}

/**
 * Test server info and tool list
 */
async function testServerInfo() {
    console.log('\n=== Testing Server Information ===');
    
    try {
        // Test tools/list
        console.log('Testing tools/list...');
        const listResponse = await makeRequest('tools/list');
        
        if (listResponse.error) {
            throw new Error(`Tools list error: ${listResponse.error.message}`);
        }

        if (!listResponse.result || !listResponse.result.tools) {
            throw new Error('Invalid tools list response');
        }

        const toolCount = listResponse.result.tools.length;
        console.log(`✓ tools/list - Found ${toolCount} tools`);
        
        if (toolCount !== 42) {
            console.log(`⚠ Warning: Expected 42 tools, found ${toolCount}`);
        }

        results.passed++;
        return true;
    } catch (error) {
        console.log(`✗ Server info test failed: ${error.message}`);
        results.failed++;
        results.errors.push({ tool: 'server_info', error: error.message });
        return false;
    }
}

/**
 * Main test function
 */
async function runTests() {
    console.log('🚀 Starting Container Tool Testing Suite');
    console.log(`📡 Testing MCP server at: ${MCP_URL}`);
    console.log(`⏱️  Timeout: ${TIMEOUT}ms\n`);

    const startTime = Date.now();    try {
        // Initialize MCP session first
        await initializeSession();

        // Test server info first
        await testServerInfo();

        // Test each category
        await testMemoryTools();
        await testNetworkTools();
        await testNmapTools();
        await testSnmpTools();
        await testProxmoxTools();

        // Print summary
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Tests Passed: ${results.passed}`);
        console.log(`❌ Tests Failed: ${results.failed}`);
        console.log(`⏱️  Duration: ${duration.toFixed(2)}s`);

        // Category breakdown
        console.log('\n📋 Category Breakdown:');
        for (const [category, stats] of Object.entries(results.summary)) {
            const total = stats.passed + stats.failed;
            const successRate = total > 0 ? ((stats.passed / total) * 100).toFixed(1) : '0.0';
            console.log(`  ${category}: ${stats.passed}/${total} (${successRate}%)`);
        }

        // Show errors if any
        if (results.errors.length > 0) {
            console.log('\n❌ ERRORS:');
            results.errors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error.tool}: ${error.error}`);
            });
        }

        // Overall result
        const overallSuccess = results.failed === 0;
        console.log('\n' + '='.repeat(60));
        console.log(`🎯 OVERALL RESULT: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
        console.log('='.repeat(60));

        process.exit(overallSuccess ? 0 : 1);

    } catch (error) {
        console.error(`\n💥 Test suite failed: ${error.message}`);
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error(`\n💥 Uncaught exception: ${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`\n💥 Unhandled rejection at:`, promise, 'reason:', reason);
    process.exit(1);
});

// Run tests
runTests();
