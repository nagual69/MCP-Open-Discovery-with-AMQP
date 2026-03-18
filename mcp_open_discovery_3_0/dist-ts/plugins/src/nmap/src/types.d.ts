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
export declare const ScanAnnotations: ToolAnnotationHints;
export declare const PingScanInputShape: {
    target: z.ZodString;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const TcpSynScanInputShape: {
    target: z.ZodString;
    ports: z.ZodOptional<z.ZodString>;
    fast_scan: z.ZodOptional<z.ZodBoolean>;
    timing_template: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodBoolean>;
    open_only: z.ZodOptional<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const TcpConnectScanInputShape: {
    target: z.ZodString;
    ports: z.ZodOptional<z.ZodString>;
    timing_template: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodBoolean>;
    open_only: z.ZodOptional<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const UdpScanInputShape: {
    target: z.ZodString;
    ports: z.ZodOptional<z.ZodString>;
    top_ports: z.ZodOptional<z.ZodNumber>;
    timing_template: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodBoolean>;
    open_only: z.ZodOptional<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const VersionScanInputShape: {
    target: z.ZodString;
    ports: z.ZodOptional<z.ZodString>;
    intensity: z.ZodOptional<z.ZodNumber>;
    light_mode: z.ZodOptional<z.ZodBoolean>;
    all_ports: z.ZodOptional<z.ZodBoolean>;
    timing_template: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodBoolean>;
    open_only: z.ZodOptional<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export interface CommandExecutionResult {
    command: string[];
    output: string;
}
//# sourceMappingURL=types.d.ts.map