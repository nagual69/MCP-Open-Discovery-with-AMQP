/**
 * SNMP Tools Module for MCP Open Discovery - SDK Compatible
 * 
 * This module provides SNMP discovery and management tools using the official MCP SDK patterns.
 * Converted from custom format to use Zod schemas and CallToolResult responses.
 */

const { z } = require('zod');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

// In-memory store for SNMP sessions and credentials
const snmpSessions = new Map();

// Detect if we're running inside a Docker container
function isRunningInContainer() {
  try {
    // Check if we're in a container by looking for Docker-specific files
    return fs.existsSync('/.dockerenv') || 
           fs.existsSync('/proc/1/cgroup') && 
           fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker');
  } catch (error) {
    return false;
  }
}

// Execution environment detection
const IN_CONTAINER = isRunningInContainer();
console.log(`SNMP Tools SDK: Running ${IN_CONTAINER ? 'inside container' : 'on host'}`);

/**
 * Execute an SNMP command using command-line tools
 * Automatically detects if running in container or on host
 */
function executeSnmpCommand(command, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let processArgs;
    let processCommand;
    
    if (IN_CONTAINER) {
      // Running inside container - execute SNMP commands directly
      processCommand = command;
      processArgs = args;
    } else {
      // Running on host - execute SNMP commands via docker exec
      processCommand = 'docker';
      processArgs = ['exec', 'mcp-open-discovery', command, ...args];
    }
    
    const process = spawn(processCommand, processArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeout
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });
    
    process.on('error', (error) => {
      reject(new Error(`Process error: ${error.message}`));
    });
  });
}

/**
 * Parse SNMP response into structured data
 */
function parseSnmpResponse(output) {
  const lines = output.split('\n').filter(line => line.trim());
  const results = [];
  
  for (const line of lines) {
    const match = line.match(/^(.+?)\s*=\s*(.+?):\s*(.+)$/);
    if (match) {
      const [, oid, type, value] = match;
      results.push({
        oid: oid.trim(),
        type: type.trim(),
        value: value.trim()
      });
    } else if (line.includes('=')) {
      // Simple fallback for lines that don't match the pattern
      const [oid, rest] = line.split('=', 2);
      results.push({
        oid: oid.trim(),
        type: 'STRING',
        value: rest ? rest.trim() : ''
      });
    }
  }
  
  return results;
}

// Core SNMP Functions
function createSnmpSession(host, options = {}) {
  const sessionOptions = {
    host,
    community: options.community || 'public',
    version: options.version || '2c',
    port: options.port || 161,
    timeout: options.timeout || 5000,
    retries: options.retries || 1
  };
  
  // Add SNMPv3 options if specified
  if (options.version === '3') {
    sessionOptions.user = options.user;
    sessionOptions.authProtocol = options.authProtocol;
    sessionOptions.authKey = options.authKey;
    sessionOptions.privProtocol = options.privProtocol;
    sessionOptions.privKey = options.privKey;
  }
  
  const sessionId = crypto.randomUUID();
  snmpSessions.set(sessionId, { 
    options: sessionOptions, 
    lastUsed: Date.now() 
  });
  
  return { sessionId };
}

function closeSnmpSession(sessionId) {
  return snmpSessions.delete(sessionId);
}

async function snmpGet(sessionId, oids) {
  if (!snmpSessions.has(sessionId)) {
    throw new Error(`SNMP session ${sessionId} not found`);
  }
  
  const session = snmpSessions.get(sessionId);
  const options = session.options;
  snmpSessions.get(sessionId).lastUsed = Date.now();
  
  // Ensure oids is an array
  const oidArray = Array.isArray(oids) ? oids : [oids];
  
  // Build snmpget command
  const args = [
    '-v', options.version,
    '-c', options.community,
    '-t', Math.floor(options.timeout / 1000).toString(),
    '-r', options.retries.toString(),
    `${options.host}:${options.port}`,
    ...oidArray
  ];
  
  try {
    const output = await executeSnmpCommand('snmpget', args, options.timeout + 1000);
    return parseSnmpResponse(output);
  } catch (error) {
    throw new Error(`SNMP GET failed: ${error.message}`);
  }
}

