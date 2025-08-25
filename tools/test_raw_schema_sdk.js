/**
 * Test Tool with Raw JSON Schema - Priority 1 Quick Win Test
 * Following ZOD_SCHEMA_COMPATIBILITY_ISSUE.md recommendations
 */

const tools = [
  {
    name: "test_raw_schema",
    description: "Test tool with raw JSON Schema (no Zod conversion)",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Test message" }
      },
      required: ["message"]
    }
  }
];

async function handleToolCall(name, args) {
  if (name === "test_raw_schema") {
    return {
      success: true,
      message: `Echo: ${args.message}`,
      timestamp: new Date().toISOString(),
      schemaType: "raw_json_schema"
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

module.exports = { tools, handleToolCall };
