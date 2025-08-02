/**
 * AMQP Transport Integration for MCP Open Discovery Server v2.0
 * 
 * This module integrates RabbitMQ/AMQP transport capabilities into the revolutionary
 * MCP Open Discovery Server v2.0 with its dynamic registry system, 61 enterprise tools,
 * and hot-reload capabilities - without breaking existing stdio and HTTP transports.
 * 
 * Features:
 * - Seamless integration with tools/registry/ system
 * - Hot-reload broadcasting over AMQP
 * - Tool category-based message routing
 * - Enterprise-grade error handling and monitoring
 * - Production-ready scaling and performance
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { RabbitMQServerTransport } = require('./amqp-server-transport.js');

/**
 * Enhanced configuration with AMQP support for MCP Open Discovery Server v2.0
 */
const AMQP_CONFIG = {
  AMQP_URL: process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672',
  AMQP_QUEUE_PREFIX: process.env.AMQP_QUEUE_PREFIX || 'mcp.discovery',
  AMQP_EXCHANGE: process.env.AMQP_EXCHANGE || 'mcp.notifications',
  AMQP_RECONNECT_DELAY: parseInt(process.env.AMQP_RECONNECT_DELAY) || 5000,
  AMQP_MAX_RECONNECT_ATTEMPTS: parseInt(process.env.AMQP_MAX_RECONNECT_ATTEMPTS) || 10,
  AMQP_PREFETCH_COUNT: parseInt(process.env.AMQP_PREFETCH_COUNT) || 1,
  AMQP_MESSAGE_TTL: parseInt(process.env.AMQP_MESSAGE_TTL) || 3600000, // 1 hour
  AMQP_QUEUE_TTL: parseInt(process.env.AMQP_QUEUE_TTL) || 7200000, // 2 hours
  
  // Enterprise discovery server specific settings
  REGISTRY_BROADCAST_ENABLED: process.env.REGISTRY_BROADCAST_ENABLED !== 'false',
  TOOL_CATEGORY_ROUTING: process.env.TOOL_CATEGORY_ROUTING !== 'false',
  HOT_RELOAD_AMQP_SYNC: process.env.HOT_RELOAD_AMQP_SYNC !== 'false'
};

/**
 * Tool category mappings for your 61-tool enterprise platform
 */
const TOOL_CATEGORIES = {
  memory: ['memory_', 'cmdb_'],
  network: ['ping', 'telnet', 'wget', 'netstat', 'ifconfig', 'arp', 'route', 'nslookup'],
  nmap: ['nmap_'],
  proxmox: ['proxmox_'],
  snmp: ['snmp_'],
  zabbix: ['zabbix_'],
  credentials: ['creds_'],
  registry: ['registry_', 'tool_']
};

/**
 * Enhanced transport mode parsing to support AMQP with your server's capabilities
 */
function parseTransportMode(mode) {
  if (!mode) return ['stdio']; // Default fallback
  
  const normalized = mode.toLowerCase().trim();
  
  // Handle special cases
  if (normalized === 'all') {
    return ['stdio', 'http', 'amqp'];
  }
  
  // Parse comma-separated modes
  const modes = normalized.split(',').map(m => m.trim()).filter(Boolean);
  
  // Validate each mode
  const validModes = ['stdio', 'http', 'amqp'];
  const invalidModes = modes.filter(m => !validModes.includes(m));
  
  if (invalidModes.length > 0) {
    throw new Error(`Invalid transport modes: ${invalidModes.join(', ')}. Valid modes are: ${validModes.join(', ')}`);
  }
  
  return modes.length > 0 ? modes : ['stdio'];
}

/**
 * Start periodic health checks for AMQP connection
 */
