#!/usr/bin/env node
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

// In-memory CI store for MCP memory tools
const ciMemory = new Map();

// Helper: merge new data into existing CI
function mergeCI(existing, update) {
  return { ...existing, ...update };
}

// MCP memory tool handlers
async function handleMemoryTool(method, args) {
  if (method === 'memory/get') {
    const key = args.key;
    return ciMemory.has(key) ? ciMemory.get(key) : null;
  }
  if (method === 'memory/set') {
    const key = args.key;
    ciMemory.set(key, args.data);
    return { success: true };
  }
  if (method === 'memory/merge') {
    const key = args.key;
    const existing = ciMemory.get(key) || {};
    ciMemory.set(key, mergeCI(existing, args.data));
    return { success: true };
  }
  if (method === 'memory/query') {
    // Example: find incomplete CIs (missing type or os)
    const incomplete = [];
    for (const [key, ci] of ciMemory.entries()) {
      if (!ci.type || !ci.os) incomplete.push(ci);
    }
    return { cis: incomplete };
  }
  return { error: 'Unknown memory tool method' };
}

class BusyboxNetworkMCPServer {
  constructor() {
    this.tools = new Map();
    this.maxOutputSize = 1024 * 1024; // 1MB limit
    this.commandTimeout = 300000; // 5 minutes (300,000 ms)
    this.roots = [];
    this.activeCommands = new Map();
    this.initializeNetworkTools();
  }

