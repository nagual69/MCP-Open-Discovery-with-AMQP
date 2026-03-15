"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const shared_1 = require("./shared");
const types_1 = require("./types");
const tools_1 = require("./tools");
const toolDefinitions = [
    {
        name: 'mcp_od_nmap_ping_scan',
        description: 'Nmap Ping Scan (-sn): Discovers online hosts without port scanning.',
        inputSchema: types_1.PingScanInputShape,
        annotations: types_1.ScanAnnotations,
        handler: async ({ response_format, target }) => {
            try {
                const result = await (0, tools_1.runPingScan)(target);
                return (0, shared_1.buildTextResponse)(result, result.output, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Nmap ping scan failed');
            }
        },
    },
    {
        name: 'mcp_od_nmap_tcp_syn_scan',
        description: 'Nmap TCP SYN Scan (-sS): Stealthy scan for open TCP ports. Requires root/administrator privileges.',
        inputSchema: types_1.TcpSynScanInputShape,
        annotations: types_1.ScanAnnotations,
        handler: async ({ response_format, ...args }) => {
            try {
                const result = await (0, tools_1.runTcpSynScan)(args);
                return (0, shared_1.buildTextResponse)(result, result.output, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Nmap TCP SYN scan failed');
            }
        },
    },
    {
        name: 'mcp_od_nmap_tcp_connect_scan',
        description: 'Nmap TCP Connect Scan (-sT): Scans for open TCP ports using the connect() system call.',
        inputSchema: types_1.TcpConnectScanInputShape,
        annotations: types_1.ScanAnnotations,
        handler: async ({ response_format, ...args }) => {
            try {
                const result = await (0, tools_1.runTcpConnectScan)(args);
                return (0, shared_1.buildTextResponse)(result, result.output, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Nmap TCP connect scan failed');
            }
        },
    },
    {
        name: 'mcp_od_nmap_udp_scan',
        description: 'Nmap UDP Scan (-sU): Scans for open UDP ports. Requires root/administrator privileges.',
        inputSchema: types_1.UdpScanInputShape,
        annotations: types_1.ScanAnnotations,
        handler: async ({ response_format, ...args }) => {
            try {
                const result = await (0, tools_1.runUdpScan)(args);
                return (0, shared_1.buildTextResponse)(result, result.output, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Nmap UDP scan failed');
            }
        },
    },
    {
        name: 'mcp_od_nmap_version_scan',
        description: 'Nmap Version Detection (-sV): Probes open ports to determine service/version info.',
        inputSchema: types_1.VersionScanInputShape,
        annotations: types_1.ScanAnnotations,
        handler: async ({ response_format, ...args }) => {
            try {
                const result = await (0, tools_1.runVersionScan)(args);
                return (0, shared_1.buildTextResponse)(result, result.output, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Nmap version scan failed');
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