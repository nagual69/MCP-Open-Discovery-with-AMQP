# OAuth 2.1 Implementation for MCP Open Discovery

This document describes the OAuth 2.1 Resource Server implementation added to MCP Open Discovery, providing standards-compliant authentication and authorization for MCP protocol endpoints.

## Overview

The implementation follows:

- **RFC 6749**: OAuth 2.0 Authorization Framework
- **RFC 6750**: OAuth 2.0 Bearer Token Usage
- **RFC 9728**: OAuth 2.0 Protected Resource Metadata
- **MCP OAuth 2.1 Specification**: Model Context Protocol OAuth extensions

## Features Implemented

### ✅ Phase 1: Standards-Compliant Minimal Implementation

1. **Protected Resource Metadata** (RFC 9728)

   - `/.well-known/oauth-protected-resource` endpoint
   - Advertises authorization requirements and supported scopes

2. **Bearer Token Validation**

   - Authorization header parsing (`Authorization: Bearer <token>`)
   - Token format validation
   - Token introspection with caching

3. **WWW-Authenticate Challenges**

   - Proper HTTP 401 responses with `WWW-Authenticate` headers
   - Error descriptions per OAuth 2.0 specification
   - Scope requirements in challenge responses

4. **Scope-Based Access Control**

   - Configurable scopes (`mcp:read`, `mcp:tools`, `mcp:resources`)
   - Granular permission validation

5. **Security Features**
   - Token caching with TTL
   - HTTPS enforcement (production mode)
   - Rate limiting integration
   - CORS support with Authorization headers

## Configuration

### Environment Variables

```bash
# OAuth 2.1 Configuration
OAUTH_ENABLED=true                              # Enable/disable OAuth authentication
OAUTH_REALM=mcp-open-discovery                  # Authentication realm
OAUTH_RESOURCE_SERVER_URI=https://localhost:3000  # This server's URI
OAUTH_AUTHORIZATION_SERVER=https://auth.example.com  # Authorization server URL
OAUTH_INTROSPECTION_ENDPOINT=https://auth.example.com/oauth/introspect  # Token introspection
OAUTH_SUPPORTED_SCOPES="mcp:read mcp:tools mcp:resources"  # Supported scopes
OAUTH_TOKEN_CACHE_TTL=300                       # Token cache TTL in seconds
OAUTH_PROTECTED_ENDPOINTS="/mcp"                # Comma-separated protected endpoints

# Server Configuration
HTTP_PORT=3000                                  # HTTP server port
NODE_ENV=production                             # Enables HTTPS requirement
```

### MCP Server Configuration

Add OAuth configuration to your MCP client:

```json
{
  "mcpServers": {
    "mcp-open-discovery": {
      "command": "node",
      "args": ["mcp_server_multi_transport_sdk.js"],
      "env": {
        "TRANSPORT_MODE": "http",
        "HTTP_PORT": "3000",
        "OAUTH_ENABLED": "true",
        "OAUTH_REALM": "mcp-open-discovery"
      }
    }
  }
}
```

## API Endpoints

### Public Endpoints (No Authentication Required)

- `GET /` - Server information with OAuth configuration
- `GET /health` - Health check with OAuth status
- `GET /.well-known/oauth-protected-resource` - Protected resource metadata

### Protected Endpoints (OAuth Required)

- `POST /mcp` - MCP protocol communication (requires `mcp:read` scope)
- `GET /mcp` - SSE stream for MCP sessions (requires `mcp:read` scope)
- `DELETE /mcp` - Session termination (requires `mcp:read` scope)

## Token Format

The current implementation accepts demo tokens for testing:

```
Format: mcp_<suffix>
Example: mcp_demo_token_12345678901234567890
Minimum length: 20 characters
Valid characters: A-Z, a-z, 0-9, -, _, =
```

### Demo Token Validation

For development/testing, tokens starting with `mcp_` are accepted as valid:

```javascript
// Demo token that will be accepted
const validToken = "mcp_demo_token_12345678901234567890";

// Request with demo token
fetch("http://localhost:3000/mcp", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${validToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  }),
});
```

## Usage Examples

### 1. Check OAuth Configuration

```bash
curl http://localhost:3000/health | jq .oauth
```

### 2. Get Protected Resource Metadata

```bash
curl http://localhost:3000/.well-known/oauth-protected-resource | jq
```

### 3. Access MCP Without Token (Should Get Challenge)

```bash
curl -v -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'
```

### 4. Access MCP With Valid Token

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer mcp_demo_token_12345678901234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"initialize",
    "id":1,
    "params":{
      "protocolVersion":"2025-06-18",
      "capabilities":{},
      "clientInfo":{"name":"test-client","version":"1.0.0"}
    }
  }'
