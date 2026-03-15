#!/usr/bin/env node

/**
 * Test MCP Parameter Detection with Enhanced Debugging
 * This test calls the memory_set tool with specific parameters to see
 * exactly what the MCP SDK is passing to our comprehensive parameter detection
 */

const fs = require('fs');
const path = require('path');
const { captureTypedPlugin } = require('./helpers/typed_plugin_harness');

// Mock console to capture all log output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;

let logOutput = [];

function captureLog(level, ...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  logOutput.push(`[${level}] ${message}`);
  // Still output to console for real-time viewing
  if (level === 'ERROR') originalConsoleError(...args);
  else if (level === 'WARN') originalConsoleWarn(...args);
  else if (level === 'DEBUG') originalConsoleDebug(...args);
  else originalConsoleLog(...args);
}

console.log = (...args) => captureLog('LOG', ...args);
console.error = (...args) => captureLog('ERROR', ...args);
console.warn = (...args) => captureLog('WARN', ...args);
console.debug = (...args) => captureLog('DEBUG', ...args);

async function testParameterDetection() {
  try {
    console.log('=== Testing Typed Plugin Parameter Handling ===');
    
    const memoryTools = await captureTypedPlugin('memory-cmdb');
    const memorySetTool = memoryTools.tools.find((tool) => tool.name === 'mcp_od_memory_set');
    if (!memorySetTool) {
      throw new Error('mcp_od_memory_set tool not found');
    }
    
    console.log('Memory tools loaded successfully');
    console.log('Available memory tools:', memoryTools.tools.map(t => t.name));
    
    // Test the memory_set tool with specific parameters
    const testParams = {
      key: 'test:server:web01',
      value: {
        hostname: 'web01.example.com',
        ip: '192.168.1.100',
        type: 'web-server'
      }
    };
    
    console.log('Testing memory_set with parameters:', testParams);
    
    console.log('\n=== Testing direct typed handler invocation ===');
    try {
      const result1 = await memorySetTool.handler(testParams);
      console.log('Scenario 1 Result:', result1);
    } catch (error) {
      console.error('Scenario 1 Error:', error.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Save all captured logs to file
    const logFile = path.join(__dirname, 'parameter_detection_test_logs.txt');
    fs.writeFileSync(logFile, logOutput.join('\n'), 'utf8');
    console.log(`\nAll logs saved to: ${logFile}`);
  }
}

testParameterDetection().catch(console.error);
