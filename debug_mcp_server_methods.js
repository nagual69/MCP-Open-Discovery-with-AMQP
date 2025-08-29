/**
 * Debug MCP SDK Server Methods
 * 
 * This script explores what methods are actually available on the MCP Server
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');

async function exploreMCPServer() {
  console.log('🔍 Exploring MCP SDK Server Methods...\n');

  // Create a test server
  const server = new Server(
    {
      name: 'test-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  console.log('📋 MCP Server Methods:');
  console.log('Available methods:');
  
  // List all methods on the server
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(server));
  methods.forEach(method => {
    if (typeof server[method] === 'function') {
      console.log(`- ${method}()`);
    }
  });

  console.log('\n📋 MCP Server Properties:');
  Object.keys(server).forEach(prop => {
    console.log(`- ${prop}: ${typeof server[prop]}`);
  });

  console.log('\n📋 MCP Server Prototype Chain:');
  let proto = Object.getPrototypeOf(server);
  let level = 0;
  while (proto && level < 5) {
    console.log(`Level ${level}: ${proto.constructor.name}`);
    const protoMethods = Object.getOwnPropertyNames(proto);
    protoMethods.forEach(method => {
      if (typeof proto[method] === 'function' && !method.startsWith('_')) {
        console.log(`  - ${method}()`);
      }
    });
    proto = Object.getPrototypeOf(proto);
    level++;
  }

  console.log('\n🔍 Searching for tool-related methods...');
  const allMethods = [];
  let currentProto = Object.getPrototypeOf(server);
  while (currentProto) {
    allMethods.push(...Object.getOwnPropertyNames(currentProto));
    currentProto = Object.getPrototypeOf(currentProto);
  }
  
  const toolMethods = allMethods.filter(method => 
    method.toLowerCase().includes('tool') && 
    typeof server[method] === 'function'
  );
  
  console.log('Tool-related methods found:');
  toolMethods.forEach(method => {
    console.log(`- ${method}()`);
  });

  console.log('\n🔍 Looking for registration methods...');
  const regMethods = allMethods.filter(method => 
    method.toLowerCase().includes('register') && 
    typeof server[method] === 'function'
  );
  
  console.log('Registration methods found:');
  regMethods.forEach(method => {
    console.log(`- ${method}()`);
  });

  console.log('\n🏁 MCP Server exploration complete');
}

// Run the exploration
exploreMCPServer().catch(console.error);
