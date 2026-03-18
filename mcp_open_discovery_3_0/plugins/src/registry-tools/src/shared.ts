import { z } from 'zod';

export const ResponseFormatSchema = z.enum(['json', 'markdown']).default('markdown');

export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export function buildTextResponse(structuredContent: unknown, text: string, responseFormat: ResponseFormat): ToolResponse {
  if (responseFormat === 'json') {
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  }

  return {
    content: [{ type: 'text', text }],
    structuredContent,
  };
}

export function buildJsonResponse(structuredContent: unknown): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

export function buildErrorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: `Registry Error: ${message}` }],
    structuredContent: { error: message },
    isError: true,
  };
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown registry error';
}