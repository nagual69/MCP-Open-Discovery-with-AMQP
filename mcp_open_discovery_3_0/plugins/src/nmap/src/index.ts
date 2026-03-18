import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import { buildErrorResponse, buildTextResponse, type ToolResponse } from './shared';
import {
  PingScanInputShape,
  ScanAnnotations,
  TcpConnectScanInputShape,
  TcpSynScanInputShape,
  UdpScanInputShape,
  VersionScanInputShape,
} from './types';
import { runPingScan, runTcpConnectScan, runTcpSynScan, runUdpScan, runVersionScan } from './tools';

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (...args: any[]) => Promise<ToolResponse>;
  annotations: Record<string, unknown>;
};

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_nmap_ping_scan',
    description: 'Nmap Ping Scan (-sn): Discovers online hosts without port scanning.',
    inputSchema: PingScanInputShape,
    annotations: ScanAnnotations,
    handler: async ({ response_format, target }) => {
      try {
        const result = await runPingScan(target);
        return buildTextResponse(result, result.output, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Nmap ping scan failed');
      }
    },
  },
  {
    name: 'mcp_od_nmap_tcp_syn_scan',
    description: 'Nmap TCP SYN Scan (-sS): Stealthy scan for open TCP ports. Requires root/administrator privileges.',
    inputSchema: TcpSynScanInputShape,
    annotations: ScanAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const result = await runTcpSynScan(args);
        return buildTextResponse(result, result.output, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Nmap TCP SYN scan failed');
      }
    },
  },
  {
    name: 'mcp_od_nmap_tcp_connect_scan',
    description: 'Nmap TCP Connect Scan (-sT): Scans for open TCP ports using the connect() system call.',
    inputSchema: TcpConnectScanInputShape,
    annotations: ScanAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const result = await runTcpConnectScan(args);
        return buildTextResponse(result, result.output, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Nmap TCP connect scan failed');
      }
    },
  },
  {
    name: 'mcp_od_nmap_udp_scan',
    description: 'Nmap UDP Scan (-sU): Scans for open UDP ports. Requires root/administrator privileges.',
    inputSchema: UdpScanInputShape,
    annotations: ScanAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const result = await runUdpScan(args);
        return buildTextResponse(result, result.output, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Nmap UDP scan failed');
      }
    },
  },
  {
    name: 'mcp_od_nmap_version_scan',
    description: 'Nmap Version Detection (-sV): Probes open ports to determine service/version info.',
    inputSchema: VersionScanInputShape,
    annotations: ScanAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const result = await runVersionScan(args);
        return buildTextResponse(result, result.output, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Nmap version scan failed');
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