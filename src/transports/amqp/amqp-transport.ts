import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AmqpStatus, AmqpTransportConfig, TransportStartResult } from '../../types';
import type { JsonRpcNotification } from '../../runtime/notifications';
import { NativeAmqpRuntimeAdapter } from './amqp-server-transport';

export interface AmqpTransportRuntime {
  start(server: McpServer, config: AmqpTransportConfig): Promise<TransportStartResult>;
  stop?(): Promise<void>;
  getStatus?(): AmqpStatus;
  send?(message: JsonRpcNotification, options?: { relatedRequestId?: string | number | null }): Promise<void>;
}

export async function startAmqpTransport(
  server: McpServer,
  config: AmqpTransportConfig,
  runtime: AmqpTransportRuntime = new NativeAmqpRuntimeAdapter(),
): Promise<TransportStartResult> {
  if (!config.enabled) {
    return { mode: 'amqp', started: false, details: 'AMQP transport disabled' };
  }
  return runtime.start(server, config);
}

export function getAmqpTransportStatus(runtime: AmqpTransportRuntime = new NativeAmqpRuntimeAdapter()): AmqpStatus {
  return runtime.getStatus?.() ?? { enabled: false, connected: false };
}