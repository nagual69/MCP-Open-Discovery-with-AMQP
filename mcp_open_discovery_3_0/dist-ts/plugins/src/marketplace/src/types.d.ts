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
export declare const ReadAnnotations: ToolAnnotationHints;
export declare const InstallAnnotations: ToolAnnotationHints;
export declare const RemoveAnnotations: ToolAnnotationHints;
export declare const ListInputShape: {
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const SearchInputShape: {
    query: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const VerifyInputShape: {
    pluginId: z.ZodString;
    strictIntegrity: z.ZodOptional<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const InstallInputShape: {
    url: z.ZodOptional<z.ZodString>;
    filePath: z.ZodOptional<z.ZodString>;
    pluginId: z.ZodOptional<z.ZodString>;
    autoLoad: z.ZodDefault<z.ZodBoolean>;
    checksum: z.ZodOptional<z.ZodString>;
    checksumAlgorithm: z.ZodOptional<z.ZodString>;
    signature: z.ZodOptional<z.ZodString>;
    publicKey: z.ZodOptional<z.ZodString>;
    signatureAlgorithm: z.ZodOptional<z.ZodString>;
};
export declare const RemoveInputShape: {
    pluginId: z.ZodString;
};
export declare const ShowInputShape: {
    pluginId: z.ZodString;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const RescanInputShape: {
    pluginId: z.ZodString;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
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
            files?: Array<{
                path?: string;
                sha256?: string;
            }>;
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
//# sourceMappingURL=types.d.ts.map