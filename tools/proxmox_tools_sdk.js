/**
 * Proxmox Tools Module for MCP Open Discovery - SDK Compatible
 * 
 * This module provides tools for interacting with Proxmox VE API to discover
 * and manage Proxmox cluster resources using the official MCP SDK patterns.
 * Converted from custom format to use Zod schemas and CallToolResult responses.
 */

const { z } = require('zod');
const https = require('https');
const { URL } = require('url');
const credentialsManager = require('./credentials_manager');

// Utility function for formatting API responses
function formatProxmoxObject(obj, indent = '') {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return String(obj);
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    
    return '[\\n' + obj.map(item => 
      `${indent}  ${formatProxmoxObject(item, indent + '  ')}`
    ).join(',\\n') + `\\n${indent}]`;
  }
  
  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';
  
  return '{\\n' + entries.map(([key, value]) => 
    `${indent}  ${key}: ${formatProxmoxObject(value, indent + '  ')}`
  ).join(',\\n') + `\\n${indent}}`;
}

// Helper to get a Proxmox credential by id using the new credential system
function getProxmoxCredsById(id) {
  try {
    const credential = credentialsManager.getCredential(id);
    
    // Ensure it's a password-type credential (Proxmox uses username/password auth)
    if (credential.type !== 'password') {
      throw new Error(`Credential '${id}' is not a password-type credential (found type: ${credential.type})`);
    }
    
    // Map the new credential format back to the expected Proxmox format
    let hostname, port;
    
    if (credential.url) {
      // Extract hostname and port from URL
      const url = new URL(credential.url);
      hostname = url.hostname;
      port = parseInt(url.port) || 8006;
    } else if (credential.customField1) {
      // Check if hostname is stored in customField1 (backward compatibility)
      hostname = credential.customField1;
      port = credential.customField2 ? parseInt(credential.customField2) : 8006;
    } else {
      throw new Error(`Credential '${id}' missing hostname/URL information. Use credentials_add with 'url' field for Proxmox credentials.`);
    }
    
    return {
      hostname: hostname,
      port: port,
      username: credential.username,
      password: credential.password,
      realm: credential.notes && credential.notes.includes('realm:') 
        ? credential.notes.split('realm:')[1].split(',')[0].trim() 
        : 'pam',
      verify_ssl: credential.notes && credential.notes.includes('verify_ssl:false') ? false : true
    };
  } catch (error) {
    throw new Error(`Failed to get Proxmox credential '${id}': ${error.message}`);
  }
}

// Proxmox API request function using new credential system
async function proxmoxApiRequest(endpoint, method = 'GET', data = null, credsId = null) {
  // Find credentials - use specified ID or fall back to first available Proxmox credential
  let creds;
  if (credsId) {
    creds = getProxmoxCredsById(credsId);
  } else {
    // Find first password-type credential that looks like a Proxmox credential
    const allCredentials = credentialsManager.listCredentials();
    const proxmoxCredentials = allCredentials.filter(c => 
      c.type === 'password' && 
      (c.url && c.url.includes(':8006')) || 
      (c.notes && c.notes.toLowerCase().includes('proxmox')) ||
      (c.id && c.id.toLowerCase().includes('proxmox'))
    );
    
    if (proxmoxCredentials.length === 0) {
      throw new Error('No Proxmox credentials found. Use credentials_add with type="password" and url="https://hostname:8006" to add Proxmox credentials.');
    }
    
    creds = getProxmoxCredsById(proxmoxCredentials[0].id);
  }
  
  // Fetch authentication ticket
  const ticket = await fetchProxmoxTicket(creds);
  
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, `https://${creds.hostname}:${creds.port || 8006}`);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `PVEAuthCookie=${ticket.ticket}`,
        'CSRFPreventionToken': ticket.CSRFPreventionToken
      },
      rejectUnauthorized: creds.verify_ssl !== false
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(responseData);
          if (jsonData.errors && jsonData.errors.length > 0) {
            reject(new Error(`Proxmox API error: ${jsonData.errors.join(', ')}`));
          } else {
            resolve(jsonData.data || jsonData);
          }
        } catch (error) {
          reject(new Error(`Failed to parse Proxmox API response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Proxmox API request failed: ${error.message}`));
    });
    
    if (data && method !== 'GET') {
      req.write(data);
    }
    
    req.end();
  });
}

