/**
 * FORENSIC TEST: Compare custom vs real zodToJsonSchema
 */

const { z } = require('zod');
const realZodToJsonSchema = require('zod-to-json-schema').zodToJsonSchema;

// Copy my custom zodToJsonSchema function here for testing
function convertZodType(zodType) {
  if (!zodType || !zodType._def) {
    return { type: 'string' }; // fallback
  }

  const def = zodType._def;
  
  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return {
        type: 'array',
        items: convertZodType(def.type)
      };
    case 'ZodOptional':
      return convertZodType(def.innerType);
    default:
      return { type: 'string' };
  }
}

function customZodToJsonSchema(zodSchema) {
  if (!zodSchema || !zodSchema._def) {
    throw new Error('Invalid Zod schema - missing _def property');
  }

  const def = zodSchema._def;
  
  if (def.typeName === 'ZodObject') {
    const properties = {};
    const required = [];
    
    let shape;
    if (typeof def.shape === 'function') {
      shape = def.shape();
    } else {
      shape = def.shape;
    }
    
    if (shape && typeof shape === 'object') {
      for (const [key, value] of Object.entries(shape)) {
        if (value && value._def) {
          properties[key] = convertZodType(value);
          
          if (value._def.typeName !== 'ZodOptional') {
            required.push(key);
          }
        }
      }
    }
    
    const jsonSchema = {
      type: 'object',
      properties,
      additionalProperties: true
    };
    
    if (required.length > 0) {
      jsonSchema.required = required;
    }
    
    return jsonSchema;
  }
  
  return convertZodType(zodSchema);
}

// Test schema like memory_stats (no parameters)
const emptySchema = z.object({});

console.log('=== TESTING EMPTY SCHEMA (like memory_stats) ===');

console.log('\n1. Real library result:');
try {
  const realResult = realZodToJsonSchema(emptySchema);
  console.log(JSON.stringify(realResult, null, 2));
  console.log('Real has _def:', !!realResult._def);
} catch (error) {
  console.log('Real library error:', error.message);
}

console.log('\n2. Custom function result:');
try {
  const customResult = customZodToJsonSchema(emptySchema);
  console.log(JSON.stringify(customResult, null, 2));
  console.log('Custom has _def:', !!customResult._def);
} catch (error) {
  console.log('Custom function error:', error.message);
}

// Test schema with parameters
const paramSchema = z.object({
  key: z.string()
});

console.log('\n=== TESTING SCHEMA WITH PARAMETERS ===');

console.log('\n1. Real library result:');
const realResult2 = realZodToJsonSchema(paramSchema);
console.log(JSON.stringify(realResult2, null, 2));

console.log('\n2. Custom function result:');
const customResult2 = customZodToJsonSchema(paramSchema);
console.log(JSON.stringify(customResult2, null, 2));
