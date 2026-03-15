"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectMessageType = detectMessageType;
exports.validateJsonRpc = validateJsonRpc;
exports.parseMessage = parseMessage;
exports.sanitizeJsonRpcMessage = sanitizeJsonRpcMessage;
exports.normalizeMethodForRouting = normalizeMethodForRouting;
exports.getRoutingKey = getRoutingKey;
exports.generateSessionId = generateSessionId;
exports.validateAmqpConfig = validateAmqpConfig;
const node_crypto_1 = require("node:crypto");
function detectMessageType(message) {
    if (message.id !== undefined && message.id !== null && (message.result !== undefined || message.error !== undefined)) {
        return 'response';
    }
    if (message.id !== undefined && message.id !== null && typeof message.method === 'string') {
        return 'request';
    }
    return 'notification';
}
function validateJsonRpc(message) {
    if (!message || typeof message !== 'object') {
        return { valid: false, reason: 'Message must be an object' };
    }
    const candidate = message;
    if (candidate.jsonrpc !== '2.0') {
        return { valid: false, reason: 'Missing or invalid jsonrpc field (must be "2.0")' };
    }
    const hasMethod = typeof candidate.method === 'string';
    const hasResult = candidate.result !== undefined;
    const hasError = candidate.error !== undefined;
    if (!hasMethod && !hasResult && !hasError) {
        return { valid: false, reason: 'Message must have method, result, or error field' };
    }
    return { valid: true };
}
function parseMessage(content) {
    try {
        return { success: true, message: JSON.parse(content.toString('utf8')) };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}
function sanitizeJsonRpcMessage(message) {
    const clean = { ...message };
    if (!clean.jsonrpc) {
        clean.jsonrpc = '2.0';
    }
    for (const key of Object.keys(clean)) {
        if (key.startsWith('_rabbitMQ')) {
            delete clean[key];
        }
    }
    return clean;
}
function normalizeMethodForRouting(method) {
    return method.replace(/\//g, '.');
}
function getRoutingKey(message, messageType, strategy) {
    if (strategy) {
        return strategy(message, messageType);
    }
    const method = typeof message.method === 'string' ? normalizeMethodForRouting(message.method) : 'unknown';
    return `mcp.${messageType}.${method}`;
}
function generateSessionId() {
    return (0, node_crypto_1.randomUUID)();
}
function validateAmqpConfig(config) {
    const errors = [];
    try {
        const parsed = new URL(config.amqpUrl);
        if (parsed.protocol !== 'amqp:' && parsed.protocol !== 'amqps:') {
            errors.push(`Invalid AMQP URL scheme: ${parsed.protocol}. Must be amqp: or amqps:`);
        }
    }
    catch {
        errors.push(`Invalid AMQP URL: ${config.amqpUrl}`);
    }
    if (!config.queuePrefix.trim()) {
        errors.push('queuePrefix is required');
    }
    if (!config.exchangeName.trim()) {
        errors.push('exchangeName is required');
    }
    if (config.reconnectDelay !== undefined && config.reconnectDelay < 1000) {
        errors.push('reconnectDelay must be at least 1000ms');
    }
    if (config.maxReconnectAttempts !== undefined && config.maxReconnectAttempts < 1) {
        errors.push('maxReconnectAttempts must be at least 1');
    }
    if (config.prefetchCount !== undefined && config.prefetchCount < 1) {
        errors.push('prefetchCount must be at least 1');
    }
    return errors;
}
//# sourceMappingURL=amqp-utils.js.map