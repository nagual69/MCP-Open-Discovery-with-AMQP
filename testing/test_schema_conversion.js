/**
 * Test to reproduce the exact schema conversion issue
 */

const { z } = require('zod');

// Import our schema conversion functions
const registryPath = '../tools/registry/index.js';
const { zodToJsonSchema } = require(registryPath);

async function testSchemaConversion() {
  console.log('🔧 Testing Schema Conversion that causes keyValidator._parse error');
  
  // Test the exact schema from registry_tools_sdk that's failing
  const registryToolSchema = z.object({
    // Empty object for registry_get_status tool
  });
  
  console.log('\n📋 Original Zod Schema:');
  console.log('Zod schema _def:', registryToolSchema._def);
  
  try {
    console.log('\n📋 Converting with zodToJsonSchema...');
    const convertedSchema = zodToJsonSchema(registryToolSchema);
    console.log('Converted JSON Schema:', JSON.stringify(convertedSchema, null, 2));
    
    console.log('✅ Schema conversion successful');
    
    // Now test what happens when MCP SDK tries to validate this
    console.log('\n📋 Testing schema structure...');
    
    // Check for properties that might cause issues
    if (convertedSchema.properties && typeof convertedSchema.properties === 'object') {
      console.log('Properties keys:', Object.keys(convertedSchema.properties));
      
      for (const [key, value] of Object.entries(convertedSchema.properties)) {
        console.log(`Property "${key}":`, value);
        
        // Check for nested objects that might have validation issues
        if (value && typeof value === 'object' && value._def) {
          console.log(`  ⚠️  Property "${key}" still has Zod _def:`, value._def);
        }
      }
    }
    
  } catch (error) {
    console.log('❌ Schema conversion failed:', error.message);
    console.log('Full error:', error);
  }
}

// Test with a more complex schema like the ones that are failing
async function testComplexSchema() {
  console.log('\n🔧 Testing Complex Schema (like credentials_add)');
  
  const credentialsSchema = z.object({
    id: z.string(),
    type: z.enum(['password', 'apiKey', 'sshKey', 'oauthToken', 'certificate', 'custom']),
    username: z.string().optional(),
    password: z.string().optional(),
    notes: z.string().optional()
  });
  
  try {
    const convertedSchema = zodToJsonSchema(credentialsSchema);
    console.log('Complex schema conversion:', JSON.stringify(convertedSchema, null, 2));
    
    // Look for potential issues
    const checkObject = (obj, path = '') => {
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object') {
          if (value._def) {
            console.log(`❌ Found unconverted Zod at ${path}.${key}:`, value._def.typeName);
          }
          if (typeof value === 'object' && !Array.isArray(value)) {
            checkObject(value, `${path}.${key}`);
          }
        }
      }
    };
    
    checkObject(convertedSchema);
    
  } catch (error) {
    console.log('❌ Complex schema conversion failed:', error.message);
  }
}

// Run tests
if (require.main === module) {
  testSchemaConversion()
    .then(() => testComplexSchema())
    .catch(console.error);
}

module.exports = { testSchemaConversion, testComplexSchema };
