/**
 * SNMP Tools Module for MCP Open Discovery - SDK Compatible
 * 
 * This module provides SNMP discovery and management tools using the official MCP SDK patterns.
 * Converted from custom format to use Zod schemas and CallToolResult responses.
 */

const { z } = require('zod');
const snmpTools = require('../snmp_tools');

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
