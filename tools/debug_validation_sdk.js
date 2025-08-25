/**
 * Debug Tool for MCP SDK Validation Investigation
 * This tool will help us understand the exact parameter validation flow
 */

const tools = [
  {
    name: "debug_mcp_validation",
    description: "Debug tool to investigate MCP SDK parameter validation flow",
    inputSchema: {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "test_string": {
          "type": "string",
          "description": "A test string parameter"
        },
        "test_number": {
          "type": "number", 
          "description": "A test number parameter"
        }
      },
      "additionalProperties": false
    }
  },
  {
    name: "debug_no_validation",
    description: "Debug tool with no parameter validation",
    inputSchema: {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "additionalProperties": true
    }
  }
];

/**
 * Debug handleToolCall with extensive logging
 */
async function handleToolCall(name, args) {
  console.log(`[DEBUG VALIDATION] ========================================`);
  console.log(`[DEBUG VALIDATION] Tool called: ${name}`);
  console.log(`[DEBUG VALIDATION] Args type: ${typeof args}`);
  console.log(`[DEBUG VALIDATION] Args value:`, JSON.stringify(args, null, 2));
  console.log(`[DEBUG VALIDATION] Args constructor: ${args ? args.constructor.name : 'null'}`);
  
  // Check if args has any prototype methods that might be causing issues
  if (args && typeof args === 'object') {
    console.log(`[DEBUG VALIDATION] Args keys:`, Object.keys(args));
    console.log(`[DEBUG VALIDATION] Args own properties:`, Object.getOwnPropertyNames(args));
    
    // Check for validation-related methods
    const methodNames = ['_parse', 'parse', 'validate', 'check'];
    for (const methodName of methodNames) {
      if (args[methodName]) {
        console.log(`[DEBUG VALIDATION] Found ${methodName} method on args:`, typeof args[methodName]);
      }
    }
  }
  
  console.log(`[DEBUG VALIDATION] ========================================`);
  
  try {
    // Simple successful response
    return {
      success: true,
      tool: name,
      debug_info: {
        args_received: args,
        args_type: typeof args,
        args_constructor: args ? args.constructor.name : null,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error(`[DEBUG VALIDATION] Error in handleToolCall:`, error);
    return {
      success: false,
      error: error.message,
      tool: name
    };
  }
}

module.exports = {
  tools,
  handleToolCall
};
