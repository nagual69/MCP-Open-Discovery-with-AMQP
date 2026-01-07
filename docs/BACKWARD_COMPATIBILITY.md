# Backward Compatibility Guide: MCP 2025-03-26 → 2025-11-25

MCP Open Discovery v2.0 supports **both** MCP 2025-03-26 (ServiceNow, legacy clients) and MCP 2025-11-25 (modern clients) without code changes. This guide explains the compatibility strategy and how to configure for your environment.

## Key Differences Between Spec Versions

| Feature | 2025-03-26 | 2025-11-25 | Our Support |
| ------- | ---------- | ---------- | ----------- |
| **Session Management** | Sessions persist indefinitely until DELETE | Sessions have optional TTL; auto-expire after inactivity | ✅ Both modes |
| **SSE Resumability** | Not required | Per-client Last-Event-ID resumption (SEP-1699) | ✅ Optional, when enabled |
| **Origin Validation** | Not explicitly required | MUST validate & return 403 for invalid origins | ✅ Enforced (opt-out available) |
| **Default Behavior** | Stateless requests allowed; sessions optional | Sessions strongly encouraged; stateless discouraged | ✅ Both supported |
| **Stateless Requests** | Supported and common | Not recommended (but not forbidden) | ✅ Fully supported |

## Default Behavior (2025-03-26 Compatible)

Out of the box, MCP Open Discovery defaults to **2025-03-26 compatibility**:

```bash
# Default environment (if not overridden)
MCP_SESSION_TTL_MS=-1             # -1 = TTL disabled (sessions never auto-expire)
MCP_VALIDATE_ORIGIN=true          # Origin validation enabled (security best practice)
MCP_ALLOWED_ORIGINS=*             # Accept all origins (can be restricted)
```

**This means:**

1. **ServiceNow and legacy clients work unchanged** — no session TTL, sessions persist until explicit DELETE
2. **Stateless requests are fully supported** — clients omitting `MCP-Session-Id` header work fine
3. **Sessions are optional** — clients can send one-off requests without initialization
4. **Security is not compromised** — Origin validation remains enabled

## Enabling 2025-11-25 Features (Optional)

To use the newer MCP 2025-11-25 spec with session TTL and SSE resumability:

```bash
# Enable 10-minute session TTL
MCP_SESSION_TTL_MS=600000

# Optional: restrict origins for stricter security
MCP_ALLOWED_ORIGINS=http://localhost,http://127.0.0.1,https://app.example.com
```

**With TTL enabled:**

- Sessions automatically expire 10 minutes after last activity
- Clients must reuse session ID within that window or re-initialize
- SSE streams can disconnect and reconnect with `Last-Event-ID` header
- Expired session returns 404; client resumes with fresh initialize

## Client Integration Patterns

### Pattern 1: ServiceNow or Simple One-Off Requests (Default)

```javascript
// ServiceNow integration or any simple client
// No session management needed (works with default settings)

const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {}
};

// Send directly to /mcp (no MCP-Session-Id header)
const response = await fetch('http://localhost:3000/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request)
});

// Works immediately, session not required
```

**Compatibility:** ✅ Works with default settings (MCP_SESSION_TTL_MS=-1)

### Pattern 2: Long-Running Session (with Optional Resumability)

```javascript
// VS Code extension or persistent client
// With session reuse (works on both spec versions)

// 1. Initialize to get session ID
const initResponse = await fetch('http://localhost:3000/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {...} })
});

const sessionId = initResponse.headers.get('mcp-session-id');

// 2. Reuse session for subsequent requests
const toolListResponse = await fetch('http://localhost:3000/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'MCP-Session-Id': sessionId  // Include in all requests
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
});

// 3. For SSE streams, include Last-Event-ID if reconnecting
const sseResponse = await fetch('http://localhost:3000/mcp', {
  method: 'GET',
  headers: {
    'MCP-Session-Id': sessionId,
    'Last-Event-ID': '42'  // Optional, for stream resumption
  }
});

// 4. Clean up when done (optional)
await fetch('http://localhost:3000/mcp', {
  method: 'DELETE',
  headers: { 'MCP-Session-Id': sessionId }
});
```

**Compatibility:**
- ✅ 2025-03-26 mode (default): Session persists indefinitely until DELETE
- ✅ 2025-11-25 mode (MCP_SESSION_TTL_MS=600000): Session expires after 10 min inactivity; reconnect with Last-Event-ID within TTL

### Pattern 3: Resilient Client with TTL-Aware Reconnection

