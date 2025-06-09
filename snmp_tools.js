/**
 * SNMP Tool Functions for MCP Open Discovery
 * 
 * This module provides SNMP discovery and querying capabilities 
 * for the MCP Open Discovery server.
 */

const snmp = require('net-snmp');
const crypto = require('crypto');

// In-memory store for SNMP sessions and credentials
const snmpSessions = new Map();

// SNMP Helper Functions
function createSnmpSession(host, options = {}) {
  const sessionOptions = {
    port: options.port || 161,
    retries: options.retries || 1,
    timeout: options.timeout || 5000,
    backoff: 1.0,
    transport: "udp4",
    trapPort: 162,
    version: getSnmpVersion(options.version || '2c'),
    backwardsGetNexts: true,
    reportOidMismatchErrors: false,
  };

  // Add community string for v1/v2c or authentication for v3
  if (sessionOptions.version === snmp.Version3) {
    sessionOptions.context = options.context || "";
    
    // Configure security level and auth
    if (options.user && options.authProtocol && options.authKey) {
      if (options.privProtocol && options.privKey) {
        // authPriv
        sessionOptions.security = {
          level: snmp.SecurityLevel.authPriv,
          user: options.user,
          authProtocol: getAuthProtocol(options.authProtocol),
          authKey: options.authKey,
          privProtocol: getPrivProtocol(options.privProtocol),
          privKey: options.privKey
        };
      } else {
        // authNoPriv
        sessionOptions.security = {
          level: snmp.SecurityLevel.authNoPriv,
          user: options.user,
          authProtocol: getAuthProtocol(options.authProtocol),
          authKey: options.authKey
        };
      }
    } else {
      // noAuthNoPriv
      sessionOptions.security = {
        level: snmp.SecurityLevel.noAuthNoPriv,
        user: options.user || "nobody"
      };
    }
  } else {
    // v1 or v2c
    sessionOptions.community = options.community || "public";
  }

  const session = snmp.createSession(host, sessionOptions);
  
  // Store session in memory with a unique ID
  const sessionId = crypto.randomUUID();
  snmpSessions.set(sessionId, { 
    session, 
    host, 
    options, 
    lastUsed: Date.now() 
  });
  
  return { sessionId, session };
}

function getAuthProtocol(authProtocol) {
  const protocols = {
    'md5': snmp.AuthProtocols.md5,
    'sha': snmp.AuthProtocols.sha,
    'sha224': snmp.AuthProtocols.sha224,
    'sha256': snmp.AuthProtocols.sha256,
    'sha384': snmp.AuthProtocols.sha384,
    'sha512': snmp.AuthProtocols.sha512
  };
  return protocols[authProtocol.toLowerCase()] || snmp.AuthProtocols.sha;
}

function getPrivProtocol(privProtocol) {
  const protocols = {
    'des': snmp.PrivProtocols.des,
    'aes': snmp.PrivProtocols.aes,
    'aes128': snmp.PrivProtocols.aes128,
    'aes192': snmp.PrivProtocols.aes192,
    'aes256': snmp.PrivProtocols.aes256
  };
  return protocols[privProtocol.toLowerCase()] || snmp.PrivProtocols.aes;
}

function closeSnmpSession(sessionId) {
  if (snmpSessions.has(sessionId)) {
    const { session } = snmpSessions.get(sessionId);
    session.close();
    snmpSessions.delete(sessionId);
    return true;
  }
  return false;
}

function getSnmpVersion(versionStr) {
  const versions = {
    '1': snmp.Version1,
    '2c': snmp.Version2c,
    '3': snmp.Version3
  };
  return versions[versionStr] || snmp.Version2c;
}

