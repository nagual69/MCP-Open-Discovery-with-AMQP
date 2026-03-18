import { z } from 'zod';
export declare const ResponseFormatSchema: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
export interface ToolResponse {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    structuredContent?: unknown;
    isError?: boolean;
}
export declare function buildTextResponse(structuredContent: unknown, text: string, responseFormat: ResponseFormat): ToolResponse;
export declare function buildJsonResponse(structuredContent: unknown): ToolResponse;
export declare function buildErrorResponse(message: string): ToolResponse;
export declare function getErrorMessage(error: unknown): string;
//# sourceMappingURL=shared.d.ts.map