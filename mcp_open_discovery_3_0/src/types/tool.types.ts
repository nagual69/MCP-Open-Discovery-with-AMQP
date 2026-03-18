import { z } from 'zod';

export const ResponseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe("Output format: 'markdown' for human-readable (default), 'json' for machine-readable/programmatic use");

export const PaginationSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(20)
    .describe('Maximum results to return per page (default: 20, max: 200)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of results to skip for pagination (default: 0)'),
});

export const ToolAnnotationsSchema = z
  .object({
    title: z.string().optional(),
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
  })
  .passthrough();

export const ToolSpecSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  annotations: ToolAnnotationsSchema.optional(),
});

export const ResourceSpecSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  uriTemplate: z.string().min(1),
});

export const PromptSpecSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  argsSchema: z.record(z.unknown()).optional(),
});

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

export function paginateResults<T>(
  allResults: T[],
  limit = 20,
  offset = 0,
): PaginatedResponse<T> {
  const total = allResults.length;
  const page = allResults.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    total_count: total,
    count: page.length,
    offset,
    limit,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
    items: page,
  };
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

export function buildErrorResponse(message: string): ToolResponse<null> {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}