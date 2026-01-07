# MCP Open Discovery Quick Reference: Backward Compatibility

## One-Line Summary
**Default:** 2025-03-26 compatible (ServiceNow works unchanged). **Optional:** Enable 2025-11-25 mode with `MCP_SESSION_TTL_MS=600000` for session resumability.

## Configuration Cheat Sheet

| Use Case | Config | Result |
|----------|--------|--------|
| **ServiceNow / Legacy** | `MCP_SESSION_TTL_MS=-1` (default) | ✅ Sessions persist indefinitely; stateless requests work |
| **Modern clients w/ resumability** | `MCP_SESSION_TTL_MS=600000` | ✅ Sessions auto-expire after 10 min; SSE resumption available |
| **Generous window (30 min)** | `MCP_SESSION_TTL_MS=1800000` | ✅ Best for mixed environments; fewer re-initializations |
| **Strict cloud security** | `MCP_SESSION_TTL_MS=600000` + `MCP_ALLOWED_ORIGINS=https://...` | ✅ TTL + origin validation |

## Test It

```bash
# Start with default (2025-03-26 compatible)
npm run start-http

# Stateless request (ServiceNow style - works immediately)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Session-based request (works on both modes)
SESSION=$(curl -s -i http://localhost:3000/mcp \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | grep -i "mcp-session-id" | cut -d' ' -f2)

curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

## Logs

### Default Mode (2025-03-26)
```
[HTTP] MCP Compatibility: 2025-03-26 (backward compatible)
[HTTP] Session TTL: disabled (2025-03-26 mode: sessions persist indefinitely)
[HTTP] 💡 Tip: ServiceNow and legacy clients work unchanged. Set MCP_SESSION_TTL_MS=600000 to enable 2025-11-25 mode...
```

### 2025-11-25 Mode (with TTL)
```
[HTTP] MCP Compatibility: 2025-11-25 (with TTL support)
[HTTP] Session TTL: enabled (600000ms)
[HTTP] 💡 Tip: Sessions will auto-expire after 600 seconds of inactivity. Clients can reconnect with Last-Event-ID header.
```

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| **ServiceNow returns 404** | TTL enabled; session expired | Set `MCP_SESSION_TTL_MS=-1` |
| **"Forbidden: Invalid Origin"** | Client origin not in allowlist | Add to `MCP_ALLOWED_ORIGINS` or set to `*` |
| **Session ID in response headers** | Client not reading `mcp-session-id` | Tell client to parse response headers for session ID |
| **SSE stream disconnects after 10 min** | Normal (if TTL enabled); by design | Client should reconnect with `Last-Event-ID` header |

## Environment Variables Quick Ref

```bash
# Session TTL (critical for compatibility)
MCP_SESSION_TTL_MS=-1                    # Disable (2025-03-26 default)
MCP_SESSION_TTL_MS=600000                # Enable 2025-11-25 (10 min)

# Security
MCP_VALIDATE_ORIGIN=true                 # Always on (can't disable)
MCP_ALLOWED_ORIGINS=http://localhost     # Comma-separated list

# Protocol
MCP_SSE_RETRY_MS=3000                    # SSE retry interval
```

## See Also

- [Full Backward Compatibility Guide](./BACKWARD_COMPATIBILITY.md)
- [HTTP Transport Architecture](./TRANSPORT_MANAGER.md)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
