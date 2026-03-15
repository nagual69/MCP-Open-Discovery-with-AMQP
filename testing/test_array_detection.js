/**
 * Test array parameter detection using mcp-types adapter
 */

const { adaptToolToMCPTypes, getValidationSummary } = require('../tools/registry/mcp_types_adapter');
const { captureTypedPlugin } = require('./helpers/typed_plugin_harness');

function hasArrayParameters(tool) {
  const shape = tool?.inputSchema?._def?.shape;
  const resolvedShape = typeof shape === 'function' ? shape() : shape;
  if (!resolvedShape || typeof resolvedShape !== 'object') {
    return false;
  }

  return Object.values(resolvedShape).some((value) => {
    const typeName = value?._def?.typeName;
    return typeName === 'ZodArray' || (typeName === 'ZodOptional' && value?._def?.innerType?._def?.typeName === 'ZodArray');
  });
}

function getRegistrationMethod(tool) {
  return tool?.inputSchema?._def ? 'zod-object' : 'unknown';
}

async function testArrayDetection() {
  console.log('🔧 Testing Array Parameter Detection');
  
  const snmpTools = await captureTypedPlugin('snmp');
  const zabbixTools = await captureTypedPlugin('zabbix');
  
  // Test SNMP tools with arrays
  console.log('\n📋 SNMP Tools with Arrays:');
  
  const snmpGet = snmpTools.tools.find(tool => tool.name === 'mcp_od_snmp_get');
  const snmpGetNext = snmpTools.tools.find(tool => tool.name === 'mcp_od_snmp_get_next');
  
  if (snmpGet) {
    console.log('snmp_get:');
    console.log('  Has array parameters:', hasArrayParameters(snmpGet));
    console.log('  Registration method:', getRegistrationMethod(snmpGet));
    console.log('  Has _def:', !!snmpGet.inputSchema._def);
    
    // Check the actual schema structure
    if (snmpGet.inputSchema._def) {
      const shape = typeof snmpGet.inputSchema._def.shape === 'function' 
        ? snmpGet.inputSchema._def.shape() 
        : snmpGet.inputSchema._def.shape;
      
      console.log('  Properties:');
      for (const [key, value] of Object.entries(shape)) {
        console.log(`    ${key}: ${value._def.typeName}`);
        if (value._def.typeName === 'ZodArray') {
          console.log(`      ✅ Found array parameter: ${key}`);
        }
      }
    }
  }
  
  if (snmpGetNext) {
    console.log('\nsnmp_get_next:');
    console.log('  Has array parameters:', hasArrayParameters(snmpGetNext));
    console.log('  Registration method:', getRegistrationMethod(snmpGetNext));
  }
  
  // Test Zabbix tools with arrays
  console.log('\n📋 Zabbix Tools with Arrays:');
  
  const zabbixAlerts = zabbixTools.tools.find(tool => tool.name === 'mcp_od_zabbix_get_alerts');
  
  if (zabbixAlerts) {
    console.log('zabbix_get_alerts:');
    console.log('  Has array parameters:', hasArrayParameters(zabbixAlerts));
    console.log('  Registration method:', getRegistrationMethod(zabbixAlerts));
    console.log('  Has _def:', !!zabbixAlerts.inputSchema._def);
    
    // Check the actual schema structure
    if (zabbixAlerts.inputSchema._def) {
      const shape = typeof zabbixAlerts.inputSchema._def.shape === 'function' 
        ? zabbixAlerts.inputSchema._def.shape() 
        : zabbixAlerts.inputSchema._def.shape;
      
      console.log('  Properties:');
      for (const [key, value] of Object.entries(shape)) {
        console.log(`    ${key}: ${value._def.typeName}`);
        if (value._def.typeName === 'ZodArray') {
          console.log(`      ✅ Found array parameter: ${key}`);
        } else if (value._def.typeName === 'ZodOptional' && value._def.innerType?._def?.typeName === 'ZodArray') {
          console.log(`      ✅ Found optional array parameter: ${key}`);
        }
      }
    }
  }
  
  // Test a non-array tool for comparison
  console.log('\n📋 Non-Array Tool for Comparison:');
  const memoryTools = await captureTypedPlugin('memory-cmdb');
  const memoryStats = memoryTools.tools.find(tool => tool.name === 'mcp_od_memory_stats');
  
  if (memoryStats) {
    console.log('memory_stats:');
    console.log('  Has array parameters:', hasArrayParameters(memoryStats));
    console.log('  Registration method:', getRegistrationMethod(memoryStats));
    console.log('  Has _def:', !!memoryStats.inputSchema._def);
  }
}

// Run test
if (require.main === module) {
  testArrayDetection().catch(console.error);
}

module.exports = { testArrayDetection };
