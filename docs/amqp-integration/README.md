# 🔥 AMQP Transport for MCP Open Discovery Server v2.0

## ✅ Production-Ready Integration Package

This package adds enterprise-grade AMQP transport to your **MCP Open Discovery Server v2.0**, enabling distributed network discovery across data centers with message queue federation.

## 🚀 What This Gives You

**Transform your 61-tool discovery platform into a distributed network discovery system:**

- **🌐 Multi-Data Center**: Deploy discovery services across geographic regions
- **⚡ Hot-Reload Federation**: Registry updates broadcast over AMQP message bus
- **📊 Tool Category Routing**: Specialized microservices for different tool types
- **🔄 Zero Breaking Changes**: Preserves your existing stdio/HTTP transports
- **🏗️ Enterprise Ready**: Production-grade error handling and monitoring

## 📦 Package Contents

```
amqp-integration/
├── Core Transport Files:
│   ├── amqp-server-transport.js         # AMQP server transport
│   ├── amqp-client-transport.js         # AMQP client transport
│   └── amqp-transport-integration.js    # Registry integration
│
├── Deployment & Testing:
│   ├── validate-amqp-integration.js     # Pre-deployment validation
│   ├── deploy-amqp-enhanced-discovery.ps1 # Automated deployment
│   ├── test-amqp-transport.js           # Comprehensive tests
│   └── docker-compose-amqp.yml          # Docker orchestration
│
├── Examples:
│   └── examples/amqp-discovery-client.js # Working client example
│
└── Documentation:
    ├── README.md (this file)
    ├── ARCHITECTURE.md
    └── INTEGRATION_CHECKLIST.md
```

## 🎯 Quick Start

### 1. Prerequisites

- Node.js 16+
- Your MCP Open Discovery Server v2.0 project
- RabbitMQ broker (Docker or standalone)

### 2. Install Dependencies

```bash
npm install amqplib @types/amqplib
```

### 3. Copy Integration Files

See `INTEGRATION_CHECKLIST.md` for detailed steps.

### 4. Start RabbitMQ

```bash
docker run -d --name rabbitmq \
  -p 5672:5672 -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=mcp \
  -e RABBITMQ_DEFAULT_PASS=discovery \
  rabbitmq:3.12-management
```

### 5. Launch Enhanced Discovery Server

```bash
# Multi-transport mode (recommended)
TRANSPORT_MODE=http,amqp node mcp_server_multi_transport_sdk.js

# AMQP only for distributed deployment
TRANSPORT_MODE=amqp node mcp_server_multi_transport_sdk.js
```

## 🔧 Configuration

### Environment Variables

```bash
# Basic Configuration
TRANSPORT_MODE=amqp                              # or http,amqp or all
AMQP_URL=amqp://mcp:discovery@localhost:5672
AMQP_QUEUE_PREFIX=mcp.discovery
AMQP_EXCHANGE=mcp.notifications

# Enterprise Configuration
AMQP_PREFETCH_COUNT=5                           # Performance tuning
AMQP_RECONNECT_DELAY=5000                       # Reconnection delay
AMQP_MAX_RECONNECT_ATTEMPTS=10                  # Max reconnection attempts
```

### Transport Modes

| Mode        | Description     | Use Case                             |
| ----------- | --------------- | ------------------------------------ |
| `stdio`     | CLI/Development | Local development and debugging      |
| `http`      | Web Interface   | Container deployment with REST API   |
| `amqp`      | Message Queue   | Distributed/microservices deployment |
| `http,amqp` | Hybrid          | Web interface + distributed backend  |
| `all`       | Complete        | Full enterprise deployment           |

## 🧪 Testing & Validation

### Run Pre-Deployment Validation

```bash
node validate-amqp-integration.js
```

### Run Comprehensive Tests

```bash
node testing/test-amqp-transport.js
```

### Test with Example Client

```bash
# Basic client test
node examples/amqp-discovery-client.js

# Monitor real-time events
node examples/amqp-discovery-client.js monitor
```

## 🚨 Troubleshooting

### Common Issues

**Connection Failed**

- Check RabbitMQ is running: `docker ps | grep rabbitmq`
- Verify credentials and URL in environment variables
- Check firewall settings (ports 5672, 15672)

**Registry Not Found**

- Ensure `tools/registry/` directory exists in your project
- Verify your MCP Open Discovery Server v2.0 is properly structured

**Tool Count Mismatch**

- Run validation: `node validate-amqp-integration.js`
- Check server logs for tool loading errors
- Verify all SDK tool modules are present

**Performance Issues**

- Adjust `AMQP_PREFETCH_COUNT` (start with 5)
- Monitor RabbitMQ management UI at http://localhost:15672
- Scale RabbitMQ cluster for high availability

## 📚 Additional Documentation

- **ARCHITECTURE.md**: Technical architecture and design decisions
- **INTEGRATION_CHECKLIST.md**: Step-by-step integration guide

## 🎉 Support

For issues and questions:

1. Run the validation script
2. Check the comprehensive test results
3. Review server logs for errors
4. Test with the example client
5. Verify RabbitMQ management interface

---

**🚀 Ready to revolutionize enterprise network discovery with distributed message queue federation!**
