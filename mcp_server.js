#!/usr/bin/env node

const { spawn } = require('child_process');
const { promisify } = require('util');

class BusyboxNetworkMCPServer {
  constructor() {
    this.tools = new Map();
    this.maxOutputSize = 1024 * 1024; // 1MB limit
    this.commandTimeout = 30000; // 30 second timeout
    
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
            host: { type: 'string', required: true },
            count: { type: 'number', default: 4, minimum: 1, maximum: 10 },
            timeout: { type: 'number', default: 5, minimum: 1, maximum: 30 }
          },
          required: ['host']
        },
        command: (args) => [
          'ping', 
          '-c', String(Math.min(args.count || 4, 10)),
          '-W', String(Math.min(args.timeout || 5, 30)),
          this.sanitizeHost(args.host)
        ]
      },
      {
        name: 'wget',
        description: 'Download files from web servers',
        schema: {
          type: 'object',
          properties: {
            url: { type: 'string', required: true },
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
            domain: { type: 'string', required: true },
            server: { type: 'string' },
            type: { type: 'string', enum: ['A', 'AAAA', 'MX', 'NS', 'TXT', 'PTR'], default: 'A' }
          },
          required: ['domain']
        },
        command: (args) => {
          const cmd = ['nslookup'];
          if (args.type && args.type !== 'A') {
            cmd.push('-type=' + args.type);
          }
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
            tcp: { type: 'boolean', default: false },
            udp: { type: 'boolean', default: false }
          }
        },
        command: (args) => {
          const cmd = ['netstat'];
          if (args.listening) cmd.push('-l');
          if (args.numeric) cmd.push('-n');
          if (args.tcp) cmd.push('-t');
          if (args.udp) cmd.push('-u');
          return cmd;
        }
      },
      {
        name: 'telnet',
        description: 'Test TCP connectivity to specific ports',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string', required: true },
            port: { type: 'number', required: true, minimum: 1, maximum: 65535 }
          },
          required: ['host', 'port']
        },
        command: (args) => [
          'timeout', '10',  // 10 second timeout for telnet
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
        timeout: this.commandTimeout,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > this.maxOutputSize) {
          child.kill('SIGTERM');
          reject(new Error('Output size limit exceeded'));
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > this.maxOutputSize) {
          child.kill('SIGTERM');
          reject(new Error('Error output size limit exceeded'));
        }
      });

      child.on('close', (code) => {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Handle timeout
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          reject(new Error('Command timeout'));
        }
      }, this.commandTimeout);
    });
  }

  // MCP Protocol handlers
  async handleListTools() {
    return {
      tools: Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.schema
      }))
    };
  }

  async handleCallTool(name, arguments_) {
    try {
      const result = await this.executeNetworkCommand(name, arguments_);
      
      return {
        content: [{
          type: 'text',
          text: result.success ? result.output : `Error: ${result.error}`
        }],
        isError: !result.success
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Execution error: ${error.message}`
        }],
        isError: true
      };
    }
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
            let response;

            switch (request.method) {
              case 'tools/list':
                response = await this.handleListTools();
                break;
              case 'tools/call':
                response = await this.handleCallTool(request.params.name, request.params.arguments);
                break;
              default:
                response = { error: 'Unknown method' };
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      } else {
        res.writeHead(405);
        res.end('Method not allowed');
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