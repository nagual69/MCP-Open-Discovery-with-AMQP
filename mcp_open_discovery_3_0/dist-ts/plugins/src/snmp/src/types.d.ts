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
export declare const SessionCreateAnnotations: ToolAnnotationHints;
export declare const SessionCloseAnnotations: ToolAnnotationHints;
export declare const SnmpReadAnnotations: ToolAnnotationHints;
export declare const SnmpGetAnnotations: ToolAnnotationHints;
export declare const SnmpSessionOptionsShape: {
    community: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodEnum<["1", "2c", "3"]>>;
    port: z.ZodOptional<z.ZodNumber>;
    timeout: z.ZodOptional<z.ZodNumber>;
    retries: z.ZodOptional<z.ZodNumber>;
    user: z.ZodOptional<z.ZodString>;
    authProtocol: z.ZodOptional<z.ZodEnum<["md5", "sha", "sha224", "sha256", "sha384", "sha512"]>>;
    authKey: z.ZodOptional<z.ZodString>;
    privProtocol: z.ZodOptional<z.ZodEnum<["des", "aes", "aes128", "aes192", "aes256"]>>;
    privKey: z.ZodOptional<z.ZodString>;
};
export declare const CreateSessionInputShape: {
    community: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodEnum<["1", "2c", "3"]>>;
    port: z.ZodOptional<z.ZodNumber>;
    timeout: z.ZodOptional<z.ZodNumber>;
    retries: z.ZodOptional<z.ZodNumber>;
    user: z.ZodOptional<z.ZodString>;
    authProtocol: z.ZodOptional<z.ZodEnum<["md5", "sha", "sha224", "sha256", "sha384", "sha512"]>>;
    authKey: z.ZodOptional<z.ZodString>;
    privProtocol: z.ZodOptional<z.ZodEnum<["des", "aes", "aes128", "aes192", "aes256"]>>;
    privKey: z.ZodOptional<z.ZodString>;
    host: z.ZodString;
};
export declare const CloseSessionInputShape: {
    sessionId: z.ZodString;
};
export declare const SessionOidArrayInputShape: {
    sessionId: z.ZodString;
    oids: z.ZodArray<z.ZodString, "many">;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const SessionOidInputShape: {
    sessionId: z.ZodString;
    oid: z.ZodString;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const DiscoverInputShape: {
    targetRange: z.ZodString;
    community: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodEnum<["1", "2c", "3"]>>;
    port: z.ZodOptional<z.ZodNumber>;
    timeout: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const HostInputShape: {
    host: z.ZodString;
    community: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodEnum<["1", "2c", "3"]>>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const TopologyInputShape: {
    networkRange: z.ZodString;
    community: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodEnum<["1", "2c", "3"]>>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
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
//# sourceMappingURL=types.d.ts.map