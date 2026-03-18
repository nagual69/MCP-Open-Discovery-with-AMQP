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

export const InstallAnnotations: ToolAnnotationHints = {
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

export const ListInputShape = {
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const SearchInputShape = {
  query: z.string().optional().describe('Text to search in name or description'),
  type: z.string().optional().describe('Filter by plugin type (for example tool-module)'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const VerifyInputShape = {
  pluginId: z.string().describe('Plugin ID (name@version)'),
  strictIntegrity: z.boolean().optional().describe('Enforce coverage=all checksum requirement'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const InstallInputShape = {
  url: z.string().url().optional().describe('HTTP(S) URL to plugin zip'),
  filePath: z.string().optional().describe('Local path to plugin zip'),
  pluginId: z.string().optional().describe('Explicit plugin ID override'),
  autoLoad: z.boolean().default(false).describe('Activate automatically after install'),
  checksum: z.string().optional().describe('Expected checksum of the payload'),
  checksumAlgorithm: z.string().optional().describe('Checksum algorithm (default sha256)'),
  signature: z.string().optional().describe('Base64 signature for payload'),
  publicKey: z.string().optional().describe('PEM public key for signature verification'),
  signatureAlgorithm: z.string().optional().describe('Signature algorithm'),
} satisfies z.ZodRawShape;

export const RemoveInputShape = {
  pluginId: z.string().describe('Plugin ID (name@version) to remove'),
} satisfies z.ZodRawShape;

export const ShowInputShape = {
  pluginId: z.string().describe('Plugin ID (name@version)'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const RescanInputShape = {
  pluginId: z.string().describe('Plugin ID (name@version)'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export interface PluginManifest {
  manifestVersion?: string;
  type?: string;
  description?: string;
  dependenciesPolicy?: string;
  permissions?: Record<string, unknown>;
  signatures?: unknown[];
  dist?: {
    hash?: string;
    fileCount?: number;
    totalBytes?: number;
    coverage?: string;
    checksums?: {
      files?: Array<{ path?: string; sha256?: string }>;
    };
  };
  capabilities?: {
    tools?: string[];
    resources?: string[];
    prompts?: string[];
  };
}

export interface PluginSummaryRecord {
  id: string;
  name: string;
  version: string;
  lifecycle_state: string;
  is_builtin: boolean;
  installed_at: string;
  source_type: string;
  bundle_size_bytes: number;
}

export interface PluginRecord extends PluginSummaryRecord {
  manifest_json: string;
}

export interface PluginExtractionRecord {
  extraction_path: string;
}

export interface PluginInstallResult {
  pluginId: string;
  manifest?: PluginManifest;
  signatureVerified?: boolean;
  payloadChecksumVerified?: boolean;
  payloadSignatureVerified?: boolean;
}