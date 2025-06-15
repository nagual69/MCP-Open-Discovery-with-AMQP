# Developer Guide for MCP Open Discovery v2.0

This guide covers best practices for developing and adding new tools to the MCP Open Discovery server using the official MCP SDK.

## SDK-Based Architecture Overview

MCP Open Discovery v2.0 uses the official Model Context Protocol SDK with a modular architecture:

### Core Components

- **Main Server** (`mcp_server_modular_sdk.js`): Official MCP SDK implementation
- **Tool Registry** (`tools/sdk_tool_registry.js`): Centralized tool registration
- **SDK Tool Modules**: All tools use SDK format with Zod schemas:
  - `tools/network_tools_sdk.js` - Network utilities (8 tools)
  - `tools/memory_tools_sdk.js` - CMDB memory operations (4 tools)
  - `tools/nmap_tools_sdk.js` - Network scanning tools (5 tools)
  - `tools/proxmox_tools_sdk.js` - Proxmox VE API integration (13 tools)
  - `tools/snmp_tools_sdk.js` - SNMP discovery and monitoring (12 tools)

### Legacy Components (Preserved)

- **Legacy Servers**: Original implementations maintained for compatibility
- **Legacy Tool Modules**: Original format tools in `tools/` (non-SDK files)

## Creating a New SDK Tool Module

### 1. SDK Module Structure

Create a new file in the `tools/` directory following the `*_sdk.js` naming convention:

```javascript
/**
 * [Module Name] Tools for MCP Open Discovery - SDK Compatible
 *
 * Description of what this module provides using the official MCP SDK patterns.
 * Converted from custom format to use Zod schemas and CallToolResult responses.
 */

const { z } = require("zod");

/**
 * Convert results to CallToolResult format
 * @param {any} data - The response data
 * @param {string} description - Description of the operation
 * @returns {Object} CallToolResult format
 */
function formatResult(data, description = "") {
  try {
    const formattedData =
      typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return {
      content: [
        {
          type: "text",
          text: description
            ? `${description}\\n\\n${formattedData}`
            : formattedData,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error formatting result: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Handle errors and return proper CallToolResult format
 * @param {Error} error - The error object
 * @returns {Object} CallToolResult with error
 */
function formatError(error) {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${error.message}`,
      },
    ],
    isError: true,
  };
}

/**
 * Register all tools in this module with the MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerMyTools(server) {
  // Example simple tool
  server.tool(
    "my_simple_tool",
    "Example tool description",
    {
      param1: z.string().describe("Required string parameter"),
      param2: z.number().optional().describe("Optional number parameter"),
    },
    async ({ param1, param2 }) => {
      try {
        // Tool implementation here
        const result = await performOperation(param1, param2);
        return formatResult(result, `Operation completed for ${param1}`);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // Example tool with complex schema
  server.tool(
    "my_complex_tool",
    "More complex tool with validation",
    {
      host: z.string().describe("Target hostname or IP address"),
      options: z
        .object({
          timeout: z.number().min(1).max(60).default(10),
          retries: z.number().min(1).max(5).default(3),
        })
        .optional()
        .describe("Optional configuration"),
    },
    async ({ host, options = {} }) => {
      try {
        const { timeout = 10, retries = 3 } = options;
        const result = await complexOperation(host, { timeout, retries });
        return formatResult(result, `Complex operation completed for ${host}`);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  console.log("[MCP SDK] Registered X MyTools");
}

module.exports = { registerMyTools };
```

### 2. Register Tools in SDK Tool Registry

Update `tools/sdk_tool_registry.js` to include your new module:

```javascript
// Add import
const { registerMyTools } = require("./my_tools_sdk");

// Add to registerAllTools function
async function registerAllTools(server, options = {}) {
  try {
    console.log("[MCP SDK] Starting tool registration...");

    // ... existing registrations ...

    // Register your new tools
    registerMyTools(server);

    console.log("[MCP SDK] All tools registered successfully");
  } catch (error) {
    console.error(`[MCP SDK] Error registering tools: ${error.message}`);
    throw error;
  }
}

// Update tool counts
function getToolCounts() {
  return {
    // ... existing counts ...
    mytools: X, // Number of your tools
    total: XX, // Updated total
  };
}
```

### 3. Schema Definition Best Practices

#### Use Zod for Type Safety

```javascript
// Simple types
z.string().describe("String parameter");
z.number().min(1).max(100).describe("Number with range");
z.boolean().default(false).describe("Boolean with default");

// Complex types
z.object({
  nested_param: z.string(),
  nested_number: z.number().optional(),
}).describe("Nested object");

z.array(z.string()).describe("Array of strings");
z.enum(["option1", "option2"]).describe("Limited options");

// Optional parameters
z.string().optional().describe("Optional parameter");
z.number().default(10).describe("Parameter with default");
```

### 4. CallToolResult Format

All tools must return the standard CallToolResult format:

```javascript
// Success response
return {
  content: [
    {
      type: "text",
      text: "Result content as string",
    },
  ],
};

// Error response
return {
  content: [
    {
      type: "text",
      text: "Error description",
    },
  ],
  isError: true,
};
```

## Input Validation and Security

### Input Sanitization

```javascript
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
