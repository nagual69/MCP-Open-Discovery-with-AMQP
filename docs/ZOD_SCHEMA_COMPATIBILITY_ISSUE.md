# Zod Schema Compatibility Issue - MCP Open Discovery

**Date**: August 11, 2025 (Updated post-AMQP transport fix)  
**Status**: ACTIVE ISSUE - Ready for systematic resolution  
**Impact**: Tools register successfully but fail execution with `keyValidator._parse is not a function` error  
**Transport Status**: ✅ AMQP transport fully working - VSCode integration complete

## Problem Summary

The MCP Open Discovery system successfully registers 57+ tools across 8 categories and achieves full VSCode connectivity via AMQP transport. However, tool execution fails with Zod schema validation errors. This is a known MCP SDK compatibility issue with Zod schema conversion that requires systematic resolution.

**Critical Context**: The transport layer (AMQP/HTTP) is working perfectly. This is purely a schema validation issue during tool execution.

## Error Signature & Transport Context

```
ERROR while calling tool: MPC -32603: keyValidator._parse is not a function
```

**Confirmed Working Flow**:

1. ✅ VSCode connects to AMQP transport via MCP bridge
2. ✅ Initialize handshake completes successfully
3. ✅ Tool discovery works (VSCode shows "Discovered 62 tools")
4. ✅ JSON-RPC requests reach server (`tools/call` method)
5. ✅ Server processes requests and attempts validation
6. ❌ **FAILURE HERE**: Zod schema validation fails with `keyValidator._parse`
7. ✅ Error responses sent back to VSCode successfully

**Key Insight**: The issue occurs during parameter validation within the MCP SDK, not during transport or tool discovery.

## Root Cause Analysis

### MCP SDK Zod Compatibility Issues

Based on GitHub discussions, testing, and our successful transport implementation:

1. **MCP SDK expects raw JSON Schema objects, not Zod schema objects**
2. **Zod version compatibility issues** - SDK built for older Zod versions
3. **Schema conversion logic issues** - Our `zodToJsonSchema()` function may not produce SDK-compatible schemas
4. **Inconsistent behavior across different Zod schema patterns**
5. **Tool registration works fine, but execution validation fails** (confirmed behavior)

### Critical Technical Context (Post-Transport Fix)

**Working Components**:

- Transport interface compliance: ✅ Fixed with idempotent `start()` method
- AMQP bidirectional routing: ✅ Working perfectly
- VSCode MCP bridge communication: ✅ Full integration
- JSON-RPC message flow: ✅ Complete end-to-end
- Tool discovery and listing: ✅ All tools visible

**Issue Location**: The problem occurs within the MCP SDK's tool parameter validation, specifically when the SDK attempts to validate incoming parameters against our converted Zod schemas.

### Known Patterns from GitHub Issues & Our Testing

```javascript
// PATTERN 1: Direct Zod object (CAUSES ERROR)
server.tool(
    "search_local_database",
    z.object({ query: z.string() }), // Zod object causes keyValidator._parse error
    async ({ query }) => {})
);

// PATTERN 2: Raw schema object (REPORTED TO WORK)
server.tool(
    "search_local_database",
    { query: z.string() }, // Raw object may work
    async ({ query }) => {})
);

// PATTERN 3: Our current approach (FAILING)
server.registerTool({
    name: "ping",
    description: "Send ICMP ping to test connectivity",
    inputSchema: zodToJsonSchema(z.object({
        host: z.string().describe("Target host or IP address"),
        count: z.number().optional()
    }))
});
```

**Our Current Implementation**: We use `zodToJsonSchema()` conversion in `tools/registry/index.js` which creates JSON Schema objects, but these still trigger the validation error.

### Zod Version Issues

- **zod@^3.21.4**: Reported working by some users
- **zod@^3.25.64**: Current version causing issues
- **zod/v4**: Memory leaks and "Type instantiation is excessively deep" errors

## Current System State (Post-AMQP Transport Fix)

### ✅ Working Components

