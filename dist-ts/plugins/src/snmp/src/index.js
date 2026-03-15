"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const shared_1 = require("./shared");
const types_1 = require("./types");
const tools_1 = require("./tools");
const toolDefinitions = [
    {
        name: 'mcp_od_snmp_create_session',
        description: 'Creates an SNMP session with a target device for further operations.',
        inputSchema: types_1.CreateSessionInputShape,
        annotations: types_1.SessionCreateAnnotations,
        handler: async (args) => {
            try {
                return (0, shared_1.buildJsonResponse)((0, tools_1.createSnmpSession)(args.host, args));
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_close_session',
        description: 'Closes an SNMP session.',
        inputSchema: types_1.CloseSessionInputShape,
        annotations: types_1.SessionCloseAnnotations,
        handler: async ({ sessionId }) => {
            try {
                return (0, shared_1.buildJsonResponse)({ success: (0, tools_1.closeSnmpSession)(sessionId) });
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_get',
        description: 'Performs an SNMP GET operation to retrieve specific OID values.',
        inputSchema: types_1.SessionOidArrayInputShape,
        annotations: types_1.SnmpGetAnnotations,
        handler: async ({ oids, response_format, sessionId }) => {
            try {
                const result = await (0, tools_1.snmpGet)(sessionId, oids);
                return (0, shared_1.buildTextResponse)(result, `SNMP GET results for ${oids.length} OID(s)\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_get_next',
        description: 'Performs an SNMP GETNEXT operation for OIDs.',
        inputSchema: types_1.SessionOidArrayInputShape,
        annotations: types_1.SnmpGetAnnotations,
        handler: async ({ oids, response_format, sessionId }) => {
            try {
                const result = await (0, tools_1.snmpGetNext)(sessionId, oids);
                return (0, shared_1.buildTextResponse)(result, `SNMP GETNEXT results for ${oids.length} OID(s)\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_walk',
        description: 'Performs an SNMP WALK operation to retrieve a subtree of OIDs.',
        inputSchema: types_1.SessionOidInputShape,
        annotations: types_1.SnmpReadAnnotations,
        handler: async ({ oid, response_format, sessionId }) => {
            try {
                const result = await (0, tools_1.snmpWalk)(sessionId, oid);
                return (0, shared_1.buildTextResponse)(result, `SNMP WALK results for OID ${oid}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_table',
        description: 'Retrieves an SNMP table.',
        inputSchema: types_1.SessionOidInputShape,
        annotations: types_1.SnmpReadAnnotations,
        handler: async ({ oid, response_format, sessionId }) => {
            try {
                const result = await (0, tools_1.snmpTable)(sessionId, oid);
                return (0, shared_1.buildTextResponse)(result, `SNMP TABLE results for OID ${oid}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_discover',
        description: 'Discovers SNMP-enabled devices in the specified network range.',
        inputSchema: types_1.DiscoverInputShape,
        annotations: types_1.SnmpReadAnnotations,
        handler: async ({ community, port, response_format, targetRange, timeout, version }) => {
            try {
                const result = await (0, tools_1.snmpDiscover)(targetRange, { community, port, timeout, version });
                return (0, shared_1.buildTextResponse)(result, `SNMP Discovery results for ${targetRange}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_device_inventory',
        description: 'Performs a comprehensive device inventory via SNMP.',
        inputSchema: types_1.HostInputShape,
        annotations: types_1.SnmpReadAnnotations,
        handler: async ({ community, host, response_format, version }) => {
            try {
                const result = await (0, tools_1.snmpDeviceInventory)(host, { community, version });
                return (0, shared_1.buildTextResponse)(result, `Device inventory for ${host}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_interface_discovery',
        description: 'Discovers and details all network interfaces on a device via SNMP.',
        inputSchema: types_1.HostInputShape,
        annotations: types_1.SnmpReadAnnotations,
        handler: async ({ community, host, response_format, version }) => {
            try {
                const result = await (0, tools_1.snmpInterfaceDiscovery)(host, { community, version });
                return (0, shared_1.buildTextResponse)(result, `Interface discovery for ${host}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_system_health',
        description: 'Checks system health metrics via SNMP.',
        inputSchema: types_1.HostInputShape,
        annotations: types_1.SnmpReadAnnotations,
        handler: async ({ community, host, response_format, version }) => {
            try {
                const result = await (0, tools_1.snmpSystemHealthCheck)(host, { community, version });
                return (0, shared_1.buildTextResponse)(result, `System health for ${host}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_service_discovery',
        description: 'Discovers running services and listening ports via SNMP.',
        inputSchema: types_1.HostInputShape,
        annotations: types_1.SnmpReadAnnotations,
        handler: async ({ community, host, response_format, version }) => {
            try {
                const result = await (0, tools_1.snmpServiceDiscovery)(host, { community, version });
                return (0, shared_1.buildTextResponse)(result, `Service discovery for ${host}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
    {
        name: 'mcp_od_snmp_network_topology',
        description: 'Maps network topology using CDP/LLDP and other protocols via SNMP.',
        inputSchema: types_1.TopologyInputShape,
        annotations: types_1.SnmpReadAnnotations,
        handler: async ({ community, networkRange, response_format, version }) => {
            try {
                const result = await (0, tools_1.snmpNetworkTopologyMapper)(networkRange, { community, version });
                return (0, shared_1.buildTextResponse)(result, `Network topology for ${networkRange}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)((0, shared_1.getErrorMessage)(error));
            }
        },
    },
];
async function createPlugin(server) {
    for (const tool of toolDefinitions) {
        server.registerTool(tool.name, {
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
        }, tool.handler);
    }
}
//# sourceMappingURL=index.js.map