#!/usr/bin/env node

/**
 * Comprehensive SNMP Tools Test - Final Version
 * Tests all SNMP functionality with our Docker-based implementation
 */

const snmpTools = require('./snmp_tools.js');

async function runComprehensiveSNMPTest() {
  console.log('🧪 COMPREHENSIVE SNMP TOOLS TEST');
  console.log('================================\n');

  const results = {
    tests: 0,
    passed: 0,
    failed: 0,
    errors: []
  };

  function test(name, testFunc) {
    return new Promise(async (resolve) => {
      results.tests++;
      try {
        console.log(`🔍 Testing: ${name}`);
        const result = await testFunc();
        if (result) {
          console.log(`✅ PASSED: ${name}\n`);
          results.passed++;
        } else {
          console.log(`❌ FAILED: ${name}\n`);
          results.failed++;
        }
        resolve();
      } catch (error) {
        console.log(`❌ ERROR: ${name} - ${error.message}\n`);
        results.failed++;
        results.errors.push({ test: name, error: error.message });
        resolve();
      }
    });
  }

  // Test 1: Basic SNMP Session Management
  await test('SNMP Session Creation', async () => {
    const { sessionId } = snmpTools.createSnmpSession('172.20.0.10', {
      community: 'public',
      version: '2c',
      port: 161,
      timeout: 5000
    });
    
    const closed = snmpTools.closeSnmpSession(sessionId);
    return sessionId && closed;
  });

  // Test 2: SNMP GET Operation
  await test('SNMP GET (System Description)', async () => {
    const { sessionId } = snmpTools.createSnmpSession('172.20.0.10');
    const result = await snmpTools.snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0']);
    snmpTools.closeSnmpSession(sessionId);
    
    console.log('   Result:', JSON.stringify(result[0], null, 2));
    return result && result.length > 0 && result[0].value;
  });

  // Test 3: SNMP WALK Operation  
  await test('SNMP WALK (System Info)', async () => {
    const { sessionId } = snmpTools.createSnmpSession('172.20.0.10');
    const result = await snmpTools.snmpWalk(sessionId, '1.3.6.1.2.1.1');
    snmpTools.closeSnmpSession(sessionId);
    
    console.log(`   Found ${result.length} system OIDs`);
    return result && result.length > 0;
  });

  // Test 4: SNMP Device Inventory
  await test('SNMP Device Inventory', async () => {
    const result = await snmpTools.snmpDeviceInventory('172.20.0.10', 'public', '2c');
    
    console.log('   System Name:', result.system?.name);
    console.log('   System Description:', result.system?.description?.substring(0, 50) + '...');
    
    return result && result.system && result.system.name;
  });

  // Test 5: SNMP Interface Discovery
  await test('SNMP Interface Discovery', async () => {
    const result = await snmpTools.snmpInterfaceDiscovery('172.20.0.10', 'public', '2c');
    
    console.log(`   Found ${result.interfaces?.length || 0} interfaces`);
    if (result.interfaces && result.interfaces.length > 0) {
      console.log('   First Interface:', result.interfaces[0].name);
    }
    
    return result && result.interfaces;
  });

  // Test 6: SNMP System Health Check
  await test('SNMP System Health Check', async () => {
    const result = await snmpTools.snmpSystemHealthCheck('172.20.0.10', 'public', '2c');
    
    console.log('   System Name:', result.system?.name);
    console.log('   System Uptime:', result.system?.uptime);
    
    return result && result.system;
  });

  // Test 7: SNMP Service Discovery
  await test('SNMP Service Discovery', async () => {
    const result = await snmpTools.snmpServiceDiscovery('172.20.0.10', 'public', '2c');
    
    console.log(`   Found ${result.services?.length || 0} running processes`);
    
    return result && typeof result === 'object';
  });
  // Test 8: SNMP Network Discovery (Full Docker Network)
  await test('SNMP Network Discovery', async () => {
    const result = await snmpTools.snmpDiscover('172.20.0.0/24', { // Full Docker network range
      community: 'public',
      version: '2c',
      timeout: 5000
    });
    
    console.log(`   Discovered ${result.length} SNMP devices`);
    result.forEach(device => {
      console.log(`   - ${device.ip}: ${device.sysName}`);
    });
    
    return result && result.length > 0;
  });

  // Test 9: Multiple Target Testing  
  await test('Multiple SNMP Targets', async () => {
    const targets = ['172.20.0.10', '172.20.0.11', '172.20.0.12'];
    const results = [];
    
    for (const target of targets) {
      try {
        const { sessionId } = snmpTools.createSnmpSession(target);
        const result = await snmpTools.snmpGet(sessionId, ['1.3.6.1.2.1.1.5.0']);
        results.push({ target, sysName: result[0]?.value });
        snmpTools.closeSnmpSession(sessionId);
      } catch (error) {
        console.log(`   ${target}: Not responding`);
      }
    }
    
    console.log('   Active targets:');
    results.forEach(r => console.log(`   - ${r.target}: ${r.sysName}`));
    
    return results.length > 0;
  });

  // Test 10: Error Handling
  await test('SNMP Error Handling', async () => {
    try {
      const { sessionId } = snmpTools.createSnmpSession('192.168.99.99'); // Non-existent IP
      await snmpTools.snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0']);
      snmpTools.closeSnmpSession(sessionId);
      return false; // Should have thrown an error
    } catch (error) {
      console.log('   Expected error:', error.message.substring(0, 50) + '...');
      return true; // Error handling works
    }
  });

  // Final Results
  console.log('\n🎯 TEST RESULTS SUMMARY');
  console.log('=======================');
  console.log(`Total Tests: ${results.tests}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${Math.round((results.passed / results.tests) * 100)}%\n`);

  if (results.errors.length > 0) {
    console.log('❌ Errors:');
    results.errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err.test}: ${err.error}`);
    });
    console.log('');
  }

  if (results.passed === results.tests) {
    console.log('🎉 ALL TESTS PASSED! SNMP Tools are fully functional!');
  } else if (results.passed > results.tests / 2) {
    console.log('✅ Most tests passed. SNMP Tools are working with minor issues.');
  } else {
    console.log('⚠️  Multiple test failures. Check SNMP configuration.');
  }

  return results;
}

// Run the comprehensive test
if (require.main === module) {
  runComprehensiveSNMPTest().catch(console.error);
}

module.exports = { runComprehensiveSNMPTest };
