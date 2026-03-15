import { createLogger } from '../utils';
import { buildNotification, sendToSession, sendViaAmqp, sendViaStdio } from './notifications';
import { getManagedTransports } from './transport-state';

const logger = createLogger('RUNTIME_LOGGING');

export const LOG_LEVELS = [
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
  'alert',
  'emergency',
] as const;

export type RuntimeLogLevel = (typeof LOG_LEVELS)[number];

let defaultLevel: RuntimeLogLevel = LOG_LEVELS.includes((process.env.LOG_LEVEL || 'info') as RuntimeLogLevel)
  ? (process.env.LOG_LEVEL as RuntimeLogLevel)
  : 'info';

const sessionLevels = new Map<string, RuntimeLogLevel>();

export function setDefaultLevel(level: string): boolean {
  if (!LOG_LEVELS.includes(level as RuntimeLogLevel)) {
    return false;
  }
  defaultLevel = level as RuntimeLogLevel;
  return true;
}

export function getDefaultLevel(): RuntimeLogLevel {
  return defaultLevel;
}

export function setSessionLevel(sessionId: string | undefined, level: string): boolean {
  if (!sessionId || !LOG_LEVELS.includes(level as RuntimeLogLevel)) {
    return false;
  }
  sessionLevels.set(sessionId, level as RuntimeLogLevel);
  return true;
}

export function getSessionLevel(sessionId?: string): RuntimeLogLevel {
  return sessionId ? sessionLevels.get(sessionId) ?? defaultLevel : defaultLevel;
}

export function shouldSend(level: RuntimeLogLevel, minimumLevel: RuntimeLogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minimumLevel);
}

export async function emitLog(level: RuntimeLogLevel, data: Record<string, unknown>, loggerName = 'mcp-open-discovery'): Promise<void> {
  const notification = buildNotification('notifications/message', {
    level,
    logger: loggerName,
    data,
  });

  const managed = getManagedTransports();
  if (managed?.http?.sessions) {
    for (const sessionId of Object.keys(managed.http.sessions)) {
      if (shouldSend(level, getSessionLevel(sessionId))) {
        await sendToSession(sessionId, notification);
      }
    }
  }

  if (shouldSend(level, defaultLevel)) {
    await sendViaStdio(notification);
    await sendViaAmqp(notification);
  }
}

export async function logAndNotify(level: RuntimeLogLevel, message: string, extra?: Record<string, unknown>): Promise<void> {
  const payload = {
    message,
    timestamp: new Date().toISOString(),
    ...(extra ?? {}),
  };
  try {
    await emitLog(level, payload);
  } catch (error) {
    logger.warn('Failed to emit log notification', {
      level,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function createSetLevelHandler(): (request: { params?: { level?: string; _meta?: { sessionId?: string } } }) => Promise<Record<string, never>> {
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