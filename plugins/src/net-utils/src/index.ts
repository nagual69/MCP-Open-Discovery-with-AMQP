import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import {
  ToolAnnotations,
  type ToolAnnotationHints,
  ArpInputShape,
  IfconfigInputShape,
  NetstatInputShape,
  NslookupInputShape,
  PingInputShape,
  RouteInputShape,
  TcpConnectInputShape,
  WgetInputShape,
  WhoisInputShape,
} from './types';
import { toolExecutors } from './tools';

type ToolRegistration = {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (...args: any[]) => Promise<any>;
  annotations?: ToolAnnotationHints;
};

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_net_ping',
    title: 'Network Ping',
    description: 'Send ICMP echo requests to a host and report reachability and latency.',
    inputSchema: PingInputShape,
    handler: toolExecutors.ping,
    annotations: ToolAnnotations,
  },
  {
    name: 'mcp_od_net_wget',
    title: 'HTTP Fetch (wget)',
    description: 'Download content from HTTP/HTTPS URLs. Use to test HTTP connectivity and retrieve web content.',
    inputSchema: WgetInputShape,
    handler: toolExecutors.wget,
    annotations: ToolAnnotations,
  },
  {
    name: 'mcp_od_net_nslookup',
    title: 'DNS Lookup',
    description: 'Perform DNS lookups for hostnames and IP addresses.',
    inputSchema: NslookupInputShape,
    handler: toolExecutors.nslookup,
    annotations: ToolAnnotations,
  },
  {
    name: 'mcp_od_net_netstat',
    title: 'Network Connections (netstat)',
    description: 'Display active network connections and listening ports.',
    inputSchema: NetstatInputShape,
    handler: toolExecutors.netstat,
    annotations: { ...ToolAnnotations, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'mcp_od_net_telnet',
    title: 'TCP Port Test',
    description: 'Test TCP connectivity to a specific host and port.',
    inputSchema: TcpConnectInputShape,
    handler: toolExecutors.tcp_connect,
    annotations: ToolAnnotations,
  },
  {
    name: 'mcp_od_net_route',
    title: 'Routing Table',
    description: 'Display the system routing table and routing paths.',
    inputSchema: RouteInputShape,
    handler: toolExecutors.route,
    annotations: { ...ToolAnnotations, openWorldHint: false },
  },
  {
    name: 'mcp_od_net_ifconfig',
    title: 'Network Interface Config',
    description: 'Display network interface configuration and IP addresses.',
    inputSchema: IfconfigInputShape,
    handler: toolExecutors.ifconfig,
    annotations: { ...ToolAnnotations, openWorldHint: false },
  },
  {
    name: 'mcp_od_net_arp',
    title: 'ARP Table',
    description: 'Display the ARP cache for network discovery.',
    inputSchema: ArpInputShape,
    handler: toolExecutors.arp,
    annotations: { ...ToolAnnotations, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'mcp_od_net_whois',
    title: 'WHOIS Lookup',
    description: 'Query WHOIS or RDAP sources for domain and IP registration information.',
    inputSchema: WhoisInputShape,
    handler: toolExecutors.whois,
    annotations: ToolAnnotations,
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