/**
 * FORENSIC TEST: Compare my custom zodToJsonSchema vs real library
 */

const { z } = require('zod');
const realZodToJsonSchema = require('zod-to-json-schema').zodToJsonSchema;

// Import my custom version
const customConvert = require('./tools/registry/index');

// Test schema
const testSchema = z.object({
  key: z.string(),
  optional: z.number().optional(),
  array: z.array(z.string())
});

console.log('=== COMPARING IMPLEMENTATIONS ===');

console.log('\n1. Real zod-to-json-schema library:');
try {
  const realResult = realZodToJsonSchema(testSchema);
  console.log(JSON.stringify(realResult, null, 2));
} catch (error) {
  console.log('Error:', error.message);
}

console.log('\n2. My custom implementation:');
// I need to check if my custom function is exported

console.log('Available exports from index:', Object.keys(customConvert));
