"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SigningKeyInputShape = exports.AuditLogInputShape = exports.UpdateInputShape = exports.PluginIdInputShape = exports.InstallInputShape = exports.ReadOnlyResponseInputShape = exports.ListPluginsInputShape = exports.RemoveAnnotations = exports.WriteAnnotations = exports.OpenReadAnnotations = exports.ReadAnnotations = exports.ResponseFormatSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("./shared");
Object.defineProperty(exports, "ResponseFormatSchema", { enumerable: true, get: function () { return shared_1.ResponseFormatSchema; } });
exports.ReadAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
exports.OpenReadAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};
exports.WriteAnnotations = {
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
exports.ListPluginsInputShape = {
    filter_state: zod_1.z.enum(['all', 'active', 'inactive', 'installed', 'error']).default('all').describe('Filter by lifecycle state'),
    limit: zod_1.z.number().int().min(1).max(200).default(50).describe('Results per page'),
    offset: zod_1.z.number().int().min(0).default(0).describe('Skip N results for pagination'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.ReadOnlyResponseInputShape = {
    response_format: shared_1.ResponseFormatSchema,
};
exports.InstallInputShape = {
    source: zod_1.z.string().describe('Marketplace URL or local file path to plugin zip'),
    auto_activate: zod_1.z.boolean().default(false).describe('Automatically activate after install'),
};
exports.PluginIdInputShape = {
    plugin_id: zod_1.z.string().describe('Plugin ID in format name@version'),
};
exports.UpdateInputShape = {
    plugin_name: zod_1.z.string().describe('Plugin name without version'),
    source: zod_1.z.string().describe('Marketplace URL or local file path to new version zip'),
};
exports.AuditLogInputShape = {
    plugin_id: zod_1.z.string().describe('Plugin ID in format name@version'),
    limit: zod_1.z.number().int().min(1).max(100).default(20).describe('Number of log entries to return'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.SigningKeyInputShape = {
    key_id: zod_1.z.string().describe('Unique identifier for this key'),
    public_key_pem: zod_1.z.string().describe('PEM-encoded public key'),
    algorithm: zod_1.z.enum(['Ed25519', 'RSA-SHA256']).default('Ed25519').describe('Key algorithm'),
    owner: zod_1.z.string().describe('Organization or team that owns this key'),
    enterprise_id: zod_1.z.string().optional().describe('Enterprise identifier'),
};
//# sourceMappingURL=types.js.map