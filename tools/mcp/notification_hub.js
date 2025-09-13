/**
 * Notification Hub - Unified MCP Notification Broadcasting
 *
 * Sends MCP notifications to all active transports and, when possible,
 * targets specific sessions (HTTP per-session, single stdio session).
 * AMQP falls back to broadcast via transport.send() routing.
 */

const GLOBAL_KEY = '__MCP_OPEN_DISCOVERY__';
const g = globalThis || global;
g[GLOBAL_KEY] = g[GLOBAL_KEY] || {};

function setTransportResults(results) {
  g[GLOBAL_KEY].transportResults = results;
}

function getTransportResults() {
  return g[GLOBAL_KEY].transportResults || { transports: {} };
}

function buildNotification(method, params) {
  return { jsonrpc: '2.0', method, params };
}

// Send a notification to a specific HTTP session if available
async function sendToHttpSession(sessionId, notification) {
  const results = getTransportResults();
  const http = results.transports?.http;
  if (!http || !http.success || !http.transports) return false;
  const transport = http.transports[sessionId];
  if (!transport || typeof transport.send !== 'function') return false;
  try {
    await transport.send(notification);
    return true;
  } catch {
    return false;
  }
}

// Send a notification via stdio transport (single session)
async function sendViaStdio(notification) {
  const results = getTransportResults();
  const stdio = results.transports?.stdio;
  if (!stdio || !stdio.success || !stdio.connection) return false;
  const transport = stdio.connection;
  if (typeof transport.send !== 'function') return false;
  try {
    await transport.send(notification);
    return true;
  } catch {
    return false;
  }
}

// Send a notification via AMQP transport (broadcast routing)
async function sendViaAmqp(notification) {
  // Prefer globally stored transport from process if present
  const amqpTransport = (getTransportResults().transports?.amqp?.transport) || process.amqpTransport;
  if (!amqpTransport || typeof amqpTransport.send !== 'function') return false;
  try {
    await amqpTransport.send(notification);
    return true;
  } catch {
    return false;
  }
}

// Broadcast to all known transports; HTTP is per-session unless forceBroadcastHttp
async function broadcast(notification, options = {}) {
  const { forceBroadcastHttp = false } = options;
  const results = getTransportResults();
  const tasks = [];

  // HTTP: per-session sends unless forced broadcast (loop all sessions)
  const http = results.transports?.http;
  if (http && http.success && http.transports) {
    const sessionIds = Object.keys(http.transports);
    for (const sid of sessionIds) {
      tasks.push(sendToHttpSession(sid, notification));
    }
  }

  // stdio (single session)
  tasks.push(sendViaStdio(notification));

  // AMQP (broadcast)
  tasks.push(sendViaAmqp(notification));

  // Await all, success if any true
  const resultsArr = await Promise.all(tasks);
  return resultsArr.some(Boolean);
}

// Targeted send by session (only HTTP currently supports exact targeting)
async function sendToSession(sessionId, notification) {
  // Try HTTP first (session aware)
  if (await sendToHttpSession(sessionId, notification)) return true;
  // Fallbacks: stdio (single session) and AMQP broadcast if needed
  // For AMQP we can't target a session reliably here; do nothing
  return false;
}

module.exports = {
  setTransportResults,
  getTransportResults,
  buildNotification,
  broadcast,
  sendToSession,
  // expose channel-specific helpers for selective routing
  sendViaStdio,
  sendViaAmqp
};
