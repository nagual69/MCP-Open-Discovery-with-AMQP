/**
 * OAuth 2.1 Resource Server Middleware for MCP Open Discovery
 * 
 * Implements RFC 6749 (OAuth 2.0), RFC 6750 (Bearer Token Usage),
 * and RFC 9728 (OAuth 2.0 Protected Resource Metadata)
 * 
 * This is a standards-compliant minimal implementation providing:
 * - Bearer token validation
 * - Protected resource metadata endpoint
 * - Proper WWW-Authenticate challenges
 * - Token introspection support
 */

const crypto = require('crypto');

// Simple logging function to avoid circular dependency
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] OAuth: ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

// Configuration
const OAUTH_CONFIG = {
  // Resource server configuration
  RESOURCE_SERVER_URI: process.env.OAUTH_RESOURCE_SERVER_URI || 'https://localhost:3000',
  REALM: process.env.OAUTH_REALM || 'mcp-open-discovery',
  
  // Authorization server configuration (for token introspection)
  AUTHORIZATION_SERVER: process.env.OAUTH_AUTHORIZATION_SERVER || null,
  INTROSPECTION_ENDPOINT: process.env.OAUTH_INTROSPECTION_ENDPOINT || null,
  CLIENT_ID: process.env.OAUTH_CLIENT_ID || null,
  CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET || null,
  
  // Token validation settings
  TOKEN_CACHE_TTL: parseInt(process.env.OAUTH_TOKEN_CACHE_TTL) || 300, // 5 minutes
  REQUIRE_HTTPS: process.env.NODE_ENV === 'production',
  
  // Supported scopes
  SUPPORTED_SCOPES: (process.env.OAUTH_SUPPORTED_SCOPES || 'mcp:read mcp:tools mcp:resources').split(' '),
  
  // Enable/disable OAuth (for gradual rollout)
  OAUTH_ENABLED: process.env.OAUTH_ENABLED === 'true' || false
};

/**
 * In-memory token cache for validated tokens
 * In production, this should be replaced with Redis or similar
 */
class TokenCache {
  constructor() {
    this.cache = new Map();
  }

  set(token, data, ttl = OAUTH_CONFIG.TOKEN_CACHE_TTL) {
    const expiry = Date.now() + (ttl * 1000);
    this.cache.set(token, { data, expiry });
  }

  get(token) {
    const entry = this.cache.get(token);
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(token);
      return null;
    }
    
    return entry.data;
  }

  delete(token) {
    this.cache.delete(token);
  }

  clear() {
    this.cache.clear();
  }

  // Cleanup expired tokens
  cleanup() {
    const now = Date.now();
    for (const [token, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(token);
      }
    }
  }
}

const tokenCache = new TokenCache();

