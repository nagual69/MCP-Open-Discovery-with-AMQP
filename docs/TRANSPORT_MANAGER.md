# 🚀 Transport Manager - MCP Open Discovery Server v2.0

## 📋 Overview

The Transport Manager provides a unified, componentized architecture for managing multiple transport protocols in the MCP Open Discovery Server. It **preserves all existing functionality** while providing better organization, maintainability, and extensibility.

## 🎯 Design Principles

### **1. Backward Compatibility First**

- **100% compatible** with existing `TRANSPORT_MODE` environment variable
- **Preserves all** OAuth 2.1 integration for HTTP transport
- **Maintains** AMQP auto-recovery functionality
- **Supports all** existing environment variables and configuration options

### **2. Componentized Architecture**

```
Transport Manager
├── stdio-transport.js     (CLI and development)
├── http-transport.js      (Web clients + OAuth 2.1)
├── AMQP integration       (Message queues + auto-recovery)
└── gRPC (prepared)        (High-performance RPC)
```

### **3. Smart Environment Detection**

- **Container environments**: Default to `http,amqp`
- **Interactive CLI**: Default to `stdio`
- **Service environments**: Intelligent multi-transport selection
- **Manual override**: Full `TRANSPORT_MODE` support

## 🔧 Configuration

### **Environment Variables (Preserved)**

All existing environment variables are fully supported:

```bash
# Transport Selection
TRANSPORT_MODE=stdio              # Single transport
TRANSPORT_MODE=http,amqp          # Multiple transports
TRANSPORT_MODE=stdio,http,amqp    # All transports

# HTTP Configuration
HTTP_PORT=3000
OAUTH_ENABLED=true
OAUTH_PROTECTED_ENDPOINTS=/mcp

# AMQP Configuration
AMQP_ENABLED=true
AMQP_URL=amqp://mcp:discovery@localhost:5672
AMQP_QUEUE_PREFIX=mcp.discovery
AMQP_EXCHANGE=mcp.notifications

# gRPC Configuration (Ready for Future)
GRPC_PORT=50051
GRPC_MAX_CONNECTIONS=1000
GRPC_KEEPALIVE_TIME=30000
```

### **Smart Defaults (Enhanced)**

The transport manager uses intelligent environment detection:

| Environment         | Auto-Selected Transports | Reason                                  |
| ------------------- | ------------------------ | --------------------------------------- |
| **Container**       | `http,amqp`              | External access + scalable messaging    |
| **Interactive CLI** | `stdio`                  | Direct communication                    |
| **Service**         | `stdio,http`             | Flexibility for both CLI and web access |
| **Production**      | `http,amqp,grpc*`        | Full protocol support for enterprise    |

\*gRPC when implemented

## 🏗️ Architecture Benefits

### **Eliminated Technical Debt**

- ✅ **No more monolithic server file** (extracted transport logic)
- ✅ **Consistent error handling** across all transports
- ✅ **Unified logging** with transport-specific identification
- ✅ **Single source of truth** for transport configuration

### **Enhanced Maintainability**

- ✅ **Modular transport modules** for independent development
- ✅ **Centralized transport orchestration** in transport manager
- ✅ **Clear separation of concerns** between transport types
- ✅ **Easy testing** of individual transport components

### **Future Extensibility**

- ✅ **gRPC integration ready** with existing configuration
- ✅ **WebSocket transport** can be easily added
- ✅ **Plugin architecture** for custom transport types
- ✅ **Protocol-agnostic** core MCP server

## 🚀 Usage Examples

### **Development Mode**

```javascript
// Start with environment auto-detection
const transportResults = await startAllTransports(mcpServer, {
  // Uses smart defaults based on environment
});

// Start specific transports
process.env.TRANSPORT_MODE = "stdio,http";
const results = await startAllTransports(mcpServer, config);
```

### **Production Mode**

```javascript
// Full configuration with OAuth and AMQP
const config = createTransportConfig(environment, {
  HTTP_PORT: 3000,
  OAUTH_ENABLED: true,
  AMQP_ENABLED: true,
  oauthHandlers: { protectedResourceMetadataHandler },
  oauthMiddleware: oauthMiddleware,
  registry: getRegistry(),
});

const results = await startAllTransports(mcpServer, config);
```

### **Container Deployment**

```bash
# Auto-detects container environment
docker run -e TRANSPORT_MODE=http,amqp mcp-open-discovery

# Override for specific use case
docker run -e TRANSPORT_MODE=grpc -e GRPC_PORT=50051 mcp-open-discovery
```

## 📊 Transport Comparison

