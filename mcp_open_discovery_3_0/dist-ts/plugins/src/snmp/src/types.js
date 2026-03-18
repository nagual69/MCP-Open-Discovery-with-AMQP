"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopologyInputShape = exports.HostInputShape = exports.DiscoverInputShape = exports.SessionOidInputShape = exports.SessionOidArrayInputShape = exports.CloseSessionInputShape = exports.CreateSessionInputShape = exports.SnmpSessionOptionsShape = exports.SnmpGetAnnotations = exports.SnmpReadAnnotations = exports.SessionCloseAnnotations = exports.SessionCreateAnnotations = exports.ResponseFormatSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("./shared");
Object.defineProperty(exports, "ResponseFormatSchema", { enumerable: true, get: function () { return shared_1.ResponseFormatSchema; } });
exports.SessionCreateAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};
exports.SessionCloseAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
exports.SnmpReadAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};
exports.SnmpGetAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};
exports.SnmpSessionOptionsShape = {
    community: zod_1.z.string().optional().describe('SNMP community string'),
    version: zod_1.z.enum(['1', '2c', '3']).optional().describe('SNMP version'),
    port: zod_1.z.number().optional().describe('SNMP port (default: 161)'),
    timeout: zod_1.z.number().optional().describe('Timeout in ms (default: 5000)'),
    retries: zod_1.z.number().optional().describe('Retry count (default: 1)'),
    user: zod_1.z.string().optional().describe('SNMPv3 username (v3 only)'),
    authProtocol: zod_1.z.enum(['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512']).optional(),
    authKey: zod_1.z.string().optional().describe('SNMPv3 auth key (v3 only)'),
    privProtocol: zod_1.z.enum(['des', 'aes', 'aes128', 'aes192', 'aes256']).optional(),
    privKey: zod_1.z.string().optional().describe('SNMPv3 privacy key (v3 only)'),
};
exports.CreateSessionInputShape = {
    host: zod_1.z.string().describe('Hostname or IP address of target device'),
    ...exports.SnmpSessionOptionsShape,
};
exports.CloseSessionInputShape = {
    sessionId: zod_1.z.string().describe('Session ID from mcp_od_snmp_create_session'),
};
exports.SessionOidArrayInputShape = {
    sessionId: zod_1.z.string(),
    oids: zod_1.z.array(zod_1.z.string()).describe('Array of OIDs to retrieve'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.SessionOidInputShape = {
    sessionId: zod_1.z.string(),
    oid: zod_1.z.string().describe('Base OID'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.DiscoverInputShape = {
    targetRange: zod_1.z.string().describe('Network range in CIDR notation (e.g., 192.168.1.0/24)'),
    community: zod_1.z.string().optional(),
    version: zod_1.z.enum(['1', '2c', '3']).optional(),
    port: zod_1.z.number().optional(),
    timeout: zod_1.z.number().optional(),
    response_format: shared_1.ResponseFormatSchema,
};
exports.HostInputShape = {
    host: zod_1.z.string().describe('Hostname or IP address of target device'),
    community: zod_1.z.string().optional(),
    version: zod_1.z.enum(['1', '2c', '3']).optional(),
    response_format: shared_1.ResponseFormatSchema,
};
exports.TopologyInputShape = {
    networkRange: zod_1.z.string().describe('Network range in CIDR notation'),
    community: zod_1.z.string().optional(),
    version: zod_1.z.enum(['1', '2c', '3']).optional(),
    response_format: shared_1.ResponseFormatSchema,
};
//# sourceMappingURL=types.js.map