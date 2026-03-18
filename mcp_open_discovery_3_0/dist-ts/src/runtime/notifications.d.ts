export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}
export declare function buildNotification(method: string, params?: unknown): JsonRpcNotification;
export declare function sendToSession(sessionId: string, notification: JsonRpcNotification): Promise<boolean>;
export declare function sendViaStdio(notification: JsonRpcNotification): Promise<boolean>;
export declare function sendViaAmqp(notification: JsonRpcNotification): Promise<boolean>;
export declare function broadcast(notification: JsonRpcNotification): Promise<boolean>;
export declare function publishToolsListChanged(): Promise<boolean>;
export declare function publishResourcesListChanged(): Promise<boolean>;
export declare function publishPromptsListChanged(): Promise<boolean>;
//# sourceMappingURL=notifications.d.ts.map