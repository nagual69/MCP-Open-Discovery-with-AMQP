"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptSpecSchema = exports.ResourceSpecSchema = exports.ToolSpecSchema = exports.ToolAnnotationsSchema = exports.PaginationSchema = exports.ResponseFormatSchema = void 0;
exports.paginateResults = paginateResults;
exports.buildTextResponse = buildTextResponse;
exports.buildErrorResponse = buildErrorResponse;
const zod_1 = require("zod");
exports.ResponseFormatSchema = zod_1.z
    .enum(['json', 'markdown'])
    .default('markdown')
    .describe("Output format: 'markdown' for human-readable (default), 'json' for machine-readable/programmatic use");
exports.PaginationSchema = zod_1.z.object({
    limit: zod_1.z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(20)
        .describe('Maximum results to return per page (default: 20, max: 200)'),
    offset: zod_1.z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Number of results to skip for pagination (default: 0)'),
});
exports.ToolAnnotationsSchema = zod_1.z
    .object({
    title: zod_1.z.string().optional(),
    readOnlyHint: zod_1.z.boolean().optional(),
    destructiveHint: zod_1.z.boolean().optional(),
    idempotentHint: zod_1.z.boolean().optional(),
    openWorldHint: zod_1.z.boolean().optional(),
})
    .passthrough();
exports.ToolSpecSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    title: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    inputSchema: zod_1.z.record(zod_1.z.unknown()).optional(),
    outputSchema: zod_1.z.record(zod_1.z.unknown()).optional(),
    annotations: exports.ToolAnnotationsSchema.optional(),
});
exports.ResourceSpecSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    title: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
    uriTemplate: zod_1.z.string().min(1),
});
exports.PromptSpecSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    title: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    argsSchema: zod_1.z.record(zod_1.z.unknown()).optional(),
});
function paginateResults(allResults, limit = 20, offset = 0) {
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
function buildTextResponse(data, markdownText, format) {
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
function buildErrorResponse(message) {
    return {
        isError: true,
        content: [{ type: 'text', text: message }],
    };
}
//# sourceMappingURL=tool.types.js.map