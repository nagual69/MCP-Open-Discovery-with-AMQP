/**
 * Integration Test: Transport Manager with Real MCP Server
 * 
 * This test validates that the transport manager works correctly with
 * the actual MCP server instance and registry system.
 */

const { 
  startAllTransports,
  getAllTransportStatus,
  cleanupAllTransports,
  detectEnvironment,
  createTransportConfig
} = require('../tools/transports/core/transport-manager');

/**
 * Test logging utility
 */
function testLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] [INTEGRATION_TEST] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Test with real MCP server
 */
async function testWithRealMcpServer() {
  testLog('info', '🔧 Testing transport manager with real MCP server...');
  
  let mcpServer = null;
  let transportResults = null;
  
  try {
    // Import the createServer function from main server
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerAllTools, getRegistry } = require('../tools/registry/index');
    
    // Create a real MCP server instance (similar to createServer but simpler)
    testLog('info', 'Creating MCP server instance...');
    
    mcpServer = new McpServer(
      {
        name: 'mcp-open-discovery-test',
        version: '2.0.0',
        description: 'Test instance for transport manager validation'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );
    
    testLog('info', 'Registering tools...');
    
    // Register tools (simplified for testing)
    await registerAllTools(mcpServer, {
      enableDynamicRegistry: false,
      ciMemory: {}
    });
    
    const registry = getRegistry();
    const stats = registry ? registry.getStats() : { tools: 0, modules: 0, categories: 0 };
    
    testLog('info', 'Tool registration complete', {
      tools: stats.tools,
      modules: stats.modules,
      categories: stats.categories
    });
    
    // Test with stdio transport only (safe for testing)
    const originalTransportMode = process.env.TRANSPORT_MODE;
    process.env.TRANSPORT_MODE = 'stdio';
    
    const environment = detectEnvironment();
    const config = createTransportConfig(environment, {
      HTTP_PORT: 3002, // Different port to avoid conflicts
      registry: registry,
      getHealthData: () => ({
        registry: stats,
        version: '2.0.0',
        singleton: true,
        testMode: true
      })
    });
    
    testLog('info', 'Starting transports with real MCP server...');
    transportResults = await startAllTransports(mcpServer, config);
    
    testLog('info', 'Transport startup results:', {
      totalEnabled: transportResults.totalEnabled,
      successCount: transportResults.successCount,
      errors: transportResults.errors.length,
      transports: Object.keys(transportResults.transports),
      environment: {
        isContainer: transportResults.environment.isContainer,
        isInteractive: transportResults.environment.isInteractive,
        transportMode: transportResults.environment.transportMode
      }
    });
    
    // Validate that stdio transport started successfully
    const stdioResult = transportResults.transports.stdio;
    if (stdioResult && stdioResult.success) {
      testLog('info', '✅ Stdio transport started successfully with real MCP server');
    } else {
      throw new Error(`Stdio transport failed: ${stdioResult?.error || 'Unknown error'}`);
    }
    
    // Test status monitoring
    testLog('info', 'Testing transport status monitoring...');
    const status = getAllTransportStatus(transportResults);
    
    testLog('info', 'Transport status results:', {
      manager: status.manager.status,
      version: status.manager.version,
      supportedTransports: status.manager.supportedTransports,
      summary: status.summary,
      availableTransports: Object.keys(status.transports),
      stdioStatus: status.transports.stdio
    });
    
    // Test cleanup
    testLog('info', 'Testing transport cleanup...');
    const cleanupResults = await cleanupAllTransports(transportResults);
    
    testLog('info', 'Transport cleanup results:', {
      cleaned: Object.keys(cleanupResults.transports).length,
      errors: cleanupResults.errors.length,
      stdioCleanup: cleanupResults.transports.stdio
    });
    
    // Restore original environment
    if (originalTransportMode) {
      process.env.TRANSPORT_MODE = originalTransportMode;
    } else {
      delete process.env.TRANSPORT_MODE;
    }
    
    testLog('info', '🎉 Integration test completed successfully!');
    
    return {
      success: true,
      mcpServerCreated: true,
      toolsRegistered: stats.tools,
      transportResults,
      status,
      cleanupResults
    };
    
  } catch (error) {
    testLog('error', 'Integration test failed', {
      error: error.message,
      stack: error.stack
    });
    
    // Attempt cleanup if we have transport results
    if (transportResults) {
      try {
        await cleanupAllTransports(transportResults);
        testLog('info', 'Emergency cleanup completed');
      } catch (cleanupError) {
        testLog('error', 'Emergency cleanup failed', { error: cleanupError.message });
      }
    }
    
    return {
      success: false,
      error: error.message,
      mcpServerCreated: !!mcpServer,
      toolsRegistered: 0
    };
  }
}

