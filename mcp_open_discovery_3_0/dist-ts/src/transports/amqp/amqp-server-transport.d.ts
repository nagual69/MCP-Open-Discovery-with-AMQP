import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Channel } from 'amqplib';
import type { AmqpStatus, AmqpTransportConfig } from '../../types';
import type { JsonRpcNotification } from '../../runtime/notifications';
import { type JsonRpcId, type JsonRpcMessage, type RoutingKeyStrategy } from './amqp-utils';
type AmqpConnection = {
    createChannel(): Promise<Channel>;
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: 'close', listener: () => void): void;
    close(): Promise<void>;
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
export declare class AmqpServerTransport {
    private readonly options;
    private connection;
    private channel;
    private readonly routingInfoStore;
    private cleanupTimer;
    private reconnectTimer;
    private readonly maxMessageSize;
    private closing;
    private closeNotified;
    private readonly connectionState;
    private protocolVersion?;
    readonly sessionId: string;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JsonRpcMessage) => void;
    ontransportclosed?: (error?: Error) => void;
    _connectFn?: (url: string) => Promise<AmqpConnection>;
    constructor(options: AmqpServerTransportOptions);
    setProtocolVersion(version: string): void;
    getStatus(): AmqpStatus;
    start(): Promise<void>;
    send(message: JsonRpcMessage, options?: {
        relatedRequestId?: JsonRpcId;
    }): Promise<void>;
    close(): Promise<void>;
    private connect;
    private setupInfrastructure;
    private handleIncomingMessage;
    private handleResponseMessage;
    private handleConnectionError;
    private handleConnectionClosed;
    private scheduleReconnect;
    private startRoutingCleanup;
    private notifyClosed;
}
export declare class NativeAmqpRuntimeAdapter {
    private transport;
    private server;
    private config;
    private recoveryTimer;
    private recoveryAttempt;
    private recoveryDelay;
    private stopping;
    private starting;
    private recoveryStatus;
    _transportFactory?: (options: AmqpServerTransportOptions) => AmqpServerTransport;
    private getRecoveryConfig;
    private clearRecoveryTimer;
    private createTransport;
    private updateRecoveryStatus;
    private resetRecoveryState;
    private attachTransport;
    private attemptRecovery;
    private scheduleRecovery;
    start(server: McpServer, config: AmqpTransportConfig): Promise<{
        mode: 'amqp';
        started: boolean;
        details?: string;
        error?: string;
    }>;
    stop(): Promise<void>;
    getStatus(): AmqpStatus;
    send(message: JsonRpcNotification, options?: {
        relatedRequestId?: string | number | null;
    }): Promise<void>;
}
export {};
//# sourceMappingURL=amqp-server-transport.d.ts.map