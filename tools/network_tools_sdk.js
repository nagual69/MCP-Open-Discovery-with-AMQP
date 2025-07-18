/**
 * Network Tools Module for MCP Open Discovery - SDK Compatible
 * 
 * This module provides basic network tools using the official MCP SDK patterns.
 * Converted from custom format to use Zod schemas and CallToolResult responses.
 */

const { z } = require('zod');
const { spawn } = require('child_process');

/**
 * Sanitize a hostname or IP address to prevent command injection
 * @param {string} host - The hostname or IP to sanitize
 * @returns {string} Sanitized hostname or IP
 */
function sanitizeHost(host) {
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
function sanitizeUrl(url) {
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
 * Execute a command and return formatted result
 * @param {Array} commandArray - Command and arguments to execute
 * @returns {Promise<Object>} CallToolResult format
 */
async function executeCommand(commandArray) {
  return new Promise((resolve, reject) => {
    const command = commandArray[0];
    const args = commandArray.slice(1);
    
    console.log(`[MCP] Running command: ${command} ${args.join(' ')}`);
    
    const process = spawn(command, args);
    let output = '';
    let errorOutput = '';
    
    // Set timeout (5 minutes)
    const timeout = setTimeout(() => {
      console.log(`[MCP] Command timed out: ${command} ${args.join(' ')}`);
      process.kill();
      reject(new Error(`Command timed out after 300 seconds`));
    }, 300000);
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    process.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        console.log(`[MCP] Command failed with code ${code}: ${command} ${args.join(' ')}`);
        resolve({
          content: [
            {
              type: "text",
              text: `Command failed with code ${code}${errorOutput ? ': ' + errorOutput : ''}`
            }
          ],
          isError: true
        });
      } else {
        resolve({
          content: [
            {
              type: "text",
              text: output || 'Command completed successfully (no output)'
            }
          ]
        });
      }
    });
    
    process.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`[MCP] Command error: ${error.message}`);
      resolve({
        content: [
          {
            type: "text",
            text: `Command error: ${error.message}`
          }
        ],
        isError: true
      });
    });
  });
}

/**
 * Register all network tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerNetworkTools(server) {
  // Ping tool
  server.tool(
    'ping',
    'Send ICMP echo requests to network hosts',
    {
      host: z.string().describe("Target hostname or IP address"),
      count: z.number().min(1).max(10).default(4).describe("Number of packets to send (1-10)"),
      timeout: z.number().min(1).max(30).default(5).describe("Timeout in seconds (1-30)"),
      size: z.number().min(56).max(1024).default(56).describe("Packet size in bytes (56-1024)")
    },
    async ({ host, count, timeout, size }) => {
      try {
        const cmd = ['ping'];
        cmd.push('-c', String(Math.min(count || 4, 10)));
        cmd.push('-w', String(Math.min(timeout || 5, 30)));
        if (size) {
          cmd.push('-s', String(Math.min(Math.max(size, 56), 1024)));
        }
        cmd.push(sanitizeHost(host));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Wget tool
  server.tool(
    'wget',
    'Download files from web servers',
    {
      url: z.string().describe("URL to download from"),
      timeout: z.number().min(1).max(60).default(10).describe("Timeout in seconds (1-60)"),
      tries: z.number().min(1).max(3).default(1).describe("Number of retry attempts (1-3)"),
      headers_only: z.boolean().default(false).describe("Only fetch headers, not content")
    },
    async ({ url, timeout, tries, headers_only }) => {
      try {
        sanitizeUrl(url); // Validate URL
        
        const cmd = ['wget'];
        cmd.push('--timeout', String(Math.min(timeout || 10, 60)));
        cmd.push('--tries', String(Math.min(tries || 1, 3)));
        
        if (headers_only) {
          cmd.push('--spider');
        } else {
          cmd.push('-O', '-'); // Output to stdout
        }
        
        cmd.push(url);
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // NSLookup tool
  server.tool(
    'nslookup',
    'Query DNS servers for domain name resolution',
    {
      domain: z.string().describe("Domain name to resolve"),
      server: z.string().optional().describe("DNS server to query (optional)"),
      type: z.enum(['A', 'AAAA', 'MX', 'NS', 'TXT', 'PTR']).default('A').describe("Record type (note: BusyBox nslookup has limited record type support)")
    },
    async ({ domain, server: dnsServer, type }) => {
      try {
        const cmd = ['nslookup'];
        
        // Add type if specified
        if (type && type !== 'A') {
          cmd.push('-type=' + type);
        }
        
        // Add the domain (must be sanitized)
        cmd.push(sanitizeHost(domain));
        
        // Add server if specified
        if (dnsServer) {
          cmd.push(sanitizeHost(dnsServer));
        }
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Netstat tool
  server.tool(
    'netstat',
    'Display network connections and routing tables',
    {
      listening: z.boolean().default(false).describe("Show only listening ports"),
      numeric: z.boolean().default(true).describe("Show numerical addresses instead of resolving hosts"),
      tcp: z.boolean().default(true).describe("Show TCP connections"),
      udp: z.boolean().default(false).describe("Show UDP connections"),
      all: z.boolean().default(false).describe("Show all sockets (listening and non-listening)")
    },
    async ({ listening, numeric, tcp, udp, all }) => {
      try {
        const cmd = ['netstat'];
        
        if (listening) {
          cmd.push('-l');
        }
        
        if (numeric) {
          cmd.push('-n');
        }
        
        if (tcp) {
          cmd.push('-t');
        }
        
        if (udp) {
          cmd.push('-u');
        }
        
        if (all) {
          cmd.push('-a');
        }
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Telnet tool
  server.tool(
    'telnet',
    'Test TCP connectivity to specific ports',
    {
      host: z.string().describe("Target hostname or IP address"),
      port: z.number().min(1).max(65535).describe("Target port number")
    },
    async ({ host, port }) => {
      try {
        const cmd = ['telnet', sanitizeHost(host), String(port)];
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Route tool
  server.tool(
    'route',
    'Display or manipulate IP routing table',
    {
      numeric: z.boolean().default(true).describe("Show numerical addresses instead of resolving hosts")
    },
    async ({ numeric }) => {
      try {
        const cmd = ['route'];
        if (numeric) {
          cmd.push('-n');
        }
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Ifconfig tool
  server.tool(
    'ifconfig',
    'Display network interface configuration',
    {
      interface: z.string().optional().describe("Specific interface name (optional)")
    },
    async ({ interface: iface }) => {
      try {
        const cmd = ['ifconfig'];
        if (iface) {
          // Sanitize interface name
          const sanitized = iface.replace(/[^\w.\-_]/g, '');
          if (!sanitized) {
            throw new Error('Invalid interface name');
          }
          cmd.push(sanitized);
        }
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // ARP tool
  server.tool(
    'arp',
    'Display or manipulate ARP cache',
    {
      numeric: z.boolean().default(true).describe("Show numerical addresses instead of resolving hosts")
    },
    async ({ numeric }) => {
      try {
        const cmd = ['arp'];
        if (numeric) {
          cmd.push('-n');
        }
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  console.log('[MCP SDK] Registered 8 network tools');
}

module.exports = { registerNetworkTools };
