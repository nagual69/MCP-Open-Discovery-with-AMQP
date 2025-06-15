#!/usr/bin/env node

/**
 * MCP Open Discovery Server - Modular Version
 * 
 * This is a refactored version of the MCP Open Discovery Server
 * that uses a modular approach to load tool definitions.
 */

class MCPOpenDiscoveryServer {
  constructor() {
    this.tools = new Map();
    this.maxOutputSize = 1024 * 1024; // 1MB limit
    this.commandTimeout = 300000; // 5 minutes (300,000 ms)
    this.roots = [];
    this.activeCommands = new Map();
    this.ciMemory = {}; // In-memory CMDB store
  }

  /**
   * Initialize the server by loading all tool modules
   */
  async initialize() {
    try {
      const moduleLoader = require('./tools/module_loader');
      await moduleLoader.loadAllModules(this, { ciMemory: this.ciMemory });
      console.log(`[MCP] Server initialized with ${this.tools.size} tools`);
    } catch (error) {
      console.error(`[MCP] Error initializing server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sanitize a hostname or IP address to prevent command injection
   * @param {string} host - The hostname or IP to sanitize
   * @returns {string} Sanitized hostname or IP
   */
  sanitizeHost(host) {
    if (!host || typeof host !== 'string') {
      throw new Error('Invalid host: Must be a non-empty string');
    }
    
    // Basic validation for hostnames and IP addresses
    // Remove anything that's not alphanumeric, dots, dashes, or colons (for IPv6)
    let sanitized = host.replace(/[^\w.\-:]/g, '');
    
    if (!sanitized) {
      throw new Error('Invalid host: Sanitization resulted in an empty string');
    }
    
    return sanitized;
  }

  /**
   * Sanitize a URL to prevent command injection
   * @param {string} url - The URL to sanitize
   * @returns {string} Sanitized URL
   */
  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL: Must be a non-empty string');
    }
    
    try {
      // Attempt to parse the URL to validate it
      const parsedUrl = new URL(url);
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid URL protocol: Only HTTP and HTTPS are supported');
      }
      return url;
    } catch (error) {
      throw new Error(`Invalid URL: ${error.message}`);
    }
  }

  /**
   * Sanitize a network interface name to prevent command injection
   * @param {string} iface - The interface name to sanitize
   * @returns {string} Sanitized interface name
   */
  sanitizeInterface(iface) {
    if (!iface || typeof iface !== 'string') {
      throw new Error('Invalid interface: Must be a non-empty string');
    }
    
    // Only allow alphanumeric characters, dots, dashes, and underscores
    let sanitized = iface.replace(/[^\w.\-_]/g, '');
    
    if (!sanitized) {
      throw new Error('Invalid interface: Sanitization resulted in an empty string');
    }
    
    return sanitized;
  }

  /**
   * Execute a command for a specific tool
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} args - Arguments for the tool
   * @param {string} requestId - Unique request identifier
   * @returns {Promise<Array|string>} Command output
   */
  async executeNetworkCommand(toolName, args, requestId) {
    if (!this.tools.has(toolName)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const tool = this.tools.get(toolName);

    try {
      // Validate args against schema if schema is defined
      if (tool.schema) {
        this.validateArgs(args, tool.schema);
      }

      // Execute the command
      const commandResult = tool.command(args, requestId);
      
      // Handle async command functions (like memory or Proxmox tools)
      if (commandResult instanceof Promise) {
        return await commandResult;
      }
      
      // Handle standard command arrays
      if (Array.isArray(commandResult)) {
        return await this.runCommand(commandResult, requestId);
      }
      
      return commandResult;
    } catch (error) {
      console.error(`[MCP] Error executing ${toolName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate arguments against a JSON schema
   * @param {Object} args - Arguments to validate
   * @param {Object} schema - JSON schema
   */
  validateArgs(args, schema) {
    // Simple validation for required fields
    if (schema.required) {
      for (const required of schema.required) {
        if (args[required] === undefined) {
          throw new Error(`Missing required argument: ${required}`);
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (args[key] !== undefined) {
          // Type validation
          if (propSchema.type === 'number' && typeof args[key] !== 'number') {
            throw new Error(`Argument ${key} must be a number`);
          } else if (propSchema.type === 'boolean' && typeof args[key] !== 'boolean') {
            throw new Error(`Argument ${key} must be a boolean`);
          } else if (propSchema.type === 'string' && typeof args[key] !== 'string') {
            throw new Error(`Argument ${key} must be a string`);
          } else if (propSchema.type === 'object' && typeof args[key] !== 'object') {
            throw new Error(`Argument ${key} must be an object`);
          } else if (propSchema.type === 'array' && !Array.isArray(args[key])) {
            throw new Error(`Argument ${key} must be an array`);
          }

          // Validate enum
          if (propSchema.enum && !propSchema.enum.includes(args[key])) {
            throw new Error(`Argument ${key} must be one of: ${propSchema.enum.join(', ')}`);
          }

          // Validate min/max for numbers
          if (propSchema.type === 'number') {
            if (propSchema.minimum !== undefined && args[key] < propSchema.minimum) {
              throw new Error(`Argument ${key} must be >= ${propSchema.minimum}`);
            }
            if (propSchema.maximum !== undefined && args[key] > propSchema.maximum) {
              throw new Error(`Argument ${key} must be <= ${propSchema.maximum}`);
            }
          }
        }
      }
    }
  }

  /**
   * Run a shell command
   * @param {Array} commandArray - Command and arguments to execute
   * @param {string} requestId - Unique request identifier
   * @returns {Promise<string>} Command output
   */
  runCommand(commandArray, requestId) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const command = commandArray[0];
      const args = commandArray.slice(1);
      
      console.log(`[MCP] Running command: ${command} ${args.join(' ')}`);
      
      const process = spawn(command, args);
      let output = '';
      let errorOutput = '';
      
      // Store in active commands map
      this.activeCommands.set(requestId, process);
      
      // Set timeout
      const timeout = setTimeout(() => {
        console.log(`[MCP] Command timed out: ${command} ${args.join(' ')}`);
        process.kill();
        reject(new Error(`Command timed out after ${this.commandTimeout / 1000} seconds`));
      }, this.commandTimeout);
      
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Check if output exceeds maximum size
        if (output.length > this.maxOutputSize) {
          console.log(`[MCP] Command output exceeded maximum size: ${command} ${args.join(' ')}`);
          process.kill();
          reject(new Error(`Command output exceeded maximum size of ${this.maxOutputSize / 1024}KB`));
        }
      });
      
      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        
        // Also add stderr to the output
        output += chunk;
        
        // Check if output exceeds maximum size
        if (output.length > this.maxOutputSize) {
          console.log(`[MCP] Command output exceeded maximum size: ${command} ${args.join(' ')}`);
          process.kill();
          reject(new Error(`Command output exceeded maximum size of ${this.maxOutputSize / 1024}KB`));
        }
      });
      
      process.on('close', (code) => {
        // Remove from active commands
        this.activeCommands.delete(requestId);
        
        // Clear timeout
        clearTimeout(timeout);
        
        if (code !== 0) {
          console.log(`[MCP] Command failed with code ${code}: ${command} ${args.join(' ')}`);
          reject(new Error(`Command failed with code ${code}: ${errorOutput || 'No error output'}`));
        } else {
          resolve(output);
        }
      });
      
      process.on('error', (error) => {
        // Remove from active commands
        this.activeCommands.delete(requestId);
        
        // Clear timeout
        clearTimeout(timeout);
        
        console.log(`[MCP] Command error: ${error.message}`);
        reject(error);
      });
    });
  }
}

