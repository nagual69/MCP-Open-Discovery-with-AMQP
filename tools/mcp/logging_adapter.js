/**
 * Logging Adapter - Per-session logging level control with MCP notifications
 */

const { broadcast, buildNotification, sendToSession } = require('./notification_hub');

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

// Emit notifications/message to all sessions that requested this level or higher
async function emitLog(level, data, loggerName = 'server') {
  const notification = buildNotification('notifications/message', {
    level,
    logger: loggerName,
    data
  });

  // Broadcast to all transports; HTTP sessions get individual messages
  await broadcast(notification);
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
