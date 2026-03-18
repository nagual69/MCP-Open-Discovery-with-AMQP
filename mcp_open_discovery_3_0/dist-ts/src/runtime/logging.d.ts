export declare const LOG_LEVELS: readonly ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"];
export type RuntimeLogLevel = (typeof LOG_LEVELS)[number];
export declare function setDefaultLevel(level: string): boolean;
export declare function getDefaultLevel(): RuntimeLogLevel;
export declare function setSessionLevel(sessionId: string | undefined, level: string): boolean;
export declare function getSessionLevel(sessionId?: string): RuntimeLogLevel;
export declare function shouldSend(level: RuntimeLogLevel, minimumLevel: RuntimeLogLevel): boolean;
export declare function emitLog(level: RuntimeLogLevel, data: Record<string, unknown>, loggerName?: string): Promise<void>;
export declare function logAndNotify(level: RuntimeLogLevel, message: string, extra?: Record<string, unknown>): Promise<void>;
export declare function createSetLevelHandler(): (request: {
    params?: {
        level?: string;
        _meta?: {
            sessionId?: string;
        };
    };
}) => Promise<Record<string, never>>;
//# sourceMappingURL=logging.d.ts.map