/**
 * Test multiple transport configurations
 */
async function testMultipleTransportConfigurations() {
  testLog('info', '🚀 Testing multiple transport configurations...');
  
  const testConfigurations = [
    { name: 'stdio-only', transportMode: 'stdio' },
    { name: 'http-only', transportMode: 'http' },
    { name: 'stdio-http', transportMode: 'stdio,http' },
    // Note: Not testing AMQP to avoid requiring RabbitMQ for unit tests
  ];
  
  const results = [];
  
  for (const testConfig of testConfigurations) {
    testLog('info', `Testing configuration: ${testConfig.name} (${testConfig.transportMode})`);
    
    try {
      const originalTransportMode = process.env.TRANSPORT_MODE;
      process.env.TRANSPORT_MODE = testConfig.transportMode;
      
      const environment = detectEnvironment();
      const config = createTransportConfig(environment, {
        HTTP_PORT: 3003 + results.length, // Different ports to avoid conflicts
      });
      
      // Create mock server for this test
      const mockServer = {
        connect: async (transport) => {
          testLog('debug', `Mock server connected to ${transport.constructor.name} for ${testConfig.name}`);
          return true;
        }
      };
      
      const transportResults = await startAllTransports(mockServer, config);
      const cleanup = await cleanupAllTransports(transportResults);
      
      results.push({
        configuration: testConfig,
        transportResults,
        cleanup,
        success: transportResults.successCount > 0 && cleanup.errors.length === 0
      });
      
      testLog('info', `Configuration ${testConfig.name} result:`, {
        enabled: transportResults.totalEnabled,
        successful: transportResults.successCount,
        failed: transportResults.errors.length
      });
      
      // Restore environment
      if (originalTransportMode) {
        process.env.TRANSPORT_MODE = originalTransportMode;
      } else {
        delete process.env.TRANSPORT_MODE;
      }
      
    } catch (error) {
      testLog('error', `Configuration ${testConfig.name} failed`, { error: error.message });
      results.push({
        configuration: testConfig,
        transportResults: null,
        cleanup: null,
        success: false,
        error: error.message
      });
    }
  }
  
  const successfulConfigs = results.filter(r => r.success).length;
  const totalConfigs = results.length;
  
  testLog('info', `Multiple configuration test results: ${successfulConfigs}/${totalConfigs} successful`);
  
  return {
    success: successfulConfigs === totalConfigs,
    results,
    summary: {
      total: totalConfigs,
      successful: successfulConfigs,
      failed: totalConfigs - successfulConfigs
    }
  };
}

/**
 * Main integration test runner
 */
async function runIntegrationTests() {
  testLog('info', '🧪 Starting Transport Manager Integration Tests...');
  
  const testResults = {
    realMcpServer: null,
    multipleConfigurations: null,
    summary: {
      totalTests: 2,
      passedTests: 0,
      failedTests: 0
    }
  };
  
  try {
    // Test with real MCP server
    testResults.realMcpServer = await testWithRealMcpServer();
    
    // Test multiple configurations
    testResults.multipleConfigurations = await testMultipleTransportConfigurations();
    
    // Calculate summary
    if (testResults.realMcpServer.success) testResults.summary.passedTests++;
    else testResults.summary.failedTests++;
    
    if (testResults.multipleConfigurations.success) testResults.summary.passedTests++;
    else testResults.summary.failedTests++;
    
    // Log final results
    testLog('info', '🎉 Integration Test Suite Complete!', {
      passed: testResults.summary.passedTests,
      failed: testResults.summary.failedTests,
      total: testResults.summary.totalTests,
      successRate: `${Math.round((testResults.summary.passedTests / testResults.summary.totalTests) * 100)}%`
    });
    
    if (testResults.summary.failedTests === 0) {
      testLog('info', '✅ All integration tests passed! Transport Manager is production ready.');
    } else {
      testLog('warn', `⚠️ ${testResults.summary.failedTests} integration test(s) failed.`);
    }
    
    return testResults;
    
  } catch (error) {
    testLog('error', 'Integration test suite execution failed', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      ...testResults,
      summary: {
        totalTests: 2,
        passedTests: 0,
        failedTests: 2
      },
      error: error.message
    };
  }
}

// Run integration tests if this file is executed directly
if (require.main === module) {
  runIntegrationTests().then((results) => {
    const exitCode = results.summary.failedTests === 0 ? 0 : 1;
    process.exit(exitCode);
  }).catch((error) => {
    testLog('error', 'Fatal integration test error', { error: error.message });
    process.exit(1);
  });
}

module.exports = {
  runIntegrationTests,
  testWithRealMcpServer,
  testMultipleTransportConfigurations
};
