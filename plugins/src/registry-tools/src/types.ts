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

export const ReadAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const OpenReadAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const WriteAnnotations: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const RemoveAnnotations: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

export const ListPluginsInputShape = {
  filter_state: z.enum(['all', 'active', 'inactive', 'installed', 'error']).default('all').describe('Filter by lifecycle state'),
  limit: z.number().int().min(1).max(200).default(50).describe('Results per page'),
  offset: z.number().int().min(0).default(0).describe('Skip N results for pagination'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const ReadOnlyResponseInputShape = {
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const InstallInputShape = {
  source: z.string().describe('Marketplace URL or local file path to plugin zip'),
  auto_activate: z.boolean().default(false).describe('Automatically activate after install'),
} satisfies z.ZodRawShape;

export const PluginIdInputShape = {
  plugin_id: z.string().describe('Plugin ID in format name@version'),
} satisfies z.ZodRawShape;

export const UpdateInputShape = {
  plugin_name: z.string().describe('Plugin name without version'),
  source: z.string().describe('Marketplace URL or local file path to new version zip'),
} satisfies z.ZodRawShape;

export const AuditLogInputShape = {
  plugin_id: z.string().describe('Plugin ID in format name@version'),
  limit: z.number().int().min(1).max(100).default(20).describe('Number of log entries to return'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const SigningKeyInputShape = {
  key_id: z.string().describe('Unique identifier for this key'),
  public_key_pem: z.string().describe('PEM-encoded public key'),
  algorithm: z.enum(['Ed25519', 'RSA-SHA256']).default('Ed25519').describe('Key algorithm'),
  owner: z.string().describe('Organization or team that owns this key'),
  enterprise_id: z.string().optional().describe('Enterprise identifier'),
} satisfies z.ZodRawShape;

export interface PluginSummaryRecord {
  id: string;
  name: string;
  version: string;
  lifecycle_state: string;
  is_builtin: boolean;
}

export interface AuditEntry {
  event: string;
  actor: string;
  occurred_at: string;
  detail?: string | null;
}

export interface MarketplacePlugin {
  name: string;
  version: string;
  description?: string;
}