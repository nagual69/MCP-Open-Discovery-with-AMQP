/**
 * Transport Manager for MCP Open Discovery Server v2.0
 * 
 * Central orchestrator for all transport types (stdio, HTTP, AMQP, gRPC).
 * This module provides a unified interface for transport management while
 * preserving all existing functionality and configuration options.
 * 
 * PRESERVES:
 * - TRANSPORT_MODE environment variable parsing (comma-separated)
 * - OAuth 2.1 integration for HTTP transport
 * - AMQP auto-recovery functionality
 * - Container detection and smart defaults
 * - All existing environment variables and configuration
 */

const { startStdioTransport, getStdioStatus } = require('./stdio-transport');
const { startHttpTransport, getHttpStatus, cleanupHttpTransport } = require('./http-transport');

// Integrate with existing AMQP system (DO NOT REPLACE)
const { 
  startAmqpServer, 
  initializeAmqpIntegration,
  getAmqpStatus
} = require('../amqp-transport-integration');

/**
 * Transport Manager Configuration
 * 
 * This mirrors the existing configuration from the main server to maintain
 * full backward compatibility with all environment variables.
 */
const TRANSPORT_CONFIG = {
  // Supported transport types (matches main server CONFIG)
  SUPPORTED_TRANSPORTS: ['stdio', 'http', 'amqp', 'grpc'],
  
  // Container detection (matches existing isRunningInContainer() logic)
  ENVIRONMENT_DETECTION: {
    CONTAINER_INDICATORS: ['DOCKER_CONTAINER', 'KUBERNETES_SERVICE_HOST', 'container'],
    SERVICE_INDICATORS: ['NODE_ENV', 'PORT', 'HTTP_PORT'],
    DOCKER_FILE_INDICATORS: ['/.dockerenv', '/proc/1/cgroup']
  },
  
  // Default transport modes (matches main server smart defaults)
  DEFAULT_CONTAINER_TRANSPORTS: ['http', 'amqp'],
  DEFAULT_INTERACTIVE_TRANSPORTS: ['stdio'],
  DEFAULT_FALLBACK_TRANSPORTS: ['stdio', 'http']
};

/**
 * Enhanced logging for transport manager
 */
function logTransport(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] [TRANSPORT_MANAGER] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Detect runtime environment for transport configuration
 * 
 * This replicates the existing isRunningInContainer() logic from the main server
 * to maintain exact compatibility with current environment detection.
 * 
 * @returns {Object} Environment detection results
 */
function detectEnvironment() {
  const env = process.env;
  const indicators = TRANSPORT_CONFIG.ENVIRONMENT_DETECTION;
  
  // Check for container environment (matches existing isRunningInContainer logic)
  let isContainer = false;
  try {
    const fs = require('fs');
    isContainer = indicators.CONTAINER_INDICATORS.some(indicator => env[indicator]) ||
                  indicators.DOCKER_FILE_INDICATORS.some(file => fs.existsSync(file)) ||
                  (fs.existsSync('/proc/1/cgroup') && fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));
  } catch (error) {
    // Fallback to environment variable detection only
    isContainer = indicators.CONTAINER_INDICATORS.some(indicator => env[indicator]);
  }
  
  // Check for service environment
  const isService = indicators.SERVICE_INDICATORS.some(indicator => env[indicator]);
  
  // Determine if running as a service or interactive
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  
  return {
    isContainer,
    isService,
    isInteractive,
    nodeEnv: env.NODE_ENV || 'development',
    platform: process.platform,
    hasStdin: !!process.stdin,
    hasStdout: !!process.stdout,
    // Additional environment context
    transportMode: env.TRANSPORT_MODE,
    httpPort: env.HTTP_PORT || env.PORT,
    amqpEnabled: env.AMQP_ENABLED !== 'false',
    oauthEnabled: env.OAUTH_ENABLED === 'true'
  };
}

/**
 * Parse TRANSPORT_MODE environment variable
 * 
 * This exactly replicates the parsing logic from the main server:
 * CONFIG.TRANSPORT_MODE.split(',').map(t => t.trim().toLowerCase())
 * 
 * @param {string} transportMode - Raw TRANSPORT_MODE value
 * @returns {Array<string>} Parsed transport names
 */
function parseTransportMode(transportMode) {
  if (!transportMode || typeof transportMode !== 'string') {
    return [];
  }
  
  return transportMode
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => TRANSPORT_CONFIG.SUPPORTED_TRANSPORTS.includes(t));
}

/**
 * Determine which transports should be enabled based on environment
 * 
 * This preserves the exact smart default logic from the main server:
 * - TRANSPORT_MODE env var takes precedence (comma-separated)
 * - Container environments default to 'http,amqp'
 * - Interactive environments default to 'stdio'
 * - Fallback to 'stdio,http' if nothing else matches
 * 
 * @param {Object} environment - Environment detection results
 * @param {Object} config - Transport configuration override
 * @returns {Array<string>} List of enabled transport names
 */
function determineEnabledTransports(environment, config = {}) {
  // 1. Check for explicit TRANSPORT_MODE (highest priority)
  if (environment.transportMode) {
    const parsed = parseTransportMode(environment.transportMode);
    if (parsed.length > 0) {
      logTransport('info', 'Using explicit TRANSPORT_MODE configuration', {
        transportMode: environment.transportMode,
        parsed: parsed
      });
      return parsed;
    }
  }
  
  // 2. Check for config override
  if (config.transports && Array.isArray(config.transports)) {
    const filtered = config.transports.filter(t => TRANSPORT_CONFIG.SUPPORTED_TRANSPORTS.includes(t));
    if (filtered.length > 0) {
      logTransport('info', 'Using config override for transports', { transports: filtered });
      return filtered;
    }
  }
  
  // 3. Smart defaults based on environment (matches main server logic)
  let defaults = [];
  
  if (environment.isContainer) {
    // Container environment: HTTP + AMQP (matches main server)
    defaults = [...TRANSPORT_CONFIG.DEFAULT_CONTAINER_TRANSPORTS];
    logTransport('info', 'Container environment detected - using HTTP+AMQP transports');
  } else if (environment.isInteractive && environment.hasStdin && environment.hasStdout) {
    // Interactive CLI environment: stdio
    defaults = [...TRANSPORT_CONFIG.DEFAULT_INTERACTIVE_TRANSPORTS];
    logTransport('info', 'Interactive environment detected - using stdio transport');
  } else {
    // Fallback: stdio + HTTP for maximum compatibility
    defaults = [...TRANSPORT_CONFIG.DEFAULT_FALLBACK_TRANSPORTS];
    logTransport('info', 'Using fallback transports for unknown environment');
  }
  
  logTransport('info', 'Transport selection completed', {
    environment: {
      isContainer: environment.isContainer,
      isInteractive: environment.isInteractive,
      hasStdin: environment.hasStdin,
      nodeEnv: environment.nodeEnv
    },
    selectedTransports: defaults
  });
  
  return defaults;
}

/**
 * Start all configured transports
 * 
 * This function preserves all existing functionality from the main server while
 * providing a clean interface for multi-transport orchestration.
 * 
 * @param {Object} mcpServer - The MCP server instance (singleton)
 * @param {Object} config - Transport configuration matching main server CONFIG
 * @returns {Promise<Object>} Startup results for all transports
 */
async function startAllTransports(mcpServer, config = {}) {
  try {
    logTransport('info', 'Starting transport manager...');
    
    const environment = detectEnvironment();
    const enabledTransports = determineEnabledTransports(environment, config);
    
    const results = {
      environment,
      transports: {},
      errors: [],
      totalEnabled: enabledTransports.length,
      successCount: 0,
      timestamp: new Date().toISOString()
    };
    
    // Start each enabled transport with full configuration support
    for (const transportName of enabledTransports) {
      try {
        logTransport('info', `Starting ${transportName} transport...`);
        
        let result;
        switch (transportName) {
          case 'stdio':
            result = await startStdioTransport(mcpServer, config.stdio || {});
            break;
            
          case 'http':
            // Pass through all HTTP configuration including OAuth
            result = await startHttpTransport(mcpServer, {
              port: config.HTTP_PORT || process.env.HTTP_PORT || process.env.PORT || 3000,
              getHealthData: config.getHealthData || (() => ({
                registry: config.registry ? config.registry.getStats() : { tools: 0, modules: 0 },
                version: '2.0.0',
                singleton: true
              })),
              oauthConfig: {
                enabled: config.OAUTH_ENABLED || environment.oauthEnabled,
                realm: config.OAUTH_REALM || 'mcp-open-discovery',
                supportedScopes: config.OAUTH_SUPPORTED_SCOPES || ['mcp:read', 'mcp:tools', 'mcp:resources'],
                authorizationServer: config.OAUTH_AUTHORIZATION_SERVER,
                ...config.oauthConfig
              },
              oauthHandlers: config.oauthHandlers || {},
              oauthMiddleware: config.oauthMiddleware,
              // Pass through any additional HTTP configuration
              ...config.http
            });
            break;
            
          case 'amqp':
            // Use existing AMQP integration (DO NOT REPLACE)
            logTransport('info', 'Initializing AMQP transport using existing integration...');
            
            try {
              // Initialize AMQP integration first
              await initializeAmqpIntegration(logTransport);
              
              // Create wrapper function for singleton MCP server
              const createServerFn = () => Promise.resolve(mcpServer);
              
              // Start AMQP server with createServerFn wrapper
              const amqpResult = await startAmqpServer(createServerFn, logTransport, {
                amqpUrl: config.AMQP_URL || process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672',
                queuePrefix: config.AMQP_QUEUE_PREFIX || process.env.AMQP_QUEUE_PREFIX || 'mcp.discovery',
                exchange: config.AMQP_EXCHANGE || process.env.AMQP_EXCHANGE || 'mcp.notifications',
                // Pass through any additional AMQP configuration
                ...config.amqp
              });
              
              result = {
                success: true,
                transport: 'amqp',
                ...amqpResult,
                timestamp: new Date().toISOString()
              };
              
              logTransport('info', 'AMQP transport started with auto-recovery capabilities');
              
            } catch (amqpError) {
              logTransport('error', 'AMQP transport initialization failed', {
                error: amqpError.message,
                stack: amqpError.stack
              });
              
              result = {
                success: false,
                transport: 'amqp',
                error: amqpError.message,
                timestamp: new Date().toISOString()
              };
            }
            break;
            
          case 'grpc':
            // gRPC transport ready for future implementation
            logTransport('info', 'gRPC transport requested but not yet implemented');
            
            // TODO: Implement gRPC transport when ready
            // result = await startGrpcTransport(mcpServer, {
            //   port: config.GRPC_PORT || process.env.GRPC_PORT || 50051,
            //   maxConnections: config.GRPC_MAX_CONNECTIONS || process.env.GRPC_MAX_CONNECTIONS || 1000,
            //   keepaliveTime: config.GRPC_KEEPALIVE_TIME || process.env.GRPC_KEEPALIVE_TIME || 30000,
            //   ...config.grpc
            // });
            
            result = {
              success: false,
              transport: 'grpc',
              error: 'gRPC transport not yet implemented - prepared for future use',
              timestamp: new Date().toISOString()
            };
            break;
            
          default:
            throw new Error(`Unknown transport: ${transportName}`);
        }
        
        results.transports[transportName] = result;
        
        if (result.success) {
          results.successCount++;
          logTransport('info', `${transportName} transport started successfully`);
        } else {
          results.errors.push({
            transport: transportName,
            error: result.error || 'Unknown error'
          });
          logTransport('error', `${transportName} transport failed to start`, result);
        }
        
      } catch (error) {
        const errorResult = {
          success: false,
          transport: transportName,
          error: error.message,
          timestamp: new Date().toISOString()
        };
        
        results.transports[transportName] = errorResult;
        results.errors.push({
          transport: transportName,
          error: error.message
        });
        
        logTransport('error', `Failed to start ${transportName} transport`, {
          error: error.message,
          stack: error.stack
        });
      }
    }
    
    // Log comprehensive summary
    logTransport('info', 'Transport manager startup complete', {
      environment: {
        isContainer: environment.isContainer,
        isInteractive: environment.isInteractive,
        transportMode: environment.transportMode
      },
      enabled: enabledTransports,
      successful: results.successCount,
      failed: results.errors.length,
      errors: results.errors,
      summary: `${results.successCount}/${enabledTransports.length} transports started successfully`
    });
    
    return results;
    
  } catch (error) {
    logTransport('error', 'Transport manager startup failed', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      environment: detectEnvironment(),
      transports: {},
      errors: [{ transport: 'manager', error: error.message }],
      totalEnabled: 0,
      successCount: 0,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get status of all transports
 * @param {Object} transportResults - Results from startAllTransports
 * @returns {Object} Comprehensive status information
 */
function getAllTransportStatus(transportResults = {}) {
  const status = {
    manager: {
      version: '2.0.0',
      status: 'active',
      environment: transportResults.environment || detectEnvironment(),
      supportedTransports: TRANSPORT_CONFIG.SUPPORTED_TRANSPORTS,
      timestamp: new Date().toISOString()
    },
    transports: {},
    summary: {
      total: 0,
      active: 0,
      failed: 0,
      errors: transportResults.errors || []
    }
  };
  
  // Get status for each transport type
  const transportChecks = [
    { name: 'stdio', getStatus: () => getStdioStatus() },
    { name: 'http', getStatus: (info) => getHttpStatus(info) },
    { name: 'amqp', getStatus: () => getAmqpStatus() }, // Use existing AMQP status
    // gRPC will be added when implemented
  ];
  
  for (const { name, getStatus } of transportChecks) {
    try {
      const transportInfo = transportResults.transports?.[name];
      status.transports[name] = getStatus(transportInfo);
      status.summary.total++;
      
      if (transportInfo?.success) {
        status.summary.active++;
      } else {
        status.summary.failed++;
      }
    } catch (error) {
      status.transports[name] = {
        transport: name,
        available: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      status.summary.total++;
      status.summary.failed++;
    }
  }
  
  return status;
}

/**
 * Cleanup all transports
 * 
 * This function provides graceful shutdown for all active transports,
 * preserving the existing AMQP auto-recovery and HTTP server cleanup logic.
 * 
 * @param {Object} transportResults - Results from startAllTransports
 * @returns {Promise<Object>} Cleanup results
 */
async function cleanupAllTransports(transportResults = {}) {
  logTransport('info', 'Starting transport cleanup...');
  
  const results = {
    transports: {},
    errors: [],
    timestamp: new Date().toISOString()
  };
  
  // Cleanup each active transport
  for (const [name, info] of Object.entries(transportResults.transports || {})) {
    if (!info.success) continue;
    
    try {
      let cleanupResult;
      
      switch (name) {
        case 'stdio':
          // Stdio transport cleanup is automatic
          cleanupResult = { success: true, message: 'Stdio transport cleanup automatic' };
          break;
          
        case 'http':
          cleanupResult = await cleanupHttpTransport(info);
          break;
          
        case 'amqp':
          // AMQP cleanup should use existing integration
          // The existing AMQP integration handles its own graceful shutdown
          logTransport('info', 'Requesting AMQP transport cleanup...');
          cleanupResult = { 
            success: true, 
            message: 'AMQP transport cleanup handled by existing integration',
            note: 'Auto-recovery system will handle graceful shutdown'
          };
          break;
          
        case 'grpc':
          // TODO: Implement gRPC cleanup when transport is ready
          cleanupResult = { success: true, message: 'gRPC cleanup not yet implemented' };
          break;
          
        default:
          cleanupResult = { success: false, error: `Unknown transport: ${name}` };
      }
      
      results.transports[name] = cleanupResult;
      
      if (cleanupResult.success) {
        logTransport('info', `${name} transport cleaned up successfully`);
      } else {
        logTransport('error', `${name} transport cleanup failed`, cleanupResult);
        results.errors.push({
          transport: name,
          error: cleanupResult.error || 'Unknown cleanup error'
        });
      }
      
    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      results.transports[name] = errorResult;
      results.errors.push({
        transport: name,
        error: error.message
      });
      
      logTransport('error', `Failed to cleanup ${name} transport`, {
        error: error.message,
        stack: error.stack
      });
    }
  }
  
  logTransport('info', 'Transport cleanup complete', {
    cleaned: Object.keys(results.transports).length,
    errors: results.errors.length
  });
  
  return results;
}

/**
 * Get transport recommendations based on environment
 * 
 * This provides intelligent recommendations based on the runtime environment,
 * matching the smart defaults logic from the main server.
 * 
 * @param {Object} environment - Environment detection results
 * @returns {Object} Transport recommendations
 */
function getTransportRecommendations(environment = null) {
  const env = environment || detectEnvironment();
  
  const recommendations = {
    environment: env,
    recommended: [],
    optional: [],
    reasons: [],
    configuration: {},
    timestamp: new Date().toISOString()
  };
  
  // Stdio recommendations
  if (env.hasStdin && env.hasStdout && env.isInteractive) {
    recommendations.recommended.push('stdio');
    recommendations.reasons.push('Interactive environment detected - stdio recommended for direct communication');
    recommendations.configuration.stdio = {
      note: 'Best for CLI tools and development'
    };
  } else if (env.hasStdin && env.hasStdout) {
    recommendations.optional.push('stdio');
    recommendations.reasons.push('Stdin/stdout available but non-interactive - stdio available as option');
  }
  
  // HTTP recommendations
  if (env.isContainer || env.isService) {
    recommendations.recommended.push('http');
    recommendations.reasons.push('Container/service environment detected - HTTP recommended for external access');
    recommendations.configuration.http = {
      port: env.httpPort || 3000,
      oauth: env.oauthEnabled ? 'enabled' : 'disabled',
      note: 'Ideal for web clients and REST APIs'
    };
  } else {
    recommendations.optional.push('http');
    recommendations.reasons.push('HTTP available for web client access and testing');
    recommendations.configuration.http = {
      port: 3000,
      note: 'Good for development and testing'
    };
  }
  
  // AMQP recommendations
  if (env.isContainer || env.nodeEnv === 'production') {
    recommendations.recommended.push('amqp');
    recommendations.reasons.push('Container/production environment - AMQP recommended for scalable messaging');
    recommendations.configuration.amqp = {
      autoRecovery: 'enabled',
      note: 'Best for distributed systems and message queuing'
    };
  } else if (env.amqpEnabled) {
    recommendations.optional.push('amqp');
    recommendations.reasons.push('AMQP explicitly enabled - consider for advanced messaging patterns');
  }
  
  // gRPC recommendations
  if (env.nodeEnv === 'production' || env.isContainer) {
    recommendations.optional.push('grpc');
    recommendations.reasons.push('Production environment - consider gRPC for high-performance RPC (when available)');
    recommendations.configuration.grpc = {
      status: 'not_yet_implemented',
      futurePort: 50051,
      note: 'Planned for high-performance service mesh integration'
    };
  }
  
  return recommendations;
}

/**
 * Validate transport configuration
 * 
 * This function validates that the requested transport configuration is
 * compatible with the current environment and available resources.
 * 
 * @param {Array<string>} requestedTransports - Requested transport names
 * @param {Object} environment - Environment detection results
 * @returns {Object} Validation results
 */
function validateTransportConfiguration(requestedTransports, environment = null) {
  const env = environment || detectEnvironment();
  const validation = {
    valid: true,
    warnings: [],
    errors: [],
    recommendations: [],
    timestamp: new Date().toISOString()
  };
  
  for (const transport of requestedTransports) {
    // Check if transport is supported
    if (!TRANSPORT_CONFIG.SUPPORTED_TRANSPORTS.includes(transport)) {
      validation.errors.push(`Unknown transport: ${transport}`);
      validation.valid = false;
      continue;
    }
    
    // Transport-specific validation
    switch (transport) {
      case 'stdio':
        if (!env.hasStdin || !env.hasStdout) {
          validation.warnings.push('stdio transport requested but stdin/stdout not available');
          if (env.isContainer) {
            validation.recommendations.push('Consider using http or amqp transport in container environment');
          }
        }
        break;
        
      case 'http':
        if (env.httpPort && isNaN(parseInt(env.httpPort))) {
          validation.warnings.push(`Invalid HTTP port specified: ${env.httpPort}`);
        }
        break;
        
      case 'amqp':
        if (!env.amqpEnabled) {
          validation.warnings.push('AMQP transport requested but AMQP_ENABLED=false');
        }
        break;
        
      case 'grpc':
        validation.warnings.push('gRPC transport requested but not yet implemented');
        validation.recommendations.push('Use http or amqp transport instead');
        break;
    }
  }
  
  // Check for conflicting configurations
  if (requestedTransports.includes('stdio') && env.isContainer) {
    validation.warnings.push('stdio transport in container environment may have limited functionality');
    validation.recommendations.push('Consider http+amqp for container deployments');
  }
  
  return validation;
}

/**
 * Create transport configuration from environment
 * 
 * This function creates a comprehensive transport configuration object
 * that includes all the necessary settings for each transport type,
 * preserving compatibility with existing environment variables.
 * 
 * @param {Object} environment - Environment detection results
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Complete transport configuration
 */
function createTransportConfig(environment = null, overrides = {}) {
  const env = environment || detectEnvironment();
  
  // Build configuration that matches main server CONFIG structure
  const config = {
    // Core transport settings
    HTTP_PORT: overrides.HTTP_PORT || env.httpPort || 3000,
    OAUTH_ENABLED: overrides.OAUTH_ENABLED || env.oauthEnabled || false,
    AMQP_URL: overrides.AMQP_URL || process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672',
    AMQP_ENABLED: overrides.AMQP_ENABLED || env.amqpEnabled,
    
    // OAuth configuration
    OAUTH_REALM: overrides.OAUTH_REALM || 'mcp-open-discovery',
    OAUTH_SUPPORTED_SCOPES: overrides.OAUTH_SUPPORTED_SCOPES || ['mcp:read', 'mcp:tools', 'mcp:resources'],
    
    // AMQP configuration
    AMQP_QUEUE_PREFIX: overrides.AMQP_QUEUE_PREFIX || process.env.AMQP_QUEUE_PREFIX || 'mcp.discovery',
    AMQP_EXCHANGE: overrides.AMQP_EXCHANGE || process.env.AMQP_EXCHANGE || 'mcp.notifications',
    
    // gRPC configuration (ready for future use)
    GRPC_PORT: overrides.GRPC_PORT || process.env.GRPC_PORT || 50051,
    GRPC_MAX_CONNECTIONS: overrides.GRPC_MAX_CONNECTIONS || process.env.GRPC_MAX_CONNECTIONS || 1000,
    GRPC_KEEPALIVE_TIME: overrides.GRPC_KEEPALIVE_TIME || process.env.GRPC_KEEPALIVE_TIME || 30000,
    
    // Health check configuration
    getHealthData: overrides.getHealthData || (() => ({
      environment: env,
      version: '2.0.0',
      singleton: true,
      timestamp: new Date().toISOString()
    })),
    
    // OAuth handlers (to be provided by main server)
    oauthHandlers: overrides.oauthHandlers || {},
    oauthMiddleware: overrides.oauthMiddleware,
    
    // Registry reference (for health data)
    registry: overrides.registry,
    
    // Additional overrides
    ...overrides
  };
  
  return config;
}

module.exports = {
  // Core transport management
  startAllTransports,
  getAllTransportStatus,
  cleanupAllTransports,
  
  // Environment and configuration
  detectEnvironment,
  determineEnabledTransports,
  parseTransportMode,
  
  // Utility functions
  getTransportRecommendations,
  validateTransportConfiguration,
  createTransportConfig,
  
  // Configuration constants
  TRANSPORT_CONFIG
};
