#!/usr/bin/env node

/**
 * Transport-Level Schema Sanitization Test
 * Tests the final fix for keyValidator._parse error in MCP Open Discovery v2.0
 * 
 * This test verifies that our transport-level response interception successfully
 * sanitizes schemas in tools/list responses to prevent keyValidator._parse errors.
 */

const axios = require('axios');
const { mcpUrl } = require('./test_http_port');

// Test configuration (dynamic via env)
const MCP_SERVER_URL = mcpUrl;
const TEST_TIMEOUT = 30000;

// Test tools that previously failed with keyValidator._parse error
const CRITICAL_TEST_TOOLS = [
  // server.registerTool() tools (previously failing)
  { name: 'memory_get', params: { key: 'test-key' } },
  { name: 'ping', params: { host: '127.0.0.1', count: 1 } },
  { name: 'nmap_ping_scan', params: { target: '127.0.0.1' } },
  
  // server.tool() tools (should still work)
  { name: 'snmp_get', params: { sessionId: 'test-session', oids: ['1.3.6.1.2.1.1.1.0'] } }
];

class TransportLevelFixTester {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
    this.sessionId = null;
  }

  async initialize() {
    console.log('🔗 Initializing MCP session...');
    
    try {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          clientInfo: {
            name: 'transport-level-test',
            version: '1.0.0'
          }
        }
      };

      const response = await axios.post(MCP_SERVER_URL, initRequest, {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: TEST_TIMEOUT
      });

      if (response.data.error) {
        throw new Error(`Initialize failed: ${response.data.error.message}`);
      }

  console.log(`✅ MCP session initialized successfully (server: ${MCP_SERVER_URL})`);
      console.log('📋 Server capabilities:', JSON.stringify(response.data.result.capabilities, null, 2));
      
      // Send initialized notification
      const initializedNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      };

      await axios.post(MCP_SERVER_URL, initializedNotification, {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: TEST_TIMEOUT
      });

      console.log('✅ Initialized notification sent');
      this.sessionId = 'initialized';
      
    } catch (error) {
      console.log('❌ Failed to initialize MCP session:', error.message);
      if (error.response?.data) {
        console.log('📄 Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  async makeRequest(method, params = {}) {
    if (!this.sessionId && method !== 'initialize') {
      await this.initialize();
    }

    const request = {
      jsonrpc: '2.0',
      id: Math.random().toString(36).substring(7),
      method,
      params
    };

    try {
      const response = await axios.post(MCP_SERVER_URL, request, {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: TEST_TIMEOUT
      });

      if (response.data.error) {
        throw new Error(`MCP Error: ${response.data.error.message || 'Unknown error'}`);
      }

      return response.data.result;
    } catch (error) {
      if (error.response?.data?.error) {
        throw new Error(`MCP Error: ${error.response.data.error.message}`);
      }
      throw error;
    }
  }

  async testToolsList() {
    console.log('\n🔍 Testing tools/list response schema sanitization...');
    
    try {
      const tools = await this.makeRequest('tools/list');
      
      console.log(`✅ Retrieved ${tools.length} tools successfully`);
      
      // Check for problematic schema properties
      let schemasChecked = 0;
      let sanitizedSchemas = 0;
      let problematicSchemas = 0;
      
      for (const tool of tools) {
        if (tool.inputSchema) {
          schemasChecked++;
          
          const hasProblematicProps = 
            tool.inputSchema.hasOwnProperty('$schema') ||
            tool.inputSchema.hasOwnProperty('$defs') ||
            tool.inputSchema.hasOwnProperty('definitions') ||
            tool.inputSchema.additionalProperties === false;
          
          if (hasProblematicProps) {
            problematicSchemas++;
            console.log(`❌ Tool ${tool.name} still has problematic schema properties:`, {
              hasSchema: tool.inputSchema.hasOwnProperty('$schema'),
              hasDefs: tool.inputSchema.hasOwnProperty('$defs'),
              hasDefinitions: tool.inputSchema.hasOwnProperty('definitions'),
              additionalProperties: tool.inputSchema.additionalProperties
            });
          } else {
            sanitizedSchemas++;
          }
        }
      }
      
      console.log(`📊 Schema Analysis:
  - Total schemas: ${schemasChecked}
  - Sanitized schemas: ${sanitizedSchemas}
  - Problematic schemas: ${problematicSchemas}
  - Sanitization rate: ${((sanitizedSchemas / schemasChecked) * 100).toFixed(1)}%`);
      
      if (problematicSchemas === 0) {
        console.log('✅ All schemas properly sanitized at transport level!');
        this.results.passed++;
      } else {
        console.log('❌ Some schemas still contain problematic properties');
        this.results.failed++;
        this.results.errors.push(`${problematicSchemas} schemas not properly sanitized`);
      }
      
      this.results.total++;
      return tools;
      
    } catch (error) {
      console.log('❌ Failed to retrieve tools list:', error.message);
      this.results.total++;
      this.results.failed++;
      this.results.errors.push(`tools/list failed: ${error.message}`);
      throw error;
    }
  }

  async testToolExecution() {
    console.log('\n🔧 Testing tool execution with transport-level fix...');
    
    for (const testTool of CRITICAL_TEST_TOOLS) {
      this.results.total++;
      
      try {
        console.log(`\n🧪 Testing ${testTool.name}...`);
        
        const result = await this.makeRequest('tools/call', {
          name: testTool.name,
          arguments: testTool.params
        });
        
        console.log(`✅ ${testTool.name} executed successfully`);
        console.log(`📄 Result preview:`, JSON.stringify(result).substring(0, 200) + '...');
        
        this.results.passed++;
        
      } catch (error) {
        console.log(`❌ ${testTool.name} failed:`, error.message);
        
        // Check if it's the specific keyValidator._parse error
        if (error.message.includes('keyValidator._parse is not a function')) {
          console.log('💥 CRITICAL: keyValidator._parse error still occurring!');
          this.results.errors.push(`${testTool.name}: keyValidator._parse error persists`);
        } else {
          console.log('ℹ️  Different error (not schema-related)');
          this.results.errors.push(`${testTool.name}: ${error.message}`);
        }
        
        this.results.failed++;
      }
    }
  }

  async testSchemaValidatorBehavior() {
    console.log('\n🧬 Testing schema validator behavior...');
    
    try {
      // Test a simple stable tool first
      const simpleResult = await this.makeRequest('tools/call', {
        name: 'memory_stats',
        arguments: {}
      });
      
      console.log('✅ Simple tool (no schema issues) works correctly');
      this.results.total++;
      this.results.passed++;
      
    } catch (error) {
      console.log('❌ Even simple tools failing:', error.message);
      this.results.total++;
      this.results.failed++;
  this.results.errors.push(`memory_stats failed: ${error.message}`);
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 TRANSPORT-LEVEL SCHEMA SANITIZATION TEST RESULTS');
    console.log('='.repeat(80));
    
    console.log(`📊 Overall Results:
  Total Tests: ${this.results.total}
  Passed: ${this.results.passed}
  Failed: ${this.results.failed}
  Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);

    if (this.results.errors.length > 0) {
      console.log(`\n❌ Errors (${this.results.errors.length}):`);
      this.results.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    const isFixed = this.results.failed === 0;
    
    console.log(`\n🎯 Transport-Level Fix Status: ${isFixed ? '✅ SUCCESS' : '❌ NEEDS MORE WORK'}`);
    
    if (isFixed) {
      console.log(`
✅ BREAKTHROUGH! Transport-level schema sanitization is working!
🔧 The response interception fix has successfully resolved the keyValidator._parse error
📈 All ${this.results.total} tests passed
🚀 MCP Open Discovery v2.0 is now fully functional`);
    } else {
      console.log(`
❌ Transport-level fix needs adjustment
🔍 ${this.results.failed} tests still failing
🛠️  Additional debugging required`);
    }
    
    console.log('\n' + '='.repeat(80));
    
    return isFixed;
  }
}

async function main() {
  console.log('🚀 Testing Transport-Level Schema Sanitization Fix');
  console.log('📅 MCP Open Discovery v2.0 - Final Validation');
  console.log('⏰ Timestamp:', new Date().toISOString());
  
  const tester = new TransportLevelFixTester();
  
  try {
    // Initialize session first
    await tester.initialize();
    
    // Test 1: Verify tools list schema sanitization
    await tester.testToolsList();
    
    // Test 2: Test critical tool execution
    await tester.testToolExecution();
    
    // Test 3: Test schema validator behavior
    await tester.testSchemaValidatorBehavior();
    
  } catch (error) {
    console.log('\n💥 CRITICAL ERROR:', error.message);
    console.log('🔍 This may indicate server connectivity issues');
  }
  
  // Print final results
  const success = tester.printResults();
  
  // Exit with appropriate code
  process.exit(success ? 0 : 1);
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.log('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = { TransportLevelFixTester };
