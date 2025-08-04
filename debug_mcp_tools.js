/**
 * Debug MCP Tool Schema Issue
 * Test what's actually happening with the array parameter tools
 */

const { z } = require('zod');

// Test the exact schema we're using for snmp_get
const snmpGetSchema = z.object({
  sessionId: z.string().describe("Session ID from snmp_create_session"),
  oids: z.array(z.string()).describe("Array of OIDs to retrieve")
});

console.log('🧪 MCP Array Parameter Debug Test');
console.log('===================================');

// Test 1: Basic Zod validation
console.log('\n🔍 Test 1: Basic Zod Schema Validation');
try {
  const testInput = {
    sessionId: "test-session",
    oids: ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.2.0"]
  };
  
  console.log('Input:', JSON.stringify(testInput, null, 2));
  
  const result = snmpGetSchema.parse(testInput);
  console.log('✅ Zod validation successful:', JSON.stringify(result, null, 2));
} catch (error) {
  console.log('❌ Zod validation failed:', error.message);
}

// Test 2: Check what the MCP SDK tool definition looks like
console.log('\n🔍 Test 2: MCP SDK Tool Schema Check');

// Import our actual SNMP tools module
const snmpTools = require('./tools/snmp_tools_sdk');

console.log('Found tools:', snmpTools.tools.length);

const snmpGetTool = snmpTools.tools.find(t => t.name === 'snmp_get');
if (snmpGetTool) {
  console.log('\n📋 snmp_get tool definition:');
  console.log('Name:', snmpGetTool.name);
  console.log('Description:', snmpGetTool.description);
  console.log('Schema type:', typeof snmpGetTool.inputSchema);
  console.log('Schema _def exists:', !!snmpGetTool.inputSchema._def);
  
  if (snmpGetTool.inputSchema._def) {
    console.log('Schema _def type:', snmpGetTool.inputSchema._def.typeName);
    
    // Check the shape
    const shape = snmpGetTool.inputSchema._def.shape();
    console.log('\n🔧 Schema shape analysis:');
    for (const [key, value] of Object.entries(shape)) {
      console.log(`  ${key}:`, {
        type: value._def?.typeName,
        description: value._def?.description,
        isArray: value._def?.typeName === 'ZodArray',
        arrayType: value._def?.typeName === 'ZodArray' ? value._def?.type?._def?.typeName : 'N/A'
      });
    }
  }
}

// Test 3: Manual schema conversion
console.log('\n🔍 Test 3: Manual Schema Conversion');

function convertZodType(zodType) {
  if (!zodType || !zodType._def) {
    return { type: 'string' };
  }

  const def = zodType._def;
  
  switch (def.typeName) {
    case 'ZodString':
      return {
        type: 'string',
        description: def.description
      };
      
    case 'ZodArray':
      console.log('  🎯 Converting ZodArray...');
      console.log('    Array type def:', def.type._def);
      
      const itemsSchema = convertZodType(def.type);
      console.log('    Generated items schema:', JSON.stringify(itemsSchema, null, 2));
      
      return {
        type: 'array',
        items: itemsSchema,
        description: def.description
      };
      
    default:
      return {
        type: 'string',
        description: def.description
      };
  }
}

function zodToJsonSchema(zodSchema) {
  if (!zodSchema || !zodSchema._def) {
    throw new Error('Invalid Zod schema');
  }

  const def = zodSchema._def;
  
  if (def.typeName === 'ZodObject') {
    const properties = {};
    const required = [];
    const shape = def.shape();
    
    for (const [key, value] of Object.entries(shape)) {
      if (value && value._def) {
        properties[key] = convertZodType(value);
        if (!value.isOptional()) {
          required.push(key);
        }
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: true
    };
  }
  
  return convertZodType(zodSchema);
}

try {
  const convertedSchema = zodToJsonSchema(snmpGetSchema);
  console.log('\n✅ Manual conversion result:');
  console.log(JSON.stringify(convertedSchema, null, 2));
} catch (error) {
  console.log('\n❌ Manual conversion failed:', error.message);
}