// Cleanup expired tokens every 5 minutes
setInterval(() => tokenCache.cleanup(), 5 * 60 * 1000);

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(authHeader) {
  if (!authHeader) return null;
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Validate token format (basic checks)
 */
function isValidTokenFormat(token) {
  if (!token || typeof token !== 'string') return false;
  
  // Basic token format validation
  // - Must be at least 20 characters
  // - Must contain only valid characters (base64url safe)
  if (token.length < 20) return false;
  if (!/^[A-Za-z0-9\-_=]+$/.test(token)) return false;
  
  return true;
}

/**
 * Mock token introspection (replace with real implementation)
 * In a real implementation, this would call the authorization server's
 * introspection endpoint (RFC 7662)
 */
async function introspectToken(token) {
  // Check cache first
  const cached = tokenCache.get(token);
  if (cached) {
    log('debug', 'Token found in cache', { 
      sub: cached.sub, 
      scope: cached.scope,
      expires: cached.exp 
    });
    return cached;
  }

  // For demo purposes, we'll create a simple token validation
  // In production, this would make an HTTP request to the auth server
  try {
    // Real RFC 7662 Token Introspection
    if (OAUTH_CONFIG.INTROSPECTION_ENDPOINT) {
      const body = new URLSearchParams({ token });
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      };

      // Add Basic Auth if client credentials are provided
      if (OAUTH_CONFIG.CLIENT_ID && OAUTH_CONFIG.CLIENT_SECRET) {
        const auth = Buffer.from(`${OAUTH_CONFIG.CLIENT_ID}:${OAUTH_CONFIG.CLIENT_SECRET}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const response = await fetch(OAUTH_CONFIG.INTROSPECTION_ENDPOINT, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        throw new Error(`Introspection endpoint returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // RFC 7662: "active" is a boolean indicator of whether or not the token is currently active
      if (result.active) {
        // Cache the validated token
        // Use exp from token if available, otherwise default TTL
        const ttl = result.exp ? (result.exp * 1000) - Date.now() : (OAUTH_CONFIG.TOKEN_CACHE_TTL * 1000);
        if (ttl > 0) {
           // Convert ms back to seconds for cache set (which expects seconds)
           tokenCache.set(token, result, Math.floor(ttl / 1000));
        }

        log('debug', 'Token introspection successful', { sub: result.sub, scope: result.scope });
        return result;
      } else {
        log('debug', 'Token is not active');
        return null;
      }
    }

    // Fallback: Demo/Dev Mode Validation
    // ONLY active if no introspection endpoint is configured AND not in production
    if (process.env.NODE_ENV !== 'production') {
      // Simple demo validation - accept tokens that start with 'mcp_'
      if (token.startsWith('mcp_') && isValidTokenFormat(token)) {
        const tokenData = {
          active: true,
          sub: 'demo-user',
          scope: 'mcp:read mcp:tools mcp:resources',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          aud: OAUTH_CONFIG.RESOURCE_SERVER_URI,
          iss: OAUTH_CONFIG.AUTHORIZATION_SERVER || 'demo-auth-server',
          client_id: 'demo-client'
        };

        // Cache the validated token
        tokenCache.set(token, tokenData);
        
        log('info', 'DEV MODE: Mock token validated successfully', { 
          sub: tokenData.sub, 
          scope: tokenData.scope 
        });
        
        return tokenData;
      }
    }

    log('warn', 'Token validation failed (No introspection endpoint & invalid mock format)', { tokenPrefix: token.substring(0, 10) + '...' });
    return null;

  } catch (error) {
    log('error', 'Token introspection failed', { 
      error: error.message,
      tokenPrefix: token.substring(0, 10) + '...'
    });
    return null;
  }
}

/**
 * Check if token has required scope
 */
function hasRequiredScope(tokenData, requiredScope) {
  if (!tokenData.scope) return false;
  
  const tokenScopes = tokenData.scope.split(' ');
  return tokenScopes.includes(requiredScope);
}

/**
 * Generate WWW-Authenticate challenge header
 */
function generateWWWAuthenticateHeader(error = null, errorDescription = null) {
  let challenge = `Bearer realm="${OAUTH_CONFIG.REALM}"`;
  
  if (error) {
    challenge += `, error="${error}"`;
  }
  
  if (errorDescription) {
    challenge += `, error_description="${errorDescription}"`;
  }
  
  // Add scope information for invalid_scope errors
  if (error === 'insufficient_scope') {
    challenge += `, scope="${OAUTH_CONFIG.SUPPORTED_SCOPES.join(' ')}"`;
  }
  
  return challenge;
}

/**
 * OAuth 2.1 Resource Server Middleware
 */
function oauthMiddleware(options = {}) {
  const {
    requiredScope = 'mcp:read',
    optional = false,
    skipPaths = ['/health', '/', '/.well-known/oauth-protected-resource']
  } = options;

  return async (req, res, next) => {
    // Skip OAuth for certain paths
    if (skipPaths.includes(req.path)) {
      return next();
    }

    // Skip OAuth if disabled
    if (!OAUTH_CONFIG.OAUTH_ENABLED) {
      log('debug', 'OAuth disabled, skipping authentication');
      return next();
    }

    // HTTPS requirement in production
    if (OAUTH_CONFIG.REQUIRE_HTTPS && req.protocol !== 'https') {
      log('warn', 'HTTPS required for OAuth in production');
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'HTTPS required for OAuth protected resources'
      });
    }

    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      const token = extractBearerToken(authHeader);

      if (!token) {
        if (optional) {
          return next();
        }

        log('debug', 'No bearer token provided');
        res.set('WWW-Authenticate', generateWWWAuthenticateHeader());
        return res.status(401).json({
          error: 'invalid_request',
          error_description: 'Bearer token required'
        });
      }

      // Validate token format
      if (!isValidTokenFormat(token)) {
        log('warn', 'Invalid token format');
        res.set('WWW-Authenticate', generateWWWAuthenticateHeader('invalid_token', 'Token format invalid'));
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'Token format invalid'
        });
      }

      // Introspect token
      const tokenData = await introspectToken(token);
      
      if (!tokenData || !tokenData.active) {
        log('warn', 'Invalid or expired token');
        res.set('WWW-Authenticate', generateWWWAuthenticateHeader('invalid_token', 'Token is invalid or expired'));
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'Token is invalid or expired'
        });
      }

      // Check token expiration
      if (tokenData.exp && tokenData.exp < Math.floor(Date.now() / 1000)) {
        log('warn', 'Token expired');
        tokenCache.delete(token); // Remove from cache
        res.set('WWW-Authenticate', generateWWWAuthenticateHeader('invalid_token', 'Token has expired'));
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'Token has expired'
        });
      }

      // Check required scope
      if (requiredScope && !hasRequiredScope(tokenData, requiredScope)) {
        log('warn', 'Insufficient scope', { 
          required: requiredScope, 
          provided: tokenData.scope 
        });
        res.set('WWW-Authenticate', generateWWWAuthenticateHeader('insufficient_scope', `Scope '${requiredScope}' required`));
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: `Scope '${requiredScope}' required`
        });
      }

      // Attach token data to request for use by downstream handlers
      req.oauth = {
        token: tokenData,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
        subject: tokenData.sub,
        clientId: tokenData.client_id
      };

      log('debug', 'OAuth validation successful', { 
        sub: tokenData.sub,
        scope: tokenData.scope,
        clientId: tokenData.client_id
      });

      next();

    } catch (error) {
      log('error', 'OAuth middleware error', { error: error.message });
      res.set('WWW-Authenticate', generateWWWAuthenticateHeader('invalid_request', 'OAuth validation failed'));
      return res.status(500).json({
        error: 'invalid_request',
        error_description: 'OAuth validation failed'
      });
    }
  };
}

