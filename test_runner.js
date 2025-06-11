#!/usr/bin/env node

/**
 * Master Test Runner for MCP Open Discovery Server
 * 
 * This script runs all essential tests for the MCP Open Discovery Server.
 * It provides a unified way to test all components and functionalities.
 * 
 * Usage:
 *   node test_runner.js [options]
 * 
 * Options:
 *   --snmp          Run only SNMP tests
 *   --proxmox       Run only Proxmox tests  
 *   --modular       Run only modular server tests
 *   --comprehensive Run comprehensive test suite
 *   --all           Run all tests (default)
 *   --verbose       Show detailed output
 *   --help          Show this help message
 */

const { spawn } = require('child_process');
const path = require('path');

// Test configurations
const TESTS = {
  snmp: {
    file: 'test_snmp_final.js',
    name: 'SNMP Tools Test',
    description: 'Tests all SNMP functionality including discovery, inventory, and health checks'
  },
  proxmox: {
    file: 'test_proxmox.js', 
    name: 'Proxmox API Test',
    description: 'Tests Proxmox API integration and credential management'
  },
  modular: {
    file: 'test_modular_server.js',
    name: 'Modular Server Test', 
    description: 'Tests modular MCP server initialization and tool loading'
  },
  comprehensive: {
    file: 'test_comprehensive.js',
    name: 'Comprehensive Test Suite',
    description: 'Complete test suite covering all modules and functionality'
  }
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tests: [],
    verbose: false,
    help: false
  };

  if (args.length === 0 || args.includes('--all')) {
    options.tests = Object.keys(TESTS);
  }

  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const option = arg.substring(2);
      if (TESTS[option]) {
        if (!options.tests.includes(option)) {
          options.tests.push(option);
        }
      } else if (option === 'verbose') {
        options.verbose = true;
      } else if (option === 'help') {
        options.help = true;
      } else if (option !== 'all') {
        console.warn(`⚠️  Unknown option: ${arg}`);
      }
    }
  });

  // If specific tests were requested, clear the default 'all' selection
  if (args.some(arg => arg.startsWith('--') && TESTS[arg.substring(2)])) {
    options.tests = options.tests.filter(test => 
      args.includes(`--${test}`) || args.includes('--all')
    );
  }

  return options;
}

// Show help message
function showHelp() {
  console.log(`
🧪 MCP Open Discovery Server - Master Test Runner
================================================

Available Tests:
`);
  
  Object.entries(TESTS).forEach(([key, test]) => {
    console.log(`  --${key.padEnd(12)} ${test.name}`);
    console.log(`  ${' '.repeat(15)} ${test.description}`);
    console.log('');
  });

  console.log(`Options:
  --all           Run all tests (default)
  --verbose       Show detailed output  
  --help          Show this help message

Examples:
  node test_runner.js                    # Run all tests
  node test_runner.js --snmp             # Run only SNMP tests
  node test_runner.js --snmp --proxmox   # Run SNMP and Proxmox tests
  node test_runner.js --comprehensive    # Run comprehensive test suite
`);
}

// Run a single test
function runTest(testKey, verbose = false) {
  return new Promise((resolve) => {
    const test = TESTS[testKey];
    const testFile = path.join(__dirname, test.file);
    
    console.log(`\n🔍 Running: ${test.name}`);
    console.log(`📄 File: ${test.file}`);
    if (verbose) {
      console.log(`📝 Description: ${test.description}`);
    }
    console.log('━'.repeat(60));

    const child = spawn('node', [testFile], {
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: __dirname
    });

    let output = '';
    let errorOutput = '';

    if (!verbose) {
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });
    }

    child.on('close', (code) => {
      const success = code === 0;
      
      if (verbose) {
        console.log(`\n${success ? '✅' : '❌'} ${test.name} ${success ? 'PASSED' : 'FAILED'}`);
      } else {
        if (success) {
          console.log(`✅ ${test.name} PASSED`);
          // Show summary from output if available
          const lines = output.split('\n');
          const summaryLine = lines.find(line => 
            line.includes('Success Rate:') || 
            line.includes('PASSED') || 
            line.includes('ALL TESTS')
          );
          if (summaryLine) {
            console.log(`   ${summaryLine.trim()}`);
          }
        } else {
          console.log(`❌ ${test.name} FAILED`);
          if (errorOutput) {
            console.log(`   Error: ${errorOutput.split('\n')[0]}`);
          }
        }
      }

      resolve({ test: testKey, success, output, errorOutput });
    });

    child.on('error', (error) => {
      console.log(`❌ ${test.name} ERROR: ${error.message}`);
      resolve({ test: testKey, success: false, error: error.message });
    });
  });
}

// Main test runner
async function runTests() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  if (options.tests.length === 0) {
    console.log('❌ No tests specified. Use --help for usage information.');
    return;
  }

  console.log('🧪 MCP Open Discovery Server - Test Runner');
  console.log('==========================================');
  console.log(`Running ${options.tests.length} test suite(s)...\n`);

  const startTime = Date.now();
  const results = [];

  // Run tests sequentially to avoid conflicts
  for (const testKey of options.tests) {
    const result = await runTest(testKey, options.verbose);
    results.push(result);
  }

  // Summary
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);
  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;

  console.log('\n🎯 TEST RUNNER SUMMARY');
  console.log('======================');
  console.log(`Total Test Suites: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${duration}s`);
  console.log(`Success Rate: ${Math.round((passed / results.length) * 100)}%\n`);

  if (failed > 0) {
    console.log('❌ Failed Tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${TESTS[r.test].name}`);
    });
    console.log('');
    process.exit(1);
  } else {
    console.log('🎉 ALL TEST SUITES PASSED!');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, TESTS };
