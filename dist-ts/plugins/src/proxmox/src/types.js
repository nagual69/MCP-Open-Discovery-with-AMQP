"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsInputShape = exports.ClusterResourcesInputShape = exports.VmInputShape = exports.NodeInputShape = exports.ListNodesInputShape = exports.OptionalCredsShape = exports.ProxmoxListAnnotations = exports.ProxmoxReadAnnotations = exports.ResponseFormatSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("./shared");
Object.defineProperty(exports, "ResponseFormatSchema", { enumerable: true, get: function () { return shared_1.ResponseFormatSchema; } });
exports.ProxmoxReadAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};
exports.ProxmoxListAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};
exports.OptionalCredsShape = {
    creds_id: zod_1.z.string().optional(),
};
exports.ListNodesInputShape = {
    ...exports.OptionalCredsShape,
    response_format: shared_1.ResponseFormatSchema,
};
exports.NodeInputShape = {
    node: zod_1.z.string().describe('Proxmox node name'),
    ...exports.OptionalCredsShape,
    response_format: shared_1.ResponseFormatSchema,
};
exports.VmInputShape = {
    node: zod_1.z.string().describe('Proxmox node name'),
    vmid: zod_1.z.string().describe('VM identifier'),
    ...exports.OptionalCredsShape,
    response_format: shared_1.ResponseFormatSchema,
};
exports.ClusterResourcesInputShape = {
    ...exports.OptionalCredsShape,
    response_format: shared_1.ResponseFormatSchema,
};
exports.MetricsInputShape = {
    node: zod_1.z.string().describe('Proxmox node name'),
    vmid: zod_1.z.string().optional().describe('Optional VM identifier for VM metrics'),
    ...exports.OptionalCredsShape,
    response_format: shared_1.ResponseFormatSchema,
};
//# sourceMappingURL=types.js.map