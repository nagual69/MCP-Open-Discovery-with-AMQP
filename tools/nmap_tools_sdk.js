/**
 * NMAP Tools Module for MCP Open Discovery - SDK Compatible with NEW REGISTRY FORMAT
 * CONVERTED TO NEW REGISTRY FORMAT
 * 
 * This module provides Nmap scanning tools using the official MCP SDK patterns.
 * Converted from registerNmapTools format to { tools, handleToolCall } for hot-reload registry.
 * 
 * NEW FORMAT: Exports { tools, handleToolCall } for hot-reload registry
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
  // Remove anything that's not alphanumeric, dots, dashes, colons (IPv6), slashes (CIDR)
  let sanitized = host.replace(/[^\w.\-:\/]/g, '');
  
  if (!sanitized) {
    throw new Error('Invalid host: Sanitization resulted in an empty string');
  }
  
  return sanitized;
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
    
    console.log(`[MCP NMAP] Running command: ${command} ${args.join(' ')}`);
    
    const process = spawn(command, args);
    let output = '';
    let errorOutput = '';
    
    // Set timeout (10 minutes for nmap scans)
    const timeout = setTimeout(() => {
      console.log(`[MCP NMAP] Command timed out: ${command} ${args.join(' ')}`);
      process.kill();
      reject(new Error(`Command timed out after 600 seconds`));
    }, 600000);
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    process.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        console.log(`[MCP NMAP] Command failed with code ${code}: ${command} ${args.join(' ')}`);
        resolve({
          content: [
            {
              type: "text",
              text: `Nmap scan failed with code ${code}${errorOutput ? ': ' + errorOutput : ''}`
            }
          ],
          isError: true
        });
      } else {
        resolve({
          content: [
            {
              type: "text",
              text: output || 'Nmap scan completed (no output)'
            }
          ]
        });
      }
    });
    
    process.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`[MCP NMAP] Command error: ${error.message}`);
      resolve({
        content: [
          {
            type: "text",
            text: `Nmap error: ${error.message}`
          }
        ],
        isError: true
      });
    });
  });
}

// ========== NEW REGISTRY FORMAT: TOOLS ARRAY + HANDLE FUNCTION ==========

/**
 * Tool definitions array for new registry system
 */
const tools = [
  {
    name: 'nmap_ping_scan',
    description: 'Nmap Ping Scan (-sn): Discovers online hosts without port scanning.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'nmap_tcp_syn_scan',
    description: 'Nmap TCP SYN Scan (-sS): Stealthy scan for open TCP ports. Requires root/administrator privileges.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)'
        },
        ports: {
          type: 'string',
          description: "Ports to scan (e.g., '80,443', '1-1024'). Default is Nmap's default (usually top 1000)."
        },
        fast_scan: {
          type: 'boolean',
          default: false,
          description: 'Fast mode (-F): Scan fewer ports than the default scan.'
        },
        timing_template: {
          type: 'number',
          minimum: 0,
          maximum: 5,
          default: 3,
          description: 'Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster.'
        },
        reason: {
          type: 'boolean',
          default: false,
          description: 'Display the reason a port is in a particular state (--reason).'
        },
        open_only: {
          type: 'boolean',
          default: false,
          description: 'Only show open (or possibly open) ports (--open).'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'nmap_tcp_connect_scan',
    description: 'Nmap TCP Connect Scan (-sT): Scans for open TCP ports using the connect() system call. Does not require special privileges.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)'
        },
        ports: {
          type: 'string',
          description: "Ports to scan (e.g., '80,443', '1-1024'). Default is Nmap's default (usually top 1000)."
        },
        timing_template: {
          type: 'number',
          minimum: 0,
          maximum: 5,
          default: 3,
          description: 'Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster.'
        },
        reason: {
          type: 'boolean',
          default: false,
          description: 'Display the reason a port is in a particular state (--reason).'
        },
        open_only: {
          type: 'boolean',
          default: false,
          description: 'Only show open (or possibly open) ports (--open).'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'nmap_udp_scan',
    description: 'Nmap UDP Scan (-sU): Scans for open UDP ports. Can be very slow as UDP is connectionless. Requires root/administrator privileges.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)'
        },
        ports: {
          type: 'string',
          description: "Ports to scan (e.g., 'U:53,161', '1-1024'). Default is Nmap's default for UDP (often common UDP ports)."
        },
        top_ports: {
          type: 'number',
          description: 'Scan the <number> most common UDP ports (--top-ports <number>). Cannot be used with ports.'
        },
        timing_template: {
          type: 'number',
          minimum: 0,
          maximum: 5,
          default: 3,
          description: 'Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster.'
        },
        reason: {
          type: 'boolean',
          default: false,
          description: 'Display the reason a port is in a particular state (--reason).'
        },
        open_only: {
          type: 'boolean',
          default: false,
          description: 'Only show open (or possibly open) ports (--open).'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'nmap_version_scan',
    description: 'Nmap Version Detection (-sV): Probes open ports to determine service/version info.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)'
        },
        ports: {
          type: 'string',
          description: "Ports to scan (e.g., '80,443', '1-1024'). Default is Nmap's default (usually top 1000 TCP and UDP)."
        },
        intensity: {
          type: 'number',
          minimum: 0,
          maximum: 9,
          default: 7,
          description: 'Version scan intensity (--version-intensity <0-9>): Higher is more likely to identify services but takes longer. Default 7.'
        },
        light_mode: {
          type: 'boolean',
          default: false,
          description: 'Enable light mode (--version-light): Faster, less comprehensive version scan. Alias for --version-intensity 2.'
        },
        all_ports: {
          type: 'boolean',
          default: false,
          description: 'Try all probes for every port (--version-all): Slower, more comprehensive. Alias for --version-intensity 9.'
        },
        timing_template: {
          type: 'number',
          minimum: 0,
          maximum: 5,
          default: 3,
          description: 'Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster.'
        },
        reason: {
          type: 'boolean',
          default: false,
          description: 'Display the reason a port is in a particular state (--reason).'
        },
        open_only: {
          type: 'boolean',
          default: false,
          description: 'Only show open (or possibly open) ports (--open).'
        }
      },
      required: ['target']
    }
  }
];

