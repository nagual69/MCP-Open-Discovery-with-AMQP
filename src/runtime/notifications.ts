import { createLogger } from '../utils';
import { getManagedTransports } from './transport-state';

const logger = createLogger('NOTIFICATIONS');

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export function buildNotification(method: string, params?: unknown): JsonRpcNotification {
  return {
    jsonrpc: '2.0',
    method,
    params,
  };
}

export async function sendToSession(sessionId: string, notification: JsonRpcNotification): Promise<boolean> {
  const transports = getManagedTransports();
  const sessionTransport = transports?.http?.sessions?.[sessionId];
  if (!sessionTransport || typeof sessionTransport.send !== 'function') {
    return false;
  }

  try {
    await sessionTransport.send(notification as never);
    return true;
  } catch (error) {
    logger.warn('Failed to send notification to HTTP session', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function sendViaStdio(notification: JsonRpcNotification): Promise<boolean> {
  const transports = getManagedTransports();
  const stdioTransport = transports?.stdioTransport;
  if (!stdioTransport || typeof stdioTransport.send !== 'function') {
    return false;
  }

  try {
    await stdioTransport.send(notification as never);
    return true;
  } catch (error) {
    logger.warn('Failed to send notification over stdio', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function sendViaAmqp(notification: JsonRpcNotification): Promise<boolean> {
  const transports = getManagedTransports();
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
  } catch (error) {
    logger.warn('Failed to send notification over AMQP', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function broadcast(notification: JsonRpcNotification): Promise<boolean> {
  const transports = getManagedTransports();
  const results: boolean[] = [];

  if (transports?.http?.sessions) {
    for (const sessionId of Object.keys(transports.http.sessions)) {
      results.push(await sendToSession(sessionId, notification));
    }
  }

  results.push(await sendViaStdio(notification));
  results.push(await sendViaAmqp(notification));

  return results.some(Boolean);
}

export async function publishToolsListChanged(): Promise<boolean> {
  return broadcast(buildNotification('notifications/tools/list_changed', {}));
}

export async function publishResourcesListChanged(): Promise<boolean> {
  return broadcast(buildNotification('notifications/resources/list_changed', {}));
}

export async function publishPromptsListChanged(): Promise<boolean> {
  return broadcast(buildNotification('notifications/prompts/list_changed', {}));
}