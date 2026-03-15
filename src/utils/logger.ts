export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
}

function writeLog(scope: string, level: LogLevel, message: string, context?: unknown): void {
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

export function createLogger(scope: string): Logger {
  return {
    debug: (message, context) => writeLog(scope, 'debug', message, context),
    info: (message, context) => writeLog(scope, 'info', message, context),
    warn: (message, context) => writeLog(scope, 'warn', message, context),
    error: (message, context) => writeLog(scope, 'error', message, context),
  };
}