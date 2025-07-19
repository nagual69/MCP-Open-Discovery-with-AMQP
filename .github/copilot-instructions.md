# MCP Open Discovery v2.0 - AI Coding Agent Instructions

## 🏆 Project Overview

**MCP Open Discovery v2.0** is a production-ready infrastructure discovery platform built on the official Model Context Protocol (MCP) SDK with **93% tool success rate** across 57 enterprise-grade tools. This system provides comprehensive network discovery, SNMP monitoring, Proxmox virtualization management, and CMDB functionality.

**Critical Architecture Facts:**

- **Main Entry Point**: `mcp_server_multi_transport_sdk.js` - Multi-transport MCP server supporting both stdio and HTTP
- **Tool Registry**: `tools/sdk_tool_registry.js` - Centralized tool registration with category-based organization
- **SQLite CMDB**: Enterprise-grade encrypted persistent memory system with automatic backups
- **Container-First**: Production Docker deployment with capability-based security (no root required)

## 🎯 Core Architecture Patterns

### Multi-Transport MCP Server Architecture

The main server (`mcp_server_multi_transport_sdk.js`) implements multi-transport support using the official MCP SDK:

```javascript
// Core pattern for transport detection
const CONFIG = {
  transports: {
    stdio: { enabled: true },
    http: { enabled: isRunningInContainer(), port: 3000 },
  },
};

// Tool registration pattern
await registerAllTools(server);
await server.connect(transport);
```

**Key Implementation Rules:**

- Always use official MCP SDK (`@modelcontextprotocol/sdk`)
- Support both stdio and HTTP transports
- Auto-detect container environment for transport selection
- Use centralized tool registry pattern

### Tool Development Patterns

All tools follow the SDK-compatible pattern in `tools/*_sdk.js`:

```javascript
/**
 * Tool Category: [Network|Memory|SNMP|Proxmox|NMAP] Tools SDK
 * MCP SDK Compatible Tool Implementation
 */

const tools = [
  {
    name: "tool_name",
    description: "Clear, actionable description",
    inputSchema: {
      type: "object",
      properties: {
        /* Zod-compatible schema */
      },
      required: ["required_param"],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case "tool_name":
      return await executeToolLogic(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { tools, handleToolCall };
```

**Tool Development Rules:**

- Use descriptive names with category prefixes (e.g., `snmp_device_inventory`)
- Include comprehensive Zod schemas for all parameters
- Implement proper error handling with descriptive messages
- Return structured data objects, not raw strings
- Follow the modular pattern with tools array and handleToolCall function

### Tool Registry System

Central registration in `tools/sdk_tool_registry.js`:

```javascript
const toolModules = [
  { module: require("./memory_tools_sdk"), category: "Memory" },
  { module: require("./network_tools_sdk"), category: "Network" },
  // ... other modules
];

async function registerAllTools(server) {
  for (const { module, category } of toolModules) {
    registerToolsFromModule(server, module, category);
  }
}
```

**Registration Rules:**

- Always register new tools through the central registry
- Use category-based organization
- Ensure proper error handling during registration
- Maintain alphabetical order in tool modules array

### SQLite Memory Persistence

The memory system (`tools/memory_tools_sdk.js`) uses SQLite with encryption:

```javascript
// Enterprise-grade CMDB with relationships
const memorySchema = {
  ci_items: "id, key, value, parent_key, created_at, updated_at",
  ci_relationships: "parent_key, child_key, relationship_type, created_at",
};

// Auto-save pattern for persistence
setInterval(async () => {
  await saveMemoryToDatabase();
}, 30000); // Every 30 seconds
```

**Memory System Rules:**

- Use hierarchical CI (Configuration Item) keys: `ci:type:identifier`
- Implement parent-child relationships for infrastructure mapping
- Enable encryption for sensitive data storage
- Provide both in-memory and persistent storage options
- Support incremental updates and merging

## 🔧 Development Workflows

### Adding New Tool Categories

1. **Create SDK Tool Module** (`tools/new_category_tools_sdk.js`):

   ```javascript
   const tools = [
     /* tool definitions */
   ];
   async function handleToolCall(name, args) {
     /* implementation */
   }
   module.exports = { tools, handleToolCall };
   ```

2. **Register in Tool Registry** (`tools/sdk_tool_registry.js`):

   ```javascript
   { module: require('./new_category_tools_sdk'), category: 'NewCategory' }
   ```

3. **Update Documentation**:
   - Add to README.md tool count and categories
   - Document in appropriate docs/ files
   - Update testing documentation

### Docker Deployment Pattern

Use the standardized `rebuild_deploy.ps1` PowerShell script:

```powershell
# Always use this script for deployments
.\rebuild_deploy.ps1
```

**Deployment Rules:**

- Never manually run `docker-compose` commands
- Always use `rebuild_deploy.ps1` for consistency
- Ensure all changes are committed before deployment
- Test with both stdio and HTTP transports

### Container Security Model

For privileged operations (NMAP), use capability-based security:

```yaml
# docker-compose.yml pattern
cap_add:
  - NET_RAW
  - NET_ADMIN
  - NET_BIND_SERVICE
security_opt:
  - no-new-privileges:true
```

**Security Rules:**

- Use capabilities instead of privileged mode
- Implement principle of least privilege
- Encrypt all stored credentials
- Audit all privileged operations

## 🧪 Testing Patterns

### Container Health Testing

Always test with the production container stack:

```javascript
// testing/test_container_health.js pattern
await testContainerConnectivity();
await testToolAvailability();
await testPrivilegedOperations();
```

### Tool Testing Methodology

