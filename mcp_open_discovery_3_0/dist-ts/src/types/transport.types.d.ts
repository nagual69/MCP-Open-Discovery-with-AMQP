export type TransportMode = 'stdio' | 'http' | 'amqp';
export interface BaseTransportConfig {
    enabled: boolean;
    mode: TransportMode;
}
export interface StdioTransportConfig extends BaseTransportConfig {
    mode: 'stdio';
}
export interface HttpTransportConfig extends BaseTransportConfig {
    mode: 'http';
    host: string;
    port: number;
    healthPath: string;
    mcpPath: string;
    oauthEnabled: boolean;
}
export interface AmqpTransportConfig extends BaseTransportConfig {
    mode: 'amqp';
    url: string;
    exchange: string;
    queuePrefix: string;
    prefetch?: number;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    messageTTL?: number;
    queueTTL?: number;
}
export type TransportConfig = StdioTransportConfig | HttpTransportConfig | AmqpTransportConfig;
export interface TransportStartResult {
    mode: TransportMode;
    started: boolean;
    details?: string;
    error?: string;
}
export interface TransportManagerResult {
    transports: TransportStartResult[];
}
//# sourceMappingURL=transport.types.d.ts.map