// Export the server class
module.exports = MCPOpenDiscoveryServer;

// Create and initialize the server if this is the main module
if (require.main === module) {
  const http = require('http');
  const server = new MCPOpenDiscoveryServer();
  
  server.initialize().then(() => {
    // Start HTTP server
    const httpServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');

      console.log(`[MCP] ${req.method} ${req.url}`);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/health' && (req.method === 'GET' || req.method === 'POST')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', tools: server.tools.size }));
        return;
      }
      
      if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'MCP Open Discovery Server (Modular) is running' }));
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          let request;          try {
            request = JSON.parse(body);
            console.log(`Received request method: ${request.method}`);
            if (request.params) console.log(`Request params: ${JSON.stringify(request.params)}`);

            // Handle notifications first (they don't have 'id' or expect a JSON-RPC response body)
            if (request.id === undefined) {
              if (request.method === 'notifications/cancelled') {
                // Handle notification if needed in the future
                res.writeHead(204); // No Content
                res.end();
                return;
              } else if (request.method === 'notifications/initialized') {
                console.log('Received notifications/initialized from client.');
                res.writeHead(204); // No Content
                res.end();
                return;
              } else {
                console.error(`Unhandled notification: ${request.method}`);
                res.writeHead(204); // No Content for other unhandled notifications
                res.end();
                return;
              }
            }            // For JSON-RPC calls that expect a response (have an 'id')
            let response = { jsonrpc: "2.0", id: request.id };

            try {
              if (!request.jsonrpc || !request.method) {
                response.error = { code: -32600, message: 'Invalid Request: missing jsonrpc or method property' };
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
                return;
              }              if (request.method === 'initialize') {
                // Handle client initialization
                const clientProtocolVersion = request.params.protocolVersion;
                const serverProtocolVersion = "2025-03-26";
                console.log(`Client offered protocolVersion: ${clientProtocolVersion}, Server selected: ${serverProtocolVersion}`);
                
                response.result = {
                  protocolVersion: serverProtocolVersion,
                  serverInfo: {
                    name: "MCP Open Discovery Server (Modular)",
                    version: "1.0.0",
                    capabilities: { supportsToolCalls: true, supportsStreaming: false }
                  },
                  capabilities: {
                    tools: { list: true, call: true, config: true, listChanged: false },
                    status: { read: true },
                    version: { read: true },
                    servers: { list: true, info: true, listChanged: false },
                    roots: { set: true, listChanged: false },
                    memory: { get: true, set: true, merge: true, query: true }
                  }
                };
              } else if (request.method === 'server/info') {
                response.result = {
                  name: "MCP Open Discovery Server (Modular)",
                  version: "1.0.0",
                  tools: Array.from(server.tools.keys())
                };              } else if (request.method === 'tools/list') {
                const toolsList = Array.from(server.tools.values()).map(tool => ({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: tool.schema 
                }));
                console.log(`Returning ${toolsList.length} tools to client (using inputSchema)`);
                response.result = {
                  tools: toolsList
                };
                  } else if (request.method === 'tools/call') {
                const toolName = request.params.name;
                const toolArgs = request.params.arguments || {};
                const requestId = request.id;
                
                if (!server.tools.has(toolName)) {
                  response.error = {
                    code: -32601,
                    message: `Tool not found: ${toolName}`
                  };                } else {                  try {
                    const tool = server.tools.get(toolName);
                    const result = await server.executeNetworkCommand(toolName, toolArgs, requestId);
                    // Format according to MCP specification
                    response.result = {
                      content: [
                        {
                          type: "text",
                          text: result
                        }
                      ]
                    };
                  } catch (error) {
                    response.error = {
                      code: -32000,
                      message: error.message
                    };
                  }                }}else if (request.method === 'memory/get') {
                const { key } = request.params;
                if (!key) {
                  response.error = {
                    code: -32602,
                    message: "Invalid params: missing required parameter 'key'"
                  };
                } else {
                  response.result = { value: server.ciMemory[key] || null };
                }              } else if (request.method === 'memory/set') {
                const { key, value } = request.params;
                if (!key || value === undefined) {
                  response.error = {
                    code: -32602,
                    message: "Invalid params: missing required parameters 'key' or 'value'"
                  };
                } else {
                  server.ciMemory[key] = value;
                  response.result = { success: true };
                }} else if (request.method === 'memory/merge') {
                const { key, value } = request.params;
                if (!key || value === undefined) {
                  response.error = {
                    code: -32602,
                    message: "Invalid params: missing required parameters 'key' or 'value'"
                  };
                } else {
                  if (!server.ciMemory[key]) {
                    server.ciMemory[key] = {};
                  }
                  server.ciMemory[key] = { ...server.ciMemory[key], ...value };
                  response.result = { success: true };
                }              } else if (request.method === 'memory/query') {
                const { pattern } = request.params;
                const results = {};
                
                if (pattern) {
                  // Simple pattern matching (e.g., "ci:host:*")
                  const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                  for (const [key, value] of Object.entries(server.ciMemory)) {
                    if (regex.test(key)) {
                      results[key] = value;
                    }
                  }
                } else {
                  // Return all CIs
                  Object.assign(results, server.ciMemory);
                }
                
                response.result = { results };
              } else {
                response.error = {
                  code: -32601,
                  message: `Method not found: ${request.method}`
                };
              }
            } catch (error) {
              console.error(`Error processing request: ${error.message}`);
              response.error = {
                code: -32603,
                message: `Internal error: ${error.message}`
              };
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } catch (error) {
            console.error(`Error parsing JSON: ${error.message}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32700,
                message: "Parse error"
              },
              id: null
            }));
          }
        });
      } else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Method not allowed"
          },
          id: null
        }));
      }
    });

    // Start the server
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
      console.log(`[MCP] Server ready on port ${PORT}`);
    });
  }).catch(error => {
    console.error(`[MCP] Server initialization failed: ${error.message}`);
    process.exit(1);
  });
}
