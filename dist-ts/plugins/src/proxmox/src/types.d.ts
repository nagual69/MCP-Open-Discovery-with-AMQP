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
export declare const ProxmoxReadAnnotations: ToolAnnotationHints;
export declare const ProxmoxListAnnotations: ToolAnnotationHints;
export declare const OptionalCredsShape: {
    creds_id: z.ZodOptional<z.ZodString>;
};
export declare const ListNodesInputShape: {
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    creds_id: z.ZodOptional<z.ZodString>;
};
export declare const NodeInputShape: {
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    creds_id: z.ZodOptional<z.ZodString>;
    node: z.ZodString;
};
export declare const VmInputShape: {
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    creds_id: z.ZodOptional<z.ZodString>;
    node: z.ZodString;
    vmid: z.ZodString;
};
export declare const ClusterResourcesInputShape: {
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    creds_id: z.ZodOptional<z.ZodString>;
};
export declare const MetricsInputShape: {
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    creds_id: z.ZodOptional<z.ZodString>;
    node: z.ZodString;
    vmid: z.ZodOptional<z.ZodString>;
};
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
//# sourceMappingURL=types.d.ts.map