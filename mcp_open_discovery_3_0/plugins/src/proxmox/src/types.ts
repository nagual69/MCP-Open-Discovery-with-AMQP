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

export const ProxmoxReadAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const ProxmoxListAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const OptionalCredsShape = {
  creds_id: z.string().optional(),
} satisfies z.ZodRawShape;

export const ListNodesInputShape = {
  ...OptionalCredsShape,
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const NodeInputShape = {
  node: z.string().describe('Proxmox node name'),
  ...OptionalCredsShape,
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const VmInputShape = {
  node: z.string().describe('Proxmox node name'),
  vmid: z.string().describe('VM identifier'),
  ...OptionalCredsShape,
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const ClusterResourcesInputShape = {
  ...OptionalCredsShape,
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const MetricsInputShape = {
  node: z.string().describe('Proxmox node name'),
  vmid: z.string().optional().describe('Optional VM identifier for VM metrics'),
  ...OptionalCredsShape,
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export interface StoredCredentialEntry {
  id?: string;
  type: string;
  username?: string;
  password?: string;
  apiKey?: string;
  sshKey?: string;
  oauthToken?: string;
  certificate?: string;
  url?: string;
  notes?: string;
  customField1?: string;
  customField2?: string;
}

export interface RetrievedCredential extends StoredCredentialEntry {
  id: string;
}

export type CredentialStore = Record<string, StoredCredentialEntry>;

export interface ProxmoxCredentials {
  hostname: string;
  port: number;
  username?: string;
  password?: string;
  realm: string;
  verify_ssl: boolean;
}

export interface ProxmoxTicket {
  ticket: string;
  CSRFPreventionToken?: string;
}

export interface ProxmoxApiEnvelope<T> {
  data?: T;
  errors?: string[];
}