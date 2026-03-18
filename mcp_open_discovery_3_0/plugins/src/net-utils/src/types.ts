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

export const ToolAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const PingInputShape = {
  host: z.string().min(1).describe('IP address or hostname to ping'),
  count: z.number().int().min(1).max(10).default(4).describe('Number of ICMP requests (1-10)'),
  timeout: z.number().int().min(1).max(30).default(5).describe('Timeout per request in seconds (1-30)'),
  size: z.number().int().min(56).max(1024).optional().describe('Packet size in bytes (56-1024)'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const WgetInputShape = {
  url: z.string().url().describe('HTTP/HTTPS URL to fetch'),
  timeout: z.number().int().min(1).max(300).default(30).describe('Request timeout in seconds (1-300)'),
  user_agent: z.string().optional().describe('Custom User-Agent string'),
  max_redirect: z.number().int().min(0).max(10).default(5).describe('Maximum redirects to follow (0-10)'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const NslookupInputShape = {
  host: z.string().min(1).describe('Hostname or IP address to lookup'),
  type: z.enum(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'PTR', 'SOA']).default('A').describe('DNS record type'),
  server: z.string().optional().describe('DNS server to query'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const NetstatInputShape = {
  listening: z.boolean().default(false).describe('Show only listening ports'),
  numeric: z.boolean().default(true).describe('Show numerical addresses'),
  programs: z.boolean().default(false).describe('Show PID and process names where available'),
  protocol: z.enum(['tcp', 'udp', 'all']).default('all').describe('Protocol filter'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const TcpConnectInputShape = {
  host: z.string().min(1).describe('Target hostname or IP address'),
  port: z.number().int().min(1).max(65535).describe('Target port number'),
  timeout: z.number().int().min(1).max(60).default(10).describe('Connection timeout in seconds (1-60)'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const RouteInputShape = {
  destination: z.string().optional().describe('Show route to specific destination'),
  numeric: z.boolean().default(true).describe('Show numerical addresses'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const IfconfigInputShape = {
  interface: z.string().optional().describe('Specific interface to display'),
  all: z.boolean().default(true).describe('Show all interfaces including inactive ones'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const ArpInputShape = {
  host: z.string().optional().describe('Specific host to lookup in ARP table'),
  numeric: z.boolean().default(false).describe('Show numerical addresses'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const WhoisInputShape = {
  query: z.string().min(1).describe('Domain name or IP address to lookup'),
  server: z.string().optional().describe('Specific WHOIS server to query'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const PingInputSchema = z.object(PingInputShape);
export const WgetInputSchema = z.object(WgetInputShape);
export const NslookupInputSchema = z.object(NslookupInputShape);
export const NetstatInputSchema = z.object(NetstatInputShape);
export const TcpConnectInputSchema = z.object(TcpConnectInputShape);
export const RouteInputSchema = z.object(RouteInputShape);
export const IfconfigInputSchema = z.object(IfconfigInputShape);
export const ArpInputSchema = z.object(ArpInputShape);
export const WhoisInputSchema = z.object(WhoisInputShape);

export type PingInput = z.infer<typeof PingInputSchema>;
export type WgetInput = z.infer<typeof WgetInputSchema>;
export type NslookupInput = z.infer<typeof NslookupInputSchema>;
export type NetstatInput = z.infer<typeof NetstatInputSchema>;
export type TcpConnectInput = z.infer<typeof TcpConnectInputSchema>;
export type RouteInput = z.infer<typeof RouteInputSchema>;
export type IfconfigInput = z.infer<typeof IfconfigInputSchema>;
export type ArpInput = z.infer<typeof ArpInputSchema>;
export type WhoisInput = z.infer<typeof WhoisInputSchema>;

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TcpConnectResult {
  host: string;
  port: number;
  timeout: number;
  reachable: boolean;
  message: string;
}

export interface WgetResult {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

export interface NslookupResult {
  host: string;
  type: string;
  answers: string[];
  server?: string;
}