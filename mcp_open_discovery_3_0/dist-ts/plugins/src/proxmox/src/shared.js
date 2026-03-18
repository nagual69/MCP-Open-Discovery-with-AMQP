"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseFormatSchema = void 0;
exports.buildTextResponse = buildTextResponse;
exports.buildErrorResponse = buildErrorResponse;
const zod_1 = require("zod");
exports.ResponseFormatSchema = zod_1.z.enum(['json', 'markdown']).default('markdown');
function normalizeStructuredContent(value) {
    if (Array.isArray(value)) {
        return { items: value };
    }
    return value;
}
function buildTextResponse(structuredContent, text, responseFormat) {
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
function buildErrorResponse(message) {
    return {
        content: [{ type: 'text', text: `Proxmox API Error: ${message}` }],
        structuredContent: { error: message },
        isError: true,
    };
}
//# sourceMappingURL=shared.js.map