// Periodically clean up old sessions
setInterval(() => {
  const now = Date.now();
  const expireTime = 10 * 60 * 1000; // 10 minutes
  
  for (const [sessionId, sessionInfo] of snmpSessions.entries()) {
    if (now - sessionInfo.lastUsed > expireTime) {
      console.log(`Closing idle SNMP session ${sessionId} for ${sessionInfo.host}`);
      sessionInfo.session.close();
      snmpSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// SNMP Tool Functions
async function snmpGet(sessionId, oids) {
  return new Promise((resolve, reject) => {
    if (!snmpSessions.has(sessionId)) {
      reject(new Error(`SNMP session ${sessionId} not found`));
      return;
    }
    
    const { session } = snmpSessions.get(sessionId);
    snmpSessions.get(sessionId).lastUsed = Date.now();
    
    session.get(oids, (error, varbinds) => {
      if (error) {
        reject(error);
        return;
      }
      
      // Check for errors in response
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) {
          reject(new Error(`Error for OID ${vb.oid}: ${snmp.varbindError(vb)}`));
          return;
        }
      }
      
      // Format results for human readability
      const results = varbinds.map(vb => {
        return {
          oid: vb.oid,
          value: vb.value.toString(),
          type: snmp.ObjectType[vb.type]
        };
      });
      
      resolve(results);
    });
  });
}

async function snmpGetNext(sessionId, oids) {
  return new Promise((resolve, reject) => {
    if (!snmpSessions.has(sessionId)) {
      reject(new Error(`SNMP session ${sessionId} not found`));
      return;
    }
    
    const { session } = snmpSessions.get(sessionId);
    snmpSessions.get(sessionId).lastUsed = Date.now();
    
    session.getNext(oids, (error, varbinds) => {
      if (error) {
        reject(error);
        return;
      }
      
      // Check for errors in response
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) {
          reject(new Error(`Error for OID ${vb.oid}: ${snmp.varbindError(vb)}`));
          return;
        }
      }
      
      // Format results for human readability
      const results = varbinds.map(vb => {
        return {
          oid: vb.oid,
          value: vb.value.toString(),
          type: snmp.ObjectType[vb.type]
        };
      });
      
      resolve(results);
    });
  });
}

async function snmpWalk(sessionId, oid) {
  return new Promise((resolve, reject) => {
    if (!snmpSessions.has(sessionId)) {
      reject(new Error(`SNMP session ${sessionId} not found`));
      return;
    }
    
    const { session } = snmpSessions.get(sessionId);
    snmpSessions.get(sessionId).lastUsed = Date.now();
    const results = [];
    
    function doneCb(error) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    }
    
    function feedCb(varbinds) {
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) {
          continue;
        }
        results.push({
          oid: vb.oid,
          value: vb.value.toString(),
          type: snmp.ObjectType[vb.type]
        });
      }
    }
    
    session.walk(oid, feedCb, doneCb);
  });
}

async function snmpTable(sessionId, oid) {
  return new Promise((resolve, reject) => {
    if (!snmpSessions.has(sessionId)) {
      reject(new Error(`SNMP session ${sessionId} not found`));
      return;
    }
    
    const { session } = snmpSessions.get(sessionId);
    snmpSessions.get(sessionId).lastUsed = Date.now();
    
    session.table(oid, (error, table) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(table);
    });
  });
}

