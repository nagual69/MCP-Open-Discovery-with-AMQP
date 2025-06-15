/**
 * SNMP Tools Module for MCP Open Discovery
 * 
 * This module provides a wrapper around the SNMP tools functions
 */

// Import the SNMP tools implementation
const snmpTools = require('../testing/snmp_tools');

/**
 * Returns the tool definitions for SNMP tools
 * @returns {Array} Array of tool definitions
 */
function getTools() {
  return [
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
          
          const { sessionId } = await snmpTools.createSnmpSession(args.host, options);
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
          const result = await snmpTools.closeSnmpSession(args.sessionId);
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
      },      command: async (args) => {
        try {
          // Ensure oids is an array of strings
          const oids = Array.isArray(args.oids) ? args.oids.map(oid => String(oid)) : [String(args.oids)];
          const result = await snmpTools.snmpGet(args.sessionId, oids);
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
      },      command: async (args) => {
        try {
          // Ensure oids is an array of strings
          const oids = Array.isArray(args.oids) ? args.oids.map(oid => String(oid)) : [String(args.oids)];
          const result = await snmpTools.snmpGetNext(args.sessionId, oids);
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
      },      command: async (args) => {
        try {
          const result = await snmpTools.snmpWalk(args.sessionId, String(args.oid));
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
      },      command: async (args) => {
        try {
          const result = await snmpTools.snmpTable(args.sessionId, String(args.oid));
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
          
          const result = await snmpTools.snmpDiscover(args.targetRange, options);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          throw new Error(`SNMP Discovery failed: ${error.message}`);
        }
      }
    },
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
          const result = await snmpTools.snmpDeviceInventory(
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
          const result = await snmpTools.snmpInterfaceDiscovery(
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
          const result = await snmpTools.snmpSystemHealthCheck(
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
          const result = await snmpTools.snmpServiceDiscovery(
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
          const result = await snmpTools.snmpNetworkTopologyMapper(
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
}

module.exports = { getTools };
