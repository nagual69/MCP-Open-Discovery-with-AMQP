/**
 * Debug the keyValidator._parse error
 */

const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');

// Test 1: Create a simple Zod schema
const simpleSchema = z.object({
  name: z.string(),
  age: z.number().optional()
});

console.log('=== Testing Zod Schema ===');
console.log('Original schema has _def:', !!simpleSchema._def);
console.log('Schema type:', simpleSchema._def?.typeName);

// Test 2: Extract the shape
const shape = typeof simpleSchema._def.shape === 'function' 
  ? simpleSchema._def.shape() 
  : simpleSchema._def.shape;

console.log('\n=== Testing Shape Extraction ===');
console.log('Shape object:', Object.keys(shape));
console.log('name property exists:', !!shape.name);
console.log('age property exists:', !!shape.age);
if (shape.name) {
  console.log('name property has _def:', !!shape.name._def);
  console.log('name property _def:', shape.name._def);
}
if (shape.age) {
  console.log('age property has _def:', !!shape.age._def);
  console.log('age property _def:', shape.age._def);
}

// Test 3: Try calling _parse on shape properties
console.log('\n=== Testing _parse calls ===');
try {
  if (shape.name._parse) {
    console.log('shape.name._parse exists');
  } else {
    console.log('shape.name._parse does NOT exist');
  }
} catch (error) {
  console.log('Error checking shape.name._parse:', error.message);
}

// Test 4: Convert to JSON Schema
console.log('\n=== Testing JSON Schema Conversion ===');
const jsonSchema = zodToJsonSchema(simpleSchema);
console.log('JSON Schema:', JSON.stringify(jsonSchema, null, 2));

// Test 5: What happens if we pass shape to zodToJsonSchema?
console.log('\n=== Testing Shape to JSON Schema ===');
try {
  const shapeJsonSchema = zodToJsonSchema(shape);
  console.log('Shape converted to JSON Schema successfully');
} catch (error) {
  console.log('Error converting shape to JSON Schema:', error.message);
}
