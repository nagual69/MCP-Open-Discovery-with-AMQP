/**
 * Logging Adapter - Per-session logging level control with MCP notifications
 */

const { broadcast, buildNotification, sendToSession, getTransportResults, sendViaStdio, sendViaAmqp } = require('./notification_hub');

const LEVELS = [
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
  'alert',
  'emergency'
];

// Global default level
let defaultLevel = process.env.LOG_LEVEL || 'info';

// Map sessionId -> level
const sessionLevels = new Map();

function setDefaultLevel(level) {
  if (LEVELS.includes(level)) defaultLevel = level;
}

function setSessionLevel(sessionId, level) {
  if (!sessionId || !LEVELS.includes(level)) return false;
  sessionLevels.set(sessionId, level);
  return true;
}

function getSessionLevel(sessionId) {
  return (sessionId && sessionLevels.get(sessionId)) || defaultLevel;
}

function shouldSend(level, minLevel) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(minLevel);
}

// Emit notifications/message to sessions/transports honoring configured levels
async function emitLog(level, data, loggerName = 'server') {
  const results = getTransportResults();
  const notification = buildNotification('notifications/message', { level, logger: loggerName, data });

  // HTTP: per-session filtering based on set level (fallback to default)
  const http = results.transports?.http;
  if (http && http.success && http.transports) {
    const sessionIds = Object.keys(http.transports);
    for (const sid of sessionIds) {
      const minLevel = getSessionLevel(sid);
      if (shouldSend(level, minLevel)) {
        try { await sendToSession(sid, notification); } catch {}
      }
    }
  }

  // stdio: single session, use default level
  if (shouldSend(level, defaultLevel)) {
    try { await sendViaStdio(notification); } catch {}
  }

  // AMQP: broadcast when level meets default threshold (no per-session targeting)
  if (shouldSend(level, defaultLevel)) {
    try { await sendViaAmqp(notification); } catch {}
  }
}

// Convenience wrapper that can be plugged into server log()
async function logAndNotify(level, message, extra = null) {
  const timestamp = new Date().toISOString();
  const payload = extra ? { message, timestamp, ...extra } : { message, timestamp };
  await emitLog(level, payload, 'mcp-open-discovery');
}

module.exports = {
  LEVELS,
  setDefaultLevel,
  setSessionLevel,
  getSessionLevel,
  shouldSend,
  emitLog,
  logAndNotify
};
