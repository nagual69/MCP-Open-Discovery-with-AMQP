import { z } from 'zod';

export const ResponseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe("Output format: 'markdown' for human-readable (default), 'json' for machine-readable");

export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResponse<T = unknown> {
  content: TextContent[];
  structuredContent?: T;
  isError?: boolean;
}

export function buildTextResponse<T>(
  data: T,
  markdownText: string,
  format: ResponseFormat,
): ToolResponse<T> {
  return {
    content: [
      {
        type: 'text',
        text: format === 'json' ? JSON.stringify(data, null, 2) : markdownText,
      },
    ],
    structuredContent: data,
  };
}

export function buildErrorResponse(message: string): ToolResponse<{ error: string }> {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: { error: message },
  };
}