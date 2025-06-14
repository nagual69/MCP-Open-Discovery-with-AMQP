#!/usr/bin/env node

/**
 * Simple Container Health Test
 * Tests basic container health and tool availability without complex MCP protocol handling
 */

const http = require('http');

/**
 * Test basic health endpoint
 */
async function testHealth() {
    return new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3000/health', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const health = JSON.parse(body);
                    resolve(health);
                } catch (error) {
                    reject(new Error(`Health check failed: ${error.message}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Health check timeout'));
        });
    });
}

/**
 * Test MCP endpoint availability (just check it responds)
 */
async function testMcpEndpoint() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'ping'
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/mcp',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            // Just check that we get a response (even if it's an error response)
            resolve({
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                headers: res.headers
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('MCP endpoint timeout'));
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Main test function
 */
async function runTests() {
    console.log('🚀 Container Health & Availability Test');
    console.log('📊 Testing MCP Open Discovery container\n');

    let passed = 0;
    let failed = 0;

    try {
        // Test health endpoint
        console.log('🏥 Testing health endpoint...');
        const health = await testHealth();
        
        if (health.status === 'healthy') {
            console.log(`✅ Health check PASSED`);
            console.log(`   - Status: ${health.status}`);
            console.log(`   - Version: ${health.version}`);
            console.log(`   - Transport: ${health.transport}`);
            console.log(`   - Tools: ${health.tools.total}`);
            console.log(`   - Uptime: ${health.uptime}s`);
            passed++;
        } else {
            console.log(`❌ Health check FAILED - status: ${health.status}`);
            failed++;
        }

    } catch (error) {
        console.log(`❌ Health check FAILED: ${error.message}`);
        failed++;
    }

    try {
        // Test MCP endpoint availability
        console.log('\n🔗 Testing MCP endpoint availability...');
        const mcpResponse = await testMcpEndpoint();
        
        // Check if the endpoint is responsive (we expect a specific response format)
        if (mcpResponse.statusCode && mcpResponse.statusCode < 500) {
            console.log(`✅ MCP endpoint AVAILABLE`);
            console.log(`   - Status Code: ${mcpResponse.statusCode}`);
            console.log(`   - Status Message: ${mcpResponse.statusMessage}`);
            console.log(`   - Content-Type: ${mcpResponse.headers['content-type']}`);
            passed++;
        } else {
            console.log(`❌ MCP endpoint ERROR - status: ${mcpResponse.statusCode}`);
            failed++;
        }

    } catch (error) {
        console.log(`❌ MCP endpoint FAILED: ${error.message}`);
        failed++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${passed}`);
    console.log(`❌ Tests Failed: ${failed}`);
    
    const success = failed === 0;
    console.log(`🎯 Overall Result: ${success ? '✅ SUCCESS' : '❌ FAILURE'}`);

    if (success) {
        console.log('\n🎉 Container is healthy and ready for MCP Inspector testing!');
        console.log('💡 Use MCP Inspector to test individual tools:');
        console.log('   npx @modelcontextprotocol/inspector http://localhost:3000/mcp');
    }

    console.log('='.repeat(60));
    process.exit(success ? 0 : 1);
}

// Handle errors
process.on('uncaughtException', (error) => {
    console.error(`\n💥 Uncaught exception: ${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`\n💥 Unhandled rejection:`, reason);
    process.exit(1);
});

// Run tests
runTests();
