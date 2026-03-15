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
export declare const ToolAnnotations: ToolAnnotationHints;
export declare const PingInputShape: {
    host: z.ZodString;
    count: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
    size: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const WgetInputShape: {
    url: z.ZodString;
    timeout: z.ZodDefault<z.ZodNumber>;
    user_agent: z.ZodOptional<z.ZodString>;
    max_redirect: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const NslookupInputShape: {
    host: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<["A", "AAAA", "MX", "NS", "TXT", "CNAME", "PTR", "SOA"]>>;
    server: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const NetstatInputShape: {
    listening: z.ZodDefault<z.ZodBoolean>;
    numeric: z.ZodDefault<z.ZodBoolean>;
    programs: z.ZodDefault<z.ZodBoolean>;
    protocol: z.ZodDefault<z.ZodEnum<["tcp", "udp", "all"]>>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const TcpConnectInputShape: {
    host: z.ZodString;
    port: z.ZodNumber;
    timeout: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const RouteInputShape: {
    destination: z.ZodOptional<z.ZodString>;
    numeric: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const IfconfigInputShape: {
    interface: z.ZodOptional<z.ZodString>;
    all: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const ArpInputShape: {
    host: z.ZodOptional<z.ZodString>;
    numeric: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const WhoisInputShape: {
    query: z.ZodString;
    server: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const PingInputSchema: z.ZodObject<{
    host: z.ZodString;
    count: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
    size: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    timeout?: number;
    host?: string;
    response_format?: "json" | "markdown";
    count?: number;
    size?: number;
}, {
    timeout?: number;
    host?: string;
    response_format?: "json" | "markdown";
    count?: number;
    size?: number;
}>;
export declare const WgetInputSchema: z.ZodObject<{
    url: z.ZodString;
    timeout: z.ZodDefault<z.ZodNumber>;
    user_agent: z.ZodOptional<z.ZodString>;
    max_redirect: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    url?: string;
    timeout?: number;
    response_format?: "json" | "markdown";
    user_agent?: string;
    max_redirect?: number;
}, {
    url?: string;
    timeout?: number;
    response_format?: "json" | "markdown";
    user_agent?: string;
    max_redirect?: number;
}>;
export declare const NslookupInputSchema: z.ZodObject<{
    host: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<["A", "AAAA", "MX", "NS", "TXT", "CNAME", "PTR", "SOA"]>>;
    server: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    type?: "A" | "AAAA" | "MX" | "NS" | "TXT" | "CNAME" | "PTR" | "SOA";
    server?: string;
    host?: string;
    response_format?: "json" | "markdown";
}, {
    type?: "A" | "AAAA" | "MX" | "NS" | "TXT" | "CNAME" | "PTR" | "SOA";
    server?: string;
    host?: string;
    response_format?: "json" | "markdown";
}>;
export declare const NetstatInputSchema: z.ZodObject<{
    listening: z.ZodDefault<z.ZodBoolean>;
    numeric: z.ZodDefault<z.ZodBoolean>;
    programs: z.ZodDefault<z.ZodBoolean>;
    protocol: z.ZodDefault<z.ZodEnum<["tcp", "udp", "all"]>>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    response_format?: "json" | "markdown";
    protocol?: "all" | "tcp" | "udp";
    listening?: boolean;
    numeric?: boolean;
    programs?: boolean;
}, {
    response_format?: "json" | "markdown";
    protocol?: "all" | "tcp" | "udp";
    listening?: boolean;
    numeric?: boolean;
    programs?: boolean;
}>;
export declare const TcpConnectInputSchema: z.ZodObject<{
    host: z.ZodString;
    port: z.ZodNumber;
    timeout: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    timeout?: number;
    host?: string;
    port?: number;
    response_format?: "json" | "markdown";
}, {
    timeout?: number;
    host?: string;
    port?: number;
    response_format?: "json" | "markdown";
}>;
export declare const RouteInputSchema: z.ZodObject<{
    destination: z.ZodOptional<z.ZodString>;
    numeric: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    response_format?: "json" | "markdown";
    numeric?: boolean;
    destination?: string;
}, {
    response_format?: "json" | "markdown";
    numeric?: boolean;
    destination?: string;
}>;
export declare const IfconfigInputSchema: z.ZodObject<{
    interface: z.ZodOptional<z.ZodString>;
    all: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    all?: boolean;
    response_format?: "json" | "markdown";
    interface?: string;
}, {
    all?: boolean;
    response_format?: "json" | "markdown";
    interface?: string;
}>;
export declare const ArpInputSchema: z.ZodObject<{
    host: z.ZodOptional<z.ZodString>;
    numeric: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    host?: string;
    response_format?: "json" | "markdown";
    numeric?: boolean;
}, {
    host?: string;
    response_format?: "json" | "markdown";
    numeric?: boolean;
}>;
export declare const WhoisInputSchema: z.ZodObject<{
    query: z.ZodString;
    server: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    server?: string;
    response_format?: "json" | "markdown";
    query?: string;
}, {
    server?: string;
    response_format?: "json" | "markdown";
    query?: string;
}>;
export type PingInput = z.infer<typeof PingInputSchema>;
export type WgetInput = z.infer<typeof WgetInputSchema>;
export type NslookupInput = z.infer<typeof NslookupInputSchema>;
export type NetstatInput = z.infer<typeof NetstatInputSchema>;
export type TcpConnectInput = z.infer<typeof TcpConnectInputSchema>;
export type RouteInput = z.infer<typeof RouteInputSchema>;
export type IfconfigInput = z.infer<typeof IfconfigInputSchema>;
export type ArpInput = z.infer<typeof ArpInputSchema>;
export type WhoisInput = z.infer<typeof WhoisInputSchema>;
export interface CommandExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface TcpConnectResult {
    host: string;
    port: number;
    timeout: number;
    reachable: boolean;
    message: string;
}
export interface WgetResult {
    url: string;
    status: number;
    ok: boolean;
    headers: Record<string, string>;
    body: string;
}
export interface NslookupResult {
    host: string;
    type: string;
    answers: string[];
    server?: string;
}
//# sourceMappingURL=types.d.ts.map