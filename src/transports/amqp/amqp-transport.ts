import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AmqpStatus, AmqpTransportConfig, TransportStartResult } from '../../types';

interface LegacyAmqpModule {
  initializeAmqpIntegration?: (logger?: (level: string, message: string, data?: unknown) => void) => Promise<void> | void;
  startAmqpServer?: (
    createServerFn: () => Promise<McpServer>,
    logger?: (level: string, message: string, data?: unknown) => void,
    options?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  getAmqpStatus?: () => Record<string, unknown>;
}

export interface AmqpTransportRuntime {
  start(server: McpServer, config: AmqpTransportConfig): Promise<TransportStartResult>;
  stop?(): Promise<void>;
  getStatus?(): AmqpStatus;
}

function log(level: string, message: string, data?: unknown): void {
  const rendered = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [AMQP] ${message}${rendered}`;
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

function tryLoadLegacyAmqpModule(): LegacyAmqpModule | null {
  try {
    return require('../../../tools/transports/amqp-transport-integration.js') as LegacyAmqpModule;
  } catch {
    return null;
  }
}

export class LegacyAmqpRuntimeAdapter implements AmqpTransportRuntime {
  private readonly legacyModule: LegacyAmqpModule | null;

  constructor(legacyModule: LegacyAmqpModule | null = tryLoadLegacyAmqpModule()) {
    this.legacyModule = legacyModule;
  }

  async start(server: McpServer, config: AmqpTransportConfig): Promise<TransportStartResult> {
    if (!this.legacyModule?.startAmqpServer) {
      return {
        mode: 'amqp',
        started: false,
        error: 'AMQP runtime adapter is not configured',
      };
    }

    if (this.legacyModule.initializeAmqpIntegration) {
      await this.legacyModule.initializeAmqpIntegration(log);
    }

    const result = await this.legacyModule.startAmqpServer(() => Promise.resolve(server), log, {
      amqpUrl: config.url,
      exchange: config.exchange,
      queuePrefix: config.queuePrefix,
      prefetchCount: config.prefetch,
    });

    const started = Boolean((result as { success?: boolean }).success);
    return {
      mode: 'amqp',
      started,
      details: started ? 'AMQP transport started via legacy adapter' : undefined,
      error: started ? undefined : String((result as { error?: unknown }).error ?? 'AMQP startup failed'),
    };
  }

  getStatus(): AmqpStatus {
    const status = this.legacyModule?.getAmqpStatus?.() ?? {};
    return {
      enabled: Boolean(status.transport ?? status.connected),
      connected: Boolean(status.connected),
      exchange: typeof status.exchangeName === 'string' ? status.exchangeName : undefined,
      queuePrefix: typeof status.queuePrefix === 'string' ? status.queuePrefix : undefined,
      error: typeof status.error === 'string' ? status.error : undefined,
    };
  }
}

export async function startAmqpTransport(
  server: McpServer,
  config: AmqpTransportConfig,
  runtime: AmqpTransportRuntime = new LegacyAmqpRuntimeAdapter(),
): Promise<TransportStartResult> {
  if (!config.enabled) {
    return { mode: 'amqp', started: false, details: 'AMQP transport disabled' };
  }
  return runtime.start(server, config);
}

export function getAmqpTransportStatus(runtime: AmqpTransportRuntime = new LegacyAmqpRuntimeAdapter()): AmqpStatus {
  return runtime.getStatus?.() ?? { enabled: false, connected: false };
}