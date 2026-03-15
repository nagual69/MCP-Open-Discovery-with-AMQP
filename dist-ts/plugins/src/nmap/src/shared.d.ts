import { z } from 'zod';
export declare const ResponseFormatSchema: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
export interface TextContent {
    [key: string]: unknown;
    type: 'text';
    text: string;
}
export interface ToolResponse<T = unknown> {
    content: TextContent[];
    structuredContent?: T;
    isError?: boolean;
}
export declare function buildTextResponse<T>(data: T, markdownText: string, format: ResponseFormat): ToolResponse<T>;
export declare function buildErrorResponse(message: string): ToolResponse<{
    error: string;
}>;
//# sourceMappingURL=shared.d.ts.map