"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RescanInputShape = exports.ShowInputShape = exports.RemoveInputShape = exports.InstallInputShape = exports.VerifyInputShape = exports.SearchInputShape = exports.ListInputShape = exports.RemoveAnnotations = exports.InstallAnnotations = exports.ReadAnnotations = exports.ResponseFormatSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("./shared");
Object.defineProperty(exports, "ResponseFormatSchema", { enumerable: true, get: function () { return shared_1.ResponseFormatSchema; } });
exports.ReadAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
exports.InstallAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};
exports.RemoveAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
};
exports.ListInputShape = {
    response_format: shared_1.ResponseFormatSchema,
};
exports.SearchInputShape = {
    query: zod_1.z.string().optional().describe('Text to search in name or description'),
    type: zod_1.z.string().optional().describe('Filter by plugin type (for example tool-module)'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.VerifyInputShape = {
    pluginId: zod_1.z.string().describe('Plugin ID (name@version)'),
    strictIntegrity: zod_1.z.boolean().optional().describe('Enforce coverage=all checksum requirement'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.InstallInputShape = {
    url: zod_1.z.string().url().optional().describe('HTTP(S) URL to plugin zip'),
    filePath: zod_1.z.string().optional().describe('Local path to plugin zip'),
    pluginId: zod_1.z.string().optional().describe('Explicit plugin ID override'),
    autoLoad: zod_1.z.boolean().default(false).describe('Activate automatically after install'),
    checksum: zod_1.z.string().optional().describe('Expected checksum of the payload'),
    checksumAlgorithm: zod_1.z.string().optional().describe('Checksum algorithm (default sha256)'),
    signature: zod_1.z.string().optional().describe('Base64 signature for payload'),
    publicKey: zod_1.z.string().optional().describe('PEM public key for signature verification'),
    signatureAlgorithm: zod_1.z.string().optional().describe('Signature algorithm'),
};
exports.RemoveInputShape = {
    pluginId: zod_1.z.string().describe('Plugin ID (name@version) to remove'),
};
exports.ShowInputShape = {
    pluginId: zod_1.z.string().describe('Plugin ID (name@version)'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.RescanInputShape = {
    pluginId: zod_1.z.string().describe('Plugin ID (name@version)'),
    response_format: shared_1.ResponseFormatSchema,
};
//# sourceMappingURL=types.js.map