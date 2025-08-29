/**
 * Debug Script: Compare Schema Output Between Standard Library and Custom Conversion
 * 
 * This will help us understand why the standard library schemas are still
 * causing keyValidator._parse errors while the custom ones work.
 */

const { z } = require('zod');
const { zodToJsonSchema: standardZodToJsonSchema } = require('zod-to-json-schema');

// Test schema from a failing tool (memory_get)
const testSchema = z.object({
  key: z.string().describe('The key to retrieve from memory')
});

console.log('=== TESTING SCHEMA CONVERSION ===\n');

// 1. Test standard library conversion
console.log('1. STANDARD LIBRARY OUTPUT:');
try {
  const standardOutput = standardZodToJsonSchema(testSchema, {
    target: 'jsonSchema7'
  });
  console.log(JSON.stringify(standardOutput, null, 2));
} catch (error) {
  console.error('Standard library error:', error);
}

console.log('\n2. CUSTOM CONVERSION OUTPUT:');

// 2. Custom conversion (the one that works for array tools)
function customZodToJsonSchema(zodSchema) {
  if (!zodSchema || !zodSchema._def) {
    throw new Error('Invalid Zod schema - missing _def property');
  }

  const def = zodSchema._def;
  
  if (def.typeName === 'ZodObject') {
    const properties = {};
    const required = [];
    
    // ZodObject properties are stored in _def.shape (can be function or property)
    let shape;
    if (typeof def.shape === 'function') {
      shape = def.shape();  // Call the function to get the shape
    } else {
      shape = def.shape;    // Use the property directly
    }
    
    if (shape && typeof shape === 'object') {
      for (const [key, value] of Object.entries(shape)) {
        if (value && value._def) {
          properties[key] = convertZodType(value);
          
          // Check if field is required (not optional and no default)
          if (value._def.typeName !== 'ZodOptional' && value._def.typeName !== 'ZodDefault') {
            // Check if the field is wrapped in ZodOptional
            let isOptional = false;
            if (value.isOptional && typeof value.isOptional === 'function') {
              isOptional = value.isOptional();
            }
            if (!isOptional) {
              required.push(key);
            }
          }
        }
      }
    }
    
    const jsonSchema = {
      type: 'object',
      properties,
      additionalProperties: true // for .passthrough()
    };
    
    // Only add required if there are actually required fields
    if (required.length > 0) {
      jsonSchema.required = required;
    }
    
    return jsonSchema;
  }
  
  return convertZodType(zodSchema);
}

function convertZodType(zodType) {
  if (!zodType || !zodType._def) {
    return { type: 'any' };
  }

  const def = zodType._def;

  switch (def.typeName) {
    case 'ZodString':
      const stringSchema = { type: 'string' };
      if (def.description) stringSchema.description = def.description;
      return stringSchema;

    case 'ZodNumber':
      const numberSchema = { type: 'number' };
      if (def.description) numberSchema.description = def.description;
      return numberSchema;

    case 'ZodBoolean':
      const booleanSchema = { type: 'boolean' };
      if (def.description) booleanSchema.description = def.description;
      return booleanSchema;

    case 'ZodOptional':
      return convertZodType(def.innerType);

    case 'ZodDefault':
      const defaultSchema = convertZodType(def.innerType);
      if (def.defaultValue !== undefined) {
        defaultSchema.default = def.defaultValue();
      }
      return defaultSchema;

    default:
      console.warn(`Unsupported Zod type: ${def.typeName}`);
      return { type: 'any' };
  }
}

try {
  const customOutput = customZodToJsonSchema(testSchema);
  console.log(JSON.stringify(customOutput, null, 2));
} catch (error) {
  console.error('Custom conversion error:', error);
}

console.log('\n3. COMPARISON:');
console.log('- Standard library may include extra properties that confuse MCP SDK');
console.log('- Custom conversion is more minimal and MCP-focused');
console.log('- The error "keyValidator._parse is not a function" suggests validation object format issues');

// Test the objects that are actually failing
console.log('\n4. DEBUGGING THE ACTUAL CONVERSION:');

// Test both approaches on what the registry would use
const hasArrays = false; // This is a simple parameter tool

if (hasArrays) {
  console.log('Using CUSTOM conversion for array parameter tool');
} else {
  console.log('Using STANDARD library conversion for simple parameter tool');
  const actualSchema = standardZodToJsonSchema(testSchema, {
    target: 'jsonSchema7'
  });
  
  console.log('\nActual schema being passed to MCP SDK:');
  console.log(JSON.stringify(actualSchema, null, 2));
  
  // Check for problematic properties
  console.log('\nPotential issues:');
  if (actualSchema.$schema) console.log('- Has $schema property');
  if (actualSchema.additionalProperties === false) console.log('- additionalProperties is false');
  if (actualSchema.definitions) console.log('- Has definitions property');
  if (actualSchema.$defs) console.log('- Has $defs property');
  
  // Check if it matches what MCP expects
  console.log('\nMCP compatibility check:');
  console.log('- type:', actualSchema.type);
  console.log('- properties exists:', !!actualSchema.properties);
  console.log('- required exists:', !!actualSchema.required);
}
