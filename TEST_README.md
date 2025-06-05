# MCP Open Discovery Test Suite

This directory contains a test suite for validating the MCP Open Discovery server functionality and MCP protocol compliance.

## Test Script

The `test_mcp_client.js` script acts as an MCP client and performs the following tests:

1. Checks the server health endpoint
2. Validates the `tools/list` method response
3. Tests each available tool with appropriate parameters (including BusyBox and Nmap tools)
4. Validates responses against the MCP specification
5. Tests error handling with invalid tool requests

## Running the Tests

To run the tests, follow these steps:

### 1. Start the MCP Server

First, make sure the MCP server is running:

```bash
npm start
```

This will start the server on port 3000 (or the port specified in the PORT environment variable).

### 2. Run the Test Script

In a separate terminal, run the test script:

```bash
npm test
```

Or run it directly:

```bash
node test_mcp_client.js
```

### Test Configuration

The test script includes a configuration object that specifies the server URL and test parameters for each tool. You can modify these parameters in the `config` object within the test script.

## Test Output

The test script provides detailed output for each test, including:

- Request and response details
- MCP compliance validation results
- Summary of passed and failed tests

## MCP Compliance Checks

The test suite validates that responses comply with the Model Context Protocol (MCP) specification, including:

- Proper response structure
- Required fields for each method
- Matching request and response IDs
- Correct error handling

## Troubleshooting

If tests fail, check the following:

1. Ensure the MCP server is running and accessible
2. Verify network connectivity for tools that require internet access
3. Check tool-specific parameters in the test configuration
