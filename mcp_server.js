#!/usr/bin/env node
/**
 * MCP Open Discovery Server
 *
 * This server exposes Busybox and Nmap networking tools via the Model Context Protocol (MCP).
 * It provides a memory-based CMDB (Configuration Management Database) for storing and querying
 * infrastructure data, including Proxmox cluster resources, nodes, VMs, containers, storage, and networks.
 *
 * Key Features:
 * - Implements MCP JSON-RPC 2.0 methods: initialize, tools/list, tools/call, memory/get, memory/set, memory/merge, memory/query
 * - In-memory CI (Configuration Item) store for fast, hierarchical CMDB queries
 * - Supports hierarchical relationships (cluster > node > VM/container, etc.)
 * - Used for AI-driven automation, VS Code integration, and compliance testing
 *
 * See README.md and MCP_COMPLIANCE.md for protocol and integration details.
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const snmp = require('net-snmp');

// Import SNMP tools
const {
  createSnmpSession,
  closeSnmpSession,
  snmpGet,
  snmpGetNext,
  snmpWalk,
  snmpTable,
  snmpDiscover,
  snmpDeviceInventory,
  snmpInterfaceDiscovery,
  snmpSystemHealthCheck,
  snmpServiceDiscovery,
  snmpNetworkTopologyMapper
} = require('./snmp_tools');

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
    ciMemory.set(key, args.value);
    return { success: true };
  }
  if (method === 'memory/merge') {
    const key = args.key;
    const existing = ciMemory.get(key) || {};
    ciMemory.set(key, mergeCI(existing, args.value));
    return { success: true };
  }
  if (method === 'memory/query') {
    // If a pattern is provided, return all CIs whose key matches the pattern (supports * as wildcard)
    if (args.pattern && typeof args.pattern === 'string') {
      // Convert glob pattern to RegExp
      const pattern = args.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regex = new RegExp('^' + pattern + '$');
      const matches = [];
      for (const [key, ci] of ciMemory.entries()) {
        if (regex.test(key)) matches.push({ key, ci });
      }
      return { cis: matches };
    } else {
      // Default: find incomplete CIs (missing type or os)
      const incomplete = [];
      for (const [key, ci] of ciMemory.entries()) {
        if (!ci.type || !ci.os) incomplete.push({ key, ci });
      }
      return { cis: incomplete };
    }
  }
  return { error: 'Unknown memory tool method' };
}

class MCPOpenDiscoveryServer {
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
      },
      // Register memory tools for MCP Inspector/VS Code
      {
        name: 'memory_get',
        description: 'Get a CI object from MCP memory by key',
        schema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique CI key (e.g., ci:host:192.168.1.10)' }
          },
          required: ['key']
        },
        command: async (args) => {
          const result = await handleMemoryTool('memory/get', args);
          return ['Result:', JSON.stringify(result, null, 2)];
        }
      },
      {
        name: 'memory_set',
        description: 'Set a CI object in MCP memory by key',
        schema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique CI key (e.g., ci:host:192.168.1.10)' },
            value: { type: 'object', description: 'CI object to store' }
          },
          required: ['key', 'value']
        },
        command: async (args) => {
          const result = await handleMemoryTool('memory/set', { key: args.key, value: args.value });
          return ['Result:', JSON.stringify(result, null, 2)];
        }
      },
      {
        name: 'memory_merge',
        description: 'Merge new data into an existing CI in MCP memory',
        schema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique CI key (e.g., ci:host:192.168.1.10)' },
            value: { type: 'object', description: 'Partial CI data to merge' }
          },
          required: ['key', 'value']
        },
        command: async (args) => {
          const result = await handleMemoryTool('memory/merge', { key: args.key, value: args.value });
          return ['Result:', JSON.stringify(result, null, 2)];
        }
      },
      {
        name: 'memory_query',
        description: 'Query MCP memory for CIs matching a pattern or incomplete CIs',
        schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Pattern for CI keys (optional, e.g., ci:host:*)' }
          }
        },
        command: async (args) => {
          const result = await handleMemoryTool('memory/query', args);
          return ['Result:', JSON.stringify(result, null, 2)];
        }
      },
      // --- Proxmox Tools ---
      {
        name: 'proxmox_list_nodes',
        description: 'Returns all nodes in the Proxmox cluster.',
        schema: { type: 'object', properties: { creds_id: { type: 'string', description: 'Credential ID to use (optional)' } } },
        command: async () => await proxmox_list_nodes()
      },
      {
        name: 'proxmox_get_node_details',
        description: 'Returns details for a given Proxmox node.',
        schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
        command: async (args) => await proxmox_get_node_details(args)
      },
      {
        name: 'proxmox_list_vms',
        description: 'Returns all VMs for a Proxmox node.',
        schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
        command: async (args) => await proxmox_list_vms(args)
      },
      {
        name: 'proxmox_get_vm_details',
        description: 'Returns config/details for a given VM.',
        schema: { type: 'object', properties: { node: { type: 'string' }, vmid: { type: 'string' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node', 'vmid'] },
        command: async (args) => await proxmox_get_vm_details(args)
      },
      {
        name: 'proxmox_list_containers',
        description: 'Returns all LXC containers for a Proxmox node.',
        schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
        command: async (args) => await proxmox_list_containers(args)
      },
      {
        name: 'proxmox_get_container_details',
        description: 'Returns config/details for a given container.',
        schema: { type: 'object', properties: { node: { type: 'string' }, vmid: { type: 'string' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node', 'vmid'] },
        command: async (args) => await proxmox_get_container_details(args)
      },
      {
        name: 'proxmox_list_storage',
        description: 'Returns storage resources for a Proxmox node.',
        schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
        command: async (args) => await proxmox_list_storage(args)
      },
      {
        name: 'proxmox_list_networks',
        description: 'Returns network config for a Proxmox node.',
        schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
        command: async (args) => await proxmox_list_networks(args)
      },
      {
        name: 'proxmox_cluster_resources',
        description: 'Returns a summary of all cluster resources.',
        schema: { type: 'object', properties: { creds_id: { type: 'string', description: 'Credential ID to use (optional)' } } },
        command: async () => await proxmox_cluster_resources()
      },
      {
        name: 'proxmox_get_metrics',
        description: 'Returns metrics for a node or VM (if vmid is provided).',
        schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, vmid: { type: 'string', description: 'VM ID (optional)' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
        command: async (args) => await proxmox_get_metrics(args)
      },
      // --- Proxmox Credential Management Tools ---
      {
        name: 'proxmox_creds_add',
        description: 'Add a new Proxmox credential (encrypted at rest).',
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Credential ID (unique, e.g. proxmox1)' },
            hostname: { type: 'string', description: 'Proxmox API hostname (e.g. proxmox.example.com or IP)' },
            port: { type: 'number', description: 'Proxmox API port (default: 8006)', default: 8006 },
            username: { type: 'string' },
            password: { type: 'string' },
            realm: { type: 'string', default: 'pam' },
            verify_ssl: { type: 'boolean', description: 'Verify SSL certificate', default: true }
          },
          required: ['id', 'hostname', 'username', 'password']
        },
        command: async (args) => await proxmox_creds_add(args)
      },
      {
        name: 'proxmox_creds_list',
        description: 'Lists stored Proxmox API credentials.',
        schema: { type: 'object', properties: {} },
        command: async () => await proxmox_creds_list()
      },
      {
        name: 'proxmox_creds_remove',
        description: 'Removes stored Proxmox API credentials.',
        schema: { type: 'object', properties: { id: { type: 'string', description: 'Credential ID to remove' } }, required: ['id'] },
        command: async (args) => await proxmox_creds_remove(args)
      },
      
      // --- SNMP Tools ---
      {
        name: 'snmp_create_session',
        description: 'Creates an SNMP session with a target device for further operations.',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string', description: 'Hostname or IP address of target device' },
            community: { type: 'string', description: 'SNMP community string', default: 'public' },
            version: { type: 'string', enum: ['1', '2c', '3'], description: 'SNMP version', default: '2c' },
            port: { type: 'number', description: 'SNMP port (default: 161)', default: 161 },
            timeout: { type: 'number', description: 'Timeout in ms (default: 5000)', default: 5000 },
            retries: { type: 'number', description: 'Retry count (default: 1)', default: 1 },
            user: { type: 'string', description: 'SNMPv3 username (v3 only)' },
            authProtocol: { type: 'string', enum: ['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512'], description: 'SNMPv3 auth protocol (v3 only)' },
            authKey: { type: 'string', description: 'SNMPv3 auth key (v3 only)' },
            privProtocol: { type: 'string', enum: ['des', 'aes', 'aes128', 'aes192', 'aes256'], description: 'SNMPv3 privacy protocol (v3 only)' },
            privKey: { type: 'string', description: 'SNMPv3 privacy key (v3 only)' }
          },
          required: ['host']
        },
        command: async (args) => {
          try {
            const options = {
              community: args.community || 'public',
              version: args.version || '2c',
              port: args.port || 161,
              timeout: args.timeout || 5000,
              retries: args.retries || 1
            };
            
            // Add SNMPv3 options if specified
            if (args.version === '3') {
              options.user = args.user;
              options.authProtocol = args.authProtocol;
              options.authKey = args.authKey;
              options.privProtocol = args.privProtocol;
              options.privKey = args.privKey;
            }
            
            const { sessionId } = await createSnmpSession(args.host, options);
            return `Successfully created SNMP session ${sessionId} for host ${args.host}`;
          } catch (error) {
            throw new Error(`Failed to create SNMP session: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_close_session',
        description: 'Closes an SNMP session.',
        schema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID from snmp_create_session' }
          },
          required: ['sessionId']
        },
        command: async (args) => {
          try {
            const result = await closeSnmpSession(args.sessionId);
            return result ? `Successfully closed SNMP session ${args.sessionId}` : `Session ${args.sessionId} not found`;
          } catch (error) {
            throw new Error(`Failed to close SNMP session: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_get',
        description: 'Performs an SNMP GET operation to retrieve specific OID values.',
        schema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID from snmp_create_session' },
            oids: { type: 'array', items: { type: 'string' }, description: 'Array of OIDs to retrieve' }
          },
          required: ['sessionId', 'oids']
        },
        command: async (args) => {
          try {
            const result = await snmpGet(args.sessionId, args.oids);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP GET failed: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_get_next',
        description: 'Performs an SNMP GETNEXT operation for OIDs.',
        schema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID from snmp_create_session' },
            oids: { type: 'array', items: { type: 'string' }, description: 'Array of OIDs to start from' }
          },
          required: ['sessionId', 'oids']
        },
        command: async (args) => {
          try {
            const result = await snmpGetNext(args.sessionId, args.oids);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP GETNEXT failed: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_walk',
        description: 'Performs an SNMP WALK operation to retrieve a subtree of OIDs.',
        schema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID from snmp_create_session' },
            oid: { type: 'string', description: 'Base OID for the walk' }
          },
          required: ['sessionId', 'oid']
        },
        command: async (args) => {
          try {
            const result = await snmpWalk(args.sessionId, args.oid);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP WALK failed: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_table',
        description: 'Retrieves an SNMP table.',
        schema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID from snmp_create_session' },
            oid: { type: 'string', description: 'Base OID for the table' }
          },
          required: ['sessionId', 'oid']
        },
        command: async (args) => {
          try {
            const result = await snmpTable(args.sessionId, args.oid);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP TABLE failed: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_discover',
        description: 'Discovers SNMP-enabled devices in the specified network range.',
        schema: {
          type: 'object',
          properties: {
            targetRange: { type: 'string', description: 'Network range in CIDR notation (e.g., 192.168.1.0/24)' },
            community: { type: 'string', description: 'SNMP community string', default: 'public' },
            version: { type: 'string', enum: ['1', '2c', '3'], description: 'SNMP version', default: '2c' },
            port: { type: 'number', description: 'SNMP port (default: 161)', default: 161 },
            timeout: { type: 'number', description: 'Timeout in ms (default: 5000)', default: 5000 }
          },
          required: ['targetRange']
        },
        command: async (args) => {
          try {
            const options = {
              community: args.community || 'public',
              version: args.version || '2c',
              port: args.port || 161,
              timeout: args.timeout || 5000
            };
            
            const result = await snmpDiscover(args.targetRange, options);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP Discovery failed: ${error.message}`);
          }
        }
      },
      
      // --- Top 5 SNMP Discovery Tools ---
      {
        name: 'snmp_device_inventory',
        description: 'Performs a comprehensive device inventory via SNMP including system info, interfaces, and storage.',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string', description: 'Hostname or IP address of target device' },
            community: { type: 'string', description: 'SNMP community string', default: 'public' },
            version: { type: 'string', enum: ['1', '2c', '3'], description: 'SNMP version', default: '2c' }
          },
          required: ['host']
        },
        command: async (args) => {
          try {
            const result = await snmpDeviceInventory(
              args.host,
              args.community || 'public',
              args.version || '2c'
            );
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP Device Inventory failed: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_interface_discovery',
        description: 'Discovers and details all network interfaces on a device via SNMP.',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string', description: 'Hostname or IP address of target device' },
            community: { type: 'string', description: 'SNMP community string', default: 'public' },
            version: { type: 'string', enum: ['1', '2c', '3'], description: 'SNMP version', default: '2c' }
          },
          required: ['host']
        },
        command: async (args) => {
          try {
            const result = await snmpInterfaceDiscovery(
              args.host,
              args.community || 'public',
              args.version || '2c'
            );
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP Interface Discovery failed: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_system_health',
        description: 'Checks system health metrics via SNMP including CPU, memory, storage, and interfaces.',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string', description: 'Hostname or IP address of target device' },
            community: { type: 'string', description: 'SNMP community string', default: 'public' },
            version: { type: 'string', enum: ['1', '2c', '3'], description: 'SNMP version', default: '2c' }
          },
          required: ['host']
        },
        command: async (args) => {
          try {
            const result = await snmpSystemHealthCheck(
              args.host,
              args.community || 'public',
              args.version || '2c'
            );
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP System Health Check failed: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_service_discovery',
        description: 'Discovers running services and listening ports via SNMP.',
        schema: {
          type: 'object',
          properties: {
            host: { type: 'string', description: 'Hostname or IP address of target device' },
            community: { type: 'string', description: 'SNMP community string', default: 'public' },
            version: { type: 'string', enum: ['1', '2c', '3'], description: 'SNMP version', default: '2c' }
          },
          required: ['host']
        },
        command: async (args) => {
          try {
            const result = await snmpServiceDiscovery(
              args.host,
              args.community || 'public',
              args.version || '2c'
            );
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP Service Discovery failed: ${error.message}`);
          }
        }
      },
      {
        name: 'snmp_network_topology',
        description: 'Maps network topology using CDP/LLDP and other protocols via SNMP.',
        schema: {
          type: 'object',
          properties: {
            networkRange: { type: 'string', description: 'Network range in CIDR notation (e.g., 192.168.1.0/24)' },
            community: { type: 'string', description: 'SNMP community string', default: 'public' },
            version: { type: 'string', enum: ['1', '2c', '3'], description: 'SNMP version', default: '2c' }
          },
          required: ['networkRange']
        },
        command: async (args) => {
          try {
            const result = await snmpNetworkTopologyMapper(
              args.networkRange,
              args.community || 'public',
              args.version || '2c'
            );
            return JSON.stringify(result, null, 2);
          } catch (error) {
            throw new Error(`SNMP Network Topology Mapping failed: ${error.message}`);
          }
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
      // Support async/in-process tools (like memory tools)
      if (tool.command.constructor.name === 'AsyncFunction') {
        const result = await tool.command(args);
        return {
          success: true,
          stdout: Array.isArray(result) ? result.join('\n') : String(result),
          stderr: '',
          exitCode: 0,
          isError: false
        };
      }
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

// --- Proxmox API Helper ---
const https = require('https');
const { URL } = require('url');

// Utility function for formatting API responses
function formatProxmoxObject(obj, indent = '') {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return String(obj);
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    
    return '[\n' + obj.map(item => 
      `${indent}  ${formatProxmoxObject(item, indent + '  ')}`
    ).join(',\n') + `\n${indent}]`;
  }
  
  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';
  
  return '{\n' + entries.map(([key, value]) => 
    `${indent}  ${key}: ${formatProxmoxObject(value, indent + '  ')}`
  ).join(',\n') + `\n${indent}}`;
}

async function readProxmoxCredentials() {
  // Try current working directory first, then __dirname
  const possiblePaths = [
    path.join(process.cwd(), 'proxmox_credentials.json'),
    path.join(__dirname, 'proxmox_credentials.json')
  ];
  let lastErr;
  for (const credPath of possiblePaths) {
    try {
      if (fs.existsSync(credPath)) {
        const raw = fs.readFileSync(credPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error('Could not find proxmox_credentials.json in current directory or script directory.' + (lastErr ? ' Last error: ' + lastErr.message : ''));
}

// Store credentials in /tmp which is a writable tmpfs in the Docker container
const CREDS_STORE_PATH = path.join('/tmp', 'proxmox_creds_store.json');
const CREDS_KEY_PATH = path.join('/tmp', 'proxmox_creds_key');

function getCredsKey() {
  // Use a persistent key file, or generate one if missing
  if (!fs.existsSync(CREDS_KEY_PATH)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(CREDS_KEY_PATH, key);
    return key;
  }
  return fs.readFileSync(CREDS_KEY_PATH);
}

function encrypt(text) {
  const key = getCredsKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decrypt(data) {
  const key = getCredsKey();
  const [ivB64, encrypted] = data.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function loadCredsStore() {
  if (!fs.existsSync(CREDS_STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CREDS_STORE_PATH, 'utf-8'));
}

function saveCredsStore(store) {
  fs.writeFileSync(CREDS_STORE_PATH, JSON.stringify(store, null, 2));
}

// Add a new credential
async function proxmox_creds_add(args) {
  const { id, username, password, realm } = args;
  let { hostname } = args;
  
  // Validate required inputs
  if (!id || !hostname || !username || !password) {
    throw new Error('id, hostname, username, and password are required');
  }
  
  // Validate host URL format and normalize
  try {
    // Add https:// prefix if not present
    let hostUrl = hostname;
    if (!hostUrl.match(/^https?:\/\//)) {
      hostUrl = `https://${hostUrl}`;
    }
    
    // Parse the URL to validate it
    const url = new URL(hostUrl);
    
    // We'll store just the hostname part (without protocol) to be consistent
    hostname = url.hostname;
  } catch (e) {
    throw new Error(`Invalid hostname format: ${e.message}`);
  }
  
  // Check for existing credential
  const store = loadCredsStore();
  if (store[id]) throw new Error('Credential with this id already exists');
  
  // Store the credential with realm defaulting to 'pam'
  store[id] = {
    host: hostname,
    port: args.port || 8006,
    username,
    password: encrypt(password),
    realm: realm || 'pam',
    verify_ssl: args.verify_ssl !== false, // Default to true if not specified
    created: new Date().toISOString()
  };
  
  saveCredsStore(store);
  return `Successfully added Proxmox credential with ID: ${id}`;
}

// List credentials (no passwords)
async function proxmox_creds_list() {
  const store = loadCredsStore();
  const credentials = Object.entries(store).map(([id, v]) => ({ id, host: v.host, username: v.username, realm: v.realm, created: v.created }));
  
  if (credentials.length === 0) {
    return "No Proxmox credentials found.";
  }
  
  // Format credentials into a readable string
  return credentials.map(cred => 
    `ID: ${cred.id}\n` +
    `Host: ${cred.host}\n` +
    `Username: ${cred.username}\n` +
    `Realm: ${cred.realm}\n` +
    `Created: ${cred.created}\n`
  ).join('\n-----------------------\n');
}

// Remove a credential
async function proxmox_creds_remove(args) {
  const { id } = args;
  if (!id) throw new Error('id is required');
  const store = loadCredsStore();
  if (!store[id]) throw new Error('Credential not found');
  delete store[id];
  saveCredsStore(store);
  return { success: true };
}

// Helper to get a credential by id (with decrypted password)
function getProxmoxCredsById(id) {
  const store = loadCredsStore();
  if (!store[id]) throw new Error('Credential not found');
  const c = store[id];
  return { ...c, password: decrypt(c.password) };
}

// --- Proxmox Tool Handlers ---
async function proxmoxApiRequest(endpoint, method = 'GET', body = null, creds_id = null) {
  let creds;
  if (creds_id) {
    creds = getProxmoxCredsById(creds_id);
  } else {
    // fallback: use first available
    const store = loadCredsStore();
    const first = Object.values(store)[0];
    if (!first) throw new Error('No Proxmox credentials available');
    creds = { ...first, password: decrypt(first.password) };
  }
  
  // Authenticate (get ticket)
  const authRes = await fetchProxmoxTicket(creds);
  const ticket = authRes.ticket;
  const csrf = authRes.CSRFPreventionToken;
  
  // Use the same URL construction logic as in fetchProxmoxTicket
  let baseUrl = creds.host;
  if (!baseUrl.match(/^https?:\/\//)) {
    baseUrl = `https://${baseUrl}`;
  }
  
  // Add port if not included in the URL and port is specified in creds
  if (creds.port && !baseUrl.includes(':8006') && !baseUrl.match(/:\d+\/?$/)) {
    baseUrl = baseUrl.replace(/\/$/, '');
    baseUrl = `${baseUrl}:${creds.port}`;
  }
  
  baseUrl = baseUrl.replace(/\/$/, '');
  const fullUrl = new URL(baseUrl + endpoint);
  
  console.log(`[Proxmox API] Requesting ${method} ${fullUrl.origin}${fullUrl.pathname}`);
  
  return new Promise((resolve, reject) => {
    const headers = {
      'Cookie': `PVEAuthCookie=${ticket}`,
      'Accept-Encoding': 'identity', // Prevent chunked encoding
      'Accept': 'application/json' // Explicitly request JSON response
    };
    
    // Add CSRF token for non-GET requests
    if (method !== 'GET' && csrf) {
      headers['CSRFPreventionToken'] = csrf;
    }
    
    // Set content type and length for requests with body
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    
    const options = {
      method,
      headers,
      rejectUnauthorized: false // Allow self-signed certs
    };
    
    console.log(`[Proxmox API] Request headers: ${JSON.stringify(headers, (key, value) => 
      key === 'Cookie' ? '[REDACTED]' : value)}`);
    
    const req = https.request(fullUrl, options, (res) => {
      console.log(`[Proxmox API] Response status: ${res.statusCode}`);
      console.log(`[Proxmox API] Response headers: ${JSON.stringify(res.headers)}`);
      
      // Handle redirects if needed
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`[Proxmox API] Redirect to: ${res.headers.location}`);
        reject(new Error(`Proxmox API redirected to ${res.headers.location} - please update your host URL`));
        return;
      }
      
      // Handle error responses
      if (res.statusCode >= 400) {
        console.error(`[Proxmox API] Error status code: ${res.statusCode}`);
        
        // Collect response data before rejecting to get error details from Proxmox
        let errorData = '';
        res.on('data', chunk => {
          errorData += chunk;
        });
        
        res.on('end', () => {
          try {
            // Try to parse error response for more details
            if (errorData && errorData.trim()) {
              const errorJson = JSON.parse(errorData.trim());
              reject(new Error(`Proxmox API error (${res.statusCode}): ${errorJson.message || JSON.stringify(errorJson)}`));
            } else {
              reject(new Error(`Proxmox API returned error status: ${res.statusCode}`));
            }
          } catch (e) {
            // If we can't parse the error, return the raw response
            reject(new Error(`Proxmox API error (${res.statusCode}): ${errorData.substring(0, 200) || 'No error details provided'}`));
          }
        });
        
        return;
      }
      
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          // Check if we got any data
          if (!data || data.trim() === '') {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              // Empty response with success status code is OK for some operations
              resolve({});
              return;
            }
            reject(new Error('Empty response from Proxmox API'));
            return;
          }
          
          // Trim any whitespace to avoid parsing errors
          const trimmedData = data.trim();
          const parsed = JSON.parse(trimmedData);
          
          console.log(`[Proxmox API] Response parsed successfully`);
          
          // Check for Proxmox error responses
          if (parsed.status && parsed.status !== 'OK') {
            reject(new Error(`Proxmox API error: ${parsed.message || JSON.stringify(parsed)}`));
            return;
          }
          
          // Make sure we have data
          if (parsed.data === undefined) {
            // Some Proxmox API endpoints return the result directly without a data wrapper
            if (Object.keys(parsed).length > 0) {
              resolve(parsed);
              return;
            }
            reject(new Error(`Proxmox API returned no data: ${JSON.stringify(parsed)}`));
            return;
          }
          
          resolve(parsed.data);
        } catch (e) {
          console.error(`[Proxmox API] Parse error: ${e.message}`);
          console.error(`[Proxmox API] Raw response: ${data.substring(0, 200)}...`);
          reject(new Error(`Failed to parse Proxmox API response: ${e.message}\nRaw response: ${data.substring(0, 100)}...`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`[Proxmox API] Request error: ${error.message}`);
      reject(error);
    });
    
    if (body) {
      req.write(body);
    }
    
    req.end();
  });
}

async function fetchProxmoxTicket(creds) {
  return new Promise((resolve, reject) => {
    const host = creds.host;
    // Ensure the URL has a protocol
    let baseUrl = host;
    if (!baseUrl.match(/^https?:\/\//)) {
      baseUrl = `https://${baseUrl}`;
    }
    
    // Add port if not included in the URL and port is specified in creds
    if (creds.port && !baseUrl.includes(':8006') && !baseUrl.match(/:\d+\/?$/)) {
      // Remove trailing slash if present
      baseUrl = baseUrl.replace(/\/$/, '');
      // Add port
      baseUrl = `${baseUrl}:${creds.port}`;
    }
    
    const url = new URL(baseUrl.replace(/\/$/, '') + '/api2/json/access/ticket');
    // Ensure the realm is included in the login request
    const realm = creds.realm || 'pam';
    
    // IMPORTANT FIX: Proxmox requires username in format "username@realm" as a single parameter
    // Do not use @ in the username portion, only for separating username and realm
    const postData = `username=${encodeURIComponent(creds.username)}@${encodeURIComponent(realm)}&password=${encodeURIComponent(creds.password)}`;
    
    // Log request (without password)
    console.log(`[Proxmox Auth] Requesting auth ticket from ${url.origin}${url.pathname} for user ${creds.username}@${realm}`);
    console.log(`[Proxmox Auth] Request data length: ${Buffer.byteLength(postData)} bytes`);
    
    const options = {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Accept-Encoding': 'identity', // Prevent chunked encoding
        'Accept': 'application/json', // Explicitly request JSON response
        'User-Agent': 'MCP-Open-Discovery/1.0' // Add a User-Agent header
      },
      rejectUnauthorized: false // Allow self-signed certs
    };
    
    console.log(`[Proxmox Auth] Request headers: ${JSON.stringify(options.headers)}`);
    
    const req = https.request(url, options, (res) => {
      console.log(`[Proxmox Auth] Response status: ${res.statusCode}`);
      console.log(`[Proxmox Auth] Response headers: ${JSON.stringify(res.headers)}`);
      
      // Handle redirects if needed
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`[Proxmox Auth] Redirect to: ${res.headers.location}`);
        reject(new Error(`Proxmox API redirected to ${res.headers.location} - please update your host URL`));
        return;
      }
      
      // Handle error responses
      if (res.statusCode >= 400) {
        console.error(`[Proxmox Auth] Error status code: ${res.statusCode}`);
        
        // Collect response data before rejecting to get error details from Proxmox
        let errorData = '';
        res.on('data', chunk => {
          errorData += chunk;
          console.log(`[Proxmox Auth] Received error chunk: ${chunk.length} bytes`);
        });
        
        res.on('end', () => {
          console.log(`[Proxmox Auth] Total error data length: ${errorData.length} bytes`);
          if (errorData.length > 0) {
            console.log(`[Proxmox Auth] First 200 chars of error response: ${errorData.substring(0, 200)}`);
          }
          
          try {
            // Try to parse error response for more details
            if (errorData && errorData.trim()) {
              try {
                const errorJson = JSON.parse(errorData.trim());
                reject(new Error(`Proxmox API auth error (${res.statusCode}): ${errorJson.message || JSON.stringify(errorJson)}`));
              } catch (parseError) {
                // If JSON parsing fails, return the raw error
                reject(new Error(`Proxmox API auth error (${res.statusCode}): ${errorData.substring(0, 200)}`));
              }
            } else {
              reject(new Error(`Proxmox API auth returned error status: ${res.statusCode} (no error details provided)`));
            }
          } catch (e) {
            // If we can't parse the error, return the raw response
            reject(new Error(`Proxmox API auth error (${res.statusCode}): ${errorData.substring(0, 200) || 'No error details provided'}`));
          }
        });
        
        return;
      }
      
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        console.log(`[Proxmox Auth] Received chunk: ${chunk.length} bytes`);
      });
      
      res.on('end', () => {
        console.log(`[Proxmox Auth] Total response data length: ${data.length} bytes`);
        if (data.length > 0) {
          console.log(`[Proxmox Auth] First 200 chars of response: ${data.substring(0, 200)}`);
        }
        
        try {
          // Trim any whitespace to avoid parsing errors
          const trimmedData = data.trim();
          if (!trimmedData) {
            reject(new Error('Empty response from Proxmox API'));
            return;
          }
          
          const parsed = JSON.parse(trimmedData);
          console.log(`[Proxmox Auth] Response parsed successfully`);
          
          if (!parsed.data) {
            reject(new Error(`Proxmox API error: ${parsed.message || JSON.stringify(parsed)}`));
            return;
          }
          
          // Debug output to confirm we have the expected ticket and CSRF token
          console.log(`[Proxmox Auth] Successfully obtained auth ticket and CSRF token`);
          console.log(`[Proxmox Auth] Username from response: ${parsed.data.username || 'not provided'}`);
          
          resolve(parsed.data);
        } catch (e) {
          console.error(`[Proxmox Auth] Parse error: ${e.message}`);
          reject(new Error(`Failed to parse Proxmox ticket response: ${e.message}\nRaw response: ${data.substring(0, 100)}...`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`[Proxmox Auth] Request error: ${error.message}`);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

// Update all Proxmox tool handlers to accept creds_id
async function proxmox_list_nodes(args = {}) {
  const nodes = await proxmoxApiRequest('/api2/json/nodes', 'GET', null, args.creds_id);
  
  // Format nodes into a readable string
  if (Array.isArray(nodes)) {
    if (nodes.length === 0) {
      return "No Proxmox nodes found.";
    }
    
    return nodes.map(node => {
      // Create a formatted string for each node
      return Object.entries(node)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    }).join('\n\n-----------------------\n\n');
  }
  
  // If not an array, return a string representation
  return JSON.stringify(nodes, null, 2);
}
async function proxmox_get_node_details(args) {
  if (!args.node) throw new Error('Missing required parameter: node');
  const result = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}`, 'GET', null, args.creds_id);
  
  // Format the result as a readable string
  if (Array.isArray(result)) {
    if (result.length === 0) {
      return "No details found for this node.";
    }
    
    return result.map((item, index) => {
      // For each item in the array, format its properties
      const formattedItem = Object.entries(item)
        .map(([key, value]) => {
          // Handle nested objects properly using the shared formatter
          if (typeof value === 'object' && value !== null) {
            return `${key}: ${formatProxmoxObject(value, '  ')}`;
          }
          return `${key}: ${value}`;
        })
        .join('\n  ');
      
      return `Item ${index}:\n  ${formattedItem}`;
    }).join('\n\n');
  } else if (typeof result === 'object' && result !== null) {
    // Handle single object case
    return Object.entries(result)
      .map(([key, value]) => {
        // Handle nested objects properly using the shared formatter
        if (typeof value === 'object' && value !== null) {
          return `${key}: ${formatProxmoxObject(value, '')}`;
        }
        return `${key}: ${value}`;
      })
      .join('\n');
  }
  
  return JSON.stringify(result, null, 2);
}
async function proxmox_list_vms(args) {
  if (!args.node) throw new Error('Missing required parameter: node');
  const vms = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}/qemu`, 'GET', null, args.creds_id);
  
  // Format VMs into a readable string
  if (Array.isArray(vms)) {
    if (vms.length === 0) {
      return "No virtual machines found on this node.";
    }
    
    return vms.map(vm => {
      return Object.entries(vm)
        .map(([key, value]) => {
          // Handle nested objects properly using the shared formatter
          if (typeof value === 'object' && value !== null) {
            return `${key}: ${formatProxmoxObject(value, '')}`;
          }
          return `${key}: ${value}`;
        })
        .join('\n');
    }).join('\n\n-----------------------\n\n');
  }
  
  return JSON.stringify(vms, null, 2);
}
async function proxmox_get_vm_details(args) {
  if (!args.node || !args.vmid) throw new Error('Missing required parameters: node, vmid');
  const details = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}/qemu/${encodeURIComponent(args.vmid)}/config`, 'GET', null, args.creds_id);
  
  // Format VM details as a readable string
  if (typeof details === 'object' && details !== null) {
    return Object.entries(details)
      .map(([key, value]) => {
        // Handle nested objects properly using the shared formatter
        if (typeof value === 'object' && value !== null) {
          return `${key}: ${formatProxmoxObject(value, '')}`;
        }
        return `${key}: ${value}`;
      })
      .join('\n');
  }
  
  return JSON.stringify(details, null, 2);
}
async function proxmox_list_containers(args) {
  if (!args.node) throw new Error('Missing required parameter: node');
  const containers = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}/lxc`, 'GET', null, args.creds_id);
  
  // Format containers into a readable string
  if (Array.isArray(containers)) {
    if (containers.length === 0) {
      return "No containers found on this node.";
    }
    
    return containers.map(container => {
      return Object.entries(container)
        .map(([key, value]) => {
          // Handle nested objects properly using the shared formatter
          if (typeof value === 'object' && value !== null) {
            return `${key}: ${formatProxmoxObject(value, '')}`;
          }
          return `${key}: ${value}`;
        })
        .join('\n');
    }).join('\n\n-----------------------\n\n');
  }
  
  return JSON.stringify(containers, null, 2);
}
async function proxmox_get_container_details(args) {
  if (!args.node || !args.vmid) throw new Error('Missing required parameters: node, vmid');
  const details = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}/lxc/${encodeURIComponent(args.vmid)}/config`, 'GET', null, args.creds_id);
  
  // Format container details as a readable string
  if (typeof details === 'object' && details !== null) {
    return Object.entries(details)
      .map(([key, value]) => {
        // Handle nested objects properly using the shared formatter
        if (typeof value === 'object' && value !== null) {
          return `${key}: ${formatProxmoxObject(value, '')}`;
        }
        return `${key}: ${value}`;
      })
      .join('\n');
  }
  
  return JSON.stringify(details, null, 2);
}
async function proxmox_list_storage(args) {
  if (!args.node) throw new Error('Missing required parameter: node');
  const storage = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}/storage`, 'GET', null, args.creds_id);
  
  // Format storage into a readable string
  if (Array.isArray(storage)) {
    if (storage.length === 0) {
      return "No storage found on this node.";
    }
    
    return storage.map(item => {
      return Object.entries(item)
        .map(([key, value]) => {
          // Handle nested objects properly using the shared formatter
          if (typeof value === 'object' && value !== null) {
            return `${key}: ${formatProxmoxObject(value, '')}`;
          }
          return `${key}: ${value}`;
        })
        .join('\n');
    }).join('\n\n-----------------------\n\n');
  }
  
  return JSON.stringify(storage, null, 2);
}
async function proxmox_list_networks(args) {
  if (!args.node) throw new Error('Missing required parameter: node');
  const networks = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}/network`, 'GET', null, args.creds_id);
  
  // Format networks into a readable string
  if (Array.isArray(networks)) {
    if (networks.length === 0) {
      return "No networks found on this node.";
    }
    
    return networks.map(network => {
      return Object.entries(network)
        .map(([key, value]) => {
          // Handle nested objects properly using the shared formatter

         
          if (typeof value === 'object' && value !== null) {
            return `${key}: ${formatProxmoxObject(value, '')}`;
          }
          return `${key}: ${value}`;
        })
        .join('\n');
    }).join('\n\n-----------------------\n\n');
  }
  
  return JSON.stringify(networks, null, 2);
}
async function proxmox_cluster_resources(args = {}) {
  const resources = await proxmoxApiRequest('/api2/json/cluster/resources', 'GET', null, args.creds_id);
  
  // Format resources into a readable string
  if (Array.isArray(resources)) {
    if (resources.length === 0) {
      return "No resources found in the cluster.";
    }
    
    return resources.map(resource => {
      return Object.entries(resource)
        .map(([key, value]) => {
          // Handle nested objects properly using the shared formatter
          if (typeof value === 'object' && value !== null) {
            return `${key}: ${formatProxmoxObject(value, '')}`;
          }
          return `${key}: ${value}`;
        })
        .join('\n');
    }).join('\n\n-----------------------\n\n');
  }
  
  return JSON.stringify(resources, null, 2);
}
async function proxmox_get_metrics(args) {
  if (!args.node) throw new Error('Missing required parameter: node');
  
  let metrics;
  let sourceType;
  
  if (args.vmid) {
    // VM metrics
    sourceType = "VM";
    metrics = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}/qemu/${encodeURIComponent(args.vmid)}/status/current`, 'GET', null, args.creds_id);
  } else {
    // Node metrics
    sourceType = "Node";
    metrics = await proxmoxApiRequest(`/api2/json/nodes/${encodeURIComponent(args.node)}/status`, 'GET', null, args.creds_id);
  }
  
  // Format metrics into a readable string
  if (typeof metrics === 'object') {
    const header = `${sourceType} Metrics for ${args.node}${args.vmid ? ` VM ${args.vmid}` : ''}:\n`;
    
    const formattedMetrics = Object.entries(metrics)
      .map(([key, value]) => {
        // Handle nested objects properly using the shared formatter
        if (typeof value === 'object' && value !== null) {
          return `${key}: ${formatProxmoxObject(value, '')}`;
        }
        return `${key}: ${value}`;
      })
      .join('\n');
    
    return header + formattedMetrics;
  }
  
  return JSON.stringify(metrics, null,  2);
}

// Export Proxmox API functions for testing
module.exports = {
  proxmox_list_nodes,
  proxmox_get_node_details,
  proxmox_list_vms,
  proxmox_get_vm_details,
  proxmox_list_containers,
  proxmox_get_container_details,
  proxmox_list_storage,
  proxmox_list_networks,
  proxmox_cluster_resources,
  proxmox_get_metrics,
  proxmoxApiRequest,
  fetchProxmoxTicket,
  proxmox_creds_add,
  proxmox_creds_list,
  proxmox_creds_remove
};

// Create an instance of the server
const server = new MCPOpenDiscoveryServer();

// Define Proxmox tools
const proxmoxTools = [
  {
    name: 'proxmox_list_nodes',
    description: 'Returns all nodes in the Proxmox cluster.',
    schema: { type: 'object', properties: { creds_id: { type: 'string', description: 'Credential ID to use (optional)' } } },
    command: async () => await proxmox_list_nodes()
  },
  {
    name: 'proxmox_get_node_details',
    description: 'Returns details for a given Proxmox node.',
    schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
    command: async (args) => await proxmox_get_node_details(args)
  },
  {
    name: 'proxmox_list_vms',
    description: 'Returns all VMs for a Proxmox node.',
    schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
    command: async (args) => await proxmox_list_vms(args)
  },
  {
    name: 'proxmox_get_vm_details',
    description: 'Returns config/details for a given VM.',
    schema: { type: 'object', properties: { node: { type: 'string' }, vmid: { type: 'string' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node', 'vmid'] },
    command: async (args) => await proxmox_get_vm_details(args)
  },
  {
    name: 'proxmox_list_containers',
    description: 'Returns all LXC containers for a Proxmox node.',
    schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
    command: async (args) => await proxmox_list_containers(args)
  },
  {
    name: 'proxmox_get_container_details',
    description: 'Returns config/details for a given container.',
    schema: { type: 'object', properties: { node: { type: 'string' }, vmid: { type: 'string' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node', 'vmid'] },
    command: async (args) => await proxmox_get_container_details(args)
  },
  {
    name: 'proxmox_list_storage',
    description: 'Returns storage resources for a Proxmox node.',
    schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
    command: async (args) => await proxmox_list_storage(args)
  },
  {
    name: 'proxmox_list_networks',
    description: 'Returns network config for a Proxmox node.',
    schema: { type: 'object', properties: { node: { type: 'string', description: 'Node name' }, creds_id: { type: 'string', description: 'Credential ID to use (optional)' } }, required: ['node'] },
    command: async (args) => await proxmox_list_networks(args)
  },
  {
    name: 'proxmox_cluster_resources',
    description: 'Returns all resources in the Proxmox cluster.',
    schema: { type: 'object', properties: { creds_id: { type: 'string', description: 'Credential ID to use (optional)' } } },
    command: async (args) => await proxmox_cluster_resources(args)
  },
  {
    name: 'proxmox_get_metrics',
    description: 'Returns metrics data for a node or VM.',
    schema: { 
      type: 'object', 
      properties: { 
        node: { type: 'string', description: 'Node name' },
        timeframe: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'year'], description: 'Timeframe for metrics', default: 'hour' },
        vmid: { type: 'string', description: 'VM ID (optional - if not provided, returns node metrics)' },
        creds_id: { type: 'string', description: 'Credential ID to use (optional)' } 
      }, 
      required: ['node'] 
    },
    command: async (args) => await proxmox_get_metrics(args)
  },
  {
    name: 'proxmox_creds_add',
    description: 'Adds/updates Proxmox API credentials.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifier for these credentials' },
        hostname: { type: 'string', description: 'Proxmox API hostname (e.g., proxmox.example.com)' },
        port: { type: 'number', description: 'Proxmox API port (default: 8006)', default: 8006 },
        username: { type: 'string', description: 'Proxmox username (e.g., root@pam)' },
        password: { type: 'string', description: 'Proxmox password' },
        token_name: { type: 'string', description: 'API token name (optional - use instead of password)' },
        token_value: { type: 'string', description: 'API token value (optional - use instead of password)' },
        verify_ssl: { type: 'boolean', description: 'Verify SSL certificate', default: true }
      },
      required: ['id', 'hostname', 'username']
    },
    command: async (args) => await proxmox_creds_add(args)
  },
  {
    name: 'proxmox_creds_list',
    description: 'Lists stored Proxmox API credentials.',
    schema: { type: 'object', properties: {} },
    command: async () => await proxmox_creds_list()
  },
  {
    name: 'proxmox_creds_remove',
    description: 'Removes stored Proxmox API credentials.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifier for the credentials to remove' }
      },
      required: ['id']
    },
    command: async (args) => await proxmox_creds_remove(args)
  }
];

// Register Proxmox tools by adding them to the server's tool collection
proxmoxTools.forEach(tool => server.tools.set(tool.name, tool));

// Start the server
server.startServer(3000);