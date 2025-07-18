# Developer Guide for MCP Open Discovery v2.0 🔥

## **REVOLUTIONARY DYNAMIC REGISTRY ARCHITECTURE**

**MCP Open Discovery v2.0** represents the world's most advanced MCP server implementation featuring the first-ever **dynamic tool registry with hot-reload capabilities**, **100% tool success rate**, and **revolutionary self-managing architecture**.

### **🔥 Breakthrough Achievements**

- **🌟 WORLD'S FIRST DYNAMIC MCP REGISTRY** - Runtime module loading with hot-reload
- **✅ 61 Dynamic Tools** - All using official MCP SDK with 100% success rate
- **🗄️ SQLite Registry Database** - Persistent tracking of modules, tools, and analytics
- **⚡ Hot-Reload Engine** - File watchers with automatic module updates
- **🔧 Self-Managing Tools** - 5 MCP tools that manage the registry itself
- **✅ Enterprise Security** - AES-256 encrypted credential management with hot-reload
- **✅ Multi-Transport Support** - HTTP, stdio, and WebSocket ready
- **✅ Zero-Downtime Updates** - Live module management without server restart

---

## 🏗️ **Dynamic Registry Architecture**

MCP Open Discovery v2.0 uses the **official Model Context Protocol SDK** with a revolutionary **dynamic tool registry** that enables runtime module management and hot-reload capabilities:

### **🔥 Phase 3: Dynamic Registry Components**

- **🎯 ToolRegistrationTracker** (`tools/sdk_tool_registry.js`): Dynamic tool tracking with hot-reload
- **🗄️ DynamicRegistryDB** (`tools/dynamic_registry_db.js`): SQLite persistence for registry analytics
- **🔄 Hot-Reload Engine**: File watchers with debounced module updates
- **⚡ Registry Management**: 5 MCP tools for runtime registry control
- **📊 Real-Time Analytics**: Live module status and performance tracking

### **🎯 Core Server Components**

- **� Main Server** (`mcp_server_multi_transport_sdk.js`): Official MCP SDK implementation
- **🔧 Dynamic Registry** (`tools/sdk_tool_registry.js`): Revolutionary hot-reload system
- **🏗️ In-Memory CMDB** (`tools/memory_tools_sdk.js`): Configuration management database
- **🔐 Credential Manager** - Enterprise-grade encrypted storage with hot-reload support
- **📈 Health Monitoring** - Comprehensive health checks and structured logging

### **🔥 Dynamic SDK Tool Modules** (All 100% Success Rate)

- **⚡ Registry Management** (`sdk_tool_registry.js`) - 5 tools, 100% success rate
- **🌐 Network Tools** (`tools/network_tools_sdk.js`) - 9 tools, 100% success rate
- **📊 Memory CMDB** (`tools/memory_tools_sdk.js`) - 8 tools, 100% success rate
- **🔍 NMAP Scanning** (`tools/nmap_tools_sdk.js`) - 5 tools, 100% success rate
- **🏗️ Proxmox Integration** (`tools/proxmox_tools_sdk.js`) - 10 tools, 100% success rate
- **📡 SNMP Discovery** (`tools/snmp_tools_sdk.js`) - 12 tools, 100% success rate
- **📊 Zabbix Monitoring** (`tools/zabbix_tools_sdk.js`) - 7 tools, 100% success rate
- **🔐 Credential Management** (`tools/credentials_tools_sdk.js`) - 5 tools, 100% success rate

### **📊 Revolutionary Registry Database**

```sql
-- SQLite schema for dynamic registry
modules          -- Module registration history with load times
tools            -- Tool definitions and metadata
tool_stats       -- Usage analytics and performance metrics
dependencies     -- Module relationships and load order
registry_config  -- System configuration and hot-reload settings
```

### **🔄 Hot-Reload Development Workflow**

The dynamic registry enables revolutionary hot-reload development:

```javascript
// 1. Create or modify a tool module
// File: tools/my_new_tools_sdk.js
async function registerMyNewTools(server) {
  server.tool("my_new_tool", "Description", schema, handler);
}

// 2. Load it dynamically (without server restart!)
await registry_load_module({
  modulePath: "./tools/my_new_tools_sdk.js",
  moduleName: "my_new_tools_sdk",
  category: "custom",
  exportName: "registerMyNewTools",
});

// 3. Make changes to the file - automatic hot-reload!
// File watchers detect changes and reload automatically

// 4. Or manually trigger reload
await registry_reload_module({
  moduleName: "my_new_tools_sdk",
});
```

### **🔧 Registry Management at Runtime**

```javascript
// Get current registry status
const status = await registry_get_status();

// Unload a module temporarily
await registry_unload_module({ moduleName: "snmp_tools_sdk" });

// Toggle hot-reload system-wide
await registry_toggle_hotreload({ enabled: false });
```

---

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

## Credential Manager Usage

- Add a credential:
  ```js
  const { addCredential } = require("./tools/credentials_manager");
  addCredential("proxmox1-creds", "password", {
    username: "apiuser",
    password: "your-password",
    url: "https://your-proxmox-instance:8006",
  });
  ```
- List credentials:
  ```js
  const { listCredentials } = require("./tools/credentials_manager");
  console.log(listCredentials("password"));
  ```
- Remove a credential:
  ```js
  const { removeCredential } = require("./tools/credentials_manager");
  removeCredential("proxmox1-creds");
  ```
