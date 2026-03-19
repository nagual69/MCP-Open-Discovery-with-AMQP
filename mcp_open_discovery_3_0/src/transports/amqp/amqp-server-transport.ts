import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Channel, ConsumeMessage } from 'amqplib';

import type { AmqpStatus, AmqpTransportConfig } from '../../types';
import type { JsonRpcNotification } from '../../runtime/notifications';
import {
  detectMessageType,
  generateSessionId,
  getRoutingKey,
  parseMessage,
  sanitizeJsonRpcMessage,
  type JsonRpcId,
  type JsonRpcMessage,
  type RoutingKeyStrategy,
  validateAmqpConfig,
  validateJsonRpc,
} from './amqp-utils';

type AmqpConnection = {
  createChannel(): Promise<Channel>;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: () => void): void;
  close(): Promise<void>;
};

type RoutingInfo = {
  correlationId: string;
  replyTo: string;
  timestamp: number;
};

export interface AmqpServerTransportOptions {
  amqpUrl: string;
  exchangeName: string;
  queuePrefix: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  prefetchCount?: number;
  messageTTL?: number;
  queueTTL?: number;
  maxMessageSize?: number;
  routingKeyStrategy?: RoutingKeyStrategy;
}

export class AmqpServerTransport {
  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;
  private readonly routingInfoStore = new Map<JsonRpcId, RoutingInfo>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxMessageSize: number;
  private closing = false;
  private closeNotified = false;
  private readonly connectionState: { connected: boolean; reconnectAttempts: number; lastError?: Error } = {
    connected: false,
    reconnectAttempts: 0,
  };
  private protocolVersion?: string;