```javascript
// For 2025-11-25 environments with session TTL enabled
// (Configure: MCP_SESSION_TTL_MS=600000)

class MCPClientWithResumability {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sessionId = null;
    this.lastEventId = null;
    this.ttlMs = 600000; // Assume 10 min TTL
    this.lastActivityTime = null;
  }

  async initialize() {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { clientInfo: { name: 'resilient-client', version: '1.0' } }
      })
    });
    
    this.sessionId = response.headers.get('mcp-session-id');
    this.lastActivityTime = Date.now();
    console.log(`Session initialized: ${this.sessionId}`);
  }

  async sendRequest(method, params) {
    // Check if session might be expired (5 min safety margin)
    const inactivityMs = Date.now() - this.lastActivityTime;
    if (inactivityMs > this.ttlMs - 300000) {
      console.log(`Session approaching TTL, re-initializing...`);
      await this.initialize();
    }

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Session-Id': this.sessionId
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
    });

    if (response.status === 404) {
      // Session expired, re-initialize and retry
      console.log('Session expired (404), re-initializing and retrying...');
      await this.initialize();
      return this.sendRequest(method, params);
    }

    this.lastActivityTime = Date.now();
    return response.json();
  }

  async openSSEStream(onMessage, onError) {
    let reconnectAttempts = 0;
    const maxReconnects = 5;

    const connect = async () => {
      try {
        const response = await fetch(`${this.baseUrl}/mcp`, {
          method: 'GET',
          headers: {
            'MCP-Session-Id': this.sessionId,
            'Last-Event-ID': this.lastEventId || ''
          }
        });

        if (response.status === 404) {
          // Session expired, re-initialize
          console.log('SSE session expired, re-initializing...');
          await this.initialize();
          await connect(); // Retry with new session
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('SSE stream ended');
            // Server may close stream and expect reconnect with Last-Event-ID
            if (reconnectAttempts < maxReconnects) {
              console.log(`Reconnecting SSE stream (attempt ${reconnectAttempts + 1})...`);
              reconnectAttempts++;
              await new Promise(r => setTimeout(r, 1000)); // 1s backoff
              await connect();
            }
            break;
          }

          buffer += decoder.decode(value);
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('id:')) {
              this.lastEventId = line.slice(3).trim();
            } else if (line.startsWith('data:')) {
              const data = line.slice(5).trim();
              if (data) {
                try {
                  onMessage(JSON.parse(data));
                  reconnectAttempts = 0; // Reset backoff on successful message
                } catch (e) {
                  onError(e);
                }
              }
            }
          }
        }
      } catch (error) {
        onError(error);
        if (reconnectAttempts < maxReconnects) {
          console.log(`SSE error, reconnecting in 3s (attempt ${reconnectAttempts + 1})...`);
          reconnectAttempts++;
          await new Promise(r => setTimeout(r, 3000));
          await connect();
        }
      }
    };

    await connect();
  }
}

// Usage
const client = new MCPClientWithResumability('http://localhost:3000');
await client.initialize();

// Send request
const tools = await client.sendRequest('tools/list', {});

// Stream events with automatic resumption
await client.openSSEStream(
  (msg) => console.log('Event:', msg),
  (err) => console.error('Error:', err)
);
```

**Compatibility:** ✅ Works best in 2025-11-25 mode (MCP_SESSION_TTL_MS=600000)

## Configuration Summary

### For ServiceNow and Legacy Clients (Recommended Default)

```bash
# Environment variables (these are the defaults)
MCP_SESSION_TTL_MS=-1                    # Sessions persist indefinitely
MCP_VALIDATE_ORIGIN=true                 # Security (recommended)
MCP_ALLOWED_ORIGINS=*                    # Accept all origins
```

**Result:**
- ✅ ServiceNow works unchanged
- ✅ Stateless requests supported
- ✅ Sessions optional (backward compatible with 2025-03-26 spec)
- ⚠️ SSE stream resumption NOT available (not in 2025-03-26 spec anyway)

### For Modern Clients with Session Resumability (2025-11-25)

```bash
# Environment variables (enable 2025-11-25 features)
MCP_SESSION_TTL_MS=600000                # 10-minute TTL
MCP_VALIDATE_ORIGIN=true                 # Security
MCP_ALLOWED_ORIGINS=http://localhost,https://app.example.com
```

**Result:**
- ✅ Sessions auto-expire after 10 minutes of inactivity
- ✅ SSE streams can resume with Last-Event-ID
- ✅ More memory-efficient (expired sessions cleaned up automatically)
- ⚠️ Legacy clients must re-initialize if session expires
- ⚠️ ServiceNow needs activity every 10 minutes or re-initialize

