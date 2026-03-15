"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNotification = buildNotification;
exports.sendToSession = sendToSession;
exports.sendViaStdio = sendViaStdio;
exports.sendViaAmqp = sendViaAmqp;
exports.broadcast = broadcast;
exports.publishToolsListChanged = publishToolsListChanged;
exports.publishResourcesListChanged = publishResourcesListChanged;
exports.publishPromptsListChanged = publishPromptsListChanged;
const utils_1 = require("../utils");
const transport_state_1 = require("./transport-state");
const logger = (0, utils_1.createLogger)('NOTIFICATIONS');
function buildNotification(method, params) {
    return {
        jsonrpc: '2.0',
        method,
        params,
    };
}
async function sendToSession(sessionId, notification) {
    const transports = (0, transport_state_1.getManagedTransports)();
    const sessionTransport = transports?.http?.sessions?.[sessionId];
    if (!sessionTransport || typeof sessionTransport.send !== 'function') {
        return false;
    }
    try {
        await sessionTransport.send(notification);
        return true;
    }
    catch (error) {
        logger.warn('Failed to send notification to HTTP session', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}
async function sendViaStdio(notification) {
    const transports = (0, transport_state_1.getManagedTransports)();
    const stdioTransport = transports?.stdioTransport;
    if (!stdioTransport || typeof stdioTransport.send !== 'function') {
        return false;
    }
    try {
        await stdioTransport.send(notification);
        return true;
    }
    catch (error) {
        logger.warn('Failed to send notification over stdio', {
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}
async function sendViaAmqp(notification) {
    const transports = (0, transport_state_1.getManagedTransports)();
    const amqpRuntime = transports?.amqpRuntime;
    if (!amqpRuntime || typeof amqpRuntime.send !== 'function') {
        return false;
    }
    if (typeof amqpRuntime.getStatus === 'function' && !amqpRuntime.getStatus().connected) {
        return false;
    }
    try {
        await amqpRuntime.send(notification);
        return true;
    }
    catch (error) {
        logger.warn('Failed to send notification over AMQP', {
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}
async function broadcast(notification) {
    const transports = (0, transport_state_1.getManagedTransports)();
    const results = [];
    if (transports?.http?.sessions) {
        for (const sessionId of Object.keys(transports.http.sessions)) {
            results.push(await sendToSession(sessionId, notification));
        }
    }
    results.push(await sendViaStdio(notification));
    results.push(await sendViaAmqp(notification));
    return results.some(Boolean);
}
async function publishToolsListChanged() {
    return broadcast(buildNotification('notifications/tools/list_changed', {}));
}
async function publishResourcesListChanged() {
    return broadcast(buildNotification('notifications/resources/list_changed', {}));
}
async function publishPromptsListChanged() {
    return broadcast(buildNotification('notifications/prompts/list_changed', {}));
}
//# sourceMappingURL=notifications.js.map