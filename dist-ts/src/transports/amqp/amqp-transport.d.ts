import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AmqpStatus, AmqpTransportConfig, TransportStartResult } from '../../types';
interface LegacyAmqpModule {
    initializeAmqpIntegration?: (logger?: (level: string, message: string, data?: unknown) => void) => Promise<void> | void;
    startAmqpServer?: (createServerFn: () => Promise<McpServer>, logger?: (level: string, message: string, data?: unknown) => void, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    getAmqpStatus?: () => Record<string, unknown>;
}
export interface AmqpTransportRuntime {
    start(server: McpServer, config: AmqpTransportConfig): Promise<TransportStartResult>;
    stop?(): Promise<void>;
    getStatus?(): AmqpStatus;
}
export declare class LegacyAmqpRuntimeAdapter implements AmqpTransportRuntime {
    private readonly legacyModule;
    constructor(legacyModule?: LegacyAmqpModule | null);
    start(server: McpServer, config: AmqpTransportConfig): Promise<TransportStartResult>;
    getStatus(): AmqpStatus;
}
export declare function startAmqpTransport(server: McpServer, config: AmqpTransportConfig, runtime?: AmqpTransportRuntime): Promise<TransportStartResult>;
export declare function getAmqpTransportStatus(runtime?: AmqpTransportRuntime): AmqpStatus;
export {};
//# sourceMappingURL=amqp-transport.d.ts.map