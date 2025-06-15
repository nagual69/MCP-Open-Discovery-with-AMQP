#!/usr/bin/env node

/**
 * SNMP Discovery Test with Test Network
 * Demonstrates SNMP discovery tools against the 3 SNMP test servers
 */

console.log('🔍 SNMP Discovery Test with Test Network');
console.log('📡 Testing SNMP discovery against our 3 test servers\n');

console.log('🌐 SNMP Test Network Configuration:');
console.log('  • Network: 172.20.0.0/16 (Docker network)');
console.log('  • snmp-agent-1: 172.20.0.10:1161 (Docker Test Lab)');
console.log('  • snmp-agent-2: 172.20.0.11:2161 (Docker Test Lab 2)');
console.log('  • snmp-agent-3: 172.20.0.12:3161 (Docker Test Lab 3 + testcommunity)');
console.log('  • mcp-server: 172.20.0.1:3000 (MCP Open Discovery)\n');

console.log('🧪 How to Test SNMP Discovery:');
console.log('1. Connect MCP Inspector:');
console.log('   npx @modelcontextprotocol/inspector http://localhost:3000/mcp\n');

console.log('2. Test SNMP Discovery tool with target network:');
console.log('   Tool: snmp_discover');
console.log('   Parameters:');
console.log('     targetRange: "172.20.0.0/24"');
console.log('     community: "public"');
console.log('     timeout: 5000\n');

console.log('3. Test Individual SNMP Queries:');
console.log('   Tool: snmp_create_session');
console.log('   Parameters:');
console.log('     host: "172.20.0.10"');
console.log('     community: "public"\n');

console.log('   Tool: snmp_get');
console.log('   Parameters (use sessionId from above):');
console.log('     sessionId: "<session-id>"');
console.log('     oids: ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.5.0"]\n');

console.log('4. Test SNMP Device Inventory:');
console.log('   Tool: snmp_device_inventory');
console.log('   Parameters:');
console.log('     host: "172.20.0.10"');
console.log('     community: "public"\n');

console.log('5. Test SNMP System Health:');
console.log('   Tool: snmp_system_health');
console.log('   Parameters:');
console.log('     host: "172.20.0.11"');
console.log('     community: "public"\n');

console.log('🎯 Expected Results:');
console.log('  • Discovery should find 3 SNMP agents');
console.log('  • Each agent should respond with system information');
console.log('  • System names: snmp-test-1, snmp-test-2, snmp-test-3');
console.log('  • Locations: Docker Test Lab, Docker Test Lab 2, Docker Test Lab 3');

console.log('\n📋 Container Status:');
console.log('  Run: docker ps');
console.log('  All 4 containers should be running (mcp-open-discovery + 3 SNMP agents)\n');

console.log('🚀 Ready to test SNMP discovery tools with live test network!');