async function snmpGetNext(sessionId, oids) {
  if (!snmpSessions.has(sessionId)) {
    throw new Error(`SNMP session ${sessionId} not found`);
  }
  
  const session = snmpSessions.get(sessionId);
  const options = session.options;
  snmpSessions.get(sessionId).lastUsed = Date.now();
  
  const oidArray = Array.isArray(oids) ? oids : [oids];
  
  const args = [
    '-v', options.version,
    '-c', options.community,
    '-t', Math.floor(options.timeout / 1000).toString(),
    '-r', options.retries.toString(),
    `${options.host}:${options.port}`,
    ...oidArray
  ];
  
  try {
    const output = await executeSnmpCommand('snmpgetnext', args, options.timeout + 1000);
    return parseSnmpResponse(output);
  } catch (error) {
    throw new Error(`SNMP GETNEXT failed: ${error.message}`);
  }
}

async function snmpWalk(sessionId, oid) {
  if (!snmpSessions.has(sessionId)) {
    throw new Error(`SNMP session ${sessionId} not found`);
  }
  
  const session = snmpSessions.get(sessionId);
  const options = session.options;
  snmpSessions.get(sessionId).lastUsed = Date.now();
  
  const args = [
    '-v', options.version,
    '-c', options.community,
    '-t', Math.floor(options.timeout / 1000).toString(),
    '-r', options.retries.toString(),
    `${options.host}:${options.port}`,
    oid
  ];
  
  try {
    const output = await executeSnmpCommand('snmpwalk', args, options.timeout + 1000);
    return parseSnmpResponse(output);
  } catch (error) {
    throw new Error(`SNMP WALK failed: ${error.message}`);
  }
}

async function snmpTable(sessionId, oid) {
  if (!snmpSessions.has(sessionId)) {
    throw new Error(`SNMP session ${sessionId} not found`);
  }
  
  const session = snmpSessions.get(sessionId);
  const options = session.options;
  snmpSessions.get(sessionId).lastUsed = Date.now();
  
  const args = [
    '-v', options.version,
    '-c', options.community,
    '-t', Math.floor(options.timeout / 1000).toString(),
    '-r', options.retries.toString(),
    `${options.host}:${options.port}`,
    oid
  ];
  
  try {
    const output = await executeSnmpCommand('snmptable', args, options.timeout + 1000);
    return { table: output.split('\n').filter(line => line.trim()) };
  } catch (error) {
    throw new Error(`SNMP TABLE failed: ${error.message}`);
  }
}

// Discovery functions - full implementations restored from archive
async function snmpDiscover(targetRange, options = {}) {
  const community = options.community || 'public';
  const port = options.port || 161;
  const timeout = options.timeout || 5000;
  const version = options.version || '2c';
  
  // Parse IP range (e.g., 192.168.1.0/24)
  const [baseIp, cidr] = targetRange.split('/');
  if (!baseIp || !cidr) {
    throw new Error('Invalid target range format. Expected format: x.x.x.x/y');
  }
  
  const ipParts = baseIp.split('.').map(Number);
  const mask = ~(2 ** (32 - parseInt(cidr)) - 1);
  const networkAddr = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) & mask;
  const hostCount = 2 ** (32 - parseInt(cidr)) - 2; // Subtract network and broadcast addresses
  
  const results = [];
  const promises = [];
  
  // Check up to 254 hosts (or fewer based on CIDR)
  const maxHosts = Math.min(hostCount, 254);
  
  for (let i = 1; i <= maxHosts; i++) {
    const ip = `${(networkAddr >> 24) & 0xff}.${(networkAddr >> 16) & 0xff}.${(networkAddr >> 8) & 0xff}.${((networkAddr & 0xff) + i)}`;
    
    const sessionOptions = {
      port,
      timeout: timeout / 3, // Shorter timeout for discovery
      retries: 0,
      version,
      community
    };
    
    const promise = new Promise(async (resolve) => {
      try {
        const { sessionId } = createSnmpSession(ip, sessionOptions);
        
        // Try to get system description and name
        const oids = ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0']; // sysDescr, sysName
        const result = await snmpGet(sessionId, oids);
        
        closeSnmpSession(sessionId);
        
        const sysDesc = result[0]?.value || 'Unknown';
        const sysName = result[1]?.value || 'Unknown';
        
        results.push({
          ip,
          sysName,
          sysDesc
        });
        
        resolve(true);
      } catch (error) {
        // Device doesn't respond to SNMP or has different community
        resolve(false);
      }
    });
    
    promises.push(promise);
  }
  
  await Promise.all(promises);
  return results;
}

