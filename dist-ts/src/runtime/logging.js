"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_LEVELS = void 0;
exports.setDefaultLevel = setDefaultLevel;
exports.getDefaultLevel = getDefaultLevel;
exports.setSessionLevel = setSessionLevel;
exports.getSessionLevel = getSessionLevel;
exports.shouldSend = shouldSend;
exports.emitLog = emitLog;
exports.logAndNotify = logAndNotify;
exports.createSetLevelHandler = createSetLevelHandler;
const utils_1 = require("../utils");
const notifications_1 = require("./notifications");
const transport_state_1 = require("./transport-state");
const logger = (0, utils_1.createLogger)('RUNTIME_LOGGING');
exports.LOG_LEVELS = [
    'debug',
    'info',
    'notice',
    'warning',
    'error',
    'critical',
    'alert',
    'emergency',
];
let defaultLevel = exports.LOG_LEVELS.includes((process.env.LOG_LEVEL || 'info'))
    ? process.env.LOG_LEVEL
    : 'info';
const sessionLevels = new Map();
function setDefaultLevel(level) {
    if (!exports.LOG_LEVELS.includes(level)) {
        return false;
    }
    defaultLevel = level;
    return true;
}
function getDefaultLevel() {
    return defaultLevel;
}
function setSessionLevel(sessionId, level) {
    if (!sessionId || !exports.LOG_LEVELS.includes(level)) {
        return false;
    }
    sessionLevels.set(sessionId, level);
    return true;
}
function getSessionLevel(sessionId) {
    return sessionId ? sessionLevels.get(sessionId) ?? defaultLevel : defaultLevel;
}
function shouldSend(level, minimumLevel) {
    return exports.LOG_LEVELS.indexOf(level) >= exports.LOG_LEVELS.indexOf(minimumLevel);
}
async function emitLog(level, data, loggerName = 'mcp-open-discovery') {
    const notification = (0, notifications_1.buildNotification)('notifications/message', {
        level,
        logger: loggerName,
        data,
    });
    const managed = (0, transport_state_1.getManagedTransports)();
    if (managed?.http?.sessions) {
        for (const sessionId of Object.keys(managed.http.sessions)) {
            if (shouldSend(level, getSessionLevel(sessionId))) {
                await (0, notifications_1.sendToSession)(sessionId, notification);
            }
        }
    }
    if (shouldSend(level, defaultLevel)) {
        await (0, notifications_1.sendViaStdio)(notification);
        await (0, notifications_1.sendViaAmqp)(notification);
    }
}
async function logAndNotify(level, message, extra) {
    const payload = {
        message,
        timestamp: new Date().toISOString(),
        ...(extra ?? {}),
    };
    try {
        await emitLog(level, payload);
    }
    catch (error) {
        logger.warn('Failed to emit log notification', {
            level,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
function createSetLevelHandler() {
    return async (request) => {
        const level = request.params?.level;
        const sessionId = request.params?._meta?.sessionId;
        if (level) {
            setDefaultLevel(level);
            if (sessionId) {
                setSessionLevel(sessionId, level);
            }
        }
        return {};
    };
}
//# sourceMappingURL=logging.js.map