  initializeNetworkTools() {
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
          const cmd = ['ping'];
          cmd.push('-c', String(Math.min(args.count || 4, 10)));
          cmd.push('-w', String(Math.min(args.timeout || 5, 30)));
          if (args.size) {
            cmd.push('-s', String(Math.min(Math.max(args.size, 56), 1024)));
          }
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
      },
      {
        name: 'nmap_ping_scan',
        description: 'Nmap Ping Scan (-sn): Discovers online hosts without port scanning.',
        schema: {
          type: 'object',
          properties: {
            target: { type: 'string', description: "Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)" }
          },
          required: ['target']
        },
        command: (args) => {
          let sanitizedTarget = String(args.target);
          sanitizedTarget = sanitizedTarget.replace(/\\/g, '/');
          sanitizedTarget = sanitizedTarget.replace(/[^\w.\-\/]/g, '');
          if (!sanitizedTarget) {
            throw new Error('Invalid target specified for Nmap Ping Scan after sanitization.');
          }
          return ['nmap', '-sn', sanitizedTarget];
        }
      },
      {
        name: 'nmap_tcp_syn_scan',
        description: 'Nmap TCP SYN Scan (-sS): Stealthy scan for open TCP ports. Requires root/administrator privileges.',
        schema: {
          type: 'object',
          properties: {
            target: { type: 'string', description: "Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)" },
            ports: { type: 'string', description: "Ports to scan (e.g., '80,443', '1-1024', 'U:53,T:21-25,80'). Default is Nmap's default (usually top 1000)." },
            fast_scan: { type: 'boolean', default: false, description: "Fast mode (-F): Scan fewer ports than the default scan." },
            timing_template: {
              type: 'number',
              enum: [0, 1, 2, 3, 4, 5],
              default: 3,
              description: "Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster."
            },
            reason: { type: 'boolean', default: false, description: "Display the reason a port is in a particular state (--reason)." },
            open_only: { type: 'boolean', default: false, description: "Only show open (or possibly open) ports (--open)." }
          },
          required: ['target']
        },
        command: (args) => {
          let sanitizedTarget = String(args.target);
          sanitizedTarget = sanitizedTarget.replace(/\\/g, '/');
          sanitizedTarget = sanitizedTarget.replace(/[^\w.\-\/]/g, '');
          if (!sanitizedTarget) {
            throw new Error('Invalid target specified for Nmap TCP SYN Scan after sanitization.');
          }
          const cmd = ['nmap', '-sS', sanitizedTarget];
          if (args.ports) {
            const ports = String(args.ports).replace(/[^a-zA-Z0-9,:-]/g, '');
            if (ports) cmd.push('-p', ports);
          }
          if (args.fast_scan) {
            cmd.push('-F');
          }
          if (args.timing_template !== undefined && [0, 1, 2, 3, 4, 5].includes(args.timing_template)) {
            cmd.push(`-T${args.timing_template}`);
          }
          if (args.reason) {
            cmd.push('--reason');
          }
          if (args.open_only) {
            cmd.push('--open');
          }
          return cmd;
        }
      },
      {
        name: 'nmap_tcp_connect_scan',
        description: 'Nmap TCP Connect Scan (-sT): Scans for open TCP ports using the connect() system call. Does not require special privileges.',
        schema: {
          type: 'object',
          properties: {
            target: { type: 'string', description: "Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)" },
            ports: { type: 'string', description: "Ports to scan (e.g., '80,443', '1-1024'). Default is Nmap's default (usually top 1000)." },
            timing_template: {
              type: 'number',
              enum: [0, 1, 2, 3, 4, 5],
              default: 3,
              description: "Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster."
            },
            reason: { type: 'boolean', default: false, description: "Display the reason a port is in a particular state (--reason)." },
            open_only: { type: 'boolean', default: false, description: "Only show open (or possibly open) ports (--open)." }
          },
          required: ['target']
        },
        command: (args) => {
          let sanitizedTarget = String(args.target);
          sanitizedTarget = sanitizedTarget.replace(/\\/g, '/');
          sanitizedTarget = sanitizedTarget.replace(/[^\w.\-\/]/g, '');
          if (!sanitizedTarget) {
            throw new Error('Invalid target specified for Nmap TCP Connect Scan after sanitization.');
          }
          const cmd = ['nmap', '-sT', sanitizedTarget];
          if (args.ports) {
            const ports = String(args.ports).replace(/[^a-zA-Z0-9,:-]/g, ''); 
            if (ports) cmd.push('-p', ports);
          }
          if (args.timing_template !== undefined && [0, 1, 2, 3, 4, 5].includes(args.timing_template)) {
            cmd.push(`-T${args.timing_template}`);
          }
          if (args.reason) {
            cmd.push('--reason');
          }
          if (args.open_only) {
            cmd.push('--open');
          }
          return cmd;
        }
      },
      {
        name: 'nmap_udp_scan',
        description: 'Nmap UDP Scan (-sU): Scans for open UDP ports. Can be very slow as UDP is connectionless.',
        schema: {
          type: 'object',
          properties: {
            target: { type: 'string', description: "Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)" },
            ports: { type: 'string', description: "Ports to scan (e.g., 'U:53,161', '1-1024'). Default is Nmap's default for UDP (often common UDP ports)." },
            top_ports: { type: 'number', description: "Scan the <number> most common UDP ports (--top-ports <number>). Cannot be used with 'ports'."},
            timing_template: {
              type: 'number',
              enum: [0, 1, 2, 3, 4, 5],
              default: 3,
              description: "Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster."
            },
            reason: { type: 'boolean', default: false, description: "Display the reason a port is in a particular state (--reason)." },
            open_only: { type: 'boolean', default: false, description: "Only show open (or possibly open) ports (--open)." }
          },
          required: ['target']
        },
        command: (args) => {
          let sanitizedTarget = String(args.target);
          sanitizedTarget = sanitizedTarget.replace(/\\/g, '/');
          sanitizedTarget = sanitizedTarget.replace(/[^\w.\-\/]/g, '');
          if (!sanitizedTarget) {
            throw new Error('Invalid target specified for Nmap UDP Scan after sanitization.');
          }
          const cmd = ['nmap', '-sU', sanitizedTarget];
          if (args.ports && args.top_ports) {
            throw new Error("Cannot specify both 'ports' and 'top_ports' for Nmap UDP Scan.");
          }
          if (args.ports) {
            const ports = String(args.ports).replace(/[^a-zA-Z0-9,:-]/g, ''); 
            if (ports) cmd.push('-p', ports);
          } else if (args.top_ports) {
            const topPorts = parseInt(args.top_ports, 10);
            if (Number.isInteger(topPorts) && topPorts > 0) {
              cmd.push('--top-ports', String(topPorts));
            } else {
              throw new Error("Invalid 'top_ports' value. Must be a positive integer.");
            }
          }
          if (args.timing_template !== undefined && [0, 1, 2, 3, 4, 5].includes(args.timing_template)) {
            cmd.push(`-T${args.timing_template}`);
          }
          if (args.reason) {
            cmd.push('--reason');
          }
          if (args.open_only) {
            cmd.push('--open');
          }
          return cmd;
        }
      },
      {
        name: 'nmap_version_scan',
        description: 'Nmap Version Detection (-sV): Probes open ports to determine service/version info.',
        schema: {
          type: 'object',
          properties: {
            target: { type: 'string', description: "Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)" },
            ports: { type: 'string', description: "Ports to scan (e.g., '80,443', '1-1024'). Default is Nmap's default (usually top 1000 TCP and UDP)." },
            intensity: {
              type: 'number',
              enum: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
              default: 7,
              description: "Version scan intensity (--version-intensity <0-9>): Higher is more likely to identify services but takes longer. Default 7."
            },
            light_mode: { type: 'boolean', default: false, description: "Enable light mode (--version-light): Faster, less comprehensive version scan. Alias for --version-intensity 2." },
            all_ports: { type: 'boolean', default: false, description: "Try all probes for every port (--version-all): Slower, more comprehensive. Alias for --version-intensity 9." },
            timing_template: {
              type: 'number',
              enum: [0, 1, 2, 3, 4, 5],
              default: 3,
              description: "Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster."
            },
            reason: { type: 'boolean', default: false, description: "Display the reason a port is in a particular state (--reason)." },
            open_only: { type: 'boolean', default: false, description: "Only show open (or possibly open) ports (--open)." }
          },
          required: ['target']
        },
        command: (args) => {
          let sanitizedTarget = String(args.target);
          sanitizedTarget = sanitizedTarget.replace(/\\/g, '/');
          sanitizedTarget = sanitizedTarget.replace(/[^\w.\-\/]/g, '');
          if (!sanitizedTarget) {
            throw new Error('Invalid target specified for Nmap Version Scan after sanitization.');
          }
          const cmd = ['nmap', '-sV', sanitizedTarget];
          if (args.ports) {
            const ports = String(args.ports).replace(/[^a-zA-Z0-9,:-]/g, '');
            if (ports) cmd.push('-p', ports);
          }
          if (args.light_mode && args.all_ports) {
            throw new Error("Cannot specify both 'light_mode' and 'all_ports'. Choose one or set intensity directly.");
          }
          if (args.light_mode) {
            cmd.push('--version-light');
          } else if (args.all_ports) {
            cmd.push('--version-all');
          } else if (args.intensity !== undefined && args.intensity >= 0 && args.intensity <= 9) {
            cmd.push('--version-intensity', String(args.intensity));
          }

          if (args.timing_template !== undefined && [0, 1, 2, 3, 4, 5].includes(args.timing_template)) {
            cmd.push(`-T${args.timing_template}`);
          }
          if (args.reason) {
            cmd.push('--reason');
          }
          if (args.open_only) {
            cmd.push('--open');
          }
          return cmd;
        }
      }
    ];

    networkTools.forEach(tool => this.tools.set(tool.name, tool));
  }

  sanitizeHost(host) {
    if (!host || typeof host !== 'string') {
      throw new Error('Invalid host parameter');
    }
    const sanitized = host.replace(/[^a-zA-Z0-9.\-]/g, '');
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
    if (!iface || typeof iface !== 'string') {
      throw new Error('Invalid interface parameter');
    }
    if (!iface.match(/^[a-zA-Z0-9\-]+$/)) {
      throw new Error('Invalid interface name format');
    }
    return iface;
  }

  async executeNetworkCommand(toolName, args, requestId) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
        isError: true,
        exitCode: -1
      };
    }

    try {
      const commandArray = tool.command(args);
      console.log(`[${requestId || 'NO_REQ_ID'}] Executing command: ${commandArray.join(' ')}`);
      const result = await this.runCommand(commandArray, requestId);
      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
        isError: false
      };
    } catch (error) {
      console.error(`[${requestId || 'NO_REQ_ID'}] Error executing ${toolName}:`, error.message);
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code !== undefined ? error.code : 1,
        isError: true
      };
    }
  }

  runCommand(commandArray, requestId) {
    return new Promise((resolve, reject) => {
      const commandName = commandArray[0];
      const commandArgs = commandArray.slice(1);
      const child = spawn(commandName, commandArgs, { stdio: 'pipe' });
      let timeoutId;

      if (requestId) {
        timeoutId = setTimeout(() => {
          if (this.activeCommands.has(requestId)) {
            console.log(`[${requestId}] Command timed out. Killing process.`);
            child.kill('SIGTERM');
            setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 2000);
          }
        }, this.commandTimeout);
        this.activeCommands.set(requestId, { process: child, timeoutId });
      }

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > this.maxOutputSize) {
          if (requestId && this.activeCommands.has(requestId)) clearTimeout(this.activeCommands.get(requestId).timeoutId);
          child.kill('SIGTERM');
          const err = new Error('Output size limit exceeded for stdout');
          err.stdout = stdout.substring(0, 1024) + "... (truncated)";
          err.stderr = stderr;
          err.code = -2;
          if (requestId) this.activeCommands.delete(requestId);
          reject(err);
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > this.maxOutputSize) {
          if (requestId && this.activeCommands.has(requestId)) clearTimeout(this.activeCommands.get(requestId).timeoutId);
          child.kill('SIGTERM');
          const err = new Error('Output size limit exceeded for stderr');
          err.stdout = stdout;
          err.stderr = stderr.substring(0, 1024) + "... (truncated)";
          err.code = -3;
          if (requestId) this.activeCommands.delete(requestId);
          reject(err);
        }
      });

      child.on('close', (code) => {
        if (requestId && this.activeCommands.has(requestId)) {
          clearTimeout(this.activeCommands.get(requestId).timeoutId);
          this.activeCommands.delete(requestId);
        }
        console.log(`[${requestId || 'NO_REQ_ID'}] Command exited with code ${code}. Stdout length: ${stdout.length}, Stderr length: ${stderr.length}`);
        if (code === 0) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        } else {
          const err = new Error(`Command failed with exit code ${code}`);
          err.stdout = stdout.trim();
          err.stderr = stderr.trim();
          err.code = code;
          reject(err);
        }
      });

      child.on('error', (error) => {
        if (requestId && this.activeCommands.has(requestId)) {
          clearTimeout(this.activeCommands.get(requestId).timeoutId);
          this.activeCommands.delete(requestId);
        }
        console.error(`[${requestId || 'NO_REQ_ID'}] Spawn error for command ${commandName}:`, error);
        error.stdout = stdout.trim();
        error.stderr = stderr.trim();
        reject(error);
      });
    });
  }

  async handleListTools() {
    const toolsList = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema 
    }));
    console.log(`Returning ${toolsList.length} tools to client (using inputSchema)`);
    return {
      tools: toolsList
    };
  }

  async handleCallTool(methodName, params) {
    const requestId = params._meta && params._meta.progressToken;
    console.log(`[${requestId || 'NO_REQ_ID'}] Handling tool call: ${methodName} with args:`, params.arguments);

    try {
      const result = await this.executeNetworkCommand(methodName, params.arguments, requestId);
      let outputText = '';
      let isError = !result.success;

      if (result.success) {
        outputText = result.stdout || '';
        if (result.stderr) {
          if (outputText.length < 150 && result.stderr.length > 0) {
            outputText = `Stdout:\n${outputText}\n\nStderr:\n${result.stderr}`;
          } else if (!outputText && result.stderr.length > 0) {
            outputText = `Stderr:\n${result.stderr}`;
          } else if (outputText && result.stderr.length > 0 && 
                     (result.stderr.includes("Nmap scan report") || 
                      result.stderr.includes("Host is up") || 
                      result.stderr.includes("Failed to resolve"))) {
            outputText += `\n\n--- Stderr ---\n${result.stderr}`;
          }
        }
        if (!outputText && !result.stderr) {
          outputText = "Command executed successfully, but returned no output.";
        }
      } else {
        isError = true;
        outputText = `Error (Exit Code: ${result.exitCode}): ${result.error || 'Unknown execution error'}`;
        if (result.stdout) outputText += `\nStdout:\n${result.stdout}`;
        if (result.stderr && result.stderr !== result.error) outputText += `\nStderr:\n${result.stderr}`;
      }
      
      console.log(`[${requestId || 'NO_REQ_ID'}] Tool call ${methodName} result. isError: ${isError}, Output length: ${outputText.length}`);

      return {
        content: [{
          type: 'text',
          text: outputText.substring(0, this.maxOutputSize)
        }],
        isError: isError,
        result: isError ? 'error' : 'success'
      };

    } catch (error) {
      console.error(`[${requestId || 'NO_REQ_ID'}] Critical error in handleCallTool for ${methodName}:`, error);
      return {
        content: [{
          type: 'text',
          text: `Critical server error during tool execution: ${error.message}`
        }],
        isError: true,
        result: 'error'
      };
    }
  }
  
  async handleStatus() {
    return {
      status: "ready"
    };
  }
  
  async handleVersion() {
    return {
      version: "1.0.0",
      protocolVersion: "1.0.0" // Match client's expectation or define your server's supported version
    };
  }
  
  async handleInitialize(params) {
    const clientProtocolVersion = params.protocolVersion;
    const serverProtocolVersion = "2025-03-26";
    console.log(`Client offered protocolVersion: ${clientProtocolVersion}, Server selected: ${serverProtocolVersion}`);
    const response = {
      protocolVersion: serverProtocolVersion,
      serverInfo: {
        name: "Busybox Network MCP Server",
        version: "1.0.0",
        capabilities: { supportsToolCalls: true, supportsStreaming: false }
      },
      capabilities: {
        tools: { list: true, call: true, config: true, listChanged: false },
        status: { read: true },
        version: { read: true },
        servers: { list: true, info: true, listChanged: false },
        roots: { set: true, listChanged: false }
      }
    };
    console.log("Initialize response (capabilities simplified for diagnostics):", JSON.stringify(response, null, 2));
    return response;
  }

  async handleNotificationsInitialized() {
    console.log("Received notifications/initialized from client.");
  }

  async handleNotificationsCancelled(params) {
    const { requestId, reason } = params;
    console.log(`[${requestId}] Received cancellation request. Reason: ${reason || 'No reason provided'}`);
    if (this.activeCommands.has(requestId)) {
      const { process, timeoutId } = this.activeCommands.get(requestId);
      clearTimeout(timeoutId);
      if (!process.killed) {
        console.log(`[${requestId}] Killing process PID ${process.pid}`);
        process.kill('SIGTERM');
        setTimeout(() => { if (!process.killed) process.kill('SIGKILL'); }, 1000);
      }
      this.activeCommands.delete(requestId);
      console.log(`[${requestId}] Process cancelled and removed from active commands.`);
    } else {
      console.log(`[${requestId}] No active command found for cancellation request.`);
    }
  }

  startServer(port = 3000) {
    const server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID'); // Allow X-Request-ID if client sends it

      console.log(`[MCP] ${req.method} ${req.url}`);

      if (req.method === 'OPTIONS') {
        res.writeHead(204); // Use 204 No Content for OPTIONS
        res.end();
        return;
      }

      if (req.url === '/health' && (req.method === 'GET' || req.method === 'POST')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', tools: this.tools.size }));
        return;
      }
      if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Busybox Network MCP Server is running' }));
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          let request;
          try {
            request = JSON.parse(body);
            console.log(`Received request method: ${request.method}`);
            if (request.params) console.log(`Request params: ${JSON.stringify(request.params)}`);

            // Handle notifications first (they don't have 'id' or expect a JSON-RPC response body)
            if (request.id === undefined) {
              if (request.method === 'notifications/cancelled') {
                await this.handleNotificationsCancelled(request.params);
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
            }

            // For JSON-RPC calls that expect a response (have an 'id')
            let response = { jsonrpc: "2.0", id: request.id };

            if (!request.jsonrpc || !request.method) {
              response.error = { code: -32600, message: 'Invalid Request: missing method' };
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
              return;
            }
            
            if (request.id !== undefined) {
              response.id = request.id;
            }

            let resultPromise;

            switch (request.method) {
              case 'initialize':
                resultPromise = this.handleInitialize(request.params);
                break;
              case 'tools/list':
                console.log("Received tools/list request");
                resultPromise = this.handleListTools();
                break;
              case 'tools/call':
                resultPromise = this.handleCallTool(request.params.name, request.params);
                break;
              case 'status':
                resultPromise = this.handleStatus();
                break;
              case 'version':
                resultPromise = this.handleVersion();
                break;
              case 'servers/list':
                resultPromise = this.handleServersList();
                break;
              case 'server/info':
                resultPromise = this.handleServerInfo();
                break;
              case 'roots/set':
                resultPromise = this.handleSetRoots(request.params.roots);
                break;
              case 'tools/config':
                resultPromise = this.handleToolsConfig();
                break;
              case 'notifications/initialized':
                await this.handleNotificationsInitialized();
                res.writeHead(204);
                res.end();
                return;
              case 'notifications/cancelled':
                await this.handleNotificationsCancelled(request.params);
                res.writeHead(204);
                res.end();
                return;
              default:
                console.log(`Unhandled method: ${request.method}`);
                response.error = { code: -32601, message: 'Method not found', data: { method: request.method } };
            }

            if (response.error) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } else if (resultPromise) {
              try {
                response.result = await resultPromise;
                console.log(`Outgoing response for method ${request.method}:`, JSON.stringify(response, null, 2));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
              } catch (error) {
                console.error("Error processing request:", error);
                response.error = { code: -32000, message: `Server error: ${error.message}` };
                if (request.id !== undefined) response.id = request.id; else delete response.id;
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
              }
            }
          } catch (error) {
            console.error("Error processing request:", error);
            const errorResponseId = (request && request.id !== undefined) ? request.id : null;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32000, message: `Server error: ${error.message}` },
              id: errorResponseId
            }));
          }
        });
      } else {
        res.writeHead(405); // Method Not Allowed
        res.end();
      }
    });

    server.listen(port, () => {
      console.log(`Busybox Network MCP Server running on port ${port}`);
      console.log(`Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
      this.logNmapDirs();
    });
  }

  logNmapDirs() {
    try {
      console.log('Listing /usr/share/nmap:');
      const nmapDir = fs.readdirSync('/usr/share/nmap');
      console.log(nmapDir);
      if (fs.existsSync('/usr/share/nmap/scripts')) {
        console.log('Listing /usr/share/nmap/scripts:');
        const scriptsDir = fs.readdirSync('/usr/share/nmap/scripts');
        console.log(scriptsDir.slice(0, 10)); // Only show first 10 for brevity
      } else {
        console.log('/usr/share/nmap/scripts does not exist');
      }
      if (fs.existsSync('/usr/share/nmap/nse_main.lua')) {
        console.log('nse_main.lua found in /usr/share/nmap');
      } else {
        console.log('nse_main.lua NOT found in /usr/share/nmap');
      }
    } catch (e) {
      console.error('Error listing Nmap directories:', e);
    }
  }
}

const server = new BusyboxNetworkMCPServer();
server.startServer(process.env.PORT || 3000);