// Fetch authentication ticket
async function fetchProxmoxTicket(creds) {
  return new Promise((resolve, reject) => {
    const postData = `username=${encodeURIComponent(creds.username + '@' + (creds.realm || 'pam'))}&password=${encodeURIComponent(creds.password)}`;
    
    const options = {
      hostname: creds.hostname,
      port: creds.port || 8006,
      path: '/api2/json/access/ticket',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      rejectUnauthorized: creds.verify_ssl !== false
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(responseData);
          if (jsonData.data && jsonData.data.ticket) {
            resolve(jsonData.data);
          } else {
            reject(new Error('Authentication failed: Invalid credentials or server response'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse authentication response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Authentication request failed: ${error.message}`));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * Convert Proxmox API results to CallToolResult format
 * @param {any} data - The API response data
 * @param {string} description - Description of the operation
 * @returns {Object} CallToolResult format
 */
function formatProxmoxResult(data, description = '') {
  try {
    const formattedData = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return {
      content: [
        {
          type: "text",
          text: description ? `${description}\\n\\n${formattedData}` : formattedData
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error formatting Proxmox result: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Handle Proxmox API errors and return proper CallToolResult format
 * @param {Error} error - The error object
 * @returns {Object} CallToolResult with error
 */
function formatProxmoxError(error) {
  return {
    content: [
      {
        type: "text",
        text: `Proxmox API Error: ${error.message}`
      }
    ],
    isError: true
  };
}

// New hot-reload registry format
const tools = [
  {
    name: "proxmox_list_nodes",
    description: "Returns all nodes in the Proxmox cluster.",
    inputSchema: z.object({
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_get_node_details",
    description: "Returns details for a given Proxmox node.",
    inputSchema: z.object({
      node: z.string().describe("Node name"),
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_list_vms",
    description: "Returns all VMs for a Proxmox node.",
    inputSchema: z.object({
      node: z.string().describe("Node name"),
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_get_vm_details",
    description: "Returns config/details for a given VM.",
    inputSchema: z.object({
      node: z.string().describe("Node name"),
      vmid: z.string().describe("VM ID"),
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_list_containers",
    description: "Returns all LXC containers for a Proxmox node.",
    inputSchema: z.object({
      node: z.string().describe("Node name"),
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_get_container_details",
    description: "Returns config/details for a given container.",
    inputSchema: z.object({
      node: z.string().describe("Node name"),
      vmid: z.string().describe("Container ID"),
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_list_storage",
    description: "Returns storage resources for a Proxmox node.",
    inputSchema: z.object({
      node: z.string().describe("Node name"),
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_list_networks",
    description: "Returns network config for a Proxmox node.",
    inputSchema: z.object({
      node: z.string().describe("Node name"),
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_cluster_resources",
    description: "Returns a summary of all cluster resources.",
    inputSchema: z.object({
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
  {
    name: "proxmox_get_metrics",
    description: "Returns metrics for a node or VM (if vmid is provided).",
    inputSchema: z.object({
      node: z.string().describe("Node name"),
      vmid: z.string().describe("VM ID (optional)").optional(),
      creds_id: z.string().describe("Credential ID to use (optional)").optional()
    }),
  },
];

// New hot-reload handleToolCall function
async function handleToolCall(name, args) {
  switch (name) {
    case "proxmox_list_nodes":
      try {
        const nodes = await proxmoxApiRequest('/api2/json/nodes', 'GET', null, args.creds_id);
        return formatProxmoxResult(nodes, 'Proxmox Cluster Nodes:');
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_get_node_details":
      try {
        const nodeDetails = await proxmoxApiRequest(`/api2/json/nodes/${args.node}/status`, 'GET', null, args.creds_id);
        return formatProxmoxResult(nodeDetails, `Node Details for ${args.node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_list_vms":
      try {
        const vms = await proxmoxApiRequest(`/api2/json/nodes/${args.node}/qemu`, 'GET', null, args.creds_id);
        return formatProxmoxResult(vms, `VMs on node ${args.node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_get_vm_details":
      try {
        const vmDetails = await proxmoxApiRequest(`/api2/json/nodes/${args.node}/qemu/${args.vmid}/config`, 'GET', null, args.creds_id);
        return formatProxmoxResult(vmDetails, `VM ${args.vmid} details on node ${args.node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_list_containers":
      try {
        const containers = await proxmoxApiRequest(`/api2/json/nodes/${args.node}/lxc`, 'GET', null, args.creds_id);
        return formatProxmoxResult(containers, `LXC containers on node ${args.node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_get_container_details":
      try {
        const containerDetails = await proxmoxApiRequest(`/api2/json/nodes/${args.node}/lxc/${args.vmid}/config`, 'GET', null, args.creds_id);
        return formatProxmoxResult(containerDetails, `Container ${args.vmid} details on node ${args.node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_list_storage":
      try {
        const storage = await proxmoxApiRequest(`/api2/json/nodes/${args.node}/storage`, 'GET', null, args.creds_id);
        return formatProxmoxResult(storage, `Storage resources on node ${args.node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_list_networks":
      try {
        const networks = await proxmoxApiRequest(`/api2/json/nodes/${args.node}/network`, 'GET', null, args.creds_id);
        return formatProxmoxResult(networks, `Network configuration for node ${args.node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_cluster_resources":
      try {
        const resources = await proxmoxApiRequest('/api2/json/cluster/resources', 'GET', null, args.creds_id);
        return formatProxmoxResult(resources, 'Proxmox Cluster Resources:');
      } catch (error) {
        return formatProxmoxError(error);
      }

    case "proxmox_get_metrics":
      try {
        let endpoint;
        let description;
        
        if (args.vmid) {
          endpoint = `/api2/json/nodes/${args.node}/qemu/${args.vmid}/status/current`;
          description = `Metrics for VM ${args.vmid} on node ${args.node}:`;
        } else {
          endpoint = `/api2/json/nodes/${args.node}/status`;
          description = `Metrics for node ${args.node}:`;
        }
        
        const metrics = await proxmoxApiRequest(endpoint, 'GET', null, args.creds_id);
        return formatProxmoxResult(metrics, description);
      } catch (error) {
        return formatProxmoxError(error);
      }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { 
  tools, 
  handleToolCall, 
  // Utility functions for external use
  proxmoxApiRequest,
  formatProxmoxResult,
  formatProxmoxError,
  formatProxmoxObject 
};
