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
    inputSchema: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: "Target hostname or IP address"
        },
        count: {
          type: "number",
          minimum: 1,
          maximum: 10,
          default: 4,
          description: "Number of packets to send (1-10)"
        },
        timeout: {
          type: "number",
          minimum: 1,
          maximum: 30,
          default: 5,
          description: "Timeout in seconds (1-30)"
        },
        size: {
          type: "number",
          minimum: 56,
          maximum: 1024,
          default: 56,
          description: "Packet size in bytes (56-1024)"
        }
      },
      required: ["host"]
    }
  },
  {
    name: 'wget',
    description: 'Download content from HTTP/HTTPS URLs',
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "HTTP/HTTPS URL to fetch"
        },
        output_document: {
          type: "string",
          description: "Filename to save the content (optional)"
        },
        timeout: {
          type: "number",
          minimum: 1,
          maximum: 300,
          default: 30,
          description: "Request timeout in seconds (1-300)"
        },
        user_agent: {
          type: "string",
          description: "Custom User-Agent string (optional)"
        },
        max_redirect: {
          type: "number",
          minimum: 0,
          maximum: 10,
          default: 5,
          description: "Maximum redirects to follow (0-10)"
        }
      },
      required: ["url"]
    }
  },
  {
    name: 'nslookup',
    description: 'Perform DNS lookups for hostnames and IP addresses',
    inputSchema: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: "Hostname or IP address to lookup"
        },
        type: {
          type: "string",
          enum: ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "PTR", "SOA"],
          default: "A",
          description: "DNS record type to query"
        },
        server: {
          type: "string",
          description: "DNS server to query (optional)"
        }
      },
      required: ["host"]
    }
  },
  {
    name: 'netstat',
    description: 'Display network connections and listening ports',
    inputSchema: {
      type: "object",
      properties: {
        listening: {
          type: "boolean",
          default: false,
          description: "Show only listening ports"
        },
        numeric: {
          type: "boolean",
          default: true,
          description: "Show numerical addresses instead of resolving hosts"
        },
        programs: {
          type: "boolean",
          default: false,
          description: "Show PID and process names"
        },
        protocol: {
          type: "string",
          enum: ["tcp", "udp", "all"],
          default: "all",
          description: "Protocol to filter by"
        }
      }
    }
  },
  {
    name: 'tcp_connect',
    description: 'Test TCP connectivity to a specific host and port',
    inputSchema: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: "Target hostname or IP address"
        },
        port: {
          type: "number",
          minimum: 1,
          maximum: 65535,
          description: "Target port number"
        },
        timeout: {
          type: "number",
          minimum: 1,
          maximum: 60,
          default: 10,
          description: "Connection timeout in seconds"
        }
      },
      required: ["host", "port"]
    }
  },
  {
    name: 'route',
    description: 'Display and manipulate network routing table',
    inputSchema: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          description: "Show route to specific destination (optional)"
        },
        numeric: {
          type: "boolean",
          default: true,
          description: "Show numerical addresses instead of resolving hosts"
        }
      }
    }
  },
  {
    name: 'ifconfig',
    description: 'Display network interface configuration',
    inputSchema: {
      type: "object",
      properties: {
        interface: {
          type: "string",
          description: "Specific interface to display (optional)"
        },
        all: {
          type: "boolean",
          default: true,
          description: "Show all interfaces including inactive ones"
        }
      }
    }
  },
  {
    name: 'arp',
    description: 'Display and modify ARP (Address Resolution Protocol) cache',
    inputSchema: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: "Specific host to lookup in ARP table (optional)"
        },
        numeric: {
          type: "boolean",
          default: false,
          description: "Show numerical addresses instead of resolving hosts"
        }
      }
    }
  },
  {
    name: 'whois',
    description: 'Query WHOIS databases for domain and IP information',
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Domain name or IP address to lookup"
        },
        server: {
          type: "string",
          description: "Specific WHOIS server to query (optional)"
        }
      },
      required: ["query"]
    }
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
