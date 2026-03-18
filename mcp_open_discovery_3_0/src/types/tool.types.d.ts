import { z } from 'zod';
export declare const ResponseFormatSchema: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
export declare const PaginationSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    offset: number;
}, {
    limit?: number | undefined;
    offset?: number | undefined;
}>;
export declare const ToolAnnotationsSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    readOnlyHint: z.ZodOptional<z.ZodBoolean>;
    destructiveHint: z.ZodOptional<z.ZodBoolean>;
    idempotentHint: z.ZodOptional<z.ZodBoolean>;
    openWorldHint: z.ZodOptional<z.ZodBoolean>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    title: z.ZodOptional<z.ZodString>;
    readOnlyHint: z.ZodOptional<z.ZodBoolean>;
    destructiveHint: z.ZodOptional<z.ZodBoolean>;
    idempotentHint: z.ZodOptional<z.ZodBoolean>;
    openWorldHint: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    title: z.ZodOptional<z.ZodString>;
    readOnlyHint: z.ZodOptional<z.ZodBoolean>;
    destructiveHint: z.ZodOptional<z.ZodBoolean>;
    idempotentHint: z.ZodOptional<z.ZodBoolean>;
    openWorldHint: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">>;
export declare const ToolSpecSchema: z.ZodObject<{
    name: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    inputSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    outputSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    annotations: z.ZodOptional<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        readOnlyHint: z.ZodOptional<z.ZodBoolean>;
        destructiveHint: z.ZodOptional<z.ZodBoolean>;
        idempotentHint: z.ZodOptional<z.ZodBoolean>;
        openWorldHint: z.ZodOptional<z.ZodBoolean>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        title: z.ZodOptional<z.ZodString>;
        readOnlyHint: z.ZodOptional<z.ZodBoolean>;
        destructiveHint: z.ZodOptional<z.ZodBoolean>;
        idempotentHint: z.ZodOptional<z.ZodBoolean>;
        openWorldHint: z.ZodOptional<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        title: z.ZodOptional<z.ZodString>;
        readOnlyHint: z.ZodOptional<z.ZodBoolean>;
        destructiveHint: z.ZodOptional<z.ZodBoolean>;
        idempotentHint: z.ZodOptional<z.ZodBoolean>;
        openWorldHint: z.ZodOptional<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough">>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
    title?: string | undefined;
    inputSchema?: Record<string, unknown> | undefined;
    outputSchema?: Record<string, unknown> | undefined;
    annotations?: z.objectOutputType<{
        title: z.ZodOptional<z.ZodString>;
        readOnlyHint: z.ZodOptional<z.ZodBoolean>;
        destructiveHint: z.ZodOptional<z.ZodBoolean>;
        idempotentHint: z.ZodOptional<z.ZodBoolean>;
        openWorldHint: z.ZodOptional<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough"> | undefined;
}, {
    name: string;
    description?: string | undefined;
    title?: string | undefined;
    inputSchema?: Record<string, unknown> | undefined;
    outputSchema?: Record<string, unknown> | undefined;
    annotations?: z.objectInputType<{
        title: z.ZodOptional<z.ZodString>;
        readOnlyHint: z.ZodOptional<z.ZodBoolean>;
        destructiveHint: z.ZodOptional<z.ZodBoolean>;
        idempotentHint: z.ZodOptional<z.ZodBoolean>;
        openWorldHint: z.ZodOptional<z.ZodBoolean>;
    }, z.ZodTypeAny, "passthrough"> | undefined;
}>;
export declare const ResourceSpecSchema: z.ZodObject<{
    name: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    uriTemplate: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    uriTemplate: string;
    title?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    name: string;
    uriTemplate: string;
    title?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const PromptSpecSchema: z.ZodObject<{
    name: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    argsSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
    title?: string | undefined;
    argsSchema?: Record<string, unknown> | undefined;
}, {
    name: string;
    description?: string | undefined;
    title?: string | undefined;
    argsSchema?: Record<string, unknown> | undefined;
}>;
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
export type PaginationParams = z.infer<typeof PaginationSchema>;
export type ToolAnnotations = z.infer<typeof ToolAnnotationsSchema>;
export type ToolSpec = z.infer<typeof ToolSpecSchema>;
export type ResourceSpec = z.infer<typeof ResourceSpecSchema>;
export type PromptSpec = z.infer<typeof PromptSpecSchema>;
export interface TextContent {
    type: 'text';
    text: string;
}
export interface ToolResponse<T = unknown> {
    content: TextContent[];
    structuredContent?: T;
    isError?: boolean;
}
export interface PaginatedResponse<T> {
    total_count: number;
    count: number;
    offset: number;
    limit: number;
    has_more: boolean;
    next_offset: number | null;
    items: T[];
}
export declare function paginateResults<T>(allResults: T[], limit?: number, offset?: number): PaginatedResponse<T>;
export declare function buildTextResponse<T>(data: T, markdownText: string, format: ResponseFormat): ToolResponse<T>;
export declare function buildErrorResponse(message: string): ToolResponse<null>;
