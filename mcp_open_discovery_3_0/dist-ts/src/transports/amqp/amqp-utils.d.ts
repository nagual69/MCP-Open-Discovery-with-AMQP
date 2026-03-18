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
export declare function detectMessageType(message: JsonRpcMessage): 'request' | 'response' | 'notification';
export declare function validateJsonRpc(message: unknown): {
    valid: boolean;
    reason?: string;
};
export declare function parseMessage(content: Buffer): {
    success: true;
    message: JsonRpcMessage;
} | {
    success: false;
    error: Error;
};
export declare function sanitizeJsonRpcMessage(message: JsonRpcMessage): JsonRpcMessage;
export declare function normalizeMethodForRouting(method: string): string;
export declare function getRoutingKey(message: JsonRpcMessage, messageType: 'request' | 'notification', strategy?: RoutingKeyStrategy): string;
export declare function generateSessionId(): string;
export declare function validateAmqpConfig(config: {
    amqpUrl: string;
    queuePrefix: string;
    exchangeName: string;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    prefetchCount?: number;
}): string[];
//# sourceMappingURL=amqp-utils.d.ts.map