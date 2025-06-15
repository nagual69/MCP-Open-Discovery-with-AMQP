/**
 * Nmap Tools Module for MCP Open Discovery
 * 
 * This module provides Nmap scanning tools like ping scan, TCP SYN scan, etc.
 */

/**
 * Returns the tool definitions for Nmap tools
 * @param {Object} server - Reference to the server instance for context
 * @returns {Array} Array of tool definitions
 */
function getTools(server) {
  return [
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
        const cmd = ['nmap', '-sn'];
        cmd.push(server.sanitizeHost(args.target));
        return cmd;
      }
    },    {
      name: 'nmap_tcp_syn_scan',
      description: 'Nmap TCP SYN Scan (-sS): Stealthy scan for open TCP ports. Requires root/administrator privileges. Note: This scan will only work if the server is running as root in Docker.',
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
        const cmd = ['nmap', '-sS'];
        
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
        
        cmd.push(server.sanitizeHost(args.target));
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
        
        cmd.push(server.sanitizeHost(args.target));
        return cmd;
      }
    },    {
      name: 'nmap_udp_scan',
      description: 'Nmap UDP Scan (-sU): Scans for open UDP ports. Can be very slow as UDP is connectionless. Requires root/administrator privileges when running in Docker.',
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
        const cmd = ['nmap', '-sU'];
        
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
        
        cmd.push(server.sanitizeHost(args.target));
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
        
        cmd.push(server.sanitizeHost(args.target));
        return cmd;
      }
    }
  ];
}

module.exports = { getTools };
