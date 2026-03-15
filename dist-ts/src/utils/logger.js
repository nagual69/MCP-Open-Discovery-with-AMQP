"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
function writeLog(scope, level, message, context) {
    const timestamp = new Date().toISOString();
    const serializedContext = context === undefined ? '' : ` ${JSON.stringify(context)}`;
    const line = `[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}${serializedContext}`;
    if (level === 'error') {
        console.error(line);
        return;
    }
    if (level === 'warn') {
        console.warn(line);
        return;
    }
    console.log(line);
}
function createLogger(scope) {
    return {
        debug: (message, context) => writeLog(scope, 'debug', message, context),
        info: (message, context) => writeLog(scope, 'info', message, context),
        warn: (message, context) => writeLog(scope, 'warn', message, context),
        error: (message, context) => writeLog(scope, 'error', message, context),
    };
}
//# sourceMappingURL=logger.js.map