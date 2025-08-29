/**
 * Debug script to test array schema conversion
 */

const { z } = require('zod');

// Reproduce the exact conversion logic from registry
function zodToJsonSchema(zodSchema) {
  if (!zodSchema || !zodSchema._def) {
    throw new Error('Invalid Zod schema - missing _def property');
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
      console.log('🔍 Processing ZodArray...');
      console.log('def.type:', def.type);
      console.log('def.type._def:', def.type._def);
      
      const itemsSchema = convertZodType(def.type);
      console.log('Generated items schema:', JSON.stringify(itemsSchema, null, 2));
      
      return {
        type: 'array',
        items: itemsSchema,
        description: def.description
      };
      
    case 'ZodOptional':
      return convertZodType(def.innerType);
      
    default:
      return {
        type: 'string',
        description: def.description
      };
  }
}

console.log('🧪 Testing Array Schema Conversion');
console.log('==================================');

// Test the problematic snmp_get schema
const snmpGetSchema = z.object({
  sessionId: z.string().describe("Session ID from snmp_create_session"),
  oids: z.array(z.string()).describe("Array of OIDs to retrieve")
});

console.log('\n📋 Original Zod Schema:');
console.log('snmpGetSchema._def.typeName:', snmpGetSchema._def.typeName);
console.log('snmpGetSchema._def.shape().oids._def.typeName:', snmpGetSchema._def.shape().oids._def.typeName);

console.log('\n🔧 Converting to JSON Schema...');
try {
  const jsonSchema = zodToJsonSchema(snmpGetSchema);
  console.log('\n✅ Generated JSON Schema:');
  console.log(JSON.stringify(jsonSchema, null, 2));
  
  // Check if the array property has items
  const oidsProperty = jsonSchema.properties.oids;
  console.log('\n🎯 Array property analysis:');
  console.log('oids.type:', oidsProperty.type);
  console.log('oids.items:', JSON.stringify(oidsProperty.items, null, 2));
  console.log('oids.items exists:', !!oidsProperty.items);
  console.log('oids.items is object:', typeof oidsProperty.items === 'object');
  
} catch (error) {
  console.error('❌ Conversion failed:', error.message);
  console.error(error.stack);
}
