/**
 * Proxmox Tools Module for MCP Open Discovery Server
 * 
 * This module provides tools for interacting with Proxmox VE API to discover
 * and manage Proxmox cluster resources, including nodes, VMs, containers,
 * storage, and networking.
 */

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

// Proxmox API tool implementations
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
  
  return JSON.stringify(metrics, null, 2);
}

// Function to get the tools
function getTools() {
  return [
    {
      name: 'proxmox_list_nodes',
      description: 'Returns all nodes in the Proxmox cluster.',
      schema: { type: 'object', properties: { creds_id: { type: 'string', description: 'Credential ID to use (optional)' } } },
      command: async (args) => await proxmox_list_nodes(args)
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
      command: async (args) => await proxmox_cluster_resources(args)
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
    }
  ];
}

module.exports = {
  getTools,
  // Export individual functions for testing or direct use
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
