"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RotateKeyInputSchema = exports.RemoveCredentialInputSchema = exports.ListCredentialsInputSchema = exports.GetCredentialInputSchema = exports.AddCredentialInputSchema = exports.RotateKeyInputShape = exports.RemoveCredentialInputShape = exports.ListCredentialsInputShape = exports.GetCredentialInputShape = exports.AddCredentialInputShape = exports.CredentialTypeSchema = exports.RemoveAnnotations = exports.WriteAnnotations = exports.ReadOnlyAnnotations = exports.ResponseFormatSchema = void 0;
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
exports.RemoveAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
};
exports.CredentialTypeSchema = zod_1.z.enum(['password', 'apiKey', 'sshKey', 'oauth', 'certificate', 'custom']);
exports.AddCredentialInputShape = {
    id: zod_1.z.string().min(1).describe('Unique identifier for this credential'),
    type: exports.CredentialTypeSchema.describe('Credential type'),
    username: zod_1.z.string().optional().describe('Username or account name'),
    password: zod_1.z.string().optional().describe('Password or secret value to encrypt'),
    url: zod_1.z.string().optional().describe('Service URL (https://hostname:port)'),
    notes: zod_1.z.string().optional().describe('Free-form notes'),
};
exports.GetCredentialInputShape = {
    id: zod_1.z.string().min(1).describe('Credential identifier to retrieve'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.ListCredentialsInputShape = {
    type: exports.CredentialTypeSchema.optional().describe('Filter by credential type'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.RemoveCredentialInputShape = {
    id: zod_1.z.string().min(1).describe('Credential identifier to remove'),
};
exports.RotateKeyInputShape = {};
exports.AddCredentialInputSchema = zod_1.z.object(exports.AddCredentialInputShape);
exports.GetCredentialInputSchema = zod_1.z.object(exports.GetCredentialInputShape);
exports.ListCredentialsInputSchema = zod_1.z.object(exports.ListCredentialsInputShape);
exports.RemoveCredentialInputSchema = zod_1.z.object(exports.RemoveCredentialInputShape);
exports.RotateKeyInputSchema = zod_1.z.object(exports.RotateKeyInputShape);
//# sourceMappingURL=types.js.map