/**
 * Test Simple Tools SDK
 * MCP SDK Compatible Test Tool Implementation
 * 
 * Simple test tool using raw JSON Schema (no Zod conversion)
 * to validate MCP schema compatibility
 */

/**
 * Test tools with raw JSON Schema according to MCP specification
 */
const tools = [
  {
    name: 'test_simple',
    description: 'Simple test tool with raw JSON Schema - no Zod conversion',
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Test message to echo back"
        },
        count: {
          type: "number",
          description: "Number of times to repeat the message",
          minimum: 1,
          maximum: 5
        }
      },
      required: ["message"]
    }
  },
  {
    name: 'test_no_params',
    description: 'Test tool with no parameters',
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

/**
 * Handle tool execution
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} Tool execution result
 */
async function handleToolCall(name, args) {
  console.log(`[Test Simple SDK] Executing tool: ${name} with args:`, args);
  
  switch (name) {
    case 'test_simple':
      const message = args.message || 'Hello from test tool!';
      const count = args.count || 1;
      
      return {
        success: true,
        tool: name,
        message: message,
        repeated: Array(count).fill(message),
        timestamp: new Date().toISOString(),
        args_received: args
      };
      
    case 'test_no_params':
      return {
        success: true,
        tool: name,
        message: 'Test tool with no parameters executed successfully',
        timestamp: new Date().toISOString(),
        server_info: {
          nodejs_version: process.version,
          platform: process.platform,
          uptime: process.uptime()
        }
      };
      
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = {
  tools,
  handleToolCall
};
