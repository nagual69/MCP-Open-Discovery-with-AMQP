#!/usr/bin/env node

const { spawn } = require('child_process');
const { promisify } = require('util');

class BusyboxNetworkMCPServer {
  constructor() {
    this.tools = new Map();
    this.maxOutputSize = 1024 * 1024; // 1MB limit
    this.commandTimeout = 30000; // 30 second timeout
    this.roots = []; // Initialize empty roots array
    
    this.initializeNetworkTools();
  }

  initializeNetworkTools() {
    // Define available Busybox networking tools only
    const networkTools = [
      {
        name: 'ping',
        description: 'Send ICMP echo requests to network hosts',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string', description: "Target hostname or IP address" },
            count: { type: 'number', default: 4, minimum: 1, maximum: 10, description: "Number of packets to send (1-10)" },
            timeout: { type: 'number', default: 5, minimum: 1, maximum: 30, description: "Timeout in seconds (1-30)" },
            size: { type: 'number', default: 56, minimum: 56, maximum: 1024, description: "Packet size in bytes (56-1024)" }
          },
          required: ['host']
        },
        command: (args) => {
          // Busybox ping format: ping [-c COUNT] [-s SIZE] [-w SEC] HOST
          const cmd = ['ping'];
          
          // Number of packets to send
          cmd.push('-c', String(Math.min(args.count || 4, 10)));
          
          // Timeout in seconds
          cmd.push('-w', String(Math.min(args.timeout || 5, 30)));
          
          // Optional packet size
          if (args.size) {
            cmd.push('-s', String(Math.min(Math.max(args.size, 56), 1024)));
          }
          
          // Target host (always last parameter)
          cmd.push(this.sanitizeHost(args.host));
          
          return cmd;
        }
      },
      {
        name: 'wget',
        description: 'Download files from web servers',
        schema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            timeout: { type: 'number', default: 10, minimum: 1, maximum: 60 },
            tries: { type: 'number', default: 1, minimum: 1, maximum: 3 },
            headers_only: { type: 'boolean', default: false }
          },
          required: ['url']
        },
        command: (args) => {
          const cmd = [
            'wget', 
            '--timeout=' + Math.min(args.timeout || 10, 60),
            '--tries=' + Math.min(args.tries || 1, 3),
            '-O', '-'  // Output to stdout
          ];
          
          if (args.headers_only) {
            cmd.push('--spider', '--server-response');
          }
          
          cmd.push(this.sanitizeUrl(args.url));
          return cmd;
        }
      },
      {
        name: 'nslookup',
        description: 'Query DNS servers for domain name resolution',
        schema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            server: { type: 'string', description: "DNS server to query (optional)" },
            type: { type: 'string', enum: ['A', 'AAAA', 'MX', 'NS', 'TXT', 'PTR'], default: 'A', description: "Record type (note: BusyBox nslookup has limited record type support)" }
          },
          required: ['domain']
        },
        command: (args) => {
          const cmd = ['nslookup'];
          
          // BusyBox nslookup doesn't support type specification directly
          // For non-A records, we'll need to parse the output or consider alternative commands
          cmd.push(this.sanitizeHost(args.domain));
          
          if (args.server) {
            cmd.push(this.sanitizeHost(args.server));
          }
          
          return cmd;
        }
      },
      {
        name: 'netstat',
        description: 'Display network connections and routing tables',
        schema: {
          type: 'object',
          properties: {
            listening: { type: 'boolean', default: false },
            numeric: { type: 'boolean', default: true },
            tcp: { type: 'boolean', default: true },
            udp: { type: 'boolean', default: false },
            all: { type: 'boolean', default: false }
          }
        },
        command: (args) => {
          // BusyBox netstat has limited options compared to full netstat
          const cmd = ['netstat'];
          if (args.all) cmd.push('-a');  // all sockets
          if (args.tcp) cmd.push('-t');  // TCP sockets
          if (args.udp) cmd.push('-u');  // UDP sockets
          if (args.listening) cmd.push('-l');  // listening sockets
          if (args.numeric) cmd.push('-n');  // don't resolve names
          return cmd;
        }
      },
      {
        name: 'telnet',
        description: 'Test TCP connectivity to specific ports',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string' },
            port: { type: 'number', minimum: 1, maximum: 65535 }
          },
          required: ['host', 'port']
        },
        command: (args) => [
          'telnet',
          this.sanitizeHost(args.host), 
          String(args.port)
        ]
      },
      {
        name: 'route',
        description: 'Display or manipulate IP routing table',
        schema: {
          type: 'object',
          properties: {
            numeric: { type: 'boolean', default: true }
          }
        },
        command: (args) => {
          const cmd = ['route'];
          if (args.numeric) cmd.push('-n');
          return cmd;
        }
      },
      {
        name: 'ifconfig',
        description: 'Display network interface configuration',
        schema: {
          type: 'object',
          properties: {
            interface: { type: 'string' }
          }
        },
        command: (args) => {
          const cmd = ['ifconfig'];
          if (args.interface) {
            cmd.push(this.sanitizeInterface(args.interface));
          }
          return cmd;
        }
      },
      {
        name: 'arp',
        description: 'Display or manipulate ARP cache',
        schema: {
          type: 'object',
          properties: {
            numeric: { type: 'boolean', default: true }
          }
        },
        command: (args) => {
          const cmd = ['arp'];
          if (args.numeric) cmd.push('-n');
          return cmd;
        }
      }
    ];

    networkTools.forEach(tool => this.tools.set(tool.name, tool));
  }

  sanitizeHost(host) {
    // Basic hostname/IP validation
    if (!host || typeof host !== 'string') {
      throw new Error('Invalid host parameter');
    }
    
    // Remove potentially dangerous characters
    const sanitized = host.replace(/[^a-zA-Z0-9\.\-]/g, '');
    
    // Basic length check
    if (sanitized.length === 0 || sanitized.length > 253) {
      throw new Error('Invalid host format');
    }
    
    return sanitized;
  }

  sanitizeUrl(url) {
    // Basic URL validation for wget
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL parameter');
    }
    
    // Only allow http/https URLs
    if (!url.match(/^https?:\/\//)) {
      throw new Error('Only HTTP/HTTPS URLs are allowed');
    }
    
    return url;
  }

  sanitizeInterface(iface) {
    // Basic interface name validation
    if (!iface || typeof iface !== 'string') {
      throw new Error('Invalid interface parameter');
    }
    
    // Allow common interface patterns
    if (!iface.match(/^[a-zA-Z0-9]+$/)) {
      throw new Error('Invalid interface name format');
    }
    
    return iface;
  }

  async executeNetworkCommand(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    try {
      const command = tool.command(args);
      const result = await this.runCommand(command);
      
      return {
        success: true,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.code
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        exitCode: error.code || 1
      };
    }
  }

  runCommand(args) {
    return new Promise((resolve, reject) => {
      const child = spawn(args[0], args.slice(1), {
        stdio: 'pipe',
        // Not using built-in timeout to manage it ourselves
      });

      let stdout = '';
      let stderr = '';
      let killed = false;
      
      // Set up the timeout
      const timeoutId = setTimeout(() => {
        if (!child.killed) {
          killed = true;
          child.kill('SIGTERM');
          reject(new Error('Command execution timed out after ' + (this.commandTimeout/1000) + ' seconds'));
        }
      }, this.commandTimeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > this.maxOutputSize) {
          if (!killed) {
            killed = true;
            clearTimeout(timeoutId);
            child.kill('SIGTERM');
            reject(new Error('Output size limit exceeded'));
          }
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > this.maxOutputSize) {
          if (!killed) {
            killed = true;
            clearTimeout(timeoutId);
            child.kill('SIGTERM');
            reject(new Error('Error output size limit exceeded'));
          }
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        if (!killed) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        if (!killed) {
          reject(error);
        }
      });
    });
  }

  // MCP Protocol handlers
  async handleListTools() {
    const toolsList = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema
    }));
    
    console.log(`Returning ${toolsList.length} tools to client`);
    
    // MCP spec: only 'tools' property, no 'result'
    return {
      tools: toolsList
    };
  }

  async handleCallTool(name, arguments_) {
    try {
      const result = await this.executeNetworkCommand(name, arguments_);
      
      // Ensure we always have text content, even if empty
      const outputText = result.success 
        ? (result.output || "Command executed successfully, but returned no output.")
        : `Error: ${result.error || "Unknown error"}`;
      
      // Format according to MCP specification
      return {
        content: [{
          type: 'text',
          text: outputText
        }],
        isError: !result.success,
        result: result.success ? 'success' : 'error'
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Execution error: ${error.message || "Unknown error occurred"}`
        }],
        isError: true,
        result: 'error'
      };
    }
  }
  
  async handleStatus() {
    return {
      status: "ready",
      serverName: "Busybox Network MCP Server",
      capabilities: {
        supportsToolCalls: true,
        supportsStreaming: false
      }
    };
  }
  
  async handleVersion() {
    // Only return version and protocolVersion, not jsonrpc
    return {
      version: "1.0.0",
      protocolVersion: "1.0.0"
    };
  }

  async handleServersList() {
    return {
      servers: [
        {
          id: "busybox-network",
          name: "Busybox Network Tools",
          status: "ready",
          description: "Network diagnostic tools powered by Busybox"
        }
      ]
    };
  }

  async handleServerInfo() {
    return {
      server: {
        id: "busybox-network",
        name: "Busybox Network Tools",
        version: "1.0.0",
        status: "ready",
        description: "Network diagnostic tools powered by Busybox",
        capabilities: {
          supportsToolCalls: true,
          supportsStreaming: false
        }
      }
    };
  }

  async handleSetRoots(roots) {
    // Store the provided roots
    this.roots = roots || [];
    
    console.log(`Received ${this.roots.length} roots from client:`, JSON.stringify(this.roots));
    
    return {
      result: "success"
    };
  }
  
  async handleToolsConfig() {
    return {
      config: {
        confirmBeforeInvoke: true,
        streaming: false
      }
    };
  }

  // HTTP server for MCP over HTTP transport
  startServer(port = 3000) {
    const http = require('http');
    
    const server = http.createServer(async (req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check endpoint
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', tools: this.tools.size }));
        return;
      }

      // MCP endpoints
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const request = JSON.parse(body);
            let response = {
              jsonrpc: "2.0"
            };
            
            // Log incoming requests for debugging
            console.log(`Received request method: ${request.method}`);
            if (request.params) {
              console.log(`Request params: ${JSON.stringify(request.params)}`);
            }
            
            // Validate the request format
            if (!request.jsonrpc) {
              throw new Error('Invalid JSON-RPC request: missing jsonrpc field');
            }
            
            if (!request.method) {
              throw new Error('Invalid JSON-RPC request: missing method field');
            }
            
            // Keep the request ID in the response
            if (request.id !== undefined) {
              response.id = request.id;
            }

            switch (request.method) {
              case 'tools/list':
                console.log('Received tools/list request');
                const toolsResponse = await this.handleListTools();
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), result: toolsResponse };
                console.log(`Responding with ${toolsResponse.tools?.length || 0} tools`);
                break;
              case 'tools/call':
                if (!request.params || !request.params.name) {
                  response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), error: { 
                    code: -32602,
                    message: 'Invalid params: missing required parameter "name"', 
                    data: { expected: "name" }
                  }};
                } else {
                  const toolCallResponse = await this.handleCallTool(request.params.name, request.params.arguments || {});
                  response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), ...toolCallResponse };
                }
                break;
              case 'tools/config':
                const toolsConfigResponse = await this.handleToolsConfig();
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), ...toolsConfigResponse };
                break;
              case 'status':
                const statusResponse = await this.handleStatus();
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), ...statusResponse };
                break;
              case 'version':
                const versionResponse = await this.handleVersion();
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), ...versionResponse };
                break;
              case 'servers/list':
                const serversResponse = await this.handleServersList();
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), ...serversResponse };
                break;
              case 'servers/info':
                const serverInfoResponse = await this.handleServerInfo();
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), ...serverInfoResponse };
                break;
              case 'roots/set':
                const rootsSetResponse = await this.handleSetRoots(request.params?.roots);
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), ...rootsSetResponse };
                break;
              case 'initialize':
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), result: {
                  capabilities: {
                    supportsToolCalls: true,
                    supportsStreaming: false,
                    toolsProvider: true
                  },
                  serverInfo: {
                    name: "Busybox Network MCP Server",
                    version: "1.0.0"
                  }
                }};
                console.log('Sent initialization response with toolsProvider capability');
                break;
              default:
                console.log(`Unhandled method: ${request.method}`);
                response = { jsonrpc: "2.0", ...(request.id !== undefined ? { id: request.id } : {}), error: { 
                  code: -32601,
                  message: 'Method not found', 
                  data: { method: request.method }
                }};
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } catch (error) {
            const errorResponse = {
              jsonrpc: "2.0",
              error: {
                code: -32603, // Internal error
                message: error.message
              }
            };
            
            // Include the request ID if it was provided
            try {
              const request = JSON.parse(body);
              if (request.id !== undefined) {
                errorResponse.id = request.id;
              }
            } catch (e) {
              // Could not parse the request, cannot extract ID
            }
            
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(errorResponse));
          }
        });
      } else {
        const methodNotAllowedResponse = {
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: 'Method not allowed',
            data: { 
              allowed: ['POST', 'OPTIONS', 'GET'] 
            }
          }
        };
        res.writeHead(405, { 
          'Content-Type': 'application/json',
          'Allow': 'GET, POST, OPTIONS' 
        });
        res.end(JSON.stringify(methodNotAllowedResponse));
      }
    });

    server.listen(port, () => {
      console.log(`Busybox Network MCP Server running on port ${port}`);
      console.log(`Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
    });
  }
}

// Start the server
const server = new BusyboxNetworkMCPServer();
server.startServer(process.env.PORT || 3000);