- **AMQP Transport**: ✅ Complete success - VSCode integration working
- **HTTP Transport**: ✅ Active on port 3000 with health endpoints
- **Server startup**: ✅ Complete success with all modules loaded
- **Tool registration**: ✅ 57+ tools across 8 categories successfully registered
- **Tool discovery**: ✅ VSCode discovers and lists all tools
- **JSON-RPC communication**: ✅ Full bidirectional flow working
- **Error handling**: ✅ Proper error responses sent back to VSCode
- **Health monitoring**: ✅ AMQP health checks passing
- **Hot-reload system**: ✅ Fully operational
- **Memory persistence**: ✅ SQLite CMDB working with auto-save

### ❌ Failing Components

- **Tool execution validation**: All tools fail with `keyValidator._parse` error
- **Schema validation**: MCP SDK rejects our converted schemas during parameter validation
- **Zod schema compatibility**: Our conversion approach doesn't produce SDK-compatible schemas

### Transport Architecture (Now Working)

```
VSCode ←→ MCP Bridge ←→ AMQP Transport ←→ MCP Server ←→ Tool Registry
  ✅        ✅            ✅             ✅         ❌ (validation)
```

**Critical Success**: The entire message flow works perfectly until the final schema validation step.

### Registry Architecture (Working System)

```
tools/registry/
├── index.js                    # Main orchestrator (ISSUE: Schema conversion here)
├── core_registry.js           # Tool lifecycle management ✅
├── parameter_type_detector.js # Schema analysis ✅
├── tool_validation_manager.js # Validation logic ✅
└── hot_reload_manager.js      # File watching ✅

tools/
├── *_tools_sdk.js             # Individual tool modules ✅
├── sdk_tool_registry.js       # Central registration ✅
└── transports/
    ├── amqp-server-transport.js # AMQP transport ✅ FIXED
    └── amqp-transport-integration.js # Integration layer ✅
```

**Key Achievement**: AMQP transport interface compliance fixed with idempotent `start()` method enabling full VSCode integration.

## Attempted Solutions & Results (Updated)

### 1. Transport Interface Compliance (✅ COMPLETED)

**Approach**: Fixed AMQP transport interface violations preventing SDK integration
**Result**: ✅ **COMPLETE SUCCESS** - VSCode now fully connects and communicates
**Key Fix**: Made `start()` method idempotent in `amqp-server-transport.js`
**Impact**: Resolved critical blocking issue, enabled end-to-end testing

### 2. Custom Zod to JSON Schema Converter (❌ STILL FAILING)

**Approach**: Created `zodToJsonSchema()` function to convert Zod schemas to JSON Schema
**Result**: ❌ Still causes `keyValidator._parse is not a function` validation errors
**Code Location**: `tools/registry/index.js` lines 39-220
**Status**: Function executes but produces incompatible schema format

### 3. Standard zod-to-json-schema Library (❌ ATTEMPTED)

**Approach**: Used npm package `zod-to-json-schema`
**Result**: ❌ Same validation errors persist
**Code**: `const { zodToJsonSchema } = require('zod-to-json-schema')`
**Analysis**: Library may produce schemas that still don't match SDK expectations

### 4. Direct Schema Registration (🔄 NEEDS TESTING)

**Approach**: Bypass conversion entirely, use raw JSON Schema objects
**Status**: Not yet implemented - requires systematic approach
**Potential**: High - matches GitHub issue recommendations

## Tool Categories & Schema Patterns (Confirmed Working System)

### Tool Distribution (From Live Registry)

- **Memory Tools**: 10 tools (includes new rotate_key, migrate tools)
- **Network Tools**: 8 tools (confirmed via registry)
- **NMAP Tools**: 5 tools (all privilege-escalation aware)
- **Proxmox Tools**: 10 tools (full cluster management)
- **SNMP Tools**: 12 tools (comprehensive device discovery)
- **Zabbix Tools**: 7 tools (monitoring integration)
- **Credentials Tools**: 5 tools (encrypted storage)
- **Registry Tools**: 5 tools (hot-reload management)

**Total**: 57+ tools successfully registered and discoverable by VSCode

### Registration Methods Analysis

