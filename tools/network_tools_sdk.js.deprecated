/**
 * Network Tools SDK
 * MCP SDK Compatible Network Tool Implementation
 * 
 * Provides comprehensive network diagnostic and discovery tools including:
 * - ping: Test network connectivity
 * - wget: HTTP/HTTPS content retrieval with detailed response information
 * - nslookup: DNS resolution and record lookup
 * - netstat: Network connection status monitoring
 * - tcp_connect: TCP port connectivity testing
 * - route: Network routing table inspection
 * - ifconfig: Network interface configuration
 * - arp: ARP table inspection for network discovery
 * - whois: Domain and IP registration information lookup
 * 
 * All tools include comprehensive error handling, input validation,
 * and structured output formatting for enterprise use.
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

// Tool definitions for new registry system
const tools = [
  {
    name: 'ping',
    description: 'Send ICMP echo requests to network hosts',
    inputSchema: z.object({
      host: z.string().describe("Target hostname or IP address"),
      count: z.number().min(1).max(10).optional().describe("Number of packets to send (1-10)"),
      timeout: z.number().min(1).max(30).optional().describe("Timeout in seconds (1-30)"),
      size: z.number().min(56).max(1024).optional().describe("Packet size in bytes (56-1024)")
    }),
  },
  {
    name: 'wget',
    description: 'Download content from HTTP/HTTPS URLs',
    inputSchema: z.object({
      url: z.string().describe("HTTP/HTTPS URL to fetch"),
      output_document: z.string().optional().describe("Filename to save the content (optional)"),
      timeout: z.number().min(1).max(300).optional().describe("Request timeout in seconds (1-300)"),
      user_agent: z.string().optional().describe("Custom User-Agent string (optional)"),
      max_redirect: z.number().min(0).max(10).optional().describe("Maximum redirects to follow (0-10)")
    }),
  },
  {
    name: 'nslookup',
    description: 'Perform DNS lookups for hostnames and IP addresses',
    inputSchema: z.object({
      host: z.string().describe("Hostname or IP address to lookup"),
      type: z.enum(["A", "AAAA", "MX", "NS", "TXT", "CNAME", "PTR", "SOA"]).default("A").describe("DNS record type to query").optional(),
      server: z.string().describe("DNS server to query (optional)").optional()
    }),
  },
  {
    name: 'netstat',
    description: 'Display network connections and listening ports',
    inputSchema: z.object({
      listening: z.boolean().default(false).describe("Show only listening ports").optional(),
      numeric: z.boolean().default(true).describe("Show numerical addresses instead of resolving hosts").optional(),
      programs: z.boolean().default(false).describe("Show PID and process names").optional(),
      protocol: z.enum(["tcp", "udp", "all"]).default("all").describe("Protocol to filter by").optional()
    }),
  },
  {
    name: 'tcp_connect',
    description: 'Test TCP connectivity to a specific host and port',
    inputSchema: z.object({
      host: z.string().describe("Target hostname or IP address"),
      port: z.number().min(1).max(65535).describe("Target port number"),
      timeout: z.number().min(1).max(60).default(10).describe("Connection timeout in seconds").optional()
    }),
  },
  {
    name: 'route',
    description: 'Display and manipulate network routing table',
    inputSchema: z.object({
      destination: z.string().describe("Show route to specific destination (optional)").optional(),
      numeric: z.boolean().default(true).describe("Show numerical addresses instead of resolving hosts").optional()
    }),
  },
  {
    name: 'ifconfig',
    description: 'Display network interface configuration',
    inputSchema: z.object({
      interface: z.string().describe("Specific interface to display (optional)").optional(),
      all: z.boolean().default(true).describe("Show all interfaces including inactive ones").optional()
    }),
  },
  {
    name: 'arp',
    description: 'Display and modify ARP (Address Resolution Protocol) cache',
    inputSchema: z.object({
      host: z.string().describe("Specific host to lookup in ARP table (optional)").optional(),
      numeric: z.boolean().default(false).describe("Show numerical addresses instead of resolving hosts").optional()
    }),
  },
  {
    name: 'whois',
    description: 'Query WHOIS databases for domain and IP information',
    inputSchema: z.object({
      query: z.string().describe("Domain name or IP address to lookup"),
      server: z.string().describe("Specific WHOIS server to query (optional)").optional()
    }),
  }
];

// Handle tool calls for new registry system
async function handleToolCall(name, args) {
  try {
    switch (name) {
      case 'ping': {
        const { host, count, timeout, size } = args;
        const cmd = ['ping'];
        cmd.push('-c', String(Math.min(count || 4, 10)));
        cmd.push('-w', String(Math.min(timeout || 5, 30)));
        if (size) {
          cmd.push('-s', String(Math.min(Math.max(size, 56), 1024)));
        }
        cmd.push(sanitizeHost(host));
        return await executeCommand(cmd);
      }

      case 'wget': {
        const { url, output_document, timeout, user_agent, max_redirect } = args;
        const cmd = ['wget'];
        
        // Add timeout
        cmd.push('--timeout', String(Math.min(timeout || 30, 300)));
        
        // Add max redirects
        cmd.push('--max-redirect', String(Math.min(max_redirect || 5, 10)));
        
        // Add user agent if specified
        if (user_agent) {
          cmd.push('--user-agent', user_agent);
        }
        
        // Add output document if specified
        if (output_document) {
          cmd.push('-O', output_document);
        } else {
          cmd.push('-O', '-'); // Output to stdout
        }
        
        // Add URL (validate first)
        cmd.push(sanitizeUrl(url));
        
        return await executeCommand(cmd);
      }

      case 'nslookup': {
        const { host, type, server } = args;
        const cmd = ['nslookup'];
        
        // Add query type if specified
        if (type && type !== 'A') {
          cmd.push('-type=' + type);
        }
        
        cmd.push(sanitizeHost(host));
        
        // Add server if specified
        if (server) {
          cmd.push(sanitizeHost(server));
        }
        
        return await executeCommand(cmd);
      }

      case 'netstat': {
        const { listening, numeric, programs, protocol } = args;
        const cmd = ['netstat'];
        
        if (listening) {
          cmd.push('-l');
        }
        
        if (numeric) {
          cmd.push('-n');
        }
        
        if (programs) {
          cmd.push('-p');
        }
        
        // Add protocol filter
        if (protocol === 'tcp') {
          cmd.push('-t');
        } else if (protocol === 'udp') {
          cmd.push('-u');
        } else {
          cmd.push('-a'); // all
        }
        
        return await executeCommand(cmd);
      }

      case 'tcp_connect': {
        const { host, port, timeout } = args;
        const cmd = ['nc', '-z', '-v'];
        
        // Add timeout
        cmd.push('-w', String(Math.min(timeout || 10, 60)));
        
        cmd.push(sanitizeHost(host), String(port));
        
        return await executeCommand(cmd);
      }

      case 'route': {
        const { destination, numeric } = args;
        const cmd = ['route'];
        
        if (numeric) {
          cmd.push('-n');
        }
        
        if (destination) {
          cmd.push('get', sanitizeHost(destination));
        }
        
        return await executeCommand(cmd);
      }

      case 'ifconfig': {
        const { interface: iface, all } = args;
        const cmd = ['ifconfig'];
        
        if (iface) {
          cmd.push(iface);
        } else if (all) {
          cmd.push('-a');
        }
        
        return await executeCommand(cmd);
      }

      case 'arp': {
        const { host, numeric } = args;
        const cmd = ['arp'];
        
        if (numeric) {
          cmd.push('-n');
        }
        
        if (host) {
          cmd.push(sanitizeHost(host));
        } else {
          cmd.push('-a');
        }
        
        return await executeCommand(cmd);
      }

      case 'whois': {
        const { query, server } = args;
        const cmd = ['whois'];
        
        // Add server if specified
        if (server) {
          cmd.push('-h', sanitizeHost(server));
        }
        
        // Add the query (domain or IP)
        cmd.push(sanitizeHost(query));
        
        return await executeCommand(cmd);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
}

module.exports = { tools, handleToolCall };
