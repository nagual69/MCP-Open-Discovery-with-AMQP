/**
 * Test specific tool that's failing with keyValidator._parse error
 */

const { captureTypedPlugin } = require('./helpers/typed_plugin_harness');

async function testFailingTool() {
  console.log('🔧 Testing Typed Tool: mcp_od_registry_list_plugins');
  
  const registryTools = await captureTypedPlugin('registry-tools');
  
  console.log('\n📋 Registry Tools Module:');
  console.log('Tools count:', registryTools.tools.length);
  
  const getStatusTool = registryTools.tools.find(tool => tool.name === 'mcp_od_registry_list_plugins');
  
  if (getStatusTool) {
    console.log('\n📋 registry_get_status tool:');
    console.log('Name:', getStatusTool.name);
    console.log('Description:', getStatusTool.description);
    console.log('InputSchema:', JSON.stringify(getStatusTool.inputSchema, null, 2));
    
    // Test calling the tool directly
    try {
      console.log('\n📋 Testing direct tool call...');
      const result = await getStatusTool.handler({ filter_state: 'all', limit: 5, offset: 0, response_format: 'json' });
      console.log('✅ Direct tool call successful');
      console.log('Result type:', typeof result);
      console.log('Result keys:', Object.keys(result || {}));
    } catch (error) {
      console.log('❌ Direct tool call failed:', error.message);
    }
    
    // Check if the schema has any issues
    if (getStatusTool.inputSchema) {
      console.log('\n📋 Schema analysis:');
      console.log('Schema type:', typeof getStatusTool.inputSchema);
      console.log('Has _def:', !!getStatusTool.inputSchema._def);
      
      if (getStatusTool.inputSchema._def) {
        console.log('Schema _def typeName:', getStatusTool.inputSchema._def.typeName);
      }
      
      // Check properties
      if (getStatusTool.inputSchema.properties) {
        console.log('Properties:', Object.keys(getStatusTool.inputSchema.properties));
      }
      
      // Check required fields
      if (getStatusTool.inputSchema.required) {
        console.log('Required fields:', getStatusTool.inputSchema.required);
      }
    }
    
  } else {
    console.log('❌ mcp_od_registry_list_plugins tool not found');
  }
}

// Test a tool that requires parameters
async function testParameterTool() {
  console.log('\n🔧 Testing Tool with Parameters: mcp_od_credentials_add');
  
  const credentialsTools = await captureTypedPlugin('credentials');
  
  const addCredsTool = credentialsTools.tools.find(tool => tool.name === 'mcp_od_credentials_add');
  
  if (addCredsTool) {
    console.log('\n📋 credentials_add tool schema:');
    console.log('Schema:', JSON.stringify(addCredsTool.inputSchema, null, 2));
    
    // Check if this schema has issues
    if (addCredsTool.inputSchema && addCredsTool.inputSchema.properties) {
      console.log('\n📋 Properties analysis:');
      for (const [key, value] of Object.entries(addCredsTool.inputSchema.properties)) {
        console.log(`Property "${key}":`, typeof value, value.type || 'no type');
        
        // Look for problematic structures
        if (value && typeof value === 'object' && value._def) {
          console.log(`  ❌ Property "${key}" has unconverted Zod _def:`, value._def.typeName);
        }
      }
    }
  }
}

// Run tests
if (require.main === module) {
  testFailingTool()
    .then(() => testParameterTool())
    .catch(console.error);
}

module.exports = { testFailingTool, testParameterTool };
