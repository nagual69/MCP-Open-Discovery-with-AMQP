"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatResponse = formatResponse;
function formatResponse(data, markdownText, format) {
    return format === 'json' ? JSON.stringify(data, null, 2) : markdownText;
}
//# sourceMappingURL=response-format.js.map