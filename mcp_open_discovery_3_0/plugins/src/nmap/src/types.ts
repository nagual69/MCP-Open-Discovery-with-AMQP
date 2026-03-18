import { z } from 'zod';

import { ResponseFormatSchema, type ResponseFormat, type ToolResponse } from './shared';

export { ResponseFormatSchema };
export type { ResponseFormat, ToolResponse };

export interface ToolAnnotationHints {
  [key: string]: unknown;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export const ScanAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const PingScanInputShape = {
  target: z.string().describe('Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const TcpSynScanInputShape = {
  target: z.string().describe('Target specification'),
  ports: z.string().optional().describe("Ports to scan (e.g., '80,443', '1-1024')"),
  fast_scan: z.boolean().optional().describe('Fast mode (-F): Scan fewer ports'),
  timing_template: z.number().min(0).max(5).optional().describe('Timing template (-T<0-5>)'),
  reason: z.boolean().optional().describe('Display the reason a port is in a particular state'),
  open_only: z.boolean().optional().describe('Only show open ports'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const TcpConnectScanInputShape = {
  target: z.string().describe('Target specification'),
  ports: z.string().optional().describe("Ports to scan (e.g., '80,443', '1-1024')"),
  timing_template: z.number().min(0).max(5).optional().describe('Timing template (-T<0-5>)'),
  reason: z.boolean().optional().describe('Display the reason a port is in a particular state'),
  open_only: z.boolean().optional().describe('Only show open ports'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const UdpScanInputShape = {
  target: z.string().describe('Target specification'),
  ports: z.string().optional().describe('Ports to scan'),
  top_ports: z.number().optional().describe('Scan the <number> most common UDP ports'),
  timing_template: z.number().min(0).max(5).optional().describe('Timing template (-T<0-5>)'),
  reason: z.boolean().optional().describe('Display the reason a port is in a particular state'),
  open_only: z.boolean().optional().describe('Only show open ports'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const VersionScanInputShape = {
  target: z.string().describe('Target specification'),
  ports: z.string().optional().describe('Ports to scan'),
  intensity: z.number().min(0).max(9).optional().describe('Version scan intensity (0-9)'),
  light_mode: z.boolean().optional().describe('Enable light mode (--version-light)'),
  all_ports: z.boolean().optional().describe('Try all probes (--version-all)'),
  timing_template: z.number().min(0).max(5).optional().describe('Timing template (-T<0-5>)'),
  reason: z.boolean().optional().describe('Display the reason a port is in a particular state'),
  open_only: z.boolean().optional().describe('Only show open ports'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export interface CommandExecutionResult {
  command: string[];
  output: string;
}