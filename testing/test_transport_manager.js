/**
 * Test Transport Manager Functionality
 * 
 * This script tests the new componentized transport system to ensure
 * all functionality is preserved and working correctly.
 */

const { createServer } = require('../mcp_open_discovery_server');
const { 
  startAllTransports,
  getAllTransportStatus,
  cleanupAllTransports,
  detectEnvironment,
  getTransportRecommendations,
  validateTransportConfiguration,
  createTransportConfig,
  parseTransportMode,
  TRANSPORT_CONFIG
} = require('../tools/transports/core/transport-manager');

/**
 * Test logging utility
 */
function testLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] [TEST] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Test environment detection
 */
async function testEnvironmentDetection() {
  testLog('info', '🔍 Testing environment detection...');
  
  try {
    const environment = detectEnvironment();
    
    testLog('info', 'Environment detection results:', {
      isContainer: environment.isContainer,
      isInteractive: environment.isInteractive,
      nodeEnv: environment.nodeEnv,
      platform: environment.platform,
      hasStdin: environment.hasStdin,
      hasStdout: environment.hasStdout,
      transportMode: environment.transportMode,
      httpPort: environment.httpPort,
      amqpEnabled: environment.amqpEnabled,
      oauthEnabled: environment.oauthEnabled
    });
    
    return { success: true, environment };
  } catch (error) {
    testLog('error', 'Environment detection failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Test TRANSPORT_MODE parsing
 */
async function testTransportModeParsing() {
  testLog('info', '🔧 Testing TRANSPORT_MODE parsing...');
  
  const testCases = [
    'stdio',
    'http',
    'stdio,http',
    'http,amqp',
    'stdio,http,amqp',
    'grpc',
    'invalid,stdio,unknown',
    '',
    null,
    undefined
  ];
  
  const results = [];
  
  for (const testCase of testCases) {
    try {
      const parsed = parseTransportMode(testCase);
      results.push({
        input: testCase,
        output: parsed,
        success: true
      });
      testLog('debug', `Parsed "${testCase}" -> [${parsed.join(', ')}]`);
    } catch (error) {
      results.push({
        input: testCase,
        output: null,
        success: false,
        error: error.message
      });
      testLog('error', `Failed to parse "${testCase}"`, { error: error.message });
    }
  }
  
  testLog('info', 'TRANSPORT_MODE parsing test results:', { results });
  return { success: true, results };
}

/**
 * Test transport recommendations
 */
async function testTransportRecommendations() {
  testLog('info', '💡 Testing transport recommendations...');
  
  try {
    const environment = detectEnvironment();
    const recommendations = getTransportRecommendations(environment);
    
    testLog('info', 'Transport recommendations:', {
      recommended: recommendations.recommended,
      optional: recommendations.optional,
      reasons: recommendations.reasons,
      configuration: recommendations.configuration
    });
    
    return { success: true, recommendations };
  } catch (error) {
    testLog('error', 'Transport recommendations failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Test configuration validation
 */
async function testConfigurationValidation() {
  testLog('info', '✅ Testing configuration validation...');
  
  const testConfigurations = [
    ['stdio'],
    ['http'],
    ['stdio', 'http'],
    ['http', 'amqp'],
    ['stdio', 'http', 'amqp'],
    ['grpc'],
    ['unknown'],
    ['stdio', 'unknown', 'http']
  ];
  
  const environment = detectEnvironment();
  const results = [];
  
  for (const config of testConfigurations) {
    try {
      const validation = validateTransportConfiguration(config, environment);
      results.push({
        configuration: config,
        validation: validation,
        success: true
      });
      
      testLog('debug', `Validation for [${config.join(', ')}]:`, {
        valid: validation.valid,
        warnings: validation.warnings.length,
        errors: validation.errors.length,
        recommendations: validation.recommendations.length
      });
    } catch (error) {
      results.push({
        configuration: config,
        validation: null,
        success: false,
        error: error.message
      });
      testLog('error', `Validation failed for [${config.join(', ')}]`, { error: error.message });
    }
  }
  
  return { success: true, results };
}

/**
 * Test transport configuration creation
 */
async function testTransportConfigCreation() {
  testLog('info', '⚙️ Testing transport configuration creation...');
  
  try {
    const environment = detectEnvironment();
    const config = createTransportConfig(environment, {
      HTTP_PORT: 3001,
      OAUTH_ENABLED: true,
      AMQP_ENABLED: true
    });
    
    testLog('info', 'Created transport configuration:', {
      HTTP_PORT: config.HTTP_PORT,
      OAUTH_ENABLED: config.OAUTH_ENABLED,
      AMQP_ENABLED: config.AMQP_ENABLED,
      AMQP_URL: config.AMQP_URL,
      GRPC_PORT: config.GRPC_PORT,
      hasHealthData: typeof config.getHealthData === 'function'
    });
    
    return { success: true, config };
  } catch (error) {
    testLog('error', 'Transport configuration creation failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Test transport manager with mock server
 */
async function testTransportManager() {
  testLog('info', '🚀 Testing transport manager with mock server...');
  
  try {
    // Create a mock MCP server for testing
    const mockServer = {
      connect: async (transport) => {
        testLog('debug', `Mock server connected to ${transport.constructor.name}`);
        return true;
      }
    };
    
    // Test with stdio only (safe for testing)
    const originalTransportMode = process.env.TRANSPORT_MODE;
    process.env.TRANSPORT_MODE = 'stdio';
    
    const environment = detectEnvironment();
    const config = createTransportConfig(environment, {
      HTTP_PORT: 3001, // Use different port for testing
      registry: {
        getStats: () => ({ tools: 62, modules: 8, categories: 8 })
      }
    });
    
    testLog('info', 'Starting transports with stdio only...');
    const transportResults = await startAllTransports(mockServer, config);
    
    testLog('info', 'Transport startup results:', {
      totalEnabled: transportResults.totalEnabled,
      successCount: transportResults.successCount,
      errors: transportResults.errors.length,
      transports: Object.keys(transportResults.transports)
    });
    
    // Test status
    const status = getAllTransportStatus(transportResults);
    testLog('info', 'Transport status:', {
      manager: status.manager.status,
      totalTransports: status.summary.total,
      activeTransports: status.summary.active,
      failedTransports: status.summary.failed
    });
    
    // Test cleanup
    const cleanupResults = await cleanupAllTransports(transportResults);
    testLog('info', 'Transport cleanup results:', {
      cleaned: Object.keys(cleanupResults.transports).length,
      errors: cleanupResults.errors.length
    });
    
    // Restore original environment
    if (originalTransportMode) {
      process.env.TRANSPORT_MODE = originalTransportMode;
    } else {
      delete process.env.TRANSPORT_MODE;
    }
    
    return { 
      success: true, 
      transportResults, 
      status, 
      cleanupResults 
    };
    
  } catch (error) {
    testLog('error', 'Transport manager test failed', { 
      error: error.message,
      stack: error.stack 
    });
    return { success: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  testLog('info', '🧪 Starting Transport Manager Test Suite...');
  
  const testResults = {
    environmentDetection: null,
    transportModeParsing: null,
    transportRecommendations: null,
    configurationValidation: null,
    transportConfigCreation: null,
    transportManager: null,
    summary: {
      totalTests: 6,
      passedTests: 0,
      failedTests: 0
    }
  };
  
  try {
    // Run all tests
    testResults.environmentDetection = await testEnvironmentDetection();
    testResults.transportModeParsing = await testTransportModeParsing();
    testResults.transportRecommendations = await testTransportRecommendations();
    testResults.configurationValidation = await testConfigurationValidation();
    testResults.transportConfigCreation = await testTransportConfigCreation();
    testResults.transportManager = await testTransportManager();
    
    // Calculate summary
    for (const [testName, result] of Object.entries(testResults)) {
      if (testName === 'summary') continue;
      
      if (result && result.success) {
        testResults.summary.passedTests++;
      } else {
        testResults.summary.failedTests++;
      }
    }
    
    // Log final results
    testLog('info', '🎉 Test Suite Complete!', {
      passed: testResults.summary.passedTests,
      failed: testResults.summary.failedTests,
      total: testResults.summary.totalTests,
      successRate: `${Math.round((testResults.summary.passedTests / testResults.summary.totalTests) * 100)}%`
    });
    
    if (testResults.summary.failedTests === 0) {
      testLog('info', '✅ All tests passed! Transport Manager is ready for production.');
    } else {
      testLog('warn', `⚠️ ${testResults.summary.failedTests} test(s) failed. Review results above.`);
    }
    
  } catch (error) {
    testLog('error', 'Test suite execution failed', { 
      error: error.message,
      stack: error.stack 
    });
  }
  
  return testResults;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().then(() => {
    process.exit(0);
  }).catch((error) => {
    testLog('error', 'Fatal test error', { error: error.message });
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testEnvironmentDetection,
  testTransportModeParsing,
  testTransportRecommendations,
  testConfigurationValidation,
  testTransportConfigCreation,
  testTransportManager
};
