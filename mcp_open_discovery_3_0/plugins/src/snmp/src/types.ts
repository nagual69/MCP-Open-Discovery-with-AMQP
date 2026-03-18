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

export const SessionCreateAnnotations: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const SessionCloseAnnotations: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const SnmpReadAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const SnmpGetAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const SnmpSessionOptionsShape = {
  community: z.string().optional().describe('SNMP community string'),
  version: z.enum(['1', '2c', '3']).optional().describe('SNMP version'),
  port: z.number().optional().describe('SNMP port (default: 161)'),
  timeout: z.number().optional().describe('Timeout in ms (default: 5000)'),
  retries: z.number().optional().describe('Retry count (default: 1)'),
  user: z.string().optional().describe('SNMPv3 username (v3 only)'),
  authProtocol: z.enum(['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512']).optional(),
  authKey: z.string().optional().describe('SNMPv3 auth key (v3 only)'),
  privProtocol: z.enum(['des', 'aes', 'aes128', 'aes192', 'aes256']).optional(),
  privKey: z.string().optional().describe('SNMPv3 privacy key (v3 only)'),
} satisfies z.ZodRawShape;

export const CreateSessionInputShape = {
  host: z.string().describe('Hostname or IP address of target device'),
  ...SnmpSessionOptionsShape,
} satisfies z.ZodRawShape;

export const CloseSessionInputShape = {
  sessionId: z.string().describe('Session ID from mcp_od_snmp_create_session'),
} satisfies z.ZodRawShape;

export const SessionOidArrayInputShape = {
  sessionId: z.string(),
  oids: z.array(z.string()).describe('Array of OIDs to retrieve'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const SessionOidInputShape = {
  sessionId: z.string(),
  oid: z.string().describe('Base OID'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const DiscoverInputShape = {
  targetRange: z.string().describe('Network range in CIDR notation (e.g., 192.168.1.0/24)'),
  community: z.string().optional(),
  version: z.enum(['1', '2c', '3']).optional(),
  port: z.number().optional(),
  timeout: z.number().optional(),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const HostInputShape = {
  host: z.string().describe('Hostname or IP address of target device'),
  community: z.string().optional(),
  version: z.enum(['1', '2c', '3']).optional(),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const TopologyInputShape = {
  networkRange: z.string().describe('Network range in CIDR notation'),
  community: z.string().optional(),
  version: z.enum(['1', '2c', '3']).optional(),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export interface SnmpSessionOptions {
  host: string;
  community: string;
  version: '1' | '2c' | '3';
  port: number;
  timeout: number;
  retries: number;
  user?: string;
  authProtocol?: 'md5' | 'sha' | 'sha224' | 'sha256' | 'sha384' | 'sha512';
  authKey?: string;
  privProtocol?: 'des' | 'aes' | 'aes128' | 'aes192' | 'aes256';
  privKey?: string;
}

export interface SnmpSessionRecord {
  options: SnmpSessionOptions;
  lastUsed: number;
}

export interface SnmpResponseItem {
  oid: string;
  type: string;
  value: string;
}

export interface CommandExecutionResult {
  output: string;
}

export interface InterfaceDetails {
  index?: string;
  description?: string;
  type?: string;
  speed?: string;
  physAddress?: string;
  adminStatus?: string;
  operStatus?: string;
  name?: string;
  mac?: string;
}