/**
 * Protected Resource Metadata endpoint (RFC 9728)
 * /.well-known/oauth-protected-resource
 */
function getProtectedResourceMetadata() {
  return {
    // Resource server identifier
    resource: OAUTH_CONFIG.RESOURCE_SERVER_URI,
    
    // Authorization servers that can issue tokens for this resource
    authorization_servers: OAUTH_CONFIG.AUTHORIZATION_SERVER ? [OAUTH_CONFIG.AUTHORIZATION_SERVER] : [],
    
    // Scopes supported by this resource server
    scopes_supported: OAUTH_CONFIG.SUPPORTED_SCOPES,
    
    // Bearer token usage methods supported
    bearer_methods_supported: ['header'],
    
    // Resource server capabilities
    resource_documentation: `${OAUTH_CONFIG.RESOURCE_SERVER_URI}/docs`,
    
    // Additional metadata
    ...(OAUTH_CONFIG.AUTHORIZATION_SERVER && {
      authorization_server: OAUTH_CONFIG.AUTHORIZATION_SERVER
    })
  };
}

/**
 * Express route handler for protected resource metadata
 */
function protectedResourceMetadataHandler(req, res) {
  res.set('Content-Type', 'application/json');
  res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.json(getProtectedResourceMetadata());
}

module.exports = {
  oauthMiddleware,
  protectedResourceMetadataHandler,
  getProtectedResourceMetadata,
  OAUTH_CONFIG,
  TokenCache,
  // Utility functions for testing
  extractBearerToken,
  isValidTokenFormat,
  introspectToken,
  hasRequiredScope,
  generateWWWAuthenticateHeader
};
