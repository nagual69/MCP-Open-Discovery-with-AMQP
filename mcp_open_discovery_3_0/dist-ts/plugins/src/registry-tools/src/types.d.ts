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
export declare const OpenReadAnnotations: ToolAnnotationHints;
export declare const WriteAnnotations: ToolAnnotationHints;
export declare const RemoveAnnotations: ToolAnnotationHints;
export declare const ListPluginsInputShape: {
    filter_state: z.ZodDefault<z.ZodEnum<["all", "active", "inactive", "installed", "error"]>>;
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const ReadOnlyResponseInputShape: {
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const InstallInputShape: {
    source: z.ZodString;
    auto_activate: z.ZodDefault<z.ZodBoolean>;
};
export declare const PluginIdInputShape: {
    plugin_id: z.ZodString;
};
export declare const UpdateInputShape: {
    plugin_name: z.ZodString;
    source: z.ZodString;
};
export declare const AuditLogInputShape: {
    plugin_id: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const SigningKeyInputShape: {
    key_id: z.ZodString;
    public_key_pem: z.ZodString;
    algorithm: z.ZodDefault<z.ZodEnum<["Ed25519", "RSA-SHA256"]>>;
    owner: z.ZodString;
    enterprise_id: z.ZodOptional<z.ZodString>;
};
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
//# sourceMappingURL=types.d.ts.map