```javascript
// METHOD 1: server.tool() - Used for array parameters
// Status: ❌ Fails with keyValidator._parse error
await server.tool({
  name: "snmp_get",
  description: "Get SNMP values",
  inputSchema: zodToJsonSchema(
    z.object({
      sessionId: z.string(),
      oids: z.array(z.string()), // Array parameter
    })
  ),
  handler: handleToolCall,
});

// METHOD 2: server.registerTool() - Used for simple parameters
// Status: ❌ Also fails with same error
await server.registerTool({
  name: "ping",
  description: "Send ICMP ping",
  inputSchema: zodToJsonSchema(
    z.object({
      host: z.string(),
      count: z.number().optional(),
    })
  ),
  handler: handleToolCall,
});
```

**Key Finding**: Both registration methods fail during execution, not registration. The issue is in runtime parameter validation.

## Next Steps for Resolution (Systematic Approach)

### Phase 1: Minimal Reproduction & Analysis 🔬

**Goal**: Create isolated test cases to understand the exact schema format requirements

1. **Single Tool Isolation Test**

   ```javascript
   // Test with minimal tool registration
   server.registerTool({
     name: "test_simple",
     description: "Simple test tool",
     inputSchema: { type: "object", properties: {} }, // Raw JSON Schema
     handler: () => ({ success: true }),
   });
   ```

2. **Schema Format Comparison**

   - Test raw JSON Schema objects (no Zod conversion)
   - Test different Zod conversion approaches
   - Compare working examples from GitHub issues
   - Document which formats the SDK accepts

3. **MCP SDK Behavior Analysis**
   ```javascript
   // Log exact schema objects being passed to SDK
   console.log("Schema passed to SDK:", JSON.stringify(inputSchema, null, 2));
   console.log("Schema type:", typeof inputSchema);
   console.log("Schema constructor:", inputSchema.constructor.name);
   ```

### Phase 2: Targeted Schema Fixes 🛠️

**Goal**: Implement working schema format based on Phase 1 findings

1. **Direct JSON Schema Approach**

   ```javascript
   // Bypass Zod conversion entirely
   const toolSchemas = {
     ping: {
       type: "object",
       properties: {
         host: { type: "string", description: "Target host" },
         count: { type: "number", description: "Number of pings" },
       },
       required: ["host"],
     },
   };
   ```

2. **Conditional Registration Strategy**

   ```javascript
   // Different approaches for different tool types
   if (hasArrayParameters(tool)) {
     await server.tool(name, rawSchema, handler);
   } else {
     await server.registerTool({ name, inputSchema: rawSchema, handler });
   }
   ```

3. **Schema Validation Testing**
   - Test each tool category individually
   - Verify no regression in working tools
   - Ensure all 57+ tools remain functional

### Phase 3: Production Implementation 🚀

**Goal**: Deploy working solution with comprehensive testing

1. **Incremental Rollout**

   - Fix one tool category at a time
   - Validate VSCode integration for each category
   - Maintain backward compatibility

2. **Comprehensive Testing Suite**

   ```javascript
   // Test all tool execution scenarios
   const testScenarios = [
     { tool: "ping", params: { host: "8.8.8.8" } },
     { tool: "memory_stats", params: {} },
     { tool: "snmp_get", params: { sessionId: "test", oids: ["1.3.6.1"] } },
   ];
   ```

3. **Documentation & Monitoring**
   - Update schema development guidelines
   - Add runtime schema validation monitoring
   - Create troubleshooting playbook

## Recommended Implementation Strategy 💡

### Priority 1: Quick Win Testing (1-2 hours)

```javascript
// Create test tool with raw JSON Schema in tools/test_simple_sdk.js
const tools = [
  {
    name: "test_simple",
    description: "Simple test tool with raw JSON Schema",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Test message" },
      },
      required: ["message"],
    },
  },
];

async function handleToolCall(name, args) {
  if (name === "test_simple") {
    return {
      success: true,
      message: args.message,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { tools, handleToolCall };
```

### Priority 2: Schema Conversion Replacement (2-4 hours)

```javascript
// Replace zodToJsonSchema() in tools/registry/index.js
function zodToMcpCompatibleSchema(zodSchema) {
  // Extract Zod schema definition manually
  if (zodSchema._def.typeName === "ZodObject") {
    const properties = {};
    const required = [];

    for (const [key, value] of Object.entries(zodSchema._def.shape())) {
      properties[key] = zodTypeToJsonSchema(value);
      if (!value.isOptional()) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  // Fallback for other types
  return { type: "object", properties: {} };
}
```

### Priority 3: Verification Testing (1 hour)

```bash
# Test with VSCode MCP extension
# Verify tools appear and execute without keyValidator._parse errors
# Test representative tools from each category
```

## Critical Files for Investigation 📁

### Primary Investigation Targets

1. **`tools/registry/index.js`** (Lines 39-220)

   - Contains `zodToJsonSchema()` conversion function
   - **Action**: Replace with MCP-compatible schema generation

2. **`tools/registry/core_registry.js`**

   - Handles tool registration with MCP SDK
   - **Action**: Add schema format validation and logging

3. **`tools/*_tools_sdk.js`** (All tool modules)
   - Contain Zod schema definitions
   - **Action**: Verify schema patterns and identify problematic cases

### Secondary Files

4. **`package.json`**

   - Current Zod version: Check for compatibility
   - **Action**: Document working Zod version requirements

5. **`mcp_server_multi_transport_sdk.js`**
   - Main server initialization
   - **Action**: Add schema validation debugging

## Success Metrics & Testing 📊

### Immediate Success Criteria

- [ ] At least one tool executes without `keyValidator._parse` error
- [ ] VSCode shows successful tool execution (not just discovery)
- [ ] Error logs show tool execution instead of validation failures

### Full Success Criteria

- [ ] All 57+ tools execute successfully from VSCode
- [ ] No regression in tool discovery or registration
- [ ] AMQP transport remains stable and functional
- [ ] Schema validation performance acceptable

### Testing Strategy

```javascript
// Systematic testing approach
const testCategories = [
  { name: "simple", tools: ["ping", "ifconfig"] },
  { name: "parameters", tools: ["nslookup", "wget"] },
  { name: "arrays", tools: ["snmp_get", "zabbix_get_alerts"] },
  { name: "complex", tools: ["proxmox_list_vms", "snmp_device_inventory"] },
];
```

## Research Links & References 📚

### GitHub Issues & Documentation

- **MCP SDK Zod compatibility discussions** - Multiple reports of `keyValidator._parse` errors
- **MCP Protocol 2025-06-18 specification** - Official schema requirements
- **VSCode MCP extension integration** - Transport layer requirements (✅ solved)
- **Vercel AI SDK conflicts** - Known Zod version compatibility issues

### Key Findings from Community

- Some users resolved by downgrading to `zod@^3.21.4`
- Raw JSON Schema objects work better than Zod objects for MCP SDK
- Different schema patterns have different compatibility levels
- Tool registration vs execution have different schema requirements
- MCP SDK expects specific schema object structure

### Successful Transport Integration

- **AMQP transport interface compliance** - Fixed with idempotent `start()` method
- **VSCode bidirectional communication** - Full JSON-RPC message flow working
- **Tool discovery mechanism** - All 57+ tools visible in VSCode interface

---

## Conclusion & Next Session Preparation 🎯

### Current Status Summary

**✅ MAJOR SUCCESS**: AMQP transport fully working with VSCode integration  
**🔄 ACTIVE ISSUE**: Zod schema compatibility preventing tool execution  
**📊 IMPACT**: High-value fix potential - all infrastructure working, isolated schema issue

### Key Technical Achievements

1. **Transport Layer**: Complete AMQP integration with VSCode
2. **Tool Registry**: 57+ tools successfully registered and discoverable
3. **Message Flow**: Full bidirectional JSON-RPC communication
4. **Error Handling**: Proper error responses transmitted

### Ready for Next Session

This document now contains:

- ✅ Complete technical context post-transport fix
- ✅ Systematic resolution strategy with priorities
- ✅ Specific implementation recommendations
- ✅ Clear testing methodology
- ✅ All necessary file locations and code examples

**Recommendation for next session**: Start with Priority 1 Quick Win Testing to validate the raw JSON Schema approach, then systematically implement the schema conversion replacement.
