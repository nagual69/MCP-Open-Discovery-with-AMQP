"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const types_1 = require("./types");
const tools_1 = require("./tools");
const toolDefinitions = [
    {
        name: 'mcp_od_net_ping',
        title: 'Network Ping',
        description: 'Send ICMP echo requests to a host and report reachability and latency.',
        inputSchema: types_1.PingInputShape,
        handler: tools_1.toolExecutors.ping,
        annotations: types_1.ToolAnnotations,
    },
    {
        name: 'mcp_od_net_wget',
        title: 'HTTP Fetch (wget)',
        description: 'Download content from HTTP/HTTPS URLs. Use to test HTTP connectivity and retrieve web content.',
        inputSchema: types_1.WgetInputShape,
        handler: tools_1.toolExecutors.wget,
        annotations: types_1.ToolAnnotations,
    },
    {
        name: 'mcp_od_net_nslookup',
        title: 'DNS Lookup',
        description: 'Perform DNS lookups for hostnames and IP addresses.',
        inputSchema: types_1.NslookupInputShape,
        handler: tools_1.toolExecutors.nslookup,
        annotations: types_1.ToolAnnotations,
    },
    {
        name: 'mcp_od_net_netstat',
        title: 'Network Connections (netstat)',
        description: 'Display active network connections and listening ports.',
        inputSchema: types_1.NetstatInputShape,
        handler: tools_1.toolExecutors.netstat,
        annotations: { ...types_1.ToolAnnotations, idempotentHint: false, openWorldHint: false },
    },
    {
        name: 'mcp_od_net_telnet',
        title: 'TCP Port Test',
        description: 'Test TCP connectivity to a specific host and port.',
        inputSchema: types_1.TcpConnectInputShape,
        handler: tools_1.toolExecutors.tcp_connect,
        annotations: types_1.ToolAnnotations,
    },
    {
        name: 'mcp_od_net_route',
        title: 'Routing Table',
        description: 'Display the system routing table and routing paths.',
        inputSchema: types_1.RouteInputShape,
        handler: tools_1.toolExecutors.route,
        annotations: { ...types_1.ToolAnnotations, openWorldHint: false },
    },
    {
        name: 'mcp_od_net_ifconfig',
        title: 'Network Interface Config',
        description: 'Display network interface configuration and IP addresses.',
        inputSchema: types_1.IfconfigInputShape,
        handler: tools_1.toolExecutors.ifconfig,
        annotations: { ...types_1.ToolAnnotations, openWorldHint: false },
    },
    {
        name: 'mcp_od_net_arp',
        title: 'ARP Table',
        description: 'Display the ARP cache for network discovery.',
        inputSchema: types_1.ArpInputShape,
        handler: tools_1.toolExecutors.arp,
        annotations: { ...types_1.ToolAnnotations, idempotentHint: false, openWorldHint: false },
    },
    {
        name: 'mcp_od_net_whois',
        title: 'WHOIS Lookup',
        description: 'Query WHOIS or RDAP sources for domain and IP registration information.',
        inputSchema: types_1.WhoisInputShape,
        handler: tools_1.toolExecutors.whois,
        annotations: types_1.ToolAnnotations,
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