/**
 * Handle tool calls for new registry system
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Object} Tool result
 */
async function handleToolCall(name, args) {
  switch (name) {
    case 'nmap_ping_scan':
      try {
        const cmd = ['nmap', '-sn'];
        cmd.push(sanitizeHost(args.target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }

    case 'nmap_tcp_syn_scan':
      try {
        const cmd = ['nmap', '-sS', '--privileged'];
        
        if (args.ports) {
          cmd.push('-p', args.ports);
        }
        
        if (args.fast_scan) {
          cmd.push('-F');
        }
        
        if (args.timing_template !== undefined) {
          cmd.push(`-T${args.timing_template}`);
        }
        
        if (args.reason) {
          cmd.push('--reason');
        }
        
        if (args.open_only) {
          cmd.push('--open');
        }
        
        cmd.push(sanitizeHost(args.target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }

    case 'nmap_tcp_connect_scan':
      try {
        const cmd = ['nmap', '-sT'];
        
        if (args.ports) {
          cmd.push('-p', args.ports);
        }
        
        if (args.timing_template !== undefined) {
          cmd.push(`-T${args.timing_template}`);
        }
        
        if (args.reason) {
          cmd.push('--reason');
        }
        
        if (args.open_only) {
          cmd.push('--open');
        }
        
        cmd.push(sanitizeHost(args.target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }

    case 'nmap_udp_scan':
      try {
        const cmd = ['nmap', '-sU', '--privileged'];
        
        if (args.ports) {
          cmd.push('-p', args.ports);
        } else if (args.top_ports) {
          cmd.push('--top-ports', String(args.top_ports));
        }
        
        if (args.timing_template !== undefined) {
          cmd.push(`-T${args.timing_template}`);
        }
        
        if (args.reason) {
          cmd.push('--reason');
        }
        
        if (args.open_only) {
          cmd.push('--open');
        }
        
        cmd.push(sanitizeHost(args.target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }

    case 'nmap_version_scan':
      try {
        const cmd = ['nmap', '-sV'];
        
        if (args.ports) {
          cmd.push('-p', args.ports);
        }
        
        if (args.light_mode) {
          cmd.push('--version-light');
        } else if (args.all_ports) {
          cmd.push('--version-all');
        } else if (args.intensity !== undefined) {
          cmd.push('--version-intensity', String(args.intensity));
        }
        
        if (args.timing_template !== undefined) {
          cmd.push(`-T${args.timing_template}`);
        }
        
        if (args.reason) {
          cmd.push('--reason');
        }
        
        if (args.open_only) {
          cmd.push('--open');
        }
        
        cmd.push(sanitizeHost(args.target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ========== BACKWARDS COMPATIBILITY ==========

/**
 * Legacy registerNmapTools function for backwards compatibility
 * @param {McpServer} server - The MCP server instance
 */
function registerNmapTools(server) {
  console.log('[MCP SDK] [DEPRECATED] Using legacy registerNmapTools - please update to new registry format');
  
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
      return await handleToolCall(tool.name, args);
    });
  }
  
  console.log('[MCP SDK] Registered 5 NMAP tools (legacy mode)');
}

// ========== EXPORTS ==========

module.exports = {
  // NEW FORMAT: For hot-reload registry system
  tools,
  handleToolCall,
  
  // LEGACY FORMAT: For backwards compatibility
  registerNmapTools,
  
  // UTILITY FUNCTIONS
  sanitizeHost,
  executeCommand
};