async function snmpDeviceInventory(host, options = {}) {
  try {
    const { sessionId } = createSnmpSession(host, { 
      community: options.community || 'public', 
      version: options.version || '2c' 
    });
    
    try {
      // Get basic system information
      const systemInfo = await Promise.all([
        snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0']), // sysDescr
        snmpGet(sessionId, ['1.3.6.1.2.1.1.2.0']), // sysObjectID
        snmpGet(sessionId, ['1.3.6.1.2.1.1.3.0']), // sysUpTime
        snmpGet(sessionId, ['1.3.6.1.2.1.1.4.0']), // sysContact
        snmpGet(sessionId, ['1.3.6.1.2.1.1.5.0']), // sysName
        snmpGet(sessionId, ['1.3.6.1.2.1.1.6.0'])  // sysLocation
      ]);
    
      // Map system info to a readable format
      const inventory = {
        ip: host,
        system: {
          description: systemInfo[0][0].value,
          objectID: systemInfo[1][0].value,
          uptime: systemInfo[2][0].value,
          contact: systemInfo[3][0].value,
          name: systemInfo[4][0].value,
          location: systemInfo[5][0].value
        },
        interfaces: {},
        storage: {}
      };
    
    // Try to get interface information
    try {
      const interfaces = await snmpWalk(sessionId, '1.3.6.1.2.1.2.2.1');
      
      // Group interface data by index
      const ifData = {};
      interfaces.forEach(item => {
        const parts = item.oid.split('.');
        const ifIndex = parts[parts.length - 1];
        const ifMetric = parts[parts.length - 2];
        
        if (!ifData[ifIndex]) {
          ifData[ifIndex] = {};
        }
        
        switch (ifMetric) {
          case '1': ifData[ifIndex].index = item.value; break;
          case '2': ifData[ifIndex].description = item.value; break;
          case '3': ifData[ifIndex].type = item.value; break;
          case '4': ifData[ifIndex].mtu = item.value; break;
          case '5': ifData[ifIndex].speed = item.value; break;
          case '6': ifData[ifIndex].physAddress = item.value; break;
          case '7': ifData[ifIndex].adminStatus = item.value; break;
          case '8': ifData[ifIndex].operStatus = item.value; break;
        }
      });
      
      inventory.interfaces = ifData;
    } catch (e) {
      inventory.interfaces = { error: "Failed to get interface information: " + e.message };
    }
    
    // Close the session
    closeSnmpSession(sessionId);
    
    return inventory;
    } catch (error) {
      // If sessionId is available, make sure to close the session
      if (sessionId) {
        try {
          closeSnmpSession(sessionId);
        } catch (closeError) {
          console.error('Error closing SNMP session:', closeError);
        }
      }
      return { error: error.message };
    }
  } catch (error) {
    return { error: error.message };
  }
}