| Transport | Status    | Port  | Use Case                | Features                   |
| --------- | --------- | ----- | ----------------------- | -------------------------- |
| **stdio** | ✅ Active | -     | CLI tools, development  | Direct I/O                 |
| **HTTP**  | ✅ Active | 3000  | Web clients, REST APIs  | OAuth 2.1, SSE             |
| **AMQP**  | ✅ Active | 5672  | Message queues, pub/sub | Auto-recovery, persistence |
| **gRPC**  | 🚧 Ready  | 50051 | High-performance RPC    | Streaming, typed APIs      |

## 🔌 Integration Points

### **OAuth 2.1 Integration (Preserved)**

```javascript
// Full OAuth support maintained
const httpConfig = {
  oauthConfig: {
    enabled: true,
    realm: "mcp-open-discovery",
    supportedScopes: ["mcp:read", "mcp:tools", "mcp:resources"],
  },
  oauthHandlers: { protectedResourceMetadataHandler },
  oauthMiddleware: oauthMiddleware,
};
```

### **AMQP Auto-Recovery (Enhanced)**

```javascript
// Uses existing AMQP integration with auto-recovery
const amqpConfig = {
  amqpUrl: "amqp://mcp:discovery@localhost:5672",
  autoRecovery: true,
  maxRetries: 4,
  exponentialBackoff: true,
};
```

### **Health Monitoring (Improved)**

```javascript
// Comprehensive health status across all transports
const status = getAllTransportStatus(transportResults);
/*
{
  manager: { version: '2.0.0', status: 'active' },
  transports: {
    stdio: { available: true, description: '...' },
    http: { available: true, port: 3000, oauth: 'enabled' },
    amqp: { available: true, autoRecovery: 'active' }
  },
  summary: { total: 3, active: 3, failed: 0 }
}
*/
```

## 🎯 Migration Guide

### **From Monolithic Server**

The migration is **seamless** - no breaking changes:

1. **Existing code continues to work** unchanged
2. **All environment variables preserved**
3. **Same startup behavior** with better organization
4. **Enhanced logging** provides more visibility

### **New Features Available**

```javascript
// Environment detection
const env = detectEnvironment();
console.log(env.isContainer, env.isInteractive);

// Transport recommendations
const recommendations = getTransportRecommendations(env);
console.log(recommendations.recommended); // ['http', 'amqp']

// Configuration validation
const validation = validateTransportConfiguration(["stdio", "http"], env);
console.log(validation.warnings, validation.recommendations);
```

## 🔮 Future Roadmap

### **Phase 1: gRPC Integration** 🚧

```javascript
// Ready for implementation
case 'grpc':
  result = await startGrpcTransport(mcpServer, {
    port: config.GRPC_PORT,
    maxConnections: config.GRPC_MAX_CONNECTIONS,
    keepaliveTime: config.GRPC_KEEPALIVE_TIME
  });
```

### **Phase 2: WebSocket Support** 🔄

- Real-time bidirectional communication
- Browser-native connectivity
- Event streaming capabilities

### **Phase 3: Plugin Architecture** 🔄

- Custom transport implementations
- Third-party protocol adapters
- Enterprise integration modules

## 🎉 Benefits Summary

### **For Developers**

- ✅ **Clean modular architecture** - Easy to understand and modify
- ✅ **Comprehensive testing** - Individual transport testing capabilities
- ✅ **Better debugging** - Transport-specific logging and error handling
- ✅ **Future-proof design** - Easy to add new transport types

### **For Operations**

- ✅ **Flexible deployment** - Mix and match transports as needed
- ✅ **Environment awareness** - Smart defaults for different environments
- ✅ **Health monitoring** - Detailed status across all transports
- ✅ **Graceful degradation** - Partial functionality if some transports fail

### **For Users**

- ✅ **Choice of protocols** - Use the best transport for your use case
- ✅ **Consistent functionality** - Same tools available across all transports
- ✅ **Reliable operation** - Auto-recovery and error handling
- ✅ **Security built-in** - OAuth 2.1, TLS, and authentication support

---

## 📞 Quick Reference

```javascript
// Core functions
const {
  startAllTransports, // Start transports based on config
  getAllTransportStatus, // Get comprehensive status
  cleanupAllTransports, // Graceful shutdown
  detectEnvironment, // Environment detection
  getTransportRecommendations, // Smart recommendations
  validateTransportConfiguration, // Config validation
  createTransportConfig, // Build complete config
} = require("./tools/transports/core/transport-manager");

// Environment variables
(TRANSPORT_MODE = stdio), http, amqp; // Transport selection
HTTP_PORT = 3000; // HTTP port
OAUTH_ENABLED = true; // OAuth 2.1 support
AMQP_ENABLED = true; // AMQP messaging
GRPC_PORT = 50051; // gRPC port (future)
```

**The Transport Manager transforms a monolithic transport architecture into a clean, modular, and extensible system while preserving 100% backward compatibility.**
