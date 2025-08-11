/**
 * Test to debug why schema conversion is failing for some tools
 */

const { hasArrayParameters, getRegistrationMethod } = require('../tools/registry/parameter_type_detector');

async function debugSchemaConversion() {
  console.log('🔧 Debugging Schema Conversion Issue');
  
  // Load tools that are having issues
  const credentialsTools = require('../tools/credentials_tools_sdk');
  const registryTools = require('../tools/registry_tools_sdk');
  
  // Test the problematic credentials_add tool
  const credsTool = credentialsTools.tools.find(tool => tool.name === 'credentials_add');
  const regTool = registryTools.tools.find(tool => tool.name === 'registry_get_status');
  
  console.log('\n📋 Testing credentials_add tool:');
  if (credsTool) {
    console.log('Has _def:', !!credsTool.inputSchema._def);
    console.log('Has array parameters:', hasArrayParameters(credsTool));
    console.log('Registration method:', getRegistrationMethod(credsTool));
    console.log('Should convert schema:', !hasArrayParameters(credsTool) && !!credsTool.inputSchema._def);
  }
  
  console.log('\n📋 Testing registry_get_status tool:');
  if (regTool) {
    console.log('Has _def:', !!regTool.inputSchema._def);
    console.log('Has array parameters:', hasArrayParameters(regTool));
    console.log('Registration method:', getRegistrationMethod(regTool));
    console.log('Should convert schema:', !hasArrayParameters(regTool) && !!regTool.inputSchema._def);
  }
  
  // Test the zodToJsonSchema function directly
  console.log('\n📋 Testing zodToJsonSchema function directly:');
  
  try {
    // Import the function from the registry module
    const registryModule = require('../tools/registry/index');
    
    // We can't import zodToJsonSchema directly, so let's manually test the conversion logic
    const { z } = require('zod');
    
    // Create the same schema as credentials_add
    const testSchema = z.object({
      id: z.string(),
      type: z.enum(['password', 'apiKey']),
      username: z.string().optional()
    });
    
    console.log('Test schema _def:', testSchema._def.typeName);
    
    // Test if the conversion logic would work
    if (testSchema._def && testSchema._def.typeName === 'ZodObject') {
      console.log('✅ Schema is ZodObject - conversion should work');
      
      // Check the shape
      const shape = typeof testSchema._def.shape === 'function' 
        ? testSchema._def.shape() 
        : testSchema._def.shape;
      
      console.log('Shape keys:', Object.keys(shape));
      
      for (const [key, value] of Object.entries(shape)) {
        console.log(`  ${key}: ${value._def.typeName}`);
      }
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run test
if (require.main === module) {
  debugSchemaConversion().catch(console.error);
}

module.exports = { debugSchemaConversion };