async function snmpDiscover(targetRange, options = {}) {
  const community = options.community || 'public';
  const port = options.port || 161;
  const timeout = options.timeout || 5000;
  const version = getSnmpVersion(options.version || '2c');
  
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
    
    const promise = new Promise(resolve => {
      const session = snmp.createSession(ip, sessionOptions);
      const timer = setTimeout(() => {
        session.close();
        resolve(null);
      }, timeout);
      
      session.get(['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0'], (error, varbinds) => {
        clearTimeout(timer);
        session.close();
        
        if (error || snmp.isVarbindError(varbinds[0])) {
          resolve(null);
          return;
        }
        
        const sysDesc = varbinds[0]?.value?.toString() || 'Unknown';
        const sysName = varbinds[1]?.value?.toString() || 'Unknown';
        
        results.push({
          ip,
          sysName,
          sysDesc
        });
        
        resolve(true);
      });
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
    
    // Try to get storage information
    try {
      const storage = await snmpWalk(sessionId, '1.3.6.1.2.1.25.2.3.1');
      
      // Group storage data by index
      const storageData = {};
      storage.forEach(item => {
        const parts = item.oid.split('.');
        const storageIndex = parts[parts.length - 1];
        const storageMetric = parts[parts.length - 2];
        
        if (!storageData[storageIndex]) {
          storageData[storageIndex] = {};
        }
        
        switch (storageMetric) {
          case '2': storageData[storageIndex].type = item.value; break;
          case '3': storageData[storageIndex].description = item.value; break;
          case '4': storageData[storageIndex].allocationUnits = item.value; break;
          case '5': storageData[storageIndex].size = item.value; break;
          case '6': storageData[storageIndex].used = item.value; break;
        }
      });
      
      inventory.storage = storageData;
    } catch (e) {
      inventory.storage = { error: "Failed to get storage information: " + e.message };
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
        
        // Get interface description (ifAlias) if available
        try {
          const aliasResult = await snmpGet(sessionId, [`1.3.6.1.2.1.31.1.1.1.18.${index}`]);
          interfaceData.description = aliasResult[0].value;
        } catch (e) {
          // ifAlias might not be supported
        }
        
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
        
        // Try to get IP addresses for this interface
        try {
          // This is complex as we need to correlate IP address table with interface
          // A simplified approach is shown here
          const ipAddrTable = await snmpWalk(sessionId, '1.3.6.1.2.1.4.20.1');
          
          for (const entry of ipAddrTable) {
            const parts = entry.oid.split('.');
            const metricType = parts[parts.length - 5];
            
            // If this is an ifIndex entry and matches our interface
            if (metricType === '2' && entry.value === index) {
              const ipAddress = parts.slice(-4).join('.');
              interfaceData.ipAddresses.push(ipAddress);
            }
          }
        } catch (e) {
          // IP address collection failed
        }
        
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
      cpu: {},
      memory: {},
      storage: {},
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
    
    // Get CPU info (system load)
    try {
      // Try UCD-SNMP-MIB (Net-SNMP) CPU metrics
      const loadAvg = await snmpGet(sessionId, ['1.3.6.1.4.1.2021.10.1.3.1']);
      healthData.cpu.loadAverage1min = loadAvg[0].value;
      
      // Try HOST-RESOURCES-MIB CPU metrics
      const cpuProcesses = await snmpWalk(sessionId, '1.3.6.1.2.1.25.3.3.1.2');
      healthData.cpu.processes = cpuProcesses.map(p => ({ 
        id: p.oid.split('.').pop(),
        utilization: p.value
      }));
    } catch (e) {
      // Not all systems expose CPU metrics
      healthData.cpu = { error: "CPU metrics not available: " + e.message };
    }
    
    // Get memory info
    try {
      // Try UCD-SNMP-MIB memory info
      const memInfo = await Promise.all([
        snmpGet(sessionId, ['1.3.6.1.4.1.2021.4.5.0']), // Total RAM
        snmpGet(sessionId, ['1.3.6.1.4.1.2021.4.6.0'])  // Free RAM
      ]);
      
      healthData.memory = {
        total: memInfo[0][0].value,
        free: memInfo[1][0].value,
        used: memInfo[0][0].value - memInfo[1][0].value,
        percentUsed: (((memInfo[0][0].value - memInfo[1][0].value) / memInfo[0][0].value) * 100).toFixed(2)
      };
    } catch (e) {
      // Try HOST-RESOURCES-MIB memory info
      try {
        const hrStorage = await snmpWalk(sessionId, '1.3.6.1.2.1.25.2.3.1');
        
        // Process storage entries to find memory
        const storageEntries = {};
        hrStorage.forEach(entry => {
          const parts = entry.oid.split('.');
          const index = parts.pop();
          const type = parts.pop();
          
          if (!storageEntries[index]) {
            storageEntries[index] = {};
          }
          
          switch (type) {
            case '2': storageEntries[index].type = entry.value; break;
            case '3': storageEntries[index].descr = entry.value; break;
            case '4': storageEntries[index].allocationUnits = entry.value; break;
            case '5': storageEntries[index].size = entry.value; break;
            case '6': storageEntries[index].used = entry.value; break;
          }
        });
        
        // Find RAM entries (usually type 2 or description contains "RAM" or "Memory")
        for (const [index, entry] of Object.entries(storageEntries)) {
          if (entry.type === '2' || 
              (entry.descr && (entry.descr.includes('RAM') || entry.descr.includes('Memory')))) {
            healthData.memory = {
              description: entry.descr,
              allocationUnits: entry.allocationUnits,
              totalUnits: entry.size,
              usedUnits: entry.used,
              percentUsed: ((entry.used / entry.size) * 100).toFixed(2)
            };
            break;
          }
        }
        
        if (!healthData.memory.description) {
          healthData.memory = { error: "Could not identify memory entries in storage table" };
        }
      } catch (e2) {
        healthData.memory = { error: "Memory metrics not available: " + e2.message };
      }
    }
    
    // Get storage info
    try {
      // Get disk storage from HOST-RESOURCES-MIB
      const storageTable = await snmpWalk(sessionId, '1.3.6.1.2.1.25.2.3.1');
      
      // Process storage entries
      const storageEntries = {};
      storageTable.forEach(entry => {
        const parts = entry.oid.split('.');
        const index = parts.pop();
        const type = parts.pop();
        
        if (!storageEntries[index]) {
          storageEntries[index] = {};
        }
        
        switch (type) {
          case '2': storageEntries[index].type = entry.value; break;
          case '3': storageEntries[index].descr = entry.value; break;
          case '4': storageEntries[index].allocationUnits = entry.value; break;
          case '5': storageEntries[index].size = entry.value; break;
          case '6': storageEntries[index].used = entry.value; break;
        }
      });
      
      // Find disk entries (usually type 4 for fixed disk)
      healthData.storage.disks = [];
      for (const [index, entry] of Object.entries(storageEntries)) {
        // Skip RAM and other non-disk entries
        if (entry.type === '4' || 
            (entry.descr && entry.descr.includes('/') && !entry.descr.includes('RAM'))) {
          const disk = {
            description: entry.descr,
            allocationUnits: entry.allocationUnits,
            totalUnits: entry.size,
            usedUnits: entry.used,
            percentUsed: entry.size > 0 ? ((entry.used / entry.size) * 100).toFixed(2) : 0
          };
          healthData.storage.disks.push(disk);
        }
      }
    } catch (e) {
      healthData.storage = { error: "Storage metrics not available: " + e.message };
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
          const [nameResult, statusResult, inOctets, outOctets, inErrors, outErrors] = await Promise.all([
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.2.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.8.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.10.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.16.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.14.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.20.${index}`])
          ]);
          
          healthData.interfaces.list.push({
            index,
            name: nameResult[0].value,
            status: statusResult[0].value === '1' ? 'up' : 'down',
            inOctets: inOctets[0].value,
            outOctets: outOctets[0].value,
            inErrors: inErrors[0].value,
            outErrors: outErrors[0].value
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
      services: []
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
      
      // Convert to array and add status text
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
    
    // Try to get TCP and UDP listening ports
    try {
      // Get TCP listening ports (tcpConnTable)
      const tcpTable = await snmpWalk(sessionId, '1.3.6.1.2.1.6.13.1.1');
      
      servicesData.tcpPorts = [];
      for (const entry of tcpTable) {
        const parts = entry.oid.split('.');
        // Extract local address and port from OID
        const localPort = parseInt(parts[parts.length - 1]);
        const localAddr = parts.slice(-5, -1).join('.');
        
        // Only include listening ports (state = 2)
        try {
          const stateOid = `1.3.6.1.2.1.6.13.1.1.${entry.value}.${localAddr}.${localPort}`;
          const stateResult = await snmpGet(sessionId, [stateOid]);
          
          if (stateResult[0].value === '2') { // listening
            servicesData.tcpPorts.push({
              localAddr,
              localPort
            });
          }
        } catch (e) {
          // Skip this entry
        }
      }
    } catch (e) {
      servicesData.tcpError = e.message;
    }
    
    try {
      // Get UDP ports (udpTable)
      const udpTable = await snmpWalk(sessionId, '1.3.6.1.2.1.7.5.1.2');
      
      servicesData.udpPorts = [];
      for (const entry of udpTable) {
        const parts = entry.oid.split('.');
        const localPort = parseInt(parts[parts.length - 1]);
        const localAddr = parts.slice(-5, -1).join('.');
        
        servicesData.udpPorts.push({
          localAddr,
          localPort
        });
      }
    } catch (e) {
      servicesData.udpError = e.message;
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
        
        // Try to get neighbor information via various methods
        
        // Method 1: CDP (Cisco Discovery Protocol)
        try {
          const cdpNeighbors = await snmpWalk(sessionId, '1.3.6.1.4.1.9.9.23.1.2.1.1');
          
          // Process CDP entries (simplified)
          const cdpEntries = {};
          cdpNeighbors.forEach(entry => {
            const parts = entry.oid.split('.');
            const property = parts[parts.length - 2];
            const ifIndex = parts[parts.length - 3];
            
            if (!cdpEntries[ifIndex]) {
              cdpEntries[ifIndex] = { localInterface: ifIndex };
            }
            
            // Extract CDP information based on property type
            switch (property) {
              case '6': cdpEntries[ifIndex].remoteDevice = entry.value; break;
              case '7': cdpEntries[ifIndex].remoteInterface = entry.value; break;
              case '4': cdpEntries[ifIndex].remoteIp = entry.value; break;
            }
          });
          
          // Add CDP neighbors to topology links
          for (const cdp of Object.values(cdpEntries)) {
            if (cdp.remoteDevice && cdp.remoteInterface) {
              topology.links.push({
                source: device.ip,
                sourceInterface: interfaces[cdp.localInterface]?.name || cdp.localInterface,
                target: cdp.remoteIp || cdp.remoteDevice,
                targetInterface: cdp.remoteInterface,
                discoveryProtocol: 'CDP'
              });
            }
          }
        } catch (e) {
          // CDP not available
        }
        
        // Method 2: LLDP (Link Layer Discovery Protocol)
        try {
          const lldpNeighbors = await snmpWalk(sessionId, '1.0.8802.1.1.2.1.4.1.1');
          
          // Process LLDP entries (simplified)
          const lldpEntries = {};
          lldpNeighbors.forEach(entry => {
            const parts = entry.oid.split('.');
            const property = parts[parts.length - 3];
            const ifIndex = parts[parts.length - 2];
            
            if (!lldpEntries[ifIndex]) {
              lldpEntries[ifIndex] = { localInterface: ifIndex };
            }
            
            // Extract LLDP information based on property type
            switch (property) {
              case '1': lldpEntries[ifIndex].remoteChassisId = entry.value; break;
              case '7': lldpEntries[ifIndex].remotePortId = entry.value; break;
              case '9': lldpEntries[ifIndex].remoteSysName = entry.value; break;
            }
          });
          
          // Add LLDP neighbors to topology links
          for (const lldp of Object.values(lldpEntries)) {
            if (lldp.remoteSysName && lldp.remotePortId) {
              topology.links.push({
                source: device.ip,
                sourceInterface: interfaces[lldp.localInterface]?.name || lldp.localInterface,
                target: lldp.remoteSysName,
                targetInterface: lldp.remotePortId,
                discoveryProtocol: 'LLDP'
              });
            }
          }
        } catch (e) {
          // LLDP not available
        }
        
        // Method 3: Bridge table / MAC address table
        try {
          const bridgeTable = await snmpWalk(sessionId, '1.3.6.1.2.1.17.4.3.1.2');
          
          // Process bridge table entries
          for (const entry of bridgeTable) {
            const parts = entry.oid.split('.');
            const macAddr = parts.slice(-6).map(p => parseInt(p).toString(16).padStart(2, '0')).join(':');
            const portNum = entry.value;
            
            // Find corresponding interface for this port
            let ifIndex = null;
            try {
              const portMapResult = await snmpGet(sessionId, [`1.3.6.1.2.1.17.1.4.1.2.${portNum}`]);
              ifIndex = portMapResult[0].value;
            } catch (e) {
              // Can't map bridge port to interface
              continue;
            }
            
            // Add to topology if this is not our own MAC
            const isOwnMac = nodeInfo.interfaces.some(iface => 
              iface.mac && iface.mac.toLowerCase() === macAddr.toLowerCase());
            
            if (!isOwnMac) {
              topology.links.push({
                source: device.ip,
                sourceInterface: interfaces[ifIndex]?.name || ifIndex,
                targetMac: macAddr,
                discoveryProtocol: 'Bridge-MIB'
              });
            }
          }
        } catch (e) {
          // Bridge table not available
        }
        
        // Add this node to the topology
        topology.nodes.push(nodeInfo);
        
        // Close the session
        closeSnmpSession(sessionId);
      } catch (e) {
        // Skip failed device
      }
    }
    
    // Try to resolve MAC addresses to IPs using ARP tables
    // This step would ideally reference ARP tables from all devices
    
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
  getSnmpVersion,
  getAuthProtocol,
  getPrivProtocol,
  
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