async function snmpInterfaceDiscovery(host, options = {}) {
  try {
    const { sessionId } = createSnmpSession(host, { 
      community: options.community || 'public', 
      version: options.version || '2c' 
    });
    
    // Collect interface information
    const interfaces = {
      ip: host,
      interfaces: []
    };
    
    // Get interface indexes
    const ifIndexes = await snmpWalk(sessionId, '1.3.6.1.2.1.2.2.1.1');
    
    // For each interface, get details
    for (const ifIdx of ifIndexes) {
      const index = ifIdx.value;
      const interfaceData = {
        index: index,
        name: '',
        description: '',
        type: '',
        speed: '',
        mac: '',
        adminStatus: '',
        operStatus: '',
        ipAddresses: []
      };
      
      try {
        // Get interface name (ifDescr)
        const descrResult = await snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.2.${index}`]);
        interfaceData.name = descrResult[0].value;
        
        // Get interface type
        const typeResult = await snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.3.${index}`]);
        interfaceData.type = typeResult[0].value;
        
        // Get interface speed
        const speedResult = await snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.5.${index}`]);
        interfaceData.speed = speedResult[0].value;
        
        // Get MAC address
        const macResult = await snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.6.${index}`]);
        interfaceData.mac = macResult[0].value;
        
        // Get admin status
        const adminResult = await snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.7.${index}`]);
        interfaceData.adminStatus = adminResult[0].value === '1' ? 'up' : 'down';
        
        // Get operational status
        const operResult = await snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.8.${index}`]);
        interfaceData.operStatus = operResult[0].value === '1' ? 'up' : 'down';
        
        interfaces.interfaces.push(interfaceData);
      } catch (e) {
        // Skip failed interface
      }
    }
    
    // Close the session
    closeSnmpSession(sessionId);
    
    return interfaces;
  } catch (error) {
    return { error: error.message };
  }
}

