"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrateFilesystemInputShape = exports.SaveMemoryInputShape = exports.RotateKeyInputShape = exports.StatsMemoryInputShape = exports.ClearMemoryInputShape = exports.QueryMemoryInputShape = exports.MergeMemoryInputShape = exports.SetMemoryInputShape = exports.GetMemoryInputShape = exports.CiValueSchema = exports.ClearAnnotations = exports.WriteAnnotations = exports.ReadOnlyAnnotations = exports.ResponseFormatSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("./shared");
Object.defineProperty(exports, "ResponseFormatSchema", { enumerable: true, get: function () { return shared_1.ResponseFormatSchema; } });
exports.ReadOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
exports.WriteAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};
exports.ClearAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
};
exports.CiValueSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
exports.GetMemoryInputShape = {
    key: zod_1.z.string().min(1).describe('CI key (e.g., ci:host:192.168.1.10)'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.SetMemoryInputShape = {
    key: zod_1.z.string().min(1).describe('CI key (e.g., ci:host:192.168.1.10)'),
    value: exports.CiValueSchema.describe('CI object to store'),
};
exports.MergeMemoryInputShape = {
    key: zod_1.z.string().min(1).describe('CI key (e.g., ci:host:192.168.1.10)'),
    value: exports.CiValueSchema.describe('Partial CI object to merge'),
};
exports.QueryMemoryInputShape = {
    pattern: zod_1.z.string().optional().describe('Optional wildcard pattern such as ci:host:*'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.ClearMemoryInputShape = {};
exports.StatsMemoryInputShape = {
    response_format: shared_1.ResponseFormatSchema,
};
exports.RotateKeyInputShape = {
    newKey: zod_1.z.string().optional().describe('Optional new key value; generated automatically when omitted'),
};
exports.SaveMemoryInputShape = {};
exports.MigrateFilesystemInputShape = {
    oldDataPath: zod_1.z.string().optional().describe('Optional path to legacy filesystem memory data JSON'),
};
//# sourceMappingURL=types.js.map