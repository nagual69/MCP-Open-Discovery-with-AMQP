"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentResponsePromptInputShape = exports.CapacityPlanningPromptInputShape = exports.SecurityAssessmentPromptInputShape = exports.NetworkTopologyPromptInputShape = exports.CmdbPromptInputShape = void 0;
const zod_1 = require("zod");
exports.CmdbPromptInputShape = {
    deviceType: zod_1.z.string().optional().describe('Type of device discovered (server, network, storage, etc.)'),
    discoveredData: zod_1.z.string().optional().describe('Raw discovery data from SNMP, network scans, etc.'),
};
exports.NetworkTopologyPromptInputShape = {
    topologyData: zod_1.z.string().optional().describe('Network topology discovery data (CDP/LLDP neighbors, routing tables, etc.)'),
    networkSegment: zod_1.z.string().optional().describe('Specific network segment or VLAN to analyze'),
};
exports.SecurityAssessmentPromptInputShape = {
    scanResults: zod_1.z.string().optional().describe('Port scan results, service discovery, vulnerability data'),
    assetType: zod_1.z.string().optional().describe('Type of asset being assessed (server, network device, application)'),
};
exports.CapacityPlanningPromptInputShape = {
    utilizationData: zod_1.z.string().optional().describe('CPU, memory, storage, and network utilization metrics'),
    timeframe: zod_1.z.string().optional().describe('Planning timeframe (6 months, 1 year, 2 years)'),
};
exports.IncidentResponsePromptInputShape = {
    alertData: zod_1.z.string().optional().describe('Alert details, monitoring data, system logs'),
    severity: zod_1.z.string().optional().describe('Incident severity level (critical, high, medium, low)'),
};
//# sourceMappingURL=types.js.map