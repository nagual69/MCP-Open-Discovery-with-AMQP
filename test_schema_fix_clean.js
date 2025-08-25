#!/usr/bin/env node

/**
 * Test Schema Fix - Test the MCP server schema sanitization
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function testSchemaFix() {
  console.log("🧪 Testing MCP Schema Fix...\n");

  try {
    console.log("📋 Testing tools/list response schemas via MCP client...");
    
    // Create MCP client with stdio transport
    const transport = new StdioClientTransport({
      command: "node",
      args: ["mcp_server_multi_transport_sdk.js"],
      env: { ...process.env, TRANSPORT_MODE: "stdio" }
    });

    const client = new Client(
      {
        name: "schema-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {}
        },
      }
    );

    await client.connect(transport);
    console.log("✅ Connected to MCP server via stdio");

    // Get tools list
    const toolsResult = await client.listTools();
    console.log(`📊 Found ${toolsResult.tools.length} tools`);

    // Check first few tools for schema issues
    const sampleTools = toolsResult.tools.slice(0, 10);
    
    let cleanCount = 0;
    let issueCount = 0;
    
    for (const tool of sampleTools) {
      console.log(`\n🔍 Tool: ${tool.name}`);
      const schema = tool.inputSchema;
      
      // Check for problematic properties
      const issues = [];
      if (schema.$schema) issues.push("has $schema");
      if (schema.$defs) issues.push("has $defs");
      if (schema.definitions) issues.push("has definitions");
      if (schema.additionalProperties === false) issues.push("additionalProperties: false");
      
      if (issues.length > 0) {
        console.log(`  ❌ Schema issues: ${issues.join(", ")}`);
        console.log(`  📋 Full schema:`, JSON.stringify(schema, null, 6));
        issueCount++;
      } else {
        console.log(`  ✅ Schema looks clean (additionalProperties: ${schema.additionalProperties})`);
        cleanCount++;
      }
    }

    console.log(`\n📊 Schema Summary:`);
    console.log(`  ✅ Clean schemas: ${cleanCount}`);
    console.log(`  ❌ Problematic schemas: ${issueCount}`);
    
    await client.close();

  } catch (error) {
    console.error("❌ MCP client test failed:", error.message);
    console.error("Stack:", error.stack);
  }

  console.log("\n✅ Schema test complete");
}

// Run the test
testSchemaFix().catch(console.error);
