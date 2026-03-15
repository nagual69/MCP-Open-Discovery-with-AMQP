"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseFormatSchema = void 0;
exports.buildTextResponse = buildTextResponse;
exports.buildJsonResponse = buildJsonResponse;
exports.buildErrorResponse = buildErrorResponse;
exports.getErrorMessage = getErrorMessage;
const zod_1 = require("zod");
exports.ResponseFormatSchema = zod_1.z.enum(['json', 'markdown']).default('markdown');
function buildTextResponse(structuredContent, text, responseFormat) {
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
function buildJsonResponse(structuredContent) {
    return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
    };
}
function buildErrorResponse(message) {
    return {
        content: [{ type: 'text', text: `SNMP Error: ${message}` }],
        structuredContent: { error: message },
        isError: true,
    };
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : 'Unknown SNMP error';
}
//# sourceMappingURL=shared.js.map