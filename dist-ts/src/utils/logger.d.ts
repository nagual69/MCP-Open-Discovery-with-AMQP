export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface Logger {
    debug(message: string, context?: unknown): void;
    info(message: string, context?: unknown): void;
    warn(message: string, context?: unknown): void;
    error(message: string, context?: unknown): void;
}
export declare function createLogger(scope: string): Logger;
//# sourceMappingURL=logger.d.ts.map