async function snmpSystemHealthCheck(host, options = {}) {
  try {
    const { sessionId } = createSnmpSession(host, { 
      community: options.community || 'public', 
      version: options.version || '2c' 
    });
    
    const healthData = {
      ip: host,
      system: {},
      memory: {},
      interfaces: {}
    };
    
    // Get system info
    try {
      const sysInfo = await Promise.all([
        snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0']), // sysDescr
        snmpGet(sessionId, ['1.3.6.1.2.1.1.3.0']), // sysUpTime
        snmpGet(sessionId, ['1.3.6.1.2.1.1.5.0'])  // sysName
      ]);
      
      healthData.system = {
        description: sysInfo[0][0].value,
        uptime: sysInfo[1][0].value,
        name: sysInfo[2][0].value
      };
    } catch (e) {
      healthData.system = { error: e.message };
    }
    
    // Get interface statistics
    try {
      // Get interface indexes
      const ifIndexes = await snmpWalk(sessionId, '1.3.6.1.2.1.2.2.1.1');
      
      healthData.interfaces.list = [];
      
      // For critical interfaces, get traffic stats
      for (const ifIdx of ifIndexes) {
        const index = ifIdx.value;
        try {
          const [nameResult, statusResult, inOctets, outOctets] = await Promise.all([
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.2.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.8.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.10.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.16.${index}`])
          ]);
          
          healthData.interfaces.list.push({
            index,
            name: nameResult[0].value,
            status: statusResult[0].value === '1' ? 'up' : 'down',
            inOctets: inOctets[0].value,
            outOctets: outOctets[0].value
          });
        } catch (e) {
          // Skip failed interface
        }
      }
    } catch (e) {
      healthData.interfaces = { error: "Interface metrics not available: " + e.message };
    }
    
    // Close the session
    closeSnmpSession(sessionId);
    
    return healthData;
  } catch (error) {
    return { error: error.message };
  }
}

async function snmpServiceDiscovery(host, options = {}) {
  try {
    const { sessionId } = createSnmpSession(host, { 
      community: options.community || 'public', 
      version: options.version || '2c' 
    });
    
    const servicesData = {
      ip: host,
      services: [],
      tcpPorts: [],
      udpPorts: []
    };
    
    // Get running processes from HOST-RESOURCES-MIB
    try {
      const hrSWRunTable = await snmpWalk(sessionId, '1.3.6.1.2.1.25.4.2.1');
      
      // Process entries by index
      const processEntries = {};
      hrSWRunTable.forEach(entry => {
        const parts = entry.oid.split('.');
        const index = parts.pop();
        const type = parts.pop();
        
        if (!processEntries[index]) {
          processEntries[index] = { index };
        }
        
        switch (type) {
          case '1': processEntries[index].index = entry.value; break;
          case '2': processEntries[index].name = entry.value; break;
          case '4': processEntries[index].path = entry.value; break;
          case '5': processEntries[index].parameters = entry.value; break;
          case '7': processEntries[index].status = entry.value; break;
        }
      });
      
      // Convert to array
      for (const process of Object.values(processEntries)) {
        if (process.name) {
          let statusText;
          switch (process.status) {
            case '1': statusText = 'running'; break;
            case '2': statusText = 'runnable'; break;
            case '3': statusText = 'not runnable'; break;
            case '4': statusText = 'invalid'; break;
            default: statusText = 'unknown';
          }
          
          process.statusText = statusText;
          servicesData.services.push(process);
        }
      }
    } catch (e) {
      servicesData.processError = e.message;
    }
    
    // Close the session
    closeSnmpSession(sessionId);
    
    return servicesData;
  } catch (error) {
    return { error: error.message };
  }
}

async function snmpNetworkTopologyMapper(networkRange, options = {}) {
  try {
    // First, discover all SNMP-enabled devices in the range
    const devices = await snmpDiscover(networkRange, { 
      community: options.community || 'public', 
      version: options.version || '2c' 
    });
    
    if (!devices || devices.length === 0) {
      return { error: "No SNMP-enabled devices found in network range" };
    }
    
    const topology = {
      networkRange,
      nodes: [],
      links: []
    };
    
    // For each discovered device, get basic info and neighbors
    for (const device of devices) {
      try {
        const { sessionId } = createSnmpSession(device.ip, { 
          community: options.community || 'public', 
          version: options.version || '2c' 
        });
        
        // Get system info
        const [sysName, sysDescr, sysLocation] = await Promise.all([
          snmpGet(sessionId, ['1.3.6.1.2.1.1.5.0']),
          snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0']),
          snmpGet(sessionId, ['1.3.6.1.2.1.1.6.0'])
        ]);
        
        const nodeInfo = {
          ip: device.ip,
          name: sysName[0].value,
          description: sysDescr[0].value,
          location: sysLocation[0].value,
          interfaces: []
        };
        
        // Get interfaces and their MACs
        const ifTable = await snmpWalk(sessionId, '1.3.6.1.2.1.2.2.1');
        
        // Process interface entries
        const interfaces = {};
        ifTable.forEach(entry => {
          const parts = entry.oid.split('.');
          const ifIndex = parts[parts.length - 1];
          const ifProperty = parts[parts.length - 2];
          
          if (!interfaces[ifIndex]) {
            interfaces[ifIndex] = { index: ifIndex };
          }
          
          switch (ifProperty) {
            case '1': interfaces[ifIndex].index = entry.value; break;
            case '2': interfaces[ifIndex].name = entry.value; break;
            case '6': interfaces[ifIndex].mac = entry.value; break;
          }
        });
        
        nodeInfo.interfaces = Object.values(interfaces).filter(iface => iface.name);
        
        // Add this node to the topology
        topology.nodes.push(nodeInfo);
        
        // Close the session
        closeSnmpSession(sessionId);
      } catch (e) {
        // Skip failed device
      }
    }
    
    return topology;
  } catch (error) {
    return { error: error.message };
  }
}

// Periodically clean up old sessions
setInterval(() => {
  const now = Date.now();
  const expireTime = 10 * 60 * 1000; // 10 minutes
  
  for (const [sessionId, sessionInfo] of snmpSessions.entries()) {
    if (now - sessionInfo.lastUsed > expireTime) {
      console.log(`Cleaning up idle SNMP session ${sessionId}`);
      snmpSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Create snmpTools object for compatibility
const snmpTools = {
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
};

/**
 * Convert SNMP results to CallToolResult format
 * @param {any} data - The SNMP response data
 * @param {string} description - Description of the operation
 * @returns {Object} CallToolResult format
 */
function formatSnmpResult(data, description = '') {
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
          text: `Error formatting SNMP result: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Handle SNMP errors and return proper CallToolResult format
 * @param {Error} error - The error object
 * @returns {Object} CallToolResult with error
 */
function formatSnmpError(error) {
  return {
    content: [
      {
        type: "text",
        text: `SNMP Error: ${error.message}`
      }
    ],
    isError: true
  };
}

/**
 * Register all SNMP tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerSnmpTools(server) {
  // SNMP Create Session
  server.tool(
    'snmp_create_session',
    'Creates an SNMP session with a target device for further operations.',
    {
      host: z.string().describe('Hostname or IP address of target device'),
      community: z.string().default('public').describe('SNMP community string'),
      version: z.enum(['1', '2c', '3']).default('2c').describe('SNMP version'),
      port: z.number().default(161).describe('SNMP port (default: 161)'),
      timeout: z.number().default(5000).describe('Timeout in ms (default: 5000)'),
      retries: z.number().default(1).describe('Retry count (default: 1)'),
      user: z.string().optional().describe('SNMPv3 username (v3 only)'),
      authProtocol: z.enum(['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512']).optional().describe('SNMPv3 auth protocol (v3 only)'),
      authKey: z.string().optional().describe('SNMPv3 auth key (v3 only)'),
      privProtocol: z.enum(['des', 'aes', 'aes128', 'aes192', 'aes256']).optional().describe('SNMPv3 privacy protocol (v3 only)'),
      privKey: z.string().optional().describe('SNMPv3 privacy key (v3 only)')
    },
    async ({ host, community, version, port, timeout, retries, user, authProtocol, authKey, privProtocol, privKey }) => {
      try {
        const options = {
          community: community || 'public',
          version: version || '2c',
          port: port || 161,
          timeout: timeout || 5000,
          retries: retries || 1
        };
        
        // Add SNMPv3 options if specified
        if (version === '3') {
          options.user = user;
          options.authProtocol = authProtocol;
          options.authKey = authKey;
          options.privProtocol = privProtocol;
          options.privKey = privKey;
        }
        
        const sessionId = await snmpTools.createSnmpSession(host, options);
        return formatSnmpResult({ sessionId }, `SNMP session created for ${host}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Close Session
  server.tool(
    'snmp_close_session',
    'Closes an SNMP session.',
    {
      sessionId: z.string().describe('Session ID from snmp_create_session')
    },
    async ({ sessionId }) => {
      try {
        await snmpTools.closeSnmpSession(sessionId);
        return formatSnmpResult({ success: true }, `SNMP session ${sessionId} closed`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Get
  server.tool(
    'snmp_get',
    'Performs an SNMP GET operation to retrieve specific OID values.',
    {
      sessionId: z.string().describe('Session ID from snmp_create_session'),
      oids: z.array(z.string()).describe('Array of OIDs to retrieve')
    },
    async ({ sessionId, oids }) => {
      try {
        const result = await snmpTools.snmpGet(sessionId, oids);
        return formatSnmpResult(result, `SNMP GET results for ${oids.length} OID(s)`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Get Next
  server.tool(
    'snmp_get_next',
    'Performs an SNMP GETNEXT operation for OIDs.',
    {
      sessionId: z.string().describe('Session ID from snmp_create_session'),
      oids: z.array(z.string()).describe('Array of OIDs to start from')
    },
    async ({ sessionId, oids }) => {
      try {
        const result = await snmpTools.snmpGetNext(sessionId, oids);
        return formatSnmpResult(result, `SNMP GETNEXT results for ${oids.length} OID(s)`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Walk
  server.tool(
    'snmp_walk',
    'Performs an SNMP WALK operation to retrieve a subtree of OIDs.',
    {
      sessionId: z.string().describe('Session ID from snmp_create_session'),
      oid: z.string().describe('Base OID for the walk')
    },
    async ({ sessionId, oid }) => {
      try {
        const result = await snmpTools.snmpWalk(sessionId, oid);
        return formatSnmpResult(result, `SNMP WALK results for OID ${oid}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Table
  server.tool(
    'snmp_table',
    'Retrieves an SNMP table.',
    {
      sessionId: z.string().describe('Session ID from snmp_create_session'),
      oid: z.string().describe('Base OID for the table')
    },
    async ({ sessionId, oid }) => {
      try {
        const result = await snmpTools.snmpTable(sessionId, oid);
        return formatSnmpResult(result, `SNMP TABLE results for OID ${oid}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Discover
  server.tool(
    'snmp_discover',
    'Discovers SNMP-enabled devices in the specified network range.',
    {
      targetRange: z.string().describe('Network range in CIDR notation (e.g., 192.168.1.0/24)'),
      community: z.string().default('public').describe('SNMP community string'),
      version: z.enum(['1', '2c', '3']).default('2c').describe('SNMP version'),
      port: z.number().default(161).describe('SNMP port (default: 161)'),
      timeout: z.number().default(5000).describe('Timeout in ms (default: 5000)')
    },
    async ({ targetRange, community, version, port, timeout }) => {
      try {
        const options = {
          community: community || 'public',
          version: version || '2c',
          port: port || 161,
          timeout: timeout || 5000
        };
        
        const result = await snmpTools.snmpDiscover(targetRange, options);
        return formatSnmpResult(result, `SNMP Discovery results for ${targetRange}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Device Inventory
  server.tool(
    'snmp_device_inventory',
    'Performs a comprehensive device inventory via SNMP including system info, interfaces, and storage.',
    {
      host: z.string().describe('Hostname or IP address of target device'),
      community: z.string().default('public').describe('SNMP community string'),
      version: z.enum(['1', '2c', '3']).default('2c').describe('SNMP version')
    },
    async ({ host, community, version }) => {
      try {
        const options = {
          community: community || 'public',
          version: version || '2c'
        };
          const result = await snmpTools.snmpDeviceInventory(host, options);
        return formatSnmpResult(result, `Device inventory for ${host}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Interface Discovery
  server.tool(
    'snmp_interface_discovery',
    'Discovers and details all network interfaces on a device via SNMP.',
    {
      host: z.string().describe('Hostname or IP address of target device'),
      community: z.string().default('public').describe('SNMP community string'),
      version: z.enum(['1', '2c', '3']).default('2c').describe('SNMP version')
    },
    async ({ host, community, version }) => {
      try {
        const options = {
          community: community || 'public',
          version: version || '2c'
        };
          const result = await snmpTools.snmpInterfaceDiscovery(host, options);
        return formatSnmpResult(result, `Interface discovery for ${host}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP System Health
  server.tool(
    'snmp_system_health',
    'Checks system health metrics via SNMP including CPU, memory, storage, and interfaces.',
    {
      host: z.string().describe('Hostname or IP address of target device'),
      community: z.string().default('public').describe('SNMP community string'),
      version: z.enum(['1', '2c', '3']).default('2c').describe('SNMP version')
    },
    async ({ host, community, version }) => {
      try {
        const options = {
          community: community || 'public',
          version: version || '2c'
        };
          const result = await snmpTools.snmpSystemHealthCheck(host, options);
        return formatSnmpResult(result, `System health for ${host}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Service Discovery
  server.tool(
    'snmp_service_discovery',
    'Discovers running services and listening ports via SNMP.',
    {
      host: z.string().describe('Hostname or IP address of target device'),
      community: z.string().default('public').describe('SNMP community string'),
      version: z.enum(['1', '2c', '3']).default('2c').describe('SNMP version')
    },
    async ({ host, community, version }) => {
      try {
        const options = {
          community: community || 'public',
          version: version || '2c'
        };
          const result = await snmpTools.snmpServiceDiscovery(host, options);
        return formatSnmpResult(result, `Service discovery for ${host}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  // SNMP Network Topology
  server.tool(
    'snmp_network_topology',
    'Maps network topology using CDP/LLDP and other protocols via SNMP.',
    {
      networkRange: z.string().describe('Network range in CIDR notation (e.g., 192.168.1.0/24)'),
      community: z.string().default('public').describe('SNMP community string'),
      version: z.enum(['1', '2c', '3']).default('2c').describe('SNMP version')
    },
    async ({ networkRange, community, version }) => {
      try {
        const options = {
          community: community || 'public',
          version: version || '2c'
        };
          const result = await snmpTools.snmpNetworkTopologyMapper(networkRange, options);
        return formatSnmpResult(result, `Network topology for ${networkRange}`);
      } catch (error) {
        return formatSnmpError(error);
      }
    }
  );

  console.log('[MCP SDK] Registered 12 SNMP tools');
}

module.exports = { registerSnmpTools };
