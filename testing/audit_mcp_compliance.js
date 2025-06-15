/**
 * MCP Response Format Compliance Audit Script
 * 
 * This script audits all tool modules for strict MCP response format compliance.
 * It checks that all tools return responses that conform to CallToolResult/CallToolErrorResult.
 * 
 * Expected format:
 * - Success: { content: [{ type: "text", text: "..." }] }
 * - Error: { content: [{ type: "text", text: "..." }], isError: true }
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

// Tool modules to audit
const { registerNetworkTools } = require('../tools/network_tools_sdk.js');
const { registerMemoryTools } = require('../tools/memory_tools_sdk.js');
const { registerNmapTools } = require('../tools/nmap_tools_sdk.js');
const { registerProxmoxTools } = require('../tools/proxmox_tools_sdk.js');
const { registerSnmpTools } = require('../tools/snmp_tools_sdk.js');

/**
 * Validate MCP response format
 * @param {any} response - The response to validate
 * @param {string} toolName - Name of the tool for error reporting
 * @returns {Object} Validation result
 */
function validateMcpResponse(response, toolName) {
  const errors = [];
  
  // Check basic structure
  if (!response || typeof response !== 'object') {
    errors.push(`Response must be an object`);
    return { valid: false, errors };
  }
  
  // Check content array
  if (!response.content || !Array.isArray(response.content)) {
    errors.push(`Response must have a 'content' array`);
  } else {
    // Check each content item
    response.content.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Content item ${index} must be an object`);
      } else {
        if (!item.type) {
          errors.push(`Content item ${index} must have a 'type' field`);
        } else if (item.type !== 'text') {
          errors.push(`Content item ${index} type must be 'text' (found: ${item.type})`);
        }
        
        if (!item.text || typeof item.text !== 'string') {
          errors.push(`Content item ${index} must have a 'text' field of type string`);
        }
      }
    });
  }
  
  // Check isError field (should only be present for error responses)
  if (response.isError !== undefined && typeof response.isError !== 'boolean') {
    errors.push(`'isError' field must be boolean if present`);
  }
  
  // Check for unexpected fields
  const validFields = ['content', 'isError'];
  Object.keys(response).forEach(field => {
    if (!validFields.includes(field)) {
      errors.push(`Unexpected field in response: ${field}`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Mock execution function to test tool response formats
 */
async function mockToolExecution(toolName, handler, params) {
  try {
    const response = await handler(params);
    return validateMcpResponse(response, toolName);
  } catch (error) {
    return {
      valid: false,
      errors: [`Tool threw an error instead of returning an error response: ${error.message}`]
    };
  }
}

/**
 * Create a mock server to register tools and extract their handlers
 */
function createMockServer() {
  const tools = new Map();
  
  const mockServer = {
    tool: (name, description, schema, handler) => {
      tools.set(name, { name, description, schema, handler });
    }
  };
  
  return { mockServer, tools };
}

async function auditAllTools() {
  console.log('🔍 Starting MCP Response Format Compliance Audit...\n');
  
  const { mockServer, tools } = createMockServer();
  
  // Register all tools
  console.log('📝 Registering tools...');
  registerNetworkTools(mockServer);
  registerMemoryTools(mockServer);
  registerNmapTools(mockServer);
  registerProxmoxTools(mockServer);
  registerSnmpTools(mockServer);
  
  console.log(`✅ Registered ${tools.size} tools\n`);
  
  const auditResults = [];
  let totalErrors = 0;
  let compliantTools = 0;
  
  // Test each tool with mock parameters
  for (const [toolName, toolInfo] of tools) {
    console.log(`🔧 Auditing tool: ${toolName}`);
    
    // Create mock parameters based on schema
    const mockParams = createMockParams(toolInfo.schema);
    
    try {
      const result = await mockToolExecution(toolName, toolInfo.handler, mockParams);
      
      if (result.valid) {
        console.log(`  ✅ Compliant`);
        compliantTools++;
      } else {
        console.log(`  ❌ Non-compliant`);
        console.log(`     Errors: ${result.errors.join(', ')}`);
        totalErrors += result.errors.length;
      }
      
      auditResults.push({
        tool: toolName,
        valid: result.valid,
        errors: result.errors
      });
      
    } catch (error) {
      console.log(`  ⚠️  Audit error: ${error.message}`);
      auditResults.push({
        tool: toolName,
        valid: false,
        errors: [`Audit error: ${error.message}`]
      });
      totalErrors++;
    }
  }
  
  // Summary
  console.log('\n📊 Audit Summary:');
  console.log(`   Total tools: ${tools.size}`);
  console.log(`   Compliant tools: ${compliantTools}`);
  console.log(`   Non-compliant tools: ${tools.size - compliantTools}`);
  console.log(`   Total errors: ${totalErrors}`);
  
  if (totalErrors === 0) {
    console.log('\n🎉 All tools are MCP response format compliant!');
  } else {
    console.log('\n⚠️  Some tools need updates for MCP compliance.');
    console.log('\nDetailed Issues:');
    auditResults.filter(r => !r.valid).forEach(result => {
      console.log(`\n  ${result.tool}:`);
      result.errors.forEach(error => {
        console.log(`    - ${error}`);
      });
    });
  }
  
  return {
    totalTools: tools.size,
    compliantTools,
    totalErrors,
    results: auditResults
  };
}

/**
 * Create mock parameters for a tool based on its schema
 */
function createMockParams(schema) {
  const params = {};
  
  if (schema && typeof schema === 'object') {
    Object.keys(schema).forEach(key => {
      const fieldSchema = schema[key];
      
      // Simple mock values based on type
      if (fieldSchema._def) {
        switch (fieldSchema._def.typeName) {
          case 'ZodString':
            params[key] = 'mock_string_value';
            break;
          case 'ZodNumber':
            params[key] = 123;
            break;
          case 'ZodBoolean':
            params[key] = false;
            break;
          case 'ZodObject':
            params[key] = {};
            break;
          default:
            params[key] = 'mock_value';
        }
      } else {
        params[key] = 'mock_value';
      }
    });
  }
  
  return params;
}

// Run the audit if this script is executed directly
if (require.main === module) {
  auditAllTools().catch(error => {
    console.error('Audit failed:', error);
    process.exit(1);
  });
}

module.exports = { auditAllTools, validateMcpResponse };
