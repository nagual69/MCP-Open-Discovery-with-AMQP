import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import { buildErrorResponse, buildJsonResponse, buildTextResponse, getErrorMessage, type ToolResponse } from './shared';
import {
  CloseSessionInputShape,
  CreateSessionInputShape,
  DiscoverInputShape,
  HostInputShape,
  SessionCloseAnnotations,
  SessionCreateAnnotations,
  SessionOidArrayInputShape,
  SessionOidInputShape,
  SnmpGetAnnotations,
  SnmpReadAnnotations,
  TopologyInputShape,
} from './types';
import {
  closeSnmpSession,
  createSnmpSession,
  snmpDeviceInventory,
  snmpDiscover,
  snmpGet,
  snmpGetNext,
  snmpInterfaceDiscovery,
  snmpNetworkTopologyMapper,
  snmpServiceDiscovery,
  snmpSystemHealthCheck,
  snmpTable,
  snmpWalk,
} from './tools';

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations: Record<string, unknown>;
  handler: (...args: any[]) => Promise<ToolResponse>;
};

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_snmp_create_session',
    description: 'Creates an SNMP session with a target device for further operations.',
    inputSchema: CreateSessionInputShape,
    annotations: SessionCreateAnnotations,
    handler: async (args) => {
      try {
        return buildJsonResponse(createSnmpSession(args.host, args));
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_close_session',
    description: 'Closes an SNMP session.',
    inputSchema: CloseSessionInputShape,
    annotations: SessionCloseAnnotations,
    handler: async ({ sessionId }) => {
      try {
        return buildJsonResponse({ success: closeSnmpSession(sessionId) });
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_get',
    description: 'Performs an SNMP GET operation to retrieve specific OID values.',
    inputSchema: SessionOidArrayInputShape,
    annotations: SnmpGetAnnotations,
    handler: async ({ oids, response_format, sessionId }) => {
      try {
        const result = await snmpGet(sessionId, oids);
        return buildTextResponse(result, `SNMP GET results for ${oids.length} OID(s)\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_get_next',
    description: 'Performs an SNMP GETNEXT operation for OIDs.',
    inputSchema: SessionOidArrayInputShape,
    annotations: SnmpGetAnnotations,
    handler: async ({ oids, response_format, sessionId }) => {
      try {
        const result = await snmpGetNext(sessionId, oids);
        return buildTextResponse(result, `SNMP GETNEXT results for ${oids.length} OID(s)\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_walk',
    description: 'Performs an SNMP WALK operation to retrieve a subtree of OIDs.',
    inputSchema: SessionOidInputShape,
    annotations: SnmpReadAnnotations,
    handler: async ({ oid, response_format, sessionId }) => {
      try {
        const result = await snmpWalk(sessionId, oid);
        return buildTextResponse(result, `SNMP WALK results for OID ${oid}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_table',
    description: 'Retrieves an SNMP table.',
    inputSchema: SessionOidInputShape,
    annotations: SnmpReadAnnotations,
    handler: async ({ oid, response_format, sessionId }) => {
      try {
        const result = await snmpTable(sessionId, oid);
        return buildTextResponse(result, `SNMP TABLE results for OID ${oid}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_discover',
    description: 'Discovers SNMP-enabled devices in the specified network range.',
    inputSchema: DiscoverInputShape,
    annotations: SnmpReadAnnotations,
    handler: async ({ community, port, response_format, targetRange, timeout, version }) => {
      try {
        const result = await snmpDiscover(targetRange, { community, port, timeout, version });
        return buildTextResponse(result, `SNMP Discovery results for ${targetRange}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_device_inventory',
    description: 'Performs a comprehensive device inventory via SNMP.',
    inputSchema: HostInputShape,
    annotations: SnmpReadAnnotations,
    handler: async ({ community, host, response_format, version }) => {
      try {
        const result = await snmpDeviceInventory(host, { community, version });
        return buildTextResponse(result, `Device inventory for ${host}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_interface_discovery',
    description: 'Discovers and details all network interfaces on a device via SNMP.',
    inputSchema: HostInputShape,
    annotations: SnmpReadAnnotations,
    handler: async ({ community, host, response_format, version }) => {
      try {
        const result = await snmpInterfaceDiscovery(host, { community, version });
        return buildTextResponse(result, `Interface discovery for ${host}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_system_health',
    description: 'Checks system health metrics via SNMP.',
    inputSchema: HostInputShape,
    annotations: SnmpReadAnnotations,
    handler: async ({ community, host, response_format, version }) => {
      try {
        const result = await snmpSystemHealthCheck(host, { community, version });
        return buildTextResponse(result, `System health for ${host}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_service_discovery',
    description: 'Discovers running services and listening ports via SNMP.',
    inputSchema: HostInputShape,
    annotations: SnmpReadAnnotations,
    handler: async ({ community, host, response_format, version }) => {
      try {
        const result = await snmpServiceDiscovery(host, { community, version });
        return buildTextResponse(result, `Service discovery for ${host}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_snmp_network_topology',
    description: 'Maps network topology using CDP/LLDP and other protocols via SNMP.',
    inputSchema: TopologyInputShape,
    annotations: SnmpReadAnnotations,
    handler: async ({ community, networkRange, response_format, version }) => {
      try {
        const result = await snmpNetworkTopologyMapper(networkRange, { community, version });
        return buildTextResponse(result, `Network topology for ${networkRange}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
];

export async function createPlugin(server: McpServer): Promise<void> {
  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      tool.handler as never,
    );
  }
}