  readonly sessionId: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JsonRpcMessage) => void;
  ontransportclosed?: (error?: Error) => void;
  _connectFn?: (url: string) => Promise<AmqpConnection>;

  constructor(private readonly options: AmqpServerTransportOptions) {
    const errors = validateAmqpConfig(options);
    if (errors.length) {
      throw new Error(`Invalid AMQP server transport configuration: ${errors.join(', ')}`);
    }
    this.maxMessageSize = options.maxMessageSize ?? 1024 * 1024;
    this.sessionId = generateSessionId();
  }

  setProtocolVersion(version: string): void {
    this.protocolVersion = version;
  }

  getStatus(): AmqpStatus {
    return {
      enabled: true,
      connected: this.connectionState.connected,
      exchange: this.options.exchangeName,
      queuePrefix: this.options.queuePrefix,
      error: this.connectionState.lastError?.message,
    };
  }

  async start(): Promise<void> {
    if (this.connectionState.connected) {
      return;
    }

    this.closing = false;
    this.closeNotified = false;
    try {
      await this.connect();
      this.connectionState.connected = true;
      this.connectionState.reconnectAttempts = 0;
      this.connectionState.lastError = undefined;
      this.startRoutingCleanup();
    } catch (error) {
      const resolved = error instanceof Error ? error : new Error(String(error));
      this.connectionState.lastError = resolved;
      this.onerror?.(resolved);
      throw resolved;
    }
  }

  async send(message: JsonRpcMessage, options?: { relatedRequestId?: JsonRpcId }): Promise<void> {
    if (!this.connectionState.connected || !this.channel) {
      throw new Error('Transport not connected');
    }

    const cleanMessage = sanitizeJsonRpcMessage(message);
    const messageType = detectMessageType(cleanMessage);

    if (messageType === 'response') {
      this.handleResponseMessage(cleanMessage, options);
      return;
    }

    const exchangeName = `${this.options.exchangeName}.mcp.routing`;
    const routingKey = getRoutingKey(cleanMessage, messageType, this.options.routingKeyStrategy);
    const content = Buffer.from(JSON.stringify(cleanMessage));

    this.channel.publish(exchangeName, routingKey, content, {
      persistent: messageType === 'request',
      timestamp: Date.now(),
      contentType: 'application/json',
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    this.connectionState.connected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } finally {
      this.notifyClosed();
    }
  }

  private async connect(): Promise<void> {
    const connectFn = this._connectFn ?? (await import('amqplib')).connect;
    this.connection = await connectFn(this.options.amqpUrl) as AmqpConnection;
    this.connection.on('error', (error) => this.handleConnectionError(error));
    this.connection.on('close', () => this.handleConnectionClosed());

    this.channel = await this.connection.createChannel();
    this.channel.on('error', (error) => this.handleConnectionError(error instanceof Error ? error : new Error(String(error))));
    if (this.options.prefetchCount) {
      await this.channel.prefetch(this.options.prefetchCount);
    }

    await this.setupInfrastructure();
  }

  private async setupInfrastructure(): Promise<void> {
    if (!this.channel) {
      throw new Error('AMQP channel not established');
    }

    const exchangeName = `${this.options.exchangeName}.mcp.routing`;
    await this.channel.assertExchange(exchangeName, 'topic', { durable: true });

    const queueName = `${this.options.queuePrefix}.requests.${this.sessionId}`;
    await this.channel.assertQueue(queueName, {
      durable: false,
      exclusive: true,
      autoDelete: true,
      arguments: {
        'x-message-ttl': this.options.messageTTL ?? 3600000,
        'x-expires': this.options.queueTTL ?? 7200000,
      },
    });

    await this.channel.bindQueue(queueName, exchangeName, 'mcp.request.#');
    await this.channel.bindQueue(queueName, exchangeName, 'mcp.notification.#');
    await this.channel.consume(queueName, (message) => {
      if (message) {
        void this.handleIncomingMessage(message);
      }
    }, { noAck: false });
  }

  private async handleIncomingMessage(message: ConsumeMessage): Promise<void> {
    if (!this.channel) {
      return;
    }

    try {
      if (message.content.byteLength > this.maxMessageSize) {
        this.channel.nack(message, false, false);
        return;
      }

      const parsed = parseMessage(message.content);
      if (!parsed.success) {
        this.channel.nack(message, false, false);
        return;
      }

      const validation = validateJsonRpc(parsed.message);
      if (!validation.valid) {
        this.channel.nack(message, false, false);
        return;
      }

      if (parsed.message.id !== undefined && parsed.message.id !== null) {
        const correlationId = typeof message.properties.correlationId === 'string' ? message.properties.correlationId : undefined;
        const replyTo = typeof message.properties.replyTo === 'string' ? message.properties.replyTo : undefined;
        if (correlationId && replyTo) {
          this.routingInfoStore.set(parsed.message.id, {
            correlationId,
            replyTo,
            timestamp: Date.now(),
          });
        }
      }

      this.onmessage?.(parsed.message);
      this.channel.ack(message);
    } catch (error) {
      const resolved = error instanceof Error ? error : new Error(String(error));
      this.connectionState.lastError = resolved;
      this.onerror?.(resolved);
      this.channel.nack(message, false, false);
    }
  }

  private handleResponseMessage(message: JsonRpcMessage, options?: { relatedRequestId?: JsonRpcId }): void {
    if (!this.channel) {
      throw new Error('AMQP channel not established');
    }

    const lookupId = options?.relatedRequestId ?? message.id;
    if (lookupId === undefined || lookupId === null) {
      throw new Error('No routing info available for response without request correlation');
    }

    const routingInfo = this.routingInfoStore.get(lookupId);
    if (!routingInfo) {
      throw new Error(`No routing info for related request ${String(lookupId)}`);
    }
    this.routingInfoStore.delete(lookupId);

    const content = Buffer.from(JSON.stringify(sanitizeJsonRpcMessage(message)));
    this.channel.sendToQueue(routingInfo.replyTo, content, {
      correlationId: routingInfo.correlationId,
      contentType: 'application/json',
      persistent: false,
    });
  }

  private handleConnectionError(error: Error): void {
    this.connectionState.connected = false;
    this.connectionState.lastError = error;
    this.onerror?.(error);
    if (!this.closing) {
      this.scheduleReconnect();
    }
  }

  private handleConnectionClosed(): void {
    this.connectionState.connected = false;
    if (!this.closing) {
      this.scheduleReconnect();
      return;
    }
  }

  private scheduleReconnect(): void {
    const maxReconnectAttempts = this.options.maxReconnectAttempts ?? 10;
    const reconnectDelay = this.options.reconnectDelay ?? 5000;
    if (this.closing) {
      return;
    }
    if (this.reconnectTimer) {
      return;
    }
    if (this.connectionState.reconnectAttempts >= maxReconnectAttempts) {
      this.connectionState.lastError ??= new Error('Maximum reconnection attempts exceeded');
      this.notifyClosed();
      return;
    }

    this.connectionState.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closing) {
        return;
      }
      void this.connect().then(() => {
        this.connectionState.connected = true;
        this.connectionState.reconnectAttempts = 0;
        this.connectionState.lastError = undefined;
      }).catch((error) => {
        this.connectionState.lastError = error instanceof Error ? error : new Error(String(error));
        this.scheduleReconnect();
      });
    }, reconnectDelay);
    this.reconnectTimer.unref?.();
  }

  private startRoutingCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    const ttl = this.options.messageTTL ?? 3600000;
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - ttl;
      for (const [requestId, routingInfo] of this.routingInfoStore.entries()) {
        if (routingInfo.timestamp < cutoff) {
          this.routingInfoStore.delete(requestId);
        }
      }
    }, 60000);
    this.cleanupTimer.unref?.();
  }

  private notifyClosed(): void {
    if (this.closeNotified) {
      return;
    }
    this.closeNotified = true;
    this.ontransportclosed?.(this.connectionState.lastError);
    this.onclose?.();
  }
}

