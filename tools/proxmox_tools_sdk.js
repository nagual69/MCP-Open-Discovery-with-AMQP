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

/**
 * Register all Proxmox tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerProxmoxTools(server) {
  // Proxmox List Nodes
  server.tool(
    'proxmox_list_nodes',
    'Returns all nodes in the Proxmox cluster.',
    {
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ creds_id }) => {
      try {
        const nodes = await proxmoxApiRequest('/api2/json/nodes', 'GET', null, creds_id);
        return formatProxmoxResult(nodes, 'Proxmox Cluster Nodes:');
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox Get Node Details
  server.tool(
    'proxmox_get_node_details',
    'Returns details for a given Proxmox node.',
    {
      node: z.string().describe('Node name'),
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ node, creds_id }) => {
      try {
        const nodeDetails = await proxmoxApiRequest(`/api2/json/nodes/${node}/status`, 'GET', null, creds_id);
        return formatProxmoxResult(nodeDetails, `Node Details for ${node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox List VMs
  server.tool(
    'proxmox_list_vms',
    'Returns all VMs for a Proxmox node.',
    {
      node: z.string().describe('Node name'),
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ node, creds_id }) => {
      try {
        const vms = await proxmoxApiRequest(`/api2/json/nodes/${node}/qemu`, 'GET', null, creds_id);
        return formatProxmoxResult(vms, `VMs on node ${node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox Get VM Details
  server.tool(
    'proxmox_get_vm_details',
    'Returns config/details for a given VM.',
    {
      node: z.string().describe('Node name'),
      vmid: z.string().describe('VM ID'),
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ node, vmid, creds_id }) => {
      try {
        const vmDetails = await proxmoxApiRequest(`/api2/json/nodes/${node}/qemu/${vmid}/config`, 'GET', null, creds_id);
        return formatProxmoxResult(vmDetails, `VM ${vmid} details on node ${node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox List Containers
  server.tool(
    'proxmox_list_containers',
    'Returns all LXC containers for a Proxmox node.',
    {
      node: z.string().describe('Node name'),
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ node, creds_id }) => {
      try {
        const containers = await proxmoxApiRequest(`/api2/json/nodes/${node}/lxc`, 'GET', null, creds_id);
        return formatProxmoxResult(containers, `LXC containers on node ${node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox Get Container Details
  server.tool(
    'proxmox_get_container_details',
    'Returns config/details for a given container.',
    {
      node: z.string().describe('Node name'),
      vmid: z.string().describe('Container ID'),
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ node, vmid, creds_id }) => {
      try {
        const containerDetails = await proxmoxApiRequest(`/api2/json/nodes/${node}/lxc/${vmid}/config`, 'GET', null, creds_id);
        return formatProxmoxResult(containerDetails, `Container ${vmid} details on node ${node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox List Storage
  server.tool(
    'proxmox_list_storage',
    'Returns storage resources for a Proxmox node.',
    {
      node: z.string().describe('Node name'),
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ node, creds_id }) => {
      try {
        const storage = await proxmoxApiRequest(`/api2/json/nodes/${node}/storage`, 'GET', null, creds_id);
        return formatProxmoxResult(storage, `Storage resources on node ${node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox List Networks
  server.tool(
    'proxmox_list_networks',
    'Returns network config for a Proxmox node.',
    {
      node: z.string().describe('Node name'),
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ node, creds_id }) => {
      try {
        const networks = await proxmoxApiRequest(`/api2/json/nodes/${node}/network`, 'GET', null, creds_id);
        return formatProxmoxResult(networks, `Network configuration for node ${node}:`);
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox Cluster Resources
  server.tool(
    'proxmox_cluster_resources',
    'Returns a summary of all cluster resources.',
    {
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ creds_id }) => {
      try {
        const resources = await proxmoxApiRequest('/api2/json/cluster/resources', 'GET', null, creds_id);
        return formatProxmoxResult(resources, 'Proxmox Cluster Resources:');
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox Get Metrics
  server.tool(
    'proxmox_get_metrics',
    'Returns metrics for a node or VM (if vmid is provided).',
    {
      node: z.string().describe('Node name'),
      vmid: z.string().optional().describe('VM ID (optional)'),
      creds_id: z.string().optional().describe('Credential ID to use (optional)')
    },
    async ({ node, vmid, creds_id }) => {
      try {
        let endpoint;
        let description;
        
        if (vmid) {
          endpoint = `/api2/json/nodes/${node}/qemu/${vmid}/status/current`;
          description = `Metrics for VM ${vmid} on node ${node}:`;
        } else {
          endpoint = `/api2/json/nodes/${node}/status`;
          description = `Metrics for node ${node}:`;
        }
        
        const metrics = await proxmoxApiRequest(endpoint, 'GET', null, creds_id);
        return formatProxmoxResult(metrics, description);
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Note: Proxmox credential management is now handled by the unified credential system.
  // Use the following tools for credential management:
  // - credentials_add (with type="password") to add Proxmox credentials
  // - credentials_list (with type="password" filter) to list Proxmox credentials  
  // - credentials_remove to remove Proxmox credentials
  //
  // Example for adding Proxmox credentials:
  // credentials_add({
  //   id: "proxmox1", 
  //   type: "password",
  //   username: "root",
  //   password: "secret",
  //   url: "https://pve.example.com:8006",
  //   notes: "Proxmox VE cluster primary, realm:pam, verify_ssl:true"
  // })
  //
  // The system will auto-detect Proxmox credentials by:
  // 1. URL containing port 8006
  // 2. Notes containing "proxmox" 
  // 3. ID containing "proxmox"

  console.log('[MCP SDK] Registered 10 Proxmox tools');
}

module.exports = { registerProxmoxTools };
