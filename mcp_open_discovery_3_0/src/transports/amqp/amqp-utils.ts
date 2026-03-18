import { randomUUID } from 'node:crypto';

export type JsonRpcId = string | number;

export type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId | null;
  method?: string;
  result?: unknown;
  error?: unknown;
  [key: string]: unknown;
};

export type RoutingKeyStrategy = (message: JsonRpcMessage, messageType: 'request' | 'notification') => string;

export function detectMessageType(message: JsonRpcMessage): 'request' | 'response' | 'notification' {
  if (message.id !== undefined && message.id !== null && (message.result !== undefined || message.error !== undefined)) {
    return 'response';
  }
  if (message.id !== undefined && message.id !== null && typeof message.method === 'string') {
    return 'request';
  }
  return 'notification';
}

export function validateJsonRpc(message: unknown): { valid: boolean; reason?: string } {
  if (!message || typeof message !== 'object') {
    return { valid: false, reason: 'Message must be an object' };
  }

  const candidate = message as JsonRpcMessage;
  if (candidate.jsonrpc !== '2.0') {
    return { valid: false, reason: 'Missing or invalid jsonrpc field (must be "2.0")' };
  }

  const hasMethod = typeof candidate.method === 'string';
  const hasResult = candidate.result !== undefined;
  const hasError = candidate.error !== undefined;

  if (!hasMethod && !hasResult && !hasError) {
    return { valid: false, reason: 'Message must have method, result, or error field' };
  }

  return { valid: true };
}

export function parseMessage(content: Buffer): { success: true; message: JsonRpcMessage } | { success: false; error: Error } {
  try {
    return { success: true, message: JSON.parse(content.toString('utf8')) as JsonRpcMessage };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export function sanitizeJsonRpcMessage(message: JsonRpcMessage): JsonRpcMessage {
  const clean: JsonRpcMessage = { ...message };
  if (!clean.jsonrpc) {
    clean.jsonrpc = '2.0';
  }
  for (const key of Object.keys(clean)) {
    if (key.startsWith('_rabbitMQ')) {
      delete clean[key];
    }
  }
  return clean;
}

export function normalizeMethodForRouting(method: string): string {
  return method.replace(/\//g, '.');
}

export function getRoutingKey(
  message: JsonRpcMessage,
  messageType: 'request' | 'notification',
  strategy?: RoutingKeyStrategy,
): string {
  if (strategy) {
    return strategy(message, messageType);
  }
  const method = typeof message.method === 'string' ? normalizeMethodForRouting(message.method) : 'unknown';
  return `mcp.${messageType}.${method}`;
}

export function generateSessionId(): string {
  return randomUUID();
}

export function validateAmqpConfig(config: {
  amqpUrl: string;
  queuePrefix: string;
  exchangeName: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  prefetchCount?: number;
}): string[] {
  const errors: string[] = [];

  try {
    const parsed = new URL(config.amqpUrl);
    if (parsed.protocol !== 'amqp:' && parsed.protocol !== 'amqps:') {
      errors.push(`Invalid AMQP URL scheme: ${parsed.protocol}. Must be amqp: or amqps:`);
    }
  } catch {
    errors.push(`Invalid AMQP URL: ${config.amqpUrl}`);
  }

  if (!config.queuePrefix.trim()) {
    errors.push('queuePrefix is required');
  }
  if (!config.exchangeName.trim()) {
    errors.push('exchangeName is required');
  }
  if (config.reconnectDelay !== undefined && config.reconnectDelay < 1000) {
    errors.push('reconnectDelay must be at least 1000ms');
  }
  if (config.maxReconnectAttempts !== undefined && config.maxReconnectAttempts < 1) {
    errors.push('maxReconnectAttempts must be at least 1');
  }
  if (config.prefetchCount !== undefined && config.prefetchCount < 1) {
    errors.push('prefetchCount must be at least 1');
  }

  return errors;
}