export class NativeAmqpRuntimeAdapter {
  private transport: AmqpServerTransport | null = null;
  private server: McpServer | null = null;
  private config: AmqpTransportConfig | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryAttempt = 0;
  private recoveryDelay = 0;
  private stopping = false;
  private starting = false;
  private recoveryStatus: AmqpStatus['recovery'] = {
    enabled: false,
    state: 'disabled',
    retryCount: 0,
  };
  _transportFactory?: (options: AmqpServerTransportOptions) => AmqpServerTransport;

  private getRecoveryConfig(): {
    enabled: boolean;
    retryInterval: number;
    maxRetries: number;
    backoffMultiplier: number;
    maxRetryInterval: number;
  } {
    return {
      enabled: this.config?.autoRecoveryEnabled !== false,
      retryInterval: this.config?.recoveryRetryInterval ?? 30000,
      maxRetries: this.config?.recoveryMaxRetries ?? -1,
      backoffMultiplier: this.config?.recoveryBackoffMultiplier ?? 1.5,
      maxRetryInterval: this.config?.recoveryMaxRetryInterval ?? 300000,
    };
  }

  private clearRecoveryTimer(): void {
    if (!this.recoveryTimer) {
      return;
    }

    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
  }

  private createTransport(config: AmqpTransportConfig): AmqpServerTransport {
    const transportFactory = this._transportFactory ?? ((options: AmqpServerTransportOptions) => new AmqpServerTransport(options));
    const transport = transportFactory({
      amqpUrl: config.url,
      exchangeName: config.exchange,
      queuePrefix: config.queuePrefix,
      prefetchCount: config.prefetch,
      reconnectDelay: config.reconnectDelay,
      maxReconnectAttempts: config.maxReconnectAttempts,
      messageTTL: config.messageTTL,
      queueTTL: config.queueTTL,
    });

    transport.ontransportclosed = (error) => {
      if (this.transport === transport) {
        this.transport = null;
      }
      if (this.stopping) {
        return;
      }
      void this.scheduleRecovery(error);
    };

    return transport;
  }

  private updateRecoveryStatus(overrides: Partial<NonNullable<AmqpStatus['recovery']>>): void {
    const recoveryConfig = this.getRecoveryConfig();
    this.recoveryStatus = {
      ...this.recoveryStatus,
      enabled: recoveryConfig.enabled,
      state: recoveryConfig.enabled ? 'idle' : 'disabled',
      retryCount: this.recoveryAttempt,
      maxRetries: recoveryConfig.maxRetries,
      retryIntervalMs: recoveryConfig.retryInterval,
      maxRetryIntervalMs: recoveryConfig.maxRetryInterval,
      backoffMultiplier: recoveryConfig.backoffMultiplier,
      ...overrides,
    };
  }

  private resetRecoveryState(): void {
    this.recoveryAttempt = 0;
    this.recoveryDelay = this.getRecoveryConfig().retryInterval;
    this.clearRecoveryTimer();
    this.updateRecoveryStatus({
      state: this.getRecoveryConfig().enabled ? 'idle' : 'disabled',
      retryCount: 0,
      nextRetryAt: undefined,
      lastAttemptAt: undefined,
      lastError: undefined,
    });
  }

