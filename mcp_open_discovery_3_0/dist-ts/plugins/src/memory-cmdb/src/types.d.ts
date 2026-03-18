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
export declare const ReadOnlyAnnotations: ToolAnnotationHints;
export declare const WriteAnnotations: ToolAnnotationHints;
export declare const ClearAnnotations: ToolAnnotationHints;
export declare const CiValueSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
export declare const GetMemoryInputShape: {
    key: z.ZodString;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const SetMemoryInputShape: {
    key: z.ZodString;
    value: z.ZodRecord<z.ZodString, z.ZodUnknown>;
};
export declare const MergeMemoryInputShape: {
    key: z.ZodString;
    value: z.ZodRecord<z.ZodString, z.ZodUnknown>;
};
export declare const QueryMemoryInputShape: {
    pattern: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const ClearMemoryInputShape: {};
export declare const StatsMemoryInputShape: {
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const RotateKeyInputShape: {
    newKey: z.ZodOptional<z.ZodString>;
};
export declare const SaveMemoryInputShape: {};
export declare const MigrateFilesystemInputShape: {
    oldDataPath: z.ZodOptional<z.ZodString>;
};
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
//# sourceMappingURL=types.d.ts.map