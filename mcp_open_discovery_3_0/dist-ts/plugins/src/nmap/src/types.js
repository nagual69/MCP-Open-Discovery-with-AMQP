"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionScanInputShape = exports.UdpScanInputShape = exports.TcpConnectScanInputShape = exports.TcpSynScanInputShape = exports.PingScanInputShape = exports.ScanAnnotations = exports.ResponseFormatSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("./shared");
Object.defineProperty(exports, "ResponseFormatSchema", { enumerable: true, get: function () { return shared_1.ResponseFormatSchema; } });
exports.ScanAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};
exports.PingScanInputShape = {
    target: zod_1.z.string().describe('Target specification (hostname, IP, network, e.g., scanme.nmap.org, 192.168.1.0/24)'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.TcpSynScanInputShape = {
    target: zod_1.z.string().describe('Target specification'),
    ports: zod_1.z.string().optional().describe("Ports to scan (e.g., '80,443', '1-1024')"),
    fast_scan: zod_1.z.boolean().optional().describe('Fast mode (-F): Scan fewer ports'),
    timing_template: zod_1.z.number().min(0).max(5).optional().describe('Timing template (-T<0-5>)'),
    reason: zod_1.z.boolean().optional().describe('Display the reason a port is in a particular state'),
    open_only: zod_1.z.boolean().optional().describe('Only show open ports'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.TcpConnectScanInputShape = {
    target: zod_1.z.string().describe('Target specification'),
    ports: zod_1.z.string().optional().describe("Ports to scan (e.g., '80,443', '1-1024')"),
    timing_template: zod_1.z.number().min(0).max(5).optional().describe('Timing template (-T<0-5>)'),
    reason: zod_1.z.boolean().optional().describe('Display the reason a port is in a particular state'),
    open_only: zod_1.z.boolean().optional().describe('Only show open ports'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.UdpScanInputShape = {
    target: zod_1.z.string().describe('Target specification'),
    ports: zod_1.z.string().optional().describe('Ports to scan'),
    top_ports: zod_1.z.number().optional().describe('Scan the <number> most common UDP ports'),
    timing_template: zod_1.z.number().min(0).max(5).optional().describe('Timing template (-T<0-5>)'),
    reason: zod_1.z.boolean().optional().describe('Display the reason a port is in a particular state'),
    open_only: zod_1.z.boolean().optional().describe('Only show open ports'),
    response_format: shared_1.ResponseFormatSchema,
};
exports.VersionScanInputShape = {
    target: zod_1.z.string().describe('Target specification'),
    ports: zod_1.z.string().optional().describe('Ports to scan'),
    intensity: zod_1.z.number().min(0).max(9).optional().describe('Version scan intensity (0-9)'),
    light_mode: zod_1.z.boolean().optional().describe('Enable light mode (--version-light)'),
    all_ports: zod_1.z.boolean().optional().describe('Try all probes (--version-all)'),
    timing_template: zod_1.z.number().min(0).max(5).optional().describe('Timing template (-T<0-5>)'),
    reason: zod_1.z.boolean().optional().describe('Display the reason a port is in a particular state'),
    open_only: zod_1.z.boolean().optional().describe('Only show open ports'),
    response_format: shared_1.ResponseFormatSchema,
};
//# sourceMappingURL=types.js.map