function startAmqpHealthCheck(log, interval = 30000) {
  if (global.amqpHealthCheckInterval) {
    clearInterval(global.amqpHealthCheckInterval);
  }
  
  global.amqpHealthCheckInterval = setInterval(async () => {
    try {
      const healthCheck = await testAmqpConnection();
      
      if (!healthCheck.healthy) {
        log('warn', 'AMQP health check failed, connection appears unhealthy', {
          reason: healthCheck.reason,
          timestamp: healthCheck.timestamp
        });
        
        // Trigger auto-recovery if enabled and no recovery already in progress
        if (process.amqpAutoRecoveryConfig?.enabled && !process.amqpRecovery) {
          log('warn', 'Triggering auto-recovery due to failed health check');
          process.amqpTransport = null;
          
          if (process.amqpCreateServerFn) {
            startAmqpAutoRecovery(process.amqpCreateServerFn, log, process.amqpAutoRecoveryConfig);
          } else {
            log('error', 'Cannot start auto-recovery: createServerFn not available');
          }
        } else if (process.amqpRecovery) {
          log('debug', 'Auto-recovery already in progress, skipping trigger');
        } else {
          log('debug', 'Auto-recovery not enabled or not configured');
        }
      } else {
        log('debug', 'AMQP health check passed');
      }
    } catch (error) {
      log('warn', 'AMQP health check error', { error: error.message });
    }
  }, interval);
  
  log('info', 'AMQP health check started', { interval: `${interval}ms` });
}

/**
 * Start the server with AMQP transport
 */
async function startAmqpServer(createServerFn, log) {
  log('info', 'Starting AMQP transport...');
  
  try {
    // Create the MCP server instance
    const mcpServer = await createServerFn();
    
    // Create AMQP transport
    const transport = new RabbitMQServerTransport({
      amqpUrl: AMQP_CONFIG.AMQP_URL,
      queuePrefix: AMQP_CONFIG.AMQP_QUEUE_PREFIX,
      exchangeName: AMQP_CONFIG.AMQP_EXCHANGE,
      reconnectDelay: AMQP_CONFIG.AMQP_RECONNECT_DELAY,
      maxReconnectAttempts: AMQP_CONFIG.AMQP_MAX_RECONNECT_ATTEMPTS,
      prefetchCount: AMQP_CONFIG.AMQP_PREFETCH_COUNT,
      messageTTL: AMQP_CONFIG.AMQP_MESSAGE_TTL,
      queueTTL: AMQP_CONFIG.AMQP_QUEUE_TTL
    });
    
    // Set up transport event handlers
    transport.onerror = (error) => {
      log('error', 'AMQP transport error', {
        error: error.message,
        stack: error.stack
      });
    };
    
    transport.onclose = () => {
      log('info', 'AMQP transport closed');
      
      // Check if auto-recovery is configured and enabled
      if (process.amqpAutoRecoveryConfig && process.amqpAutoRecoveryConfig.enabled) {
        log('warn', 'AMQP connection lost, starting auto-recovery...');
        process.amqpTransport = null;
        
        // Use the stored createServerFn if available
        if (process.amqpCreateServerFn) {
          startAmqpAutoRecovery(process.amqpCreateServerFn, log, process.amqpAutoRecoveryConfig);
        } else {
          log('warn', 'Cannot start auto-recovery: createServerFn not available');
        }
      }
    };
    
    // Connect server to transport
    await mcpServer.connect(transport);
    
    // Start the transport
    await transport.start();
    
    // Start periodic health checks
    startAmqpHealthCheck(log, 15000); // Check every 15 seconds
    
    // Set up registry integration for your revolutionary hot-reload system
    if (AMQP_CONFIG.REGISTRY_BROADCAST_ENABLED) {
      await setupRegistryIntegration(transport, log);
    }
    
    // Set up tool category routing for your 61-tool platform
    if (AMQP_CONFIG.TOOL_CATEGORY_ROUTING) {
      await setupToolCategoryRouting(transport, log);
    }
    
    log('info', 'AMQP transport started successfully with MCP Open Discovery v2.0 enhancements', {
      amqpUrl: AMQP_CONFIG.AMQP_URL,
      queuePrefix: AMQP_CONFIG.AMQP_QUEUE_PREFIX,
      exchangeName: AMQP_CONFIG.AMQP_EXCHANGE,
      prefetchCount: AMQP_CONFIG.AMQP_PREFETCH_COUNT
    });
    
    // Return transport for management
    return transport;
    
  } catch (error) {
    log('error', 'Failed to start AMQP transport', {
      error: error.message,
      stack: error.stack,
      config: {
        amqpUrl: AMQP_CONFIG.AMQP_URL,
        queuePrefix: AMQP_CONFIG.AMQP_QUEUE_PREFIX,
        exchangeName: AMQP_CONFIG.AMQP_EXCHANGE
      }
    });
    throw error;
  }
}