  private async attachTransport(server: McpServer, config: AmqpTransportConfig): Promise<void> {
    this.starting = true;
    const transport = this.createTransport(config);

    try {
      await server.connect(transport as never);
      this.transport = transport;
      this.resetRecoveryState();
    } catch (error) {
      this.transport = null;
      await transport.close().catch(() => undefined);
      throw error;
    } finally {
      this.starting = false;
    }
  }

  private async attemptRecovery(): Promise<void> {
    if (this.stopping || this.starting || !this.server || !this.config) {
      return;
    }

    const recoveryConfig = this.getRecoveryConfig();
    if (recoveryConfig.maxRetries >= 0 && this.recoveryAttempt >= recoveryConfig.maxRetries) {
      this.updateRecoveryStatus({
        state: 'stopped',
        nextRetryAt: undefined,
      });
      return;
    }

    this.recoveryAttempt += 1;
    this.updateRecoveryStatus({
      state: 'attempting',
      retryCount: this.recoveryAttempt,
      lastAttemptAt: new Date().toISOString(),
      nextRetryAt: undefined,
    });

    try {
      await this.attachTransport(this.server, this.config);
    } catch (error) {
      const resolved = error instanceof Error ? error : new Error(String(error));
      this.updateRecoveryStatus({ lastError: resolved.message });

      if (recoveryConfig.maxRetries >= 0 && this.recoveryAttempt >= recoveryConfig.maxRetries) {
        this.updateRecoveryStatus({
          state: 'stopped',
          nextRetryAt: undefined,
        });
        return;
      }

      this.recoveryDelay = Math.min(
        Math.max(this.recoveryDelay, recoveryConfig.retryInterval) * recoveryConfig.backoffMultiplier,
        recoveryConfig.maxRetryInterval,
      );
      await this.scheduleRecovery(resolved);
    }
  }

  private async scheduleRecovery(error?: Error): Promise<void> {
    const recoveryConfig = this.getRecoveryConfig();
    if (!recoveryConfig.enabled || this.stopping || this.recoveryTimer) {
      if (!recoveryConfig.enabled) {
        this.updateRecoveryStatus({ state: 'disabled' });
      }
      return;
    }

    const nextRetryAt = new Date(Date.now() + this.recoveryDelay).toISOString();
    this.updateRecoveryStatus({
      state: 'waiting',
      nextRetryAt,
      lastError: error?.message ?? this.recoveryStatus?.lastError,
    });

    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      void this.attemptRecovery();
    }, this.recoveryDelay);
    this.recoveryTimer.unref?.();
  }

  async start(server: McpServer, config: AmqpTransportConfig): Promise<{ mode: 'amqp'; started: boolean; details?: string; error?: string }> {
    this.server = server;
    this.config = config;
    this.stopping = false;
    this.recoveryDelay = this.getRecoveryConfig().retryInterval;
    this.updateRecoveryStatus({});

    try {
      await this.attachTransport(server, config);
      return { mode: 'amqp', started: true, details: 'AMQP transport started via typed AMQP server transport' };
    } catch (error) {
      const resolved = error instanceof Error ? error : new Error(String(error));
      await this.scheduleRecovery(resolved);
      return {
        mode: 'amqp',
        started: false,
        details: this.getRecoveryConfig().enabled ? 'AMQP transport start failed; background recovery scheduled' : undefined,
        error: resolved.message,
      };
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.clearRecoveryTimer();
    this.updateRecoveryStatus({
      state: this.getRecoveryConfig().enabled ? 'stopped' : 'disabled',
      nextRetryAt: undefined,
    });
    await this.transport?.close();
    this.transport = null;
  }

  getStatus(): AmqpStatus {
    const transportStatus = this.transport?.getStatus() ?? { enabled: Boolean(this.config?.enabled), connected: false };
    return {
      ...transportStatus,
      recovery: this.recoveryStatus ?? undefined,
    };
  }

  async send(message: JsonRpcNotification, options?: { relatedRequestId?: string | number | null }): Promise<void> {
    if (!this.transport) {
      throw new Error('AMQP transport not initialized');
    }
    await this.transport.send(message as JsonRpcMessage, options);
  }
}
