/**
 * MCP Open Discovery Server v2.0 - AMQP Integration Validator
 * 
 * This script validates that the AMQP transport integration is working
 * correctly with your revolutionary 61-tool discovery platform.
 * 
 * Usage: node validate-amqp-integration.js
 */

const fs = require('fs');
const path = require('path');

/**
 * Enhanced logging
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
  const logMessage = `${prefix} [${timestamp}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? '\n' + JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? '\n' + JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Validation steps
 */
const validationSteps = [
  {
    name: 'Check AMQP Dependencies',
    check: async () => {
      try {
        require('amqplib');
        return { success: true, message: 'amqplib dependency found' };
      } catch (error) {
        return { 
          success: false, 
          message: 'amqplib not installed. Run: npm install amqplib @types/amqplib',
          error: error.message 
        };
      }
    }
  },
  
  {
    name: 'Check Transport Files',
    check: async () => {
      const requiredFiles = [
        'tools/transports/amqp-server-transport.js',
        'tools/transports/amqp-client-transport.js', 
        'tools/transports/amqp-transport-integration.js'
      ];
      
      const missingFiles = [];
      for (const file of requiredFiles) {
        if (!fs.existsSync(path.join(__dirname, file))) {
          missingFiles.push(path.basename(file));
        }
      }
      
      if (missingFiles.length > 0) {
        return {
          success: false,
          message: `Missing transport files: ${missingFiles.join(', ')}`,
          missingFiles
        };
      }
      
      return { success: true, message: 'All transport files present' };
    }
  },
  
  {
    name: 'Check Integration Module',
    check: async () => {
      try {
        const integration = require('./tools/transports/amqp-transport-integration.js');
        const requiredExports = [
          'AMQP_CONFIG',
          'parseTransportMode', 
          'startAmqpServer',
          'startServerWithAmqp',
          'initializeAmqpIntegration'
        ];
        
        const missingExports = requiredExports.filter(exp => !integration[exp]);
        
        if (missingExports.length > 0) {
          return {
            success: false,
            message: `Missing integration exports: ${missingExports.join(', ')}`,
            missingExports
          };
        }
        
        return { 
          success: true, 
          message: 'Integration module exports are correct',
          toolCategories: Object.keys(integration.TOOL_CATEGORIES || {}),
          config: integration.AMQP_CONFIG
        };
      } catch (error) {
        return {
          success: false,
          message: 'Failed to load integration module',
          error: error.message
        };
      }
    }
  },
  
  {
    name: 'Check RabbitMQ Connection',
    check: async () => {
      try {
        const amqp = require('amqplib');
        const amqpUrl = process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672';
        
        log('info', `Testing connection to: ${amqpUrl}`);
        
        const connection = await amqp.connect(amqpUrl);
        const channel = await connection.createChannel();
        
        // Test basic queue operations
        const testQueue = 'test-integration-' + Date.now();
        await channel.assertQueue(testQueue, { exclusive: true });
        await channel.deleteQueue(testQueue);
        
        await channel.close();
        await connection.close();
        
        return { 
          success: true, 
          message: 'RabbitMQ connection successful',
          amqpUrl 
        };
      } catch (error) {
        return {
          success: false,
          message: 'RabbitMQ connection failed',
          error: error.message,
          suggestion: 'Start RabbitMQ: docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 -e RABBITMQ_DEFAULT_USER=mcp -e RABBITMQ_DEFAULT_PASS=discovery rabbitmq:3-management'
        };
      }
    }
  },
  
  {
    name: 'Check Environment Configuration',
    check: async () => {
      const envVars = {
        'TRANSPORT_MODE': process.env.TRANSPORT_MODE || 'not_set',
        'AMQP_URL': process.env.AMQP_URL || 'not_set', 
        'AMQP_QUEUE_PREFIX': process.env.AMQP_QUEUE_PREFIX || 'not_set',
        'AMQP_EXCHANGE': process.env.AMQP_EXCHANGE || 'not_set'
      };
      
      const recommendations = [];
      
      if (envVars.TRANSPORT_MODE === 'not_set') {
        recommendations.push('Set TRANSPORT_MODE=amqp or TRANSPORT_MODE=all');
      }
      
      if (envVars.AMQP_URL === 'not_set') {
        recommendations.push('Set AMQP_URL=amqp://mcp:discovery@localhost:5672');
      }
      
      return {
        success: recommendations.length === 0,
        message: recommendations.length === 0 ? 'Environment configured' : 'Environment needs configuration',
        envVars,
        recommendations
      };
    }
  },
  
  {
    name: 'Test Client Transport',
    check: async () => {
      try {
        const { RabbitMQClientTransport } = require('./tools/transports/amqp-client-transport.js');
        
        const transport = new RabbitMQClientTransport({
          amqpUrl: process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672',
          serverQueuePrefix: 'mcp.discovery',
          exchangeName: 'mcp.notifications',
          responseTimeout: 5000
        });
        
        // Just test instantiation - don't actually connect
        // since server might not be running
        
        return {
          success: true,
          message: 'Client transport instantiated successfully'
        };
      } catch (error) {
        return {
          success: false,
          message: 'Client transport instantiation failed',
          error: error.message
        };
      }
    }
  }
];

