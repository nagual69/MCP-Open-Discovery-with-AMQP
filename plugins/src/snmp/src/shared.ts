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

function normalizeStructuredContent(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { items: value };
  }

  return value;
}

export function buildTextResponse(structuredContent: unknown, text: string, responseFormat: ResponseFormat): ToolResponse {
  const normalizedContent = normalizeStructuredContent(structuredContent);

  if (responseFormat === 'json') {
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent: normalizedContent,
    };
  }

  return {
    content: [{ type: 'text', text }],
    structuredContent: normalizedContent,
  };
}

export function buildJsonResponse(structuredContent: unknown): ToolResponse {
  const normalizedContent = normalizeStructuredContent(structuredContent);

  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent: normalizedContent,
  };
}

export function buildErrorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: `SNMP Error: ${message}` }],
    structuredContent: { error: message },
    isError: true,
  };
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown SNMP error';
}