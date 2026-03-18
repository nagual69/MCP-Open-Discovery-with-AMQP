"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseFormatSchema = void 0;
exports.buildTextResponse = buildTextResponse;
exports.buildJsonResponse = buildJsonResponse;
exports.buildErrorResponse = buildErrorResponse;
const zod_1 = require("zod");
exports.ResponseFormatSchema = zod_1.z
    .enum(['json', 'markdown'])
    .default('markdown')
    .describe("Output format: 'markdown' for human-readable (default), 'json' for machine-readable");
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
function buildJsonResponse(data) {
    return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
    };
}
function buildErrorResponse(message) {
    return {
        isError: true,
        content: [{ type: 'text', text: message }],
        structuredContent: { error: message },
    };
}
//# sourceMappingURL=shared.js.map