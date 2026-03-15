"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhoisInputSchema = exports.ArpInputSchema = exports.IfconfigInputSchema = exports.RouteInputSchema = exports.TcpConnectInputSchema = exports.NetstatInputSchema = exports.NslookupInputSchema = exports.WgetInputSchema = exports.PingInputSchema = exports.WhoisInputShape = exports.ArpInputShape = exports.IfconfigInputShape = exports.RouteInputShape = exports.TcpConnectInputShape = exports.NetstatInputShape = exports.NslookupInputShape = exports.WgetInputShape = exports.PingInputShape = exports.ToolAnnotations = exports.ResponseFormatSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("./shared");
Object.defineProperty(exports, "ResponseFormatSchema", { enumerable: true, get: function () { return shared_1.ResponseFormatSchema; } });
exports.ToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};
exports.PingInputShape = {
    host: zod_1.z.string().min(1).describe('IP address or hostname to ping'),
    count: zod_1.z.number().int().min(1).max(10).default(4).describe('Number of ICMP requests (1-10)'),
    timeout: zod_1.z.number().int().min(1).max(30).default(5).describe('Timeout per request in seconds (1-30)'),
    size: zod_1.z.number().int().min(56).max(1024).optional().describe('Packet size in bytes (56-1024)'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.WgetInputShape = {
    url: zod_1.z.string().url().describe('HTTP/HTTPS URL to fetch'),
    timeout: zod_1.z.number().int().min(1).max(300).default(30).describe('Request timeout in seconds (1-300)'),
    user_agent: zod_1.z.string().optional().describe('Custom User-Agent string'),
    max_redirect: zod_1.z.number().int().min(0).max(10).default(5).describe('Maximum redirects to follow (0-10)'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.NslookupInputShape = {
    host: zod_1.z.string().min(1).describe('Hostname or IP address to lookup'),
    type: zod_1.z.enum(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'PTR', 'SOA']).default('A').describe('DNS record type'),
    server: zod_1.z.string().optional().describe('DNS server to query'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.NetstatInputShape = {
    listening: zod_1.z.boolean().default(false).describe('Show only listening ports'),
    numeric: zod_1.z.boolean().default(true).describe('Show numerical addresses'),
    programs: zod_1.z.boolean().default(false).describe('Show PID and process names where available'),
    protocol: zod_1.z.enum(['tcp', 'udp', 'all']).default('all').describe('Protocol filter'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.TcpConnectInputShape = {
    host: zod_1.z.string().min(1).describe('Target hostname or IP address'),
    port: zod_1.z.number().int().min(1).max(65535).describe('Target port number'),
    timeout: zod_1.z.number().int().min(1).max(60).default(10).describe('Connection timeout in seconds (1-60)'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.RouteInputShape = {
    destination: zod_1.z.string().optional().describe('Show route to specific destination'),
    numeric: zod_1.z.boolean().default(true).describe('Show numerical addresses'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.IfconfigInputShape = {
    interface: zod_1.z.string().optional().describe('Specific interface to display'),
    all: zod_1.z.boolean().default(true).describe('Show all interfaces including inactive ones'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.ArpInputShape = {
    host: zod_1.z.string().optional().describe('Specific host to lookup in ARP table'),
    numeric: zod_1.z.boolean().default(false).describe('Show numerical addresses'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.WhoisInputShape = {
    query: zod_1.z.string().min(1).describe('Domain name or IP address to lookup'),
    server: zod_1.z.string().optional().describe('Specific WHOIS server to query'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.PingInputSchema = zod_1.z.object(exports.PingInputShape);
exports.WgetInputSchema = zod_1.z.object(exports.WgetInputShape);
exports.NslookupInputSchema = zod_1.z.object(exports.NslookupInputShape);
exports.NetstatInputSchema = zod_1.z.object(exports.NetstatInputShape);
exports.TcpConnectInputSchema = zod_1.z.object(exports.TcpConnectInputShape);
exports.RouteInputSchema = zod_1.z.object(exports.RouteInputShape);
exports.IfconfigInputSchema = zod_1.z.object(exports.IfconfigInputShape);
exports.ArpInputSchema = zod_1.z.object(exports.ArpInputShape);
exports.WhoisInputSchema = zod_1.z.object(exports.WhoisInputShape);
//# sourceMappingURL=types.js.map