# Zod Schema Compatibility Issue - MCP Open Discovery

**Date**: August 11, 2025  
**Status**: UNRESOLVED - Paused for systematic analysis  
**Impact**: Tools register but fail with `keyValidator._parse is not a function` error

## Problem Summary

The MCP Open Discovery system successfully registers 62 tools across 8 categories, but tool execution fails with validation errors. This is a known MCP SDK compatibility issue with Zod schema handling.

## Error Signature

```
ERROR while calling tool: MPC -32603: keyValidator._parse is not a function
```

## Root Cause Analysis

### MCP SDK Zod Compatibility Issues

Based on GitHub discussions and testing:

1. **MCP SDK expects raw JSON Schema objects, not Zod schema objects**
2. **Zod version compatibility issues** - SDK built for older Zod versions
3. **Inconsistent behavior across different Zod schema patterns**
4. **Schema conversion approaches cause validation failures**

### Known Patterns from GitHub Issues

```javascript
// INCORRECT - Causes keyValidator._parse error
server.tool(
    "search_local_database",
    z.object({ query: z.string() }), // Zod object causes error
    async ({ query }) => {})
);

// CORRECT - Works with raw schema
server.tool(
    "search_local_database",
    { query: z.string() }, // Raw object works
    async ({ query }) => {})
);
```

### Zod Version Issues

- **zod@^3.21.4**: Reported working by some users
- **zod@^3.25.64**: Current version causing issues
- **zod/v4**: Memory leaks and "Type instantiation is excessively deep" errors

## Current System State

### ✅ Working Components

- **Server startup**: Complete success
- **Tool registration**: 62 tools across 8 categories
- **Health endpoint**: Returns healthy status
- **Hot-reload system**: Fully operational
- **AMQP transport**: Connected and functional
- **HTTP transport**: Active on port 3000

### ❌ Failing Components

- **Tool execution**: All tools fail with validation error
- **Schema validation**: MCP SDK rejects converted schemas

### Registry Architecture

```
tools/registry/
├── index.js               # Main orchestrator (ISSUE HERE)
├── core_registry.js       # Tool lifecycle management
├── parameter_type_detector.js # Schema analysis
├── tool_validation_manager.js # Validation logic
└── hot_reload_manager.js   # File watching
```

## Attempted Solutions & Results

### 1. Custom Zod to JSON Schema Converter

**Approach**: Created `zodToJsonSchema()` function to convert Zod schemas to JSON Schema
**Result**: ❌ Still causes validation errors
**Code Location**: `tools/registry/index.js` lines 39-220

### 2. Standard zod-to-json-schema Library

**Approach**: Used npm package `zod-to-json-schema`
**Result**: ❌ Same validation errors persist
**Code**: `const { zodToJsonSchema } = require('zod-to-json-schema')`

### 3. Schema Passthrough (No Conversion)

**Approach**: Use original schemas without conversion
**Result**: ❌ Tools still fail (may need proper implementation)

### 4. Function Naming Issues

**Issue**: Renamed `zodToJsonSchema` to `zodSchemaToJsonSchema` breaking references
**Resolution**: Reverted to original name
**Impact**: Fixed naming but core issue remains

## Tool Categories & Schema Patterns

### Tool Distribution

- **Memory Tools**: 9 tools
- **Network Tools**: 9 tools
- **NMAP Tools**: 5 tools
- **Proxmox Tools**: 10 tools
- **SNMP Tools**: 12 tools
- **Zabbix Tools**: 7 tools
- **Credentials Tools**: 5 tools
- **Registry Tools**: 5 tools

### Registration Methods Used

1. **server.tool()**: For tools with array parameters
2. **server.registerTool()**: For simple parameter tools

## Next Steps for Resolution

### Phase 1: Diagnostic Analysis

1. **Catalog working vs failing tools**

   - Test each tool category individually
   - Document which specific tools work/fail
   - Identify patterns in working tools

2. **Schema pattern analysis**

   - Document Zod schema types used by each tool
   - Identify which patterns cause validation failures
   - Test simple schemas vs complex schemas

3. **MCP SDK behavior mapping**
   - Test with different schema formats
   - Document which formats the SDK accepts
   - Identify the exact validation requirements

### Phase 2: Targeted Fixes

1. **Conditional schema handling**

   - Different conversion strategies per schema type
   - Fallback mechanisms for incompatible schemas
   - Tool-specific schema adaptations

2. **Incremental testing**

   - Fix one tool category at a time
   - Validate fixes don't break other tools
   - Document successful patterns

3. **Version compatibility testing**
   - Test with different Zod versions
   - Identify optimal Zod version for compatibility
   - Document version requirements

### Phase 3: Implementation

1. **Implement hybrid approach**

   - Use working patterns for each tool type
   - Maintain backward compatibility
   - Comprehensive testing suite

2. **Documentation updates**
   - Schema compatibility guide
   - Tool development best practices
   - Troubleshooting guide

## Research Links & References

### GitHub Issues

- MCP SDK Zod compatibility discussions
- `keyValidator._parse is not a function` error reports
- Zod version compatibility issues
- Vercel AI SDK conflicts

### Key Findings

- Some users resolved by downgrading to `zod@^3.21.4`
- Raw schema objects work better than Zod objects
- Different schema patterns have different compatibility
- Tool registration vs execution have different requirements

## Files to Investigate

### Primary Files

- `tools/registry/index.js` - Main registration logic
- `tools/registry/parameter_type_detector.js` - Schema analysis
- Individual tool files (`tools/*_tools_sdk.js`) - Schema definitions

### Schema Examples to Analyze

- Working tool schemas vs failing ones
- Array parameter patterns vs simple parameters
- Complex Zod schemas vs basic ones

## Testing Strategy

### Minimal Test Cases

1. **Single tool test**: Test one simple tool in isolation
2. **Schema type tests**: Test different Zod schema patterns
3. **Registration method tests**: Compare server.tool() vs server.registerTool()
4. **Version tests**: Test with different Zod versions

### Success Criteria

- Tools execute without validation errors
- All 62 tools remain functional
- Schema conversion is consistent and reliable
- No regression in existing functionality

---

**Note**: This issue requires methodical analysis rather than rapid iteration. The system architecture is sound, but schema validation compatibility needs systematic resolution.