### For Strict Origin Validation (Cloud/SaaS Deployments)

```bash
# Restrict to specific origins only
MCP_SESSION_TTL_MS=-1                    # Keep legacy session mode
MCP_VALIDATE_ORIGIN=true                 # Always on (can't disable)
MCP_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

**Result:**
- ✅ Only requests from allowed origins accepted (403 Forbidden otherwise)
- ✅ Protects against DNS rebinding attacks
- ✅ Compatible with both 2025-03-26 and 2025-11-25 clients

## Protocol Version Header

Clients can declare their MCP protocol version using the `MCP-Protocol-Version` header:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
MCP-Protocol-Version: 2025-11-25
MCP-Session-Id: uuid-here

{...request body...}
```

**Default:** `2025-03-26` (if header omitted)

The server logs the declared version for diagnostics but applies the same behavior regardless:
- TTL enforcement depends only on `MCP_SESSION_TTL_MS` setting
- Origin validation always enforced (per MCP 2025-11-25 security requirements)

## Migration Path: 2025-03-26 → 2025-11-25

If you have legacy ServiceNow or other 2025-03-26 clients and want to gradually adopt 2025-11-25:

### Phase 1: Keep Current Settings (No Change)
```bash
# Default configuration (backward compatible)
MCP_SESSION_TTL_MS=-1
```
- ServiceNow and legacy clients work unchanged
- New clients can opt-in to session-based patterns

### Phase 2: Enable TTL with Generous Window
```bash
# Increase TTL to accommodate slower integrations
MCP_SESSION_TTL_MS=1800000  # 30 minutes
```
- Most integrations unaffected (30 min is usually sufficient)
- New clients benefit from resumability
- Memory usage slightly improved (stale sessions cleaned up)

### Phase 3: Standard TTL
```bash
# Industry-standard 10-minute window
MCP_SESSION_TTL_MS=600000
```
- Full 2025-11-25 compliance
- Ensure integrations handle 404 and re-initialize
- Best memory efficiency

### Phase 4: Strict Validation (Optional)
```bash
# Add origin restrictions if in cloud environment
MCP_SESSION_TTL_MS=600000
MCP_ALLOWED_ORIGINS=https://app.example.com
```
- Maximum security posture
- Only for SaaS/cloud deployments

## Testing Compatibility

### Test 2025-03-26 Mode (Default)

```bash
# Start server with default settings
npm run start-http

# Test stateless request (no session)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test session-based request
SESSION_ID=$(curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' \
  -s -i | grep -i "mcp-session-id" | cut -d' ' -f2)

# Reuse session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### Test 2025-11-25 Mode (with TTL)

```bash
# Start server with TTL enabled (5 min for testing)
MCP_SESSION_TTL_MS=300000 npm run start-http

# Initialize session
SESSION_ID=$(curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' \
  -s -i | grep -i "mcp-session-id" | cut -d' ' -f2)

# Wait 5 minutes (or set TTL to 10s for testing)
sleep 310

# Session should now be expired (404)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  # Should return 404
```

## Troubleshooting

### ServiceNow Integration Returns 404

**Likely cause:** Session TTL enabled, and session expired

**Solution:**
```bash
# Disable TTL (default, 2025-03-26 mode)
MCP_SESSION_TTL_MS=-1
```

### "Forbidden: Invalid Origin" Error

**Likely cause:** `MCP_ALLOWED_ORIGINS` doesn't include the client's origin

**Solution:**
```bash
# Add the client origin
MCP_ALLOWED_ORIGINS=http://localhost,https://servicenow.example.com
```

### SSE Stream Closes After 10 Minutes

**Likely cause:** Session TTL enabled and session expired

**Solution (if using 2025-11-25 client):**
- Client should include `Last-Event-ID` header when reconnecting
- Server will restore session state and resume stream

**Solution (if using legacy client):**
- Disable TTL: `MCP_SESSION_TTL_MS=-1`
- Or increase TTL: `MCP_SESSION_TTL_MS=3600000` (1 hour)

### Client Can't Determine Server's MCP Version

**Limitation:** Server doesn't advertise spec version in HTTP headers

**Workaround:** Clients should:
1. Try sending request with `MCP-Protocol-Version: 2025-11-25`
2. If it fails, assume 2025-03-26 and retry
3. Or check `/health` endpoint for version info (currently shows "2.0.0")

## See Also

- [HTTP Transport Architecture](./TRANSPORT_MANAGER.md)
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
