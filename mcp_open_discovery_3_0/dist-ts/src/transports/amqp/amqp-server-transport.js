"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NativeAmqpRuntimeAdapter = exports.AmqpServerTransport = void 0;
const amqp_utils_1 = require("./amqp-utils");
class AmqpServerTransport {
    options;
    connection = null;
    channel = null;
    routingInfoStore = new Map();
    cleanupTimer = null;
    reconnectTimer = null;
    maxMessageSize;
    closing = false;
    closeNotified = false;
    connectionState = {
        connected: false,
        reconnectAttempts: 0,
    };
    protocolVersion;
    sessionId;
    onclose;
    onerror;
    onmessage;
    ontransportclosed;
    _connectFn;
    constructor(options) {
        this.options = options;
        const errors = (0, amqp_utils_1.validateAmqpConfig)(options);
        if (errors.length) {
            throw new Error(`Invalid AMQP server transport configuration: ${errors.join(', ')}`);
        }
        this.maxMessageSize = options.maxMessageSize ?? 1024 * 1024;
        this.sessionId = (0, amqp_utils_1.generateSessionId)();
    }
    setProtocolVersion(version) {
        this.protocolVersion = version;
    }
    getStatus() {
        return {
            enabled: true,
            connected: this.connectionState.connected,
            exchange: this.options.exchangeName,
            queuePrefix: this.options.queuePrefix,
            error: this.connectionState.lastError?.message,
        };
    }
    async start() {
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
        }
        catch (error) {
            const resolved = error instanceof Error ? error : new Error(String(error));
            this.connectionState.lastError = resolved;
            this.onerror?.(resolved);
            throw resolved;
        }
    }
    async send(message, options) {
        if (!this.connectionState.connected || !this.channel) {
            throw new Error('Transport not connected');
        }
        const cleanMessage = (0, amqp_utils_1.sanitizeJsonRpcMessage)(message);
        const messageType = (0, amqp_utils_1.detectMessageType)(cleanMessage);
        if (messageType === 'response') {
            this.handleResponseMessage(cleanMessage, options);
            return;
        }
        const exchangeName = `${this.options.exchangeName}.mcp.routing`;
        const routingKey = (0, amqp_utils_1.getRoutingKey)(cleanMessage, messageType, this.options.routingKeyStrategy);
        const content = Buffer.from(JSON.stringify(cleanMessage));
        this.channel.publish(exchangeName, routingKey, content, {
            persistent: messageType === 'request',
            timestamp: Date.now(),
            contentType: 'application/json',
        });
    }
    async close() {
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
        }
        finally {
            this.notifyClosed();
        }
    }
    async connect() {
        const connectFn = this._connectFn ?? (await Promise.resolve().then(() => __importStar(require('amqplib')))).connect;
        this.connection = await connectFn(this.options.amqpUrl);
        this.connection.on('error', (error) => this.handleConnectionError(error));
        this.connection.on('close', () => this.handleConnectionClosed());
        this.channel = await this.connection.createChannel();
        this.channel.on('error', (error) => this.handleConnectionError(error instanceof Error ? error : new Error(String(error))));
        if (this.options.prefetchCount) {
            await this.channel.prefetch(this.options.prefetchCount);
        }
        await this.setupInfrastructure();
    }
    async setupInfrastructure() {
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
    async handleIncomingMessage(message) {
        if (!this.channel) {
            return;
        }
        try {
            if (message.content.byteLength > this.maxMessageSize) {
                this.channel.nack(message, false, false);
                return;
            }
            const parsed = (0, amqp_utils_1.parseMessage)(message.content);
            if (!parsed.success) {
                this.channel.nack(message, false, false);
                return;
            }
            const validation = (0, amqp_utils_1.validateJsonRpc)(parsed.message);
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
        }
        catch (error) {
            const resolved = error instanceof Error ? error : new Error(String(error));
            this.connectionState.lastError = resolved;
            this.onerror?.(resolved);
            this.channel.nack(message, false, false);
        }
    }
    handleResponseMessage(message, options) {
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
        const content = Buffer.from(JSON.stringify((0, amqp_utils_1.sanitizeJsonRpcMessage)(message)));
        this.channel.sendToQueue(routingInfo.replyTo, content, {
            correlationId: routingInfo.correlationId,
            contentType: 'application/json',
            persistent: false,
        });
    }
    handleConnectionError(error) {
        this.connectionState.connected = false;
        this.connectionState.lastError = error;
        this.onerror?.(error);
        if (!this.closing) {
            this.scheduleReconnect();
        }
    }
    handleConnectionClosed() {
        this.connectionState.connected = false;
        if (!this.closing) {
            this.scheduleReconnect();
            return;
        }
    }
    scheduleReconnect() {
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
    startRoutingCleanup() {
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
    notifyClosed() {
        if (this.closeNotified) {
            return;
        }
        this.closeNotified = true;
        this.ontransportclosed?.(this.connectionState.lastError);
        this.onclose?.();
    }
}
exports.AmqpServerTransport = AmqpServerTransport;
class NativeAmqpRuntimeAdapter {
    transport = null;
    server = null;
    config = null;
    recoveryTimer = null;
    recoveryAttempt = 0;
    recoveryDelay = 0;
    stopping = false;
    starting = false;
    recoveryStatus = {
        enabled: false,
        state: 'disabled',
        retryCount: 0,
    };
    _transportFactory;
    getRecoveryConfig() {
        return {
            enabled: this.config?.autoRecoveryEnabled !== false,
            retryInterval: this.config?.recoveryRetryInterval ?? 30000,
            maxRetries: this.config?.recoveryMaxRetries ?? -1,
            backoffMultiplier: this.config?.recoveryBackoffMultiplier ?? 1.5,
            maxRetryInterval: this.config?.recoveryMaxRetryInterval ?? 300000,
        };
    }
    clearRecoveryTimer() {
        if (!this.recoveryTimer) {
            return;
        }
        clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
    }
    createTransport(config) {
        const transportFactory = this._transportFactory ?? ((options) => new AmqpServerTransport(options));
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
    updateRecoveryStatus(overrides) {
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
    resetRecoveryState() {
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
    async attachTransport(server, config) {
        this.starting = true;
        const transport = this.createTransport(config);
        try {
            await server.connect(transport);
            this.transport = transport;
            this.resetRecoveryState();
        }
        catch (error) {
            this.transport = null;
            await transport.close().catch(() => undefined);
            throw error;
        }
        finally {
            this.starting = false;
        }
    }
    async attemptRecovery() {
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
        }
        catch (error) {
            const resolved = error instanceof Error ? error : new Error(String(error));
            this.updateRecoveryStatus({ lastError: resolved.message });
            if (recoveryConfig.maxRetries >= 0 && this.recoveryAttempt >= recoveryConfig.maxRetries) {
                this.updateRecoveryStatus({
                    state: 'stopped',
                    nextRetryAt: undefined,
                });
                return;
            }
            this.recoveryDelay = Math.min(Math.max(this.recoveryDelay, recoveryConfig.retryInterval) * recoveryConfig.backoffMultiplier, recoveryConfig.maxRetryInterval);
            await this.scheduleRecovery(resolved);
        }
    }
    async scheduleRecovery(error) {
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
    async start(server, config) {
        this.server = server;
        this.config = config;
        this.stopping = false;
        this.recoveryDelay = this.getRecoveryConfig().retryInterval;
        this.updateRecoveryStatus({});
        try {
            await this.attachTransport(server, config);
            return { mode: 'amqp', started: true, details: 'AMQP transport started via typed AMQP server transport' };
        }
        catch (error) {
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
    async stop() {
        this.stopping = true;
        this.clearRecoveryTimer();
        this.updateRecoveryStatus({
            state: this.getRecoveryConfig().enabled ? 'stopped' : 'disabled',
            nextRetryAt: undefined,
        });
        await this.transport?.close();
        this.transport = null;
    }
    getStatus() {
        const transportStatus = this.transport?.getStatus() ?? { enabled: Boolean(this.config?.enabled), connected: false };
        return {
            ...transportStatus,
            recovery: this.recoveryStatus ?? undefined,
        };
    }
    async send(message, options) {
        if (!this.transport) {
            throw new Error('AMQP transport not initialized');
        }
        await this.transport.send(message, options);
    }
}
exports.NativeAmqpRuntimeAdapter = NativeAmqpRuntimeAdapter;
//# sourceMappingURL=amqp-server-transport.js.map