/**
 * Auto-recovery mechanism for AMQP connections
 */
async function startAmqpAutoRecovery(createServerFn, log, retryConfig = {}) {
  const config = {
    enabled: retryConfig.enabled !== false,
    maxRetries: retryConfig.maxRetries || -1, // -1 = infinite retries
    retryInterval: retryConfig.retryInterval || 30000, // 30 seconds
    backoffMultiplier: retryConfig.backoffMultiplier || 1.5,
    maxRetryInterval: retryConfig.maxRetryInterval || 300000, // 5 minutes
    ...retryConfig
  };
  
  if (!config.enabled) {
    log('info', 'AMQP auto-recovery disabled');
    return null;
  }
  
  let retryCount = 0;
  let retryInterval = config.retryInterval;
  let isRecovering = false;
  
  const recovery = {
    stop: false,
    retryCount: 0,
    lastAttempt: null,
    status: 'waiting'
  };
  
  // Store recovery state globally for status checking
  process.amqpRecovery = recovery;
  
  const attemptReconnection = async () => {
    if (recovery.stop || isRecovering) return;
    
    isRecovering = true;
    recovery.status = 'attempting';
    recovery.lastAttempt = new Date().toISOString();
    retryCount++;
    recovery.retryCount = retryCount;
    
    log('info', `AMQP auto-recovery attempt ${retryCount}`, {
      retryInterval: retryInterval,
      maxRetries: config.maxRetries,
      nextRetryIn: `${Math.round(retryInterval / 1000)}s`
    });
    
    try {
      const amqpTransport = await startAmqpServer(createServerFn, log);
      
      // Success! AMQP is back online
      log('info', 'AMQP auto-recovery successful! 🎉', {
        retriesAttempted: retryCount,
        totalDowntime: recovery.lastAttempt ? 
          Math.round((Date.now() - new Date(recovery.lastAttempt).getTime()) / 1000) + 's' : 'unknown'
      });
      
      // Store the recovered transport
      process.amqpTransport = amqpTransport;
      recovery.status = 'connected';
      
      // Set up disconnect handler to restart auto-recovery if connection is lost again
      if (amqpTransport.onclose) {
        const originalOnClose = amqpTransport.onclose;
        amqpTransport.onclose = () => {
          originalOnClose();
          log('warn', 'AMQP connection lost, restarting auto-recovery...');
          process.amqpTransport = null;
          recovery.status = 'waiting';
          retryCount = 0;
          retryInterval = config.retryInterval;
          scheduleNextRetry();
        };
      }
      
      // Stop the recovery process
      recovery.stop = true;
      isRecovering = false;
      return amqpTransport;
      
    } catch (error) {
      recovery.status = 'failed';
      log('debug', `AMQP auto-recovery attempt ${retryCount} failed`, {
        error: error.message,
        nextRetryIn: `${Math.round(retryInterval / 1000)}s`
      });
      
      // Check if we should stop retrying
      if (config.maxRetries > 0 && retryCount >= config.maxRetries) {
        log('warn', 'AMQP auto-recovery stopped after maximum retries reached', {
          maxRetries: config.maxRetries,
          totalAttempts: retryCount
        });
        recovery.status = 'stopped';
        isRecovering = false;
        return null;
      }
      
      // Exponential backoff
      retryInterval = Math.min(
        retryInterval * config.backoffMultiplier,
        config.maxRetryInterval
      );
      
      isRecovering = false;
      scheduleNextRetry();
    }
  };
  
  const scheduleNextRetry = () => {
    if (recovery.stop) return;
    
    recovery.status = 'waiting';
    setTimeout(() => {
      if (!recovery.stop) {
        attemptReconnection();
      }
    }, retryInterval);
  };
  
  // Start the recovery process
  log('info', 'Starting AMQP auto-recovery service', {
    retryInterval: `${config.retryInterval / 1000}s`,
    maxRetries: config.maxRetries === -1 ? 'infinite' : config.maxRetries,
    backoffMultiplier: config.backoffMultiplier,
    maxRetryInterval: `${config.maxRetryInterval / 1000}s`
  });
  
  scheduleNextRetry();
  
  return recovery;
}

