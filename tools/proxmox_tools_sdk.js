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
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Store credentials in /tmp which is a writable tmpfs in the Docker container
const CREDS_STORE_PATH = path.join('/tmp', 'proxmox_creds_store.json');
const CREDS_KEY_PATH = path.join('/tmp', 'proxmox_creds_key');

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

// Helper to get a credential by id (with decrypted password)
function getProxmoxCredsById(id) {
  const store = loadCredsStore();
  if (!store[id]) throw new Error('Credential not found');
  const c = store[id];
  return { ...c, password: decrypt(c.password) };
}

// Proxmox API request function
async function proxmoxApiRequest(endpoint, method = 'GET', data = null, credsId = null) {
  const store = loadCredsStore();
  
  // Find credentials - use specified ID or fall back to first available
  let creds;
  if (credsId) {
    creds = getProxmoxCredsById(credsId);
  } else {
    const ids = Object.keys(store);
    if (ids.length === 0) {
      throw new Error('No Proxmox credentials stored. Use proxmox_creds_add first.');
    }
    creds = getProxmoxCredsById(ids[0]);
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

  // Proxmox Credentials Add
  server.tool(
    'proxmox_creds_add',
    'Add a new Proxmox credential (encrypted at rest).',
    {
      id: z.string().describe('Credential ID (unique, e.g. proxmox1)'),
      hostname: z.string().describe('Proxmox API hostname (e.g. proxmox.example.com or IP)'),
      port: z.number().default(8006).describe('Proxmox API port (default: 8006)'),
      username: z.string().describe('Username for authentication'),
      password: z.string().describe('Password for authentication'),
      realm: z.string().default('pam').describe('Authentication realm (default: pam)'),
      verify_ssl: z.boolean().default(true).describe('Verify SSL certificate')
    },
    async ({ id, hostname, port, username, password, realm, verify_ssl }) => {
      try {
        // Validate required inputs
        if (!id || !hostname || !username || !password) {
          throw new Error('id, hostname, username, and password are required');
        }
        
        // Validate host URL format and normalize
        let hostUrl = hostname;
        if (!hostUrl.match(/^https?:\/\//)) {
          hostUrl = `https://${hostUrl}`;
        }
        
        const parsedUrl = new URL(hostUrl);
        const normalizedHostname = parsedUrl.hostname;
        
        // Test the credentials by attempting to get a ticket
        const testCreds = {
          hostname: normalizedHostname,
          port: port || 8006,
          username,
          password,
          realm: realm || 'pam',
          verify_ssl: verify_ssl !== false
        };
        
        try {
          await fetchProxmoxTicket(testCreds);
        } catch (error) {
          throw new Error(`Credential validation failed: ${error.message}`);
        }
        
        // Load existing credentials store
        const store = loadCredsStore();
        
        // Check if ID already exists
        if (store[id]) {
          throw new Error(`Credential ID '${id}' already exists. Use a different ID or remove the existing one first.`);
        }
        
        // Encrypt the password
        const encryptedPassword = encrypt(password);
        
        // Store the credential
        store[id] = {
          hostname: normalizedHostname,
          port: port || 8006,
          username,
          password: encryptedPassword,
          realm: realm || 'pam',
          verify_ssl: verify_ssl !== false,
          created: new Date().toISOString()
        };
        
        saveCredsStore(store);
        
        return {
          content: [
            {
              type: "text",
              text: `Proxmox credential '${id}' added successfully for ${normalizedHostname}:${port || 8006}`
            }
          ]
        };
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox Credentials List
  server.tool(
    'proxmox_creds_list',
    'Lists stored Proxmox API credentials.',
    {},
    async () => {
      try {
        const store = loadCredsStore();
        const ids = Object.keys(store);
        
        if (ids.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No Proxmox credentials stored. Use proxmox_creds_add to add some."
              }
            ]
          };
        }
        
        const credsList = ids.map(id => {
          const creds = store[id];
          return {
            id,
            hostname: creds.hostname,
            port: creds.port,
            username: creds.username,
            realm: creds.realm,
            verify_ssl: creds.verify_ssl,
            created: creds.created
          };
        });
        
        return formatProxmoxResult(credsList, 'Stored Proxmox Credentials:');
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  // Proxmox Credentials Remove
  server.tool(
    'proxmox_creds_remove',
    'Removes stored Proxmox API credentials.',
    {
      id: z.string().describe('Credential ID to remove')
    },
    async ({ id }) => {
      try {
        const store = loadCredsStore();
        
        if (!store[id]) {
          throw new Error(`Credential ID '${id}' not found`);
        }
        
        delete store[id];
        saveCredsStore(store);
        
        return {
          content: [
            {
              type: "text",
              text: `Proxmox credential '${id}' removed successfully`
            }
          ]
        };
      } catch (error) {
        return formatProxmoxError(error);
      }
    }
  );

  console.log('[MCP SDK] Registered 13 Proxmox tools');
}

module.exports = { registerProxmoxTools };