```

## Error Responses

### 401 Unauthorized - Missing Token

```json
{
  "error": "invalid_request",
  "error_description": "Bearer token required"
}
```

HTTP Headers:

```
WWW-Authenticate: Bearer realm="mcp-open-discovery"
```

### 401 Unauthorized - Invalid Token

```json
{
  "error": "invalid_token",
  "error_description": "Token is invalid or expired"
}
```

HTTP Headers:

```
WWW-Authenticate: Bearer realm="mcp-open-discovery", error="invalid_token", error_description="Token is invalid or expired"
```

### 403 Forbidden - Insufficient Scope

```json
{
  "error": "insufficient_scope",
  "error_description": "Scope 'mcp:read' required"
}
```

HTTP Headers:

```
WWW-Authenticate: Bearer realm="mcp-open-discovery", error="insufficient_scope", error_description="Scope 'mcp:read' required", scope="mcp:read mcp:tools mcp:resources"
```

## Testing

Run the OAuth test suite:

```bash
# Start the server with OAuth enabled
OAUTH_ENABLED=true TRANSPORT_MODE=http node mcp_server_multi_transport_sdk.js

# In another terminal, run tests
node testing/test_oauth_implementation.js
```

Expected output:

```
🔐 Starting OAuth 2.1 Implementation Tests

Testing: Protected Resource Metadata Endpoint (RFC 9728)
✅ PASSED: Protected Resource Metadata Endpoint (RFC 9728)

Testing: Health Endpoint Access (No Auth Required)
✅ PASSED: Health Endpoint Access (No Auth Required)

...

📊 Test Results Summary
========================
✅ Passed: 10
❌ Failed: 0
📈 Total:  10
```

## Integration with Authorization Servers

### Token Introspection

To integrate with a real authorization server, implement token introspection:

```javascript
// Update tools/oauth_middleware_sdk.js
async function introspectToken(token) {
  if (!OAUTH_CONFIG.INTROSPECTION_ENDPOINT) {
    // Fall back to demo validation
    return demoTokenValidation(token);
  }

  const response = await fetch(OAUTH_CONFIG.INTROSPECTION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from("client_id:client_secret").toString(
        "base64"
      )}`,
    },
    body: new URLSearchParams({ token }),
  });

  const result = await response.json();
  return result.active ? result : null;
}
```

### Authorization Server Discovery

Configure authorization server discovery:

```bash
OAUTH_AUTHORIZATION_SERVER=https://auth.example.com
```

The server will provide a redirect to the authorization server's discovery endpoint:

```bash
curl http://localhost:3000/.well-known/oauth-authorization-server
# Returns 302 redirect to https://auth.example.com/.well-known/oauth-authorization-server
```

## Compliance Status

### ✅ Implemented (RFC 9728 - Protected Resource Metadata)

- [x] Resource identifier advertisement
- [x] Supported scopes publication
- [x] Bearer methods declaration
- [x] Authorization server discovery support

### ✅ Implemented (RFC 6750 - Bearer Token Usage)

- [x] Authorization header parsing
- [x] WWW-Authenticate challenge responses
- [x] Proper error codes and descriptions
- [x] Case-insensitive Bearer scheme

### ✅ Implemented (RFC 6749 - OAuth 2.0 Core)

- [x] Scope-based access control
- [x] Token validation
- [x] Error handling per specification
- [x] HTTPS enforcement (production)

### 🔄 Future Enhancements (Phase 2)

- [ ] Dynamic Client Registration (RFC 7591)
- [ ] PKCE Support (RFC 7636)
- [ ] JWT Bearer Tokens (RFC 7523)
- [ ] Resource Indicators (RFC 8707)
- [ ] Token Binding
- [ ] Advanced scope negotiation

## Security Considerations

1. **HTTPS Required**: In production mode (`NODE_ENV=production`), HTTPS is enforced
2. **Token Storage**: Tokens are cached in memory only (not persisted)
3. **Token Validation**: Comprehensive format and introspection validation
4. **Rate Limiting**: OAuth integrates with existing rate limiting
5. **CORS Security**: Authorization headers properly configured
6. **Error Information**: Error responses don't leak sensitive information

## Troubleshooting

### OAuth Not Working

1. Check if OAuth is enabled:

   ```bash
   curl http://localhost:3000/health | jq .oauth.enabled
   ```

2. Verify token format:

   ```bash
   # Token must start with 'mcp_' and be at least 20 characters
   echo "mcp_demo_token_12345678901234567890" | wc -c
   ```

3. Check server logs for authentication errors

### Token Rejected

1. Verify Authorization header format:

   ```
   Authorization: Bearer mcp_demo_token_12345678901234567890
   ```

2. Check token hasn't expired (demo tokens don't expire)

3. Verify required scope is available

### CORS Issues

Ensure your client includes the Authorization header in CORS preflight:

```javascript
fetch(url, {
  method: "POST",
  mode: "cors",
  headers: {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  },
});
```

## Next Steps

1. **Phase 2**: Implement authorization server with full OAuth 2.1 capabilities
2. **Integration**: Connect with enterprise identity providers (Azure AD, Okta, etc.)
3. **Advanced Features**: Add PKCE, dynamic registration, and JWT support
4. **Monitoring**: Add OAuth-specific metrics and logging
5. **Documentation**: Create client integration guides

This implementation provides a solid foundation for OAuth 2.1 authentication while maintaining compatibility with the MCP protocol and existing tooling.
