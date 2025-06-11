# Developer Guide for MCP Open Discovery

This guide covers best practices for developing and adding new tool modules to the MCP Open Discovery server.

## Modular Architecture Overview

The MCP Open Discovery server uses a modular architecture where tools are organized into separate modules by functionality:

- **Network Tools** (`tools/network_tools.js`): Basic network utilities
- **Nmap Tools** (`tools/nmap_tools.js`): Network scanning tools
- **Memory Tools** (`tools/memory_tools.js`): In-memory CMDB operations
- **Proxmox Tools** (`tools/proxmox_tools.js`): Proxmox VE API integration
- **SNMP Tools** (`tools/snmp_module.js`): SNMP discovery and monitoring

## Creating a New Tool Module

### 1. Module Structure

Create a new file in the `tools/` directory following this template:

```javascript
/**
 * [Module Name] Tools for MCP Open Discovery
 *
 * Description of what this module provides
 */

const { spawn } = require("child_process");

/**
 * Helper function example
 */
function helperFunction(param) {
  // Implementation
}

/**
 * Tool implementation example
 */
async function exampleTool(args) {
  try {
    // Tool logic here
    return {
      success: true,
      data: result,
      message: "Operation completed successfully",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Returns the tool definitions for this module
 * @param {Object} server - Reference to the server instance
 * @returns {Array} Array of tool definitions
 */
function getTools(server) {
  return [
    {
      name: "example_tool",
      description: "Example tool description",
      inputSchema: {
        type: "object",
        properties: {
          required_param: {
            type: "string",
            description: "Required parameter description",
          },
          optional_param: {
            type: "string",
            description: "Optional parameter description",
            default: "default_value",
          },
        },
        required: ["required_param"],
      },
      handler: exampleTool,
    },
    // ... more tool definitions
  ];
}

module.exports = {
  getTools,
};
```

### 2. Tool Definition Schema

Each tool must follow the MCP tool schema format:

```javascript
{
  name: 'tool_name',              // Unique tool identifier
  description: 'Tool description', // Clear description of functionality
  inputSchema: {                  // JSON Schema for parameters
    type: 'object',
    properties: {
      param_name: {
        type: 'string|number|boolean|array|object',
        description: 'Parameter description',
        enum: ['option1', 'option2'], // For limited options
        default: 'default_value'      // Optional default
      }
    },
    required: ['required_param1', 'required_param2']
  },
  handler: handlerFunction        // Async function to execute
}
```

### 3. Handler Function Best Practices

#### Input Validation

```javascript
async function toolHandler(args) {
  // Validate required parameters
  if (!args.required_param) {
    throw new Error("required_param is required");
  }

  // Sanitize and validate input
  const sanitizedInput = sanitizeInput(args.user_input);
}
```

#### Error Handling

```javascript
async function toolHandler(args) {
  try {
    // Tool implementation
    return { success: true, data: result };
  } catch (error) {
    // Log error for debugging
    console.error(`[${toolName}] Error:`, error.message);

    // Return structured error
    return {
      success: false,
      error: error.message,
      code: "TOOL_ERROR",
    };
  }
}
```

#### Command Execution

```javascript
function executeCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      timeout: options.timeout || 30000,
      ...options,
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed: ${stderr}`));
      }
    });

    process.on("error", reject);
  });
}
```

## Module Integration

### 1. Automatic Loading

The module loader (`tools/module_loader.js`) automatically discovers and loads all modules in the `tools/` directory. No manual registration is required.

### 2. Module Dependencies

If your module depends on external libraries:

```javascript
// Add to package.json dependencies
{
  "dependencies": {
    "your-library": "^1.0.0"
  }
}

// Require in your module
const yourLibrary = require('your-library');
```

### 3. Server Context

Access server resources through the provided context:

```javascript
function getTools(server) {
  // Access server methods and properties
  const ciMemory = server.ciMemory;

  return [
    {
      name: "example_tool",
      handler: async (args) => {
        // Use server context
        ciMemory["key"] = "value";
      },
    },
  ];
}
```

## Testing Your Module

### 1. Create Module Tests

Create a test file in `testing/` directory:

```javascript
// testing/test_your_module.js
const { spawn } = require("child_process");

async function testYourModule() {
  console.log("Testing Your Module...");

  try {
    // Test tool functionality
    const result = await callMCPTool("your_tool_name", {
      param1: "test_value",
    });

    console.log("✅ your_tool_name passed");
    return true;
  } catch (error) {
    console.log("❌ your_tool_name failed:", error.message);
    return false;
  }
}

module.exports = { testYourModule };
```

### 2. Add to Test Runner

Update `testing/test_runner.js` to include your tests:

```javascript
const TESTS = {
  // ...existing tests
  your_module: {
    name: "Your Module Tests",
    file: "test_your_module.js",
    function: "testYourModule",
  },
};
```

### 3. Run Tests

```bash
cd testing
node test_runner.js --your_module
```

## Docker Integration

### 1. Container Dependencies

If your module requires additional system packages, update the Dockerfile:

```dockerfile
# Install additional packages
RUN apk add --no-cache your-package

# Copy module files
COPY tools/your_module.js /home/mcpuser/app/tools/
```

### 2. Environment Variables

Configure environment variables in docker-compose.yml:

```yaml
services:
  busybox-network-mcp:
    environment:
      - YOUR_MODULE_CONFIG=value
```

## Security Considerations

### 1. Input Sanitization

Always sanitize user input:

```javascript
function sanitizeInput(input) {
  // Remove dangerous characters
  return input.replace(/[;&|`$]/g, "");
}
```

### 2. Command Injection Prevention

Use parameterized commands:

```javascript
// BAD - vulnerable to injection
const command = `tool ${userInput}`;

// GOOD - use array format
const args = ["tool", userInput];
spawn("command", args);
```

### 3. Resource Limits

Implement timeouts and resource limits:

```javascript
const process = spawn(command, args, {
  timeout: 30000, // 30 second timeout
  maxBuffer: 1024 * 1024, // 1MB output limit
});
```

## Best Practices Summary

1. **Follow naming conventions**: Use descriptive, consistent naming
2. **Comprehensive error handling**: Always handle and report errors gracefully
3. **Input validation**: Validate all inputs according to schema
4. **Security first**: Sanitize inputs and prevent injection attacks
5. **Resource awareness**: Implement timeouts and limits
6. **Clear documentation**: Document all parameters and behavior
7. **Comprehensive testing**: Test all functionality and edge cases
8. **Modular design**: Keep modules focused and independent
