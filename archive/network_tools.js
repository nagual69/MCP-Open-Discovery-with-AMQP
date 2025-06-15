/**
 * Basic Network Tools Module for MCP Open Discovery
 * 
 * This module provides basic network tools like ping, wget, nslookup, etc.
 */

/**
 * Returns the tool definitions for basic network tools
 * @param {Object} server - Reference to the server instance for context
 * @returns {Array} Array of tool definitions
 */
function getTools(server) {
  return [
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
        cmd.push(server.sanitizeHost(args.host));
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
        const cmd = ['wget'];
        cmd.push('--timeout', String(Math.min(args.timeout || 10, 60)));
        cmd.push('--tries', String(Math.min(args.tries || 1, 3)));
        
        if (args.headers_only) {
          cmd.push('--spider');
        } else {
          cmd.push('-O', '-'); // Output to stdout
        }
        
        cmd.push(args.url);
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
        
        // Add type if specified
        if (args.type && args.type !== 'A') {
          cmd.push('-type=' + args.type);
        }
        
        // Add the domain (must be sanitized)
        cmd.push(server.sanitizeHost(args.domain));
        
        // Add server if specified
        if (args.server) {
          cmd.push(server.sanitizeHost(args.server));
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
        const cmd = ['netstat'];
        
        if (args.listening) {
          cmd.push('-l');
        }
        
        if (args.numeric) {
          cmd.push('-n');
        }
        
        if (args.tcp) {
          cmd.push('-t');
        }
        
        if (args.udp) {
          cmd.push('-u');
        }
        
        if (args.all) {
          cmd.push('-a');
        }
        
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
        server.sanitizeHost(args.host), 
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
        if (args.numeric) {
          cmd.push('-n');
        }
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
          cmd.push(args.interface);
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
        if (args.numeric) {
          cmd.push('-n');
        }
        return cmd;
      }
    }
  ];
}

module.exports = { getTools };
