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

export const ReadOnlyAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const WriteAnnotations: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const ClearAnnotations: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

export const CiValueSchema = z.record(z.string(), z.unknown());

export const GetMemoryInputShape = {
  key: z.string().min(1).describe('CI key (e.g., ci:host:192.168.1.10)'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const SetMemoryInputShape = {
  key: z.string().min(1).describe('CI key (e.g., ci:host:192.168.1.10)'),
  value: CiValueSchema.describe('CI object to store'),
} satisfies z.ZodRawShape;

export const MergeMemoryInputShape = {
  key: z.string().min(1).describe('CI key (e.g., ci:host:192.168.1.10)'),
  value: CiValueSchema.describe('Partial CI object to merge'),
} satisfies z.ZodRawShape;

export const QueryMemoryInputShape = {
  pattern: z.string().optional().describe('Optional wildcard pattern such as ci:host:*'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const ClearMemoryInputShape = {} satisfies z.ZodRawShape;

export const StatsMemoryInputShape = {
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const RotateKeyInputShape = {
  newKey: z.string().optional().describe('Optional new key value; generated automatically when omitted'),
} satisfies z.ZodRawShape;

export const SaveMemoryInputShape = {} satisfies z.ZodRawShape;

export const MigrateFilesystemInputShape = {
  oldDataPath: z.string().optional().describe('Optional path to legacy filesystem memory data JSON'),
} satisfies z.ZodRawShape;

export type CiValue = z.infer<typeof CiValueSchema>;

export interface MemoryGetResult {
  key: string;
  value: CiValue | null;
}

export interface MemoryQueryResult {
  count: number;
  pattern?: string;
  matches: Record<string, CiValue>;
}

export interface MemoryMutationResult {
  success: true;
  key: string;
  savedCount: number;
  value: CiValue;
}

export interface MemoryClearResult {
  success: true;
  clearedMemoryCount: number;
  clearedPersistentCount: number;
}

export interface MemoryStatsResult {
  inMemoryCIs: number;
  sqliteCIs: number;
  totalSizeBytes: number;
  auditEntries: number;
  oldestCI: string | null;
  newestCI: string | null;
  autoSave: {
    enabled: boolean;
    intervalMs: number;
  };
}

export interface MemoryRotateKeyResult {
  success: true;
  message: string;
  keyLength: number;
}

export interface MemorySaveResult {
  success: true;
  count: number;
}

export interface MemoryMigrateResult {
  success: true;
  migratedCount: number;
  sourcePath: string;
}