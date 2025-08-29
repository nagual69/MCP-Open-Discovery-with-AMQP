#!/usr/bin/env node

/**
 * Test MCP Parameter Detection with Enhanced Debugging
 * This test calls the memory_set tool with specific parameters to see
 * exactly what the MCP SDK is passing to our comprehensive parameter detection
 */

const fs = require('fs');
const path = require('path');

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
    console.log('=== Testing MCP Parameter Detection ===');
    
    // Import the memory tools directly to test parameter handling
    const memoryTools = require('../tools/memory_tools_sdk');
    
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
    
    // Simulate what the MCP SDK might be passing
    const mockMCPContext = {
      signal: new AbortController().signal,
      sessionId: 'test-session-123',
      _meta: { transport: 'test', timestamp: Date.now() },
      requestInfo: { id: 'test-request-456', method: 'tools/call' }
    };
    
    // Test different parameter passing scenarios
    console.log('\n=== Testing Scenario 1: Parameters first, context second ===');
    try {
      const result1 = await memoryTools.handleToolCall('memory_set', testParams, mockMCPContext);
      console.log('Scenario 1 Result:', result1);
    } catch (error) {
      console.error('Scenario 1 Error:', error.message);
    }
    
    console.log('\n=== Testing Scenario 2: Context first, parameters second ===');
    try {
      const result2 = await memoryTools.handleToolCall('memory_set', mockMCPContext, testParams);
      console.log('Scenario 2 Result:', result2);
    } catch (error) {
      console.error('Scenario 2 Error:', error.message);
    }
    
    console.log('\n=== Testing Scenario 3: Parameters wrapped in arguments property ===');
    try {
      const wrappedParams = { arguments: testParams };
      const result3 = await memoryTools.handleToolCall('memory_set', wrappedParams, mockMCPContext);
      console.log('Scenario 3 Result:', result3);
    } catch (error) {
      console.error('Scenario 3 Error:', error.message);
    }
    
    console.log('\n=== Testing Scenario 4: Only context object (no parameters) ===');
    try {
      const result4 = await memoryTools.handleToolCall('memory_set', mockMCPContext);
      console.log('Scenario 4 Result:', result4);
    } catch (error) {
      console.error('Scenario 4 Error:', error.message);
    }
    
    console.log('\n=== Testing Scenario 5: Parameters nested in context ===');
    try {
      const contextWithParams = {
        ...mockMCPContext,
        params: { arguments: testParams }
      };
      const result5 = await memoryTools.handleToolCall('memory_set', contextWithParams);
      console.log('Scenario 5 Result:', result5);
    } catch (error) {
      console.error('Scenario 5 Error:', error.message);
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
