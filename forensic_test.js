/**
 * FORENSIC TRACING: Test to isolate keyValidator._parse error
 * 
 * This test will help us understand exactly where the error occurs
 */

console.log('=== FORENSIC TEST: keyValidator._parse Error ===');

// Test 1: Check what we're actually passing to MCP SDK
const { z } = require('zod');

// Create a simple schema like our tools use
const testSchema = z.object({
  key: z.string()
});

console.log('\n1. Original Zod Schema:');
console.log('  Has _def:', !!testSchema._def);
console.log('  Type:', testSchema._def?.typeName);

// Test 2: Convert to JSON Schema
const { zodToJsonSchema } = require('zod-to-json-schema');

const jsonSchema = zodToJsonSchema(testSchema);
console.log('\n2. Converted JSON Schema:');
console.log('  Has _def:', !!jsonSchema._def);
console.log('  Type:', jsonSchema.type);
console.log('  Properties:', Object.keys(jsonSchema.properties || {}));

// Test 3: What our parameter detector returns
const { getRegistrationSchema } = require('./tools/registry/parameter_type_detector');

const mockTool = {
  name: 'test_tool',
  inputSchema: testSchema
};

const detectorResult = getRegistrationSchema(mockTool);
console.log('\n3. Parameter Detector Result:');
console.log('  Has _def:', !!detectorResult._def);
console.log('  Type:', detectorResult.type || detectorResult._def?.typeName);

// Test 4: Simulate what gets passed to server.registerTool
console.log('\n4. SIMULATION: What gets passed to MCP SDK');

// This simulates the exact same logic from the registry
let registrationSchema = getRegistrationSchema(mockTool);

console.log('Before conversion:');
console.log('  Has _def:', !!registrationSchema._def);

if (mockTool.inputSchema && mockTool.inputSchema._def) {
  try {
    registrationSchema = zodToJsonSchema(mockTool.inputSchema);
    console.log('After conversion:');
    console.log('  Has _def:', !!registrationSchema._def);
    console.log('  Actual schema:', JSON.stringify(registrationSchema, null, 2));
  } catch (error) {
    console.log('Conversion error:', error.message);
  }
}

console.log('\n=== END FORENSIC TEST ===');
