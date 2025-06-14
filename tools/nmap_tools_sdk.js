/**
 * NMAP Tools Module for MCP Open Discovery - SDK Compatible
 * 
 * This module provides Nmap scanning tools using the official MCP SDK patterns.
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

/**
 * Register all NMAP tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerNmapTools(server) {
  // Nmap Ping Scan
  server.tool(
    'nmap_ping_scan',
    'Nmap Ping Scan (-sn): Discovers online hosts without port scanning.',
    {
      target: z.string().describe("Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)")
    },
    async ({ target }) => {
      try {
        const cmd = ['nmap', '-sn'];
        cmd.push(sanitizeHost(target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Nmap TCP SYN Scan
  server.tool(
    'nmap_tcp_syn_scan',
    'Nmap TCP SYN Scan (-sS): Stealthy scan for open TCP ports. Requires root/administrator privileges. Note: This scan will only work if the server is running as root in Docker.',
    {
      target: z.string().describe("Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)"),
      ports: z.string().optional().describe("Ports to scan (e.g., '80,443', '1-1024', 'U:53,T:21-25,80'). Default is Nmap's default (usually top 1000)."),
      fast_scan: z.boolean().default(false).describe("Fast mode (-F): Scan fewer ports than the default scan."),
      timing_template: z.number().int().min(0).max(5).default(3).describe("Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster."),
      reason: z.boolean().default(false).describe("Display the reason a port is in a particular state (--reason)."),
      open_only: z.boolean().default(false).describe("Only show open (or possibly open) ports (--open).")
    },
    async ({ target, ports, fast_scan, timing_template, reason, open_only }) => {
      try {
        const cmd = ['nmap', '-sS'];
        
        if (ports) {
          cmd.push('-p', ports);
        }
        
        if (fast_scan) {
          cmd.push('-F');
        }
        
        if (timing_template !== undefined) {
          cmd.push(`-T${timing_template}`);
        }
        
        if (reason) {
          cmd.push('--reason');
        }
        
        if (open_only) {
          cmd.push('--open');
        }
        
        cmd.push(sanitizeHost(target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Nmap TCP Connect Scan
  server.tool(
    'nmap_tcp_connect_scan',
    'Nmap TCP Connect Scan (-sT): Scans for open TCP ports using the connect() system call. Does not require special privileges.',
    {
      target: z.string().describe("Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)"),
      ports: z.string().optional().describe("Ports to scan (e.g., '80,443', '1-1024'). Default is Nmap's default (usually top 1000)."),
      timing_template: z.number().int().min(0).max(5).default(3).describe("Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster."),
      reason: z.boolean().default(false).describe("Display the reason a port is in a particular state (--reason)."),
      open_only: z.boolean().default(false).describe("Only show open (or possibly open) ports (--open).")
    },
    async ({ target, ports, timing_template, reason, open_only }) => {
      try {
        const cmd = ['nmap', '-sT'];
        
        if (ports) {
          cmd.push('-p', ports);
        }
        
        if (timing_template !== undefined) {
          cmd.push(`-T${timing_template}`);
        }
        
        if (reason) {
          cmd.push('--reason');
        }
        
        if (open_only) {
          cmd.push('--open');
        }
        
        cmd.push(sanitizeHost(target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Nmap UDP Scan
  server.tool(
    'nmap_udp_scan',
    'Nmap UDP Scan (-sU): Scans for open UDP ports. Can be very slow as UDP is connectionless. Requires root/administrator privileges when running in Docker.',
    {
      target: z.string().describe("Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)"),
      ports: z.string().optional().describe("Ports to scan (e.g., 'U:53,161', '1-1024'). Default is Nmap's default for UDP (often common UDP ports)."),
      top_ports: z.number().int().positive().optional().describe("Scan the <number> most common UDP ports (--top-ports <number>). Cannot be used with 'ports'."),
      timing_template: z.number().int().min(0).max(5).default(3).describe("Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster."),
      reason: z.boolean().default(false).describe("Display the reason a port is in a particular state (--reason)."),
      open_only: z.boolean().default(false).describe("Only show open (or possibly open) ports (--open).")
    },
    async ({ target, ports, top_ports, timing_template, reason, open_only }) => {
      try {
        const cmd = ['nmap', '-sU'];
        
        if (ports) {
          cmd.push('-p', ports);
        } else if (top_ports) {
          cmd.push('--top-ports', String(top_ports));
        }
        
        if (timing_template !== undefined) {
          cmd.push(`-T${timing_template}`);
        }
        
        if (reason) {
          cmd.push('--reason');
        }
        
        if (open_only) {
          cmd.push('--open');
        }
        
        cmd.push(sanitizeHost(target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Nmap Version Scan
  server.tool(
    'nmap_version_scan',
    'Nmap Version Detection (-sV): Probes open ports to determine service/version info.',
    {
      target: z.string().describe("Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)"),
      ports: z.string().optional().describe("Ports to scan (e.g., '80,443', '1-1024'). Default is Nmap's default (usually top 1000 TCP and UDP)."),
      intensity: z.number().int().min(0).max(9).default(7).describe("Version scan intensity (--version-intensity <0-9>): Higher is more likely to identify services but takes longer. Default 7."),
      light_mode: z.boolean().default(false).describe("Enable light mode (--version-light): Faster, less comprehensive version scan. Alias for --version-intensity 2."),
      all_ports: z.boolean().default(false).describe("Try all probes for every port (--version-all): Slower, more comprehensive. Alias for --version-intensity 9."),
      timing_template: z.number().int().min(0).max(5).default(3).describe("Timing template (-T<0-5>): 0 (paranoid), 1 (sneaky), 2 (polite), 3 (normal), 4 (aggressive), 5 (insane). Higher is faster."),
      reason: z.boolean().default(false).describe("Display the reason a port is in a particular state (--reason)."),
      open_only: z.boolean().default(false).describe("Only show open (or possibly open) ports (--open).")
    },
    async ({ target, ports, intensity, light_mode, all_ports, timing_template, reason, open_only }) => {
      try {
        const cmd = ['nmap', '-sV'];
        
        if (ports) {
          cmd.push('-p', ports);
        }
        
        if (light_mode) {
          cmd.push('--version-light');
        } else if (all_ports) {
          cmd.push('--version-all');
        } else if (intensity !== undefined) {
          cmd.push('--version-intensity', String(intensity));
        }
        
        if (timing_template !== undefined) {
          cmd.push(`-T${timing_template}`);
        }
        
        if (reason) {
          cmd.push('--reason');
        }
        
        if (open_only) {
          cmd.push('--open');
        }
        
        cmd.push(sanitizeHost(target));
        
        return await executeCommand(cmd);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  console.log('[MCP SDK] Registered 5 NMAP tools');
}

module.exports = { registerNmapTools };