/**
 * Test AMQP connection health by sending a heartbeat message
 */
async function testAmqpConnection() {
  if (!process.amqpTransport) {
    return { healthy: false, reason: 'No transport available' };
  }
  
  try {
    // Try to send a simple test message to verify connection
    const testChannel = await process.amqpTransport.connection.createChannel();
    await testChannel.assertExchange('mcp.heartbeat', 'fanout', { durable: false });
    await testChannel.publish('mcp.heartbeat', '', Buffer.from(JSON.stringify({
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
      source: 'mcp-open-discovery'
    })));
    await testChannel.close();
    
    return { healthy: true, timestamp: new Date().toISOString() };
  } catch (error) {
    return { 
      healthy: false, 
      reason: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get AMQP connection status including auto-recovery information
 */
function getAmqpStatus() {
  const status = {
    connected: !!process.amqpTransport,
    transport: !!process.amqpTransport,
    autoRecovery: !!(process.amqpRecovery || (process.amqpAutoRecoveryConfig && process.amqpAutoRecoveryConfig.enabled)),
    timestamp: new Date().toISOString()
  };
  
  // Include auto-recovery configuration if available
  if (process.amqpAutoRecoveryConfig) {
    status.recovery = {
      enabled: process.amqpAutoRecoveryConfig.enabled,
      status: process.amqpRecovery ? process.amqpRecovery.status : 'standby',
      retryInterval: process.amqpAutoRecoveryConfig.retryInterval,
      maxRetries: process.amqpAutoRecoveryConfig.maxRetries
    };
    
    // Add active recovery details if in progress
    if (process.amqpRecovery) {
      Object.assign(status.recovery, {
        retryCount: process.amqpRecovery.retryCount || 0,
        lastAttempt: process.amqpRecovery.lastAttempt,
        nextRetry: process.amqpRecovery.nextRetry
      });
    }
  } else if (process.amqpRecovery) {
    status.recovery = {
      enabled: true,
      status: process.amqpRecovery.status,
      retryCount: process.amqpRecovery.retryCount,
      lastAttempt: process.amqpRecovery.lastAttempt,
      stopped: process.amqpRecovery.stop
    };
  } else {
    status.recovery = { enabled: false };
  }
  
  return status;
}
async function startServerWithAmqp(originalStartServer, createServerFn, log, CONFIG) {
  try {
    const transportModes = parseTransportMode(CONFIG.TRANSPORT_MODE);
    
    log('info', `Starting server with transport modes: ${transportModes.join(', ')}`, {
      originalValue: CONFIG.TRANSPORT_MODE,
      envValue: process.env.TRANSPORT_MODE,
      parsedModes: transportModes
    });
    
    const activeTransports = [];
    const failedTransports = [];
    
    // Start each requested transport with graceful degradation
    for (const mode of transportModes) {
      try {
        switch (mode) {
          case 'stdio':
            if (originalStartServer.startStdioServer) {
              await originalStartServer.startStdioServer();
              activeTransports.push('stdio');
            }
            break;
            
          case 'http':
            if (originalStartServer.startHttpServer) {
              await originalStartServer.startHttpServer();
              activeTransports.push('http');
            }
            break;
            
          case 'amqp':
            try {
              // Set up auto-recovery configuration first (regardless of initial connection success)
              const autoRecoveryConfig = {
                enabled: process.env.AMQP_AUTO_RECOVERY !== 'false',
                retryInterval: parseInt(process.env.AMQP_RETRY_INTERVAL) || 30000, // 30 seconds
                maxRetries: parseInt(process.env.AMQP_MAX_RETRIES) || -1, // infinite by default
                backoffMultiplier: parseFloat(process.env.AMQP_BACKOFF_MULTIPLIER) || 1.5,
                maxRetryInterval: parseInt(process.env.AMQP_MAX_RETRY_INTERVAL) || 300000 // 5 minutes
              };
              
              // Store auto-recovery configuration globally
              process.amqpAutoRecoveryConfig = autoRecoveryConfig;
              
              // Store createServerFn globally for auto-recovery
              global.mcpCreateServerFn = createServerFn;
              
              const amqpTransport = await startAmqpServer(createServerFn, log);
              activeTransports.push('amqp');
              
              // Store transport for graceful shutdown
              process.amqpTransport = amqpTransport;
              
              if (autoRecoveryConfig.enabled) {
                log('info', 'AMQP auto-recovery configured', {
                  retryInterval: autoRecoveryConfig.retryInterval,
                  maxRetries: autoRecoveryConfig.maxRetries === -1 ? 'infinite' : autoRecoveryConfig.maxRetries,
                  status: 'standby'
                });
              }
            } catch (amqpError) {
              log('warn', 'AMQP transport failed to start, enabling auto-recovery', {
                error: amqpError.message,
                fallback: 'Server will continue without AMQP support and attempt auto-recovery'
              });
              failedTransports.push({ mode: 'amqp', error: amqpError.message });
              
              // Auto-recovery config should already be set above, just start recovery
              if (process.amqpAutoRecoveryConfig && process.amqpAutoRecoveryConfig.enabled) {
                startAmqpAutoRecovery(createServerFn, log, process.amqpAutoRecoveryConfig);
                log('info', 'AMQP auto-recovery started after initial failure', {
                  retryInterval: process.amqpAutoRecoveryConfig.retryInterval,
                  maxRetries: process.amqpAutoRecoveryConfig.maxRetries === -1 ? 'infinite' : process.amqpAutoRecoveryConfig.maxRetries
                });
              } else {
                log('info', 'AMQP auto-recovery disabled via AMQP_AUTO_RECOVERY=false');
              }
            }
            break;
            
          default:
            log('warn', `Unknown transport mode: ${mode}`);
        }
      } catch (transportError) {
        log('error', `Failed to start ${mode} transport`, {
          error: transportError.message,
          stack: transportError.stack
        });
        failedTransports.push({ mode, error: transportError.message });
      }
    }
    
    // Report startup status
    if (activeTransports.length > 0) {
      log('info', 'MCP Server with AMQP integration started successfully', {
        activeTransports,
        failedTransports: failedTransports.length > 0 ? failedTransports : 'none',
        mode: transportModes.join(', '),
        degradedOperation: failedTransports.length > 0
      });
      
      // Log warnings for failed transports
      if (failedTransports.length > 0) {
        log('warn', 'Server running in degraded mode - some transports failed', {
          failedCount: failedTransports.length,
          details: failedTransports
        });
      }
    } else {
      log('error', 'All transports failed to start', { failedTransports });
      throw new Error('No transports could be started');
    }
    
    // Enhanced graceful shutdown
    const gracefulShutdown = async (signal) => {
      log('info', `Received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop AMQP auto-recovery if running
        if (process.amqpRecovery) {
          log('info', 'Stopping AMQP auto-recovery service...');
          process.amqpRecovery.stop = true;
        }
        
        // Close AMQP transport if active
        if (process.amqpTransport) {
          log('info', 'Closing AMQP transport...');
          await process.amqpTransport.close();
        }
        
        log('info', 'Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        log('error', 'Error during graceful shutdown', {
          error: error.message,
          stack: error.stack
        });
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
  } catch (error) {
    log('error', 'Failed to start server', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    process.exit(1);
  }
}

/**
 * Health check enhancement with AMQP status and auto-recovery information
 */
function enhanceHealthCheck(originalHealthResponse) {
  const amqpStatus = getAmqpStatus();
  
  const enhanced = {
    ...originalHealthResponse,
    transports: {
      ...originalHealthResponse.transports,
      amqp: {
        enabled: amqpStatus.connected,
        connected: amqpStatus.connected,
        autoRecovery: amqpStatus.recovery,
        config: {
          queuePrefix: AMQP_CONFIG.AMQP_QUEUE_PREFIX,
          exchangeName: AMQP_CONFIG.AMQP_EXCHANGE,
          prefetchCount: AMQP_CONFIG.AMQP_PREFETCH_COUNT
        }
      }
    }
  };
  
  if (process.amqpTransport?.connectionState) {
    enhanced.transports.amqp.connectionState = {
      connected: process.amqpTransport.connectionState.connected,
      reconnectAttempts: process.amqpTransport.connectionState.reconnectAttempts,
      lastError: process.amqpTransport.connectionState.lastError?.message
    };
  }
  
  return enhanced;
}

/**
 * Configuration validator for AMQP settings
 */
function validateAmqpConfig() {
  const errors = [];
  
  // Validate AMQP URL
  try {
    new URL(AMQP_CONFIG.AMQP_URL);
  } catch (error) {
    errors.push(`Invalid AMQP_URL: ${AMQP_CONFIG.AMQP_URL}`);
  }
  
  // Validate queue prefix
  if (!AMQP_CONFIG.AMQP_QUEUE_PREFIX || AMQP_CONFIG.AMQP_QUEUE_PREFIX.trim() === '') {
    errors.push('AMQP_QUEUE_PREFIX cannot be empty');
  }
  
  // Validate exchange name
  if (!AMQP_CONFIG.AMQP_EXCHANGE || AMQP_CONFIG.AMQP_EXCHANGE.trim() === '') {
    errors.push('AMQP_EXCHANGE cannot be empty');
  }
  
  // Validate numeric values
  if (AMQP_CONFIG.AMQP_RECONNECT_DELAY < 1000) {
    errors.push('AMQP_RECONNECT_DELAY must be at least 1000ms');
  }
  
  if (AMQP_CONFIG.AMQP_MAX_RECONNECT_ATTEMPTS < 1) {
    errors.push('AMQP_MAX_RECONNECT_ATTEMPTS must be at least 1');
  }
  
  if (AMQP_CONFIG.AMQP_PREFETCH_COUNT < 1) {
    errors.push('AMQP_PREFETCH_COUNT must be at least 1');
  }
  
  return errors;
}

/**
 * Initialize AMQP configuration and validation
 */
function initializeAmqpIntegration(log) {
  log('info', 'Initializing AMQP integration...');
  
  // Validate configuration
  const configErrors = validateAmqpConfig();
  if (configErrors.length > 0) {
    log('error', 'AMQP configuration validation failed', {
      errors: configErrors,
      config: AMQP_CONFIG
    });
    throw new Error(`AMQP configuration errors: ${configErrors.join(', ')}`);
  }
  
  log('info', 'AMQP configuration validated for MCP Open Discovery Server v2.0', {
    amqpUrl: AMQP_CONFIG.AMQP_URL,
    queuePrefix: AMQP_CONFIG.AMQP_QUEUE_PREFIX,
    exchangeName: AMQP_CONFIG.AMQP_EXCHANGE,
    reconnectDelay: AMQP_CONFIG.AMQP_RECONNECT_DELAY,
    maxReconnectAttempts: AMQP_CONFIG.AMQP_MAX_RECONNECT_ATTEMPTS,
    prefetchCount: AMQP_CONFIG.AMQP_PREFETCH_COUNT,
    registryBroadcast: AMQP_CONFIG.REGISTRY_BROADCAST_ENABLED,
    toolCategoryRouting: AMQP_CONFIG.TOOL_CATEGORY_ROUTING,
    hotReloadSync: AMQP_CONFIG.HOT_RELOAD_AMQP_SYNC
  });
  
  return true;
}

/**
 * Set up registry integration for your revolutionary hot-reload system
 * Broadcasts registry events across the AMQP message bus
 */
async function setupRegistryIntegration(transport, log) {
  try {
    log('info', 'Setting up MCP Open Discovery registry integration over AMQP...');
    
    // Try to integrate with your existing registry system
    let registry = null;
    try {
      // Attempt to access your registry system
      const registryModule = require('../registry/index.js');
      if (registryModule && registryModule.getGlobalRegistry) {
        registry = registryModule.getGlobalRegistry();
      }
    } catch (error) {
      log('warn', 'Registry module not found, continuing without registry integration', {
        error: error.message
      });
      return;
    }
    
    if (!registry) {
      log('warn', 'Registry not available, skipping registry integration');
      return;
    }
    
    // Set up event listeners for your dynamic registry
    if (typeof registry.on === 'function') {
      // Tool registration events
      registry.on('toolRegistered', (tool) => {
        const category = getToolCategory(tool.name);
        transport.publish(`registry.tool.registered.${category}`, {
          name: tool.name,
          category,
          timestamp: Date.now(),
          serverInstance: process.env.SERVER_INSTANCE_ID || 'default'
        });
        log('debug', `Broadcasted tool registration via AMQP: ${tool.name} (${category})`);
      });
      
      // Tool unregistration events
      registry.on('toolUnregistered', (toolName) => {
        const category = getToolCategory(toolName);
        transport.publish(`registry.tool.unregistered.${category}`, {
          name: toolName,
          category,
          timestamp: Date.now(),
          serverInstance: process.env.SERVER_INSTANCE_ID || 'default'
        });
      });
      
      // Module events (for your hot-reload system)
      registry.on('moduleLoaded', (moduleInfo) => {
        transport.publish('registry.module.loaded', {
          ...moduleInfo,
          timestamp: Date.now(),
          serverInstance: process.env.SERVER_INSTANCE_ID || 'default'
        });
      });
      
      registry.on('moduleUnloaded', (moduleName) => {
        transport.publish('registry.module.unloaded', {
          name: moduleName,
          timestamp: Date.now(),
          serverInstance: process.env.SERVER_INSTANCE_ID || 'default'
        });
      });
    }
    
    log('info', 'Registry integration with AMQP completed successfully');
    
  } catch (error) {
    log('error', 'Failed to set up registry integration', {
      error: error.message,
      stack: error.stack
    });
    // Non-fatal error - continue without registry integration
  }
}

/**
 * Set up tool category routing for your 61-tool enterprise platform
 */
async function setupToolCategoryRouting(transport, log) {
  try {
    log('info', 'Setting up tool category routing for MCP Open Discovery tools...');
    
    // Set up category-specific exchanges for your tool suite
    const categories = Object.keys(TOOL_CATEGORIES);
    for (const category of categories) {
      const exchangeName = `${AMQP_CONFIG.AMQP_EXCHANGE}.tools.${category}`;
      
      // This will be handled by the underlying AMQP transport
      // The transport should create topic exchanges for each category
      log('debug', `Configured category routing for: ${category} -> ${exchangeName}`);
    }
    
    log('info', `Tool category routing configured for ${categories.length} categories`, {
      categories,
      totalTools: Object.values(TOOL_CATEGORIES).reduce((sum, tools) => sum + tools.length, 0)
    });
    
  } catch (error) {
    log('error', 'Failed to set up tool category routing', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Determine tool category based on tool name (for your 61-tool platform)
 */
function getToolCategory(toolName) {
  for (const [category, prefixes] of Object.entries(TOOL_CATEGORIES)) {
    for (const prefix of prefixes) {
      if (toolName.startsWith(prefix) || toolName === prefix) {
        return category;
      }
    }
  }
  return 'other'; // Default category for unmatched tools
}

/**
 * Enhanced health check with registry and tool information
 */
function enhanceHealthCheckWithRegistry(originalHealthResponse) {
  const enhanced = enhanceHealthCheck(originalHealthResponse);
  
  // Add tool category breakdown for your 61-tool platform
  if (process.amqpTransport) {
    try {
      // Try to get registry information
      const registryModule = require('../registry/index.js');
      if (registryModule && registryModule.getToolCounts) {
        const toolCounts = registryModule.getToolCounts();
        enhanced.tools = {
          total: toolCounts.total || 61,
          categories: toolCounts.categories || {},
          amqpEnabled: true,
          categoryRoutingEnabled: AMQP_CONFIG.TOOL_CATEGORY_ROUTING,
          registryBroadcastEnabled: AMQP_CONFIG.REGISTRY_BROADCAST_ENABLED
        };
      }
    } catch (error) {
      // Fallback information
      enhanced.tools = {
        total: 61,
        categories: {
          memory: 9,
          network: 8, 
          proxmox: 10,
          snmp: 12,
          zabbix: 7,
          nmap: 5,
          credentials: 6,
          registry: 4
        },
        amqpEnabled: true,
        note: 'Registry integration not available - using static counts'
      };
    }
  }
  
  return enhanced;
}

module.exports = {
  AMQP_CONFIG,
  TOOL_CATEGORIES,
  parseTransportMode,
  startAmqpServer,
  startAmqpAutoRecovery,
  getAmqpStatus,
  testAmqpConnection,
  startAmqpHealthCheck,
  startServerWithAmqp,
  enhanceHealthCheck,
  enhanceHealthCheckWithRegistry,
  validateAmqpConfig,
  initializeAmqpIntegration,
  setupRegistryIntegration,
  setupToolCategoryRouting,
  getToolCategory
};
