/**
 * Universal SNMP Tool Functions for MCP Open Discovery
 * 
 * This module provides SNMP discovery and querying capabilities 
 * for the MCP Open Discovery server.
 * 
 * Uses command-line SNMP tools and detects execution environment:
 * - When running inside container: uses SNMP tools directly
 * - When running on host: uses docker exec to run commands in container
 */

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
console.log(`SNMP Tools: Running ${IN_CONTAINER ? 'inside container' : 'on host'}`);

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
      processArgs = ['exec', 'busybox-network-mcp', command, ...args];
    }
    
    const process = spawn(processCommand, processArgs);
    let stdout = '';
    let stderr = '';
    
    const timer = setTimeout(() => {
      process.kill('SIGTERM');
      reject(new Error(`SNMP command timed out after ${timeout}ms`));
    }, timeout);
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`SNMP command failed: ${stderr.trim() || stdout.trim()}`));
      }
    });
    
    process.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Failed to execute SNMP command: ${error.message}`));
    });
  });
}

/**
 * Parse SNMP response output (filters out MIB warnings)
 */
function parseSnmpResponse(output) {
  const lines = output.split('\n').filter(line => line.trim());
  const results = [];
  
  for (const line of lines) {
    // Skip MIB warnings and errors
    if (line.includes('Cannot find module') || 
        line.includes('Did not find') || 
        line.includes('Unlinked OID') || 
        line.includes('Undefined identifier') || 
        line.includes('Cannot adopt OID') ||
        line.includes('MIB search path:') ||
        line.includes('Unknown module')) {
      continue;
    }
    
    // Look for actual SNMP response lines
    // Example: "RFC1213-MIB::sysDescr.0 = STRING: Linux..."
    const match = line.match(/^(.+?)\s*=\s*([^:]+):\s*(.*)$/);
    if (match) {
      const [, oidName, type, value] = match;
      // Extract numeric OID if possible, otherwise use the full OID name
      const oidMatch = oidName.match(/\.(\d+(?:\.\d+)*)$/);
      const oid = oidMatch ? oidMatch[1] : oidName;
      
      results.push({
        oid: oid,
        oidName: oidName.trim(),
        value: value.replace(/^"(.*)"$/, '$1'), // Remove quotes if present
        type: type.trim()
      });
    }
  }
  
  return results;
}

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

// SNMP Tool Functions
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
  
  // Ensure oids is an array
  const oidArray = Array.isArray(oids) ? oids : [oids];
  
  // Build snmpgetnext command
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
  
  // Build snmpwalk command
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
  
  // Build snmptable command
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
    return parseSnmpResponse(output);
  } catch (error) {
    throw new Error(`SNMP TABLE failed: ${error.message}`);
  }
}

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

// Top 5 SNMP Discovery Tool Functions
async function snmpDeviceInventory(host, community = 'public', version = '2c') {
  try {
    const { sessionId } = createSnmpSession(host, { community, version });
    
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
    return { error: error.message };
  }
}

async function snmpInterfaceDiscovery(host, community = 'public', version = '2c') {
  try {
    const { sessionId } = createSnmpSession(host, { community, version });
    
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

async function snmpSystemHealthCheck(host, community = 'public', version = '2c') {
  try {
    const { sessionId } = createSnmpSession(host, { community, version });
    
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

async function snmpServiceDiscovery(host, community = 'public', version = '2c') {
  try {
    const { sessionId } = createSnmpSession(host, { community, version });
    
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

async function snmpNetworkTopologyMapper(networkRange, community = 'public', version = '2c') {
  try {
    // First, discover all SNMP-enabled devices in the range
    const devices = await snmpDiscover(networkRange, { community, version });
    
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
        const { sessionId } = createSnmpSession(device.ip, { community, version });
        
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

// Export all SNMP tool functions
module.exports = {
  // Session management
  createSnmpSession,
  closeSnmpSession,
  
  // Basic SNMP operations
  snmpGet,
  snmpGetNext,
  snmpWalk,
  snmpTable,
  snmpDiscover,
  
  // Top 5 Discovery Tools
  snmpDeviceInventory,
  snmpInterfaceDiscovery,
  snmpSystemHealthCheck,
  snmpServiceDiscovery,
  snmpNetworkTopologyMapper
};