1. **Unit Testing**: Test individual tools with known inputs
2. **Integration Testing**: Test tool interactions and dependencies
3. **Production Testing**: Test against real infrastructure
4. **Security Testing**: Validate credential handling and privilege escalation

**Testing Rules:**

- Test both stdio and HTTP transports
- Validate against real Proxmox clusters when possible
- Test SNMP tools against network devices
- Verify memory persistence across restarts

## 📊 Success Rate Standards

Current success rates to maintain:

- **Memory Tools**: 100% (10/10) - Perfect
- **Proxmox Integration**: 100% (13/13) - Perfect
- **Credential Management**: 100% (5/5) - Perfect
- **Registry Management**: 100% (5/5) - Perfect
- **NMAP Scanning**: 100% (5/5) - Perfect
- **Zabbix Monitoring**: 100% (7/7) - Perfect
- **Network Tools**: 87.5% (7/8) - Excellent
- **SNMP Discovery**: 83.3% (10/12) - Excellent

**Quality Standards:**

- Maintain >90% overall success rate
- Zero critical failures in core infrastructure tools
- 100% success rate for new tool categories
- Comprehensive error handling and user feedback

## 🔐 Security Implementation Patterns

### Credential Management

```javascript
// Encrypted credential storage pattern
await credentialsAdd({
  id: "unique_identifier",
  type: "password|apiKey|sshKey|oauthToken|certificate|custom",
  username: "username",
  password: "encrypted_value",
});
```

### Privilege Escalation

```javascript
// Capability-based privilege pattern (not root)
const nmapCommand = buildNmapCommand(scanType, target, options);
const result = await executeWithCapabilities(nmapCommand);
```

**Security Rules:**

- Never store plaintext credentials
- Use capability-based security over root access
- Implement audit trails for all privileged operations
- Validate and sanitize all user inputs

## 📁 File Organization Standards

```
mcp-open-discovery/
├── mcp_server_multi_transport_sdk.js    # Main MCP SDK server
├── tools/
│   ├── sdk_tool_registry.js             # Central tool registration
│   ├── memory_tools_sdk.js              # SQLite CMDB with encryption
│   ├── network_tools_sdk.js             # Network discovery tools
│   ├── snmp_tools_sdk.js                # SNMP monitoring tools
│   ├── proxmox_tools_sdk.js             # Proxmox virtualization
│   └── *_tools_sdk.js                   # Other tool categories
├── testing/
│   ├── test_container_health.js         # Container health validation
│   ├── test_*_sdk.js                    # Tool-specific testing
│   └── audit_mcp_compliance.js          # MCP protocol compliance
├── docs/
│   ├── DEPLOYMENT.md                    # Production deployment guide
│   ├── TESTING.md                       # Comprehensive testing results
│   ├── DEVELOPER.md                     # SDK development patterns
│   └── MCP_COMPLIANCE.md                # Protocol compliance details
└── rebuild_deploy.ps1                   # Standardized deployment script
```

## 🚀 Best Practices

### Code Quality Standards

1. **Use TypeScript-style JSDoc**: Document all functions with types
2. **Implement Zod Schemas**: Validate all tool inputs
3. **Error Handling**: Provide descriptive, actionable error messages
4. **Logging**: Use structured logging with appropriate levels
5. **Performance**: Monitor tool execution times and optimize

### Documentation Standards

1. **Update README.md**: Always update tool counts and success rates
2. **Document New Features**: Add to appropriate docs/ files
3. **Testing Documentation**: Update TESTING.md with new results
4. **API Documentation**: Document all tool schemas and examples

### Git Workflow

1. **Commit Messages**: Use descriptive, categorized commit messages
2. **Branch Strategy**: Use feature branches for new tool categories
3. **Testing**: Always test before committing
4. **Documentation**: Update docs in the same commit as code changes

## 🎯 Project-Specific Context

### Current Tool Status

- **57 total tools** across 8 categories
- **93% overall success rate** (53/57 working)
- **4 known failing tools**: 1 Network, 2 SNMP, 1 missing telnet binary

### Enterprise Features

- **SQLite-based CMDB** with CI relationships and encryption
- **Multi-transport MCP support** (stdio, HTTP, WebSocket ready)
- **Capability-based security** for privileged operations
- **Comprehensive credential management** with audit trails
- **Production monitoring** with health checks and metrics

### Integration Points

- **Proxmox API**: Full cluster discovery and management
- **SNMP Protocol**: Device discovery and monitoring
- **Zabbix Integration**: Monitoring data and alerting
- **Network Analysis**: Topology discovery and health assessment

## 🔄 Continuous Improvement

### Performance Monitoring

- Track tool execution times
- Monitor memory usage and persistence performance
- Analyze transport efficiency (stdio vs HTTP)

### Security Auditing

- Regular credential encryption validation
- Privilege escalation monitoring
- Input validation and sanitization checks

### Feature Development Priority

1. Improve SNMP tool success rate (currently 83.3%)
2. Add missing network tools (telnet binary)
3. Enhance CMDB relationship modeling
4. Expand monitoring integration capabilities

---

## 💡 Quick Reference

**Start Development**: `npm start` or `.\rebuild_deploy.ps1`
**Test Tools**: `npm run test` or individual test files
**Check Health**: `npm run health` or `http://localhost:3000/health`
**View Logs**: `docker-compose logs -f mcp-server`
**Debug Tools**: Use `testing/test_container_tools.js` for tool validation

Remember: This is a production-ready infrastructure discovery platform. Maintain the high quality standards and comprehensive testing that have achieved 93% success rate across 57 enterprise tools.