/**
 * Run validation
 */
async function runValidation() {
  log('info', '🚀 MCP Open Discovery Server v2.0 - AMQP Integration Validation');
  log('info', '================================================================');
  
  let totalSteps = validationSteps.length;
  let successfulSteps = 0;
  let failedSteps = 0;
  
  for (let i = 0; i < validationSteps.length; i++) {
    const step = validationSteps[i];
    log('info', `\n[${i + 1}/${totalSteps}] ${step.name}...`);
    
    try {
      const result = await step.check();
      
      if (result.success) {
        log('success', result.message, result.data);
        successfulSteps++;
      } else {
        log('error', result.message);
        if (result.error) log('error', `Error: ${result.error}`);
        if (result.suggestion) log('warn', `Suggestion: ${result.suggestion}`);
        if (result.recommendations) {
          result.recommendations.forEach(rec => log('warn', `• ${rec}`));
        }
        failedSteps++;
      }
    } catch (error) {
      log('error', `Validation step failed: ${error.message}`);
      failedSteps++;
    }
  }
  
  log('info', '\n================================================================');
  log('info', `Validation Summary: ${successfulSteps}/${totalSteps} steps passed`);
  
  if (failedSteps === 0) {
    log('success', '🎉 AMQP integration is ready for MCP Open Discovery Server v2.0!');
    log('info', '\nNext steps:');
    log('info', '1. Start your MCP server: TRANSPORT_MODE=amqp node mcp_server_multi_transport_sdk.js');
    log('info', '2. Test with: node examples/amqp-discovery-client.js');
    log('info', '3. Run comprehensive tests: node test-amqp-transport.js');
  } else {
    log('error', `❌ ${failedSteps} validation steps failed. Please fix the issues above.`);
    process.exit(1);
  }
}

/**
 * Generate integration report
 */
function generateIntegrationReport() {
  const report = {
    timestamp: new Date().toISOString(),
    mcpVersion: '2.0.0',
    amqpIntegration: 'validated',
    expectedToolCount: 61,
    supportedTransports: ['stdio', 'http', 'amqp'],
    features: [
      'Registry hot-reload over AMQP',
      'Tool category routing',
      'Multi-data center federation',
      'Microservices architecture support',
      'Real-time discovery notifications'
    ],
    nextSteps: [
      'Copy transport files to tools/transports/',
      'Update mcp_server_multi_transport_sdk.js',
      'Set TRANSPORT_MODE environment variable',
      'Start RabbitMQ broker',
      'Test with example client'
    ]
  };
  
  const reportPath = 'amqp-integration-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log('success', `Integration report saved: ${reportPath}`);
  
  return report;
}

// Run validation if executed directly
if (require.main === module) {
  runValidation()
    .then(() => {
      generateIntegrationReport();
    })
    .catch((error) => {
      log('error', 'Validation failed', { error: error.message });
      process.exit(1);
    });
}

module.exports = {
  runValidation,
  generateIntegrationReport,
  validationSteps
};
