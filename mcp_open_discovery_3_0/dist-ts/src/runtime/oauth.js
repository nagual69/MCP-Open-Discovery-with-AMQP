"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProtectedResourceMetadata = getProtectedResourceMetadata;
exports.createProtectedResourceMetadataHandler = createProtectedResourceMetadataHandler;
exports.createOauthMiddlewareFactory = createOauthMiddlewareFactory;
const utils_1 = require("../utils");
const logger = (0, utils_1.createLogger)('OAUTH');
class TokenCache {
    cache = new Map();
    set(token, data, ttlSeconds) {
        this.cache.set(token, {
            data,
            expiry: Date.now() + ttlSeconds * 1000,
        });
    }
    get(token) {
        const entry = this.cache.get(token);
        if (!entry) {
            return null;
        }
        if (Date.now() > entry.expiry) {
            this.cache.delete(token);
            return null;
        }
        return entry.data;
    }
    delete(token) {
        this.cache.delete(token);
    }
    cleanup() {
        const now = Date.now();
        for (const [token, entry] of this.cache.entries()) {
            if (entry.expiry <= now) {
                this.cache.delete(token);
            }
        }
    }
}
const tokenCache = new TokenCache();
const cleanupTimer = setInterval(() => tokenCache.cleanup(), 5 * 60 * 1000);
cleanupTimer.unref();
function extractBearerToken(authHeader) {
    if (!authHeader) {
        return null;
    }
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}
function isValidTokenFormat(token) {
    if (!token || token.length < 20) {
        return false;
    }
    return /^[A-Za-z0-9\-_=]+$/.test(token);
}
function hasRequiredScope(tokenData, requiredScope) {
    if (!requiredScope) {
        return true;
    }
    if (!tokenData.scope) {
        return false;
    }
    return tokenData.scope.split(' ').includes(requiredScope);
}
function generateWWWAuthenticateHeader(config, error, errorDescription) {
    let challenge = `Bearer realm="${config.realm}"`;
    if (error) {
        challenge += `, error="${error}"`;
    }
    if (errorDescription) {
        challenge += `, error_description="${errorDescription}"`;
    }
    if (error === 'insufficient_scope') {
        challenge += `, scope="${config.supportedScopes.join(' ')}"`;
    }
    return challenge;
}
async function introspectToken(config, token) {
    const cached = tokenCache.get(token);
    if (cached) {
        return cached;
    }
    try {
        if (config.introspectionEndpoint) {
            const body = new URLSearchParams({ token });
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            };
            if (config.clientId && config.clientSecret) {
                headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
            }
            const response = await fetch(config.introspectionEndpoint, {
                method: 'POST',
                headers,
                body,
            });
            if (!response.ok) {
                throw new Error(`Introspection endpoint returned ${response.status}: ${response.statusText}`);
            }
            const result = (await response.json());
            if (result.active) {
                const ttlSeconds = result.exp
                    ? Math.max(1, Math.floor(result.exp - Date.now() / 1000))
                    : config.tokenCacheTtl;
                tokenCache.set(token, result, ttlSeconds);
                return result;
            }
            return null;
        }
        if (process.env.NODE_ENV !== 'production' && token.startsWith('mcp_')) {
            const demoToken = {
                active: true,
                sub: 'demo-user',
                scope: config.supportedScopes.join(' '),
                exp: Math.floor(Date.now() / 1000) + 3600,
                aud: config.resourceServerUri,
                iss: config.authorizationServer ?? 'demo-auth-server',
                client_id: 'demo-client',
            };
            tokenCache.set(token, demoToken, config.tokenCacheTtl);
            return demoToken;
        }
    }
    catch (error) {
        logger.error('Token introspection failed', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return null;
}
function getProtectedResourceMetadata(config) {
    return {
        resource: config.resourceServerUri,
        authorization_servers: config.authorizationServer ? [config.authorizationServer] : [],
        scopes_supported: config.supportedScopes,
        bearer_methods_supported: ['header'],
        resource_documentation: `${config.resourceServerUri}/docs`,
        ...(config.authorizationServer ? { authorization_server: config.authorizationServer } : {}),
    };
}
function createProtectedResourceMetadataHandler(config) {
    return (_request, response) => {
        response.set('Content-Type', 'application/json');
        response.set('Cache-Control', 'public, max-age=3600');
        response.json(getProtectedResourceMetadata(config));
    };
}
function createOauthMiddlewareFactory(config) {
    return ({ requiredScope = 'mcp:read', skipPaths = [], optional = false }) => {
        const effectiveSkipPaths = new Set([
            '/health',
            '/',
            '/.well-known/oauth-protected-resource',
            '/oauth-metadata',
            '/.well-known/oauth-authorization-server',
            ...skipPaths,
        ]);
        return async (request, response, next) => {
            if (effectiveSkipPaths.has(request.path)) {
                next();
                return;
            }
            if (!config.enabled) {
                next();
                return;
            }
            if (config.requireHttps && request.protocol !== 'https') {
                response.status(400).json({
                    error: 'invalid_request',
                    error_description: 'HTTPS required for OAuth protected resources',
                });
                return;
            }
            const authorizationHeader = Array.isArray(request.headers.authorization)
                ? request.headers.authorization[0]
                : request.headers.authorization;
            const token = extractBearerToken(authorizationHeader);
            if (!token) {
                if (optional) {
                    next();
                    return;
                }
                response.set('WWW-Authenticate', generateWWWAuthenticateHeader(config));
                response.status(401).json({
                    error: 'invalid_request',
                    error_description: 'Bearer token required',
                });
                return;
            }
            if (!isValidTokenFormat(token)) {
                response.set('WWW-Authenticate', generateWWWAuthenticateHeader(config, 'invalid_token', 'Token format invalid'));
                response.status(401).json({
                    error: 'invalid_token',
                    error_description: 'Token format invalid',
                });
                return;
            }
            const tokenData = await introspectToken(config, token);
            if (!tokenData || !tokenData.active) {
                response.set('WWW-Authenticate', generateWWWAuthenticateHeader(config, 'invalid_token', 'Token is invalid or expired'));
                response.status(401).json({
                    error: 'invalid_token',
                    error_description: 'Token is invalid or expired',
                });
                return;
            }
            if (tokenData.exp && tokenData.exp < Math.floor(Date.now() / 1000)) {
                tokenCache.delete(token);
                response.set('WWW-Authenticate', generateWWWAuthenticateHeader(config, 'invalid_token', 'Token has expired'));
                response.status(401).json({
                    error: 'invalid_token',
                    error_description: 'Token has expired',
                });
                return;
            }
            if (!hasRequiredScope(tokenData, requiredScope)) {
                response.set('WWW-Authenticate', generateWWWAuthenticateHeader(config, 'insufficient_scope', `Scope '${requiredScope}' required`));
                response.status(403).json({
                    error: 'insufficient_scope',
                    error_description: `Scope '${requiredScope}' required`,
                });
                return;
            }
            next();
        };
    };
}
//# sourceMappingURL=oauth.js.map