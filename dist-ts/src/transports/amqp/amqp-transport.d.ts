import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AmqpStatus, AmqpTransportConfig, TransportStartResult } from '../../types';
import type { JsonRpcNotification } from '../../runtime/notifications';
export interface AmqpTransportRuntime {
    start(server: McpServer, config: AmqpTransportConfig): Promise<TransportStartResult>;
    stop?(): Promise<void>;
    getStatus?(): AmqpStatus;
    send?(message: JsonRpcNotification, options?: {
        relatedRequestId?: string | number | null;
    }): Promise<void>;
}
export declare function startAmqpTransport(server: McpServer, config: AmqpTransportConfig, runtime?: AmqpTransportRuntime): Promise<TransportStartResult>;
export declare function getAmqpTransportStatus(runtime?: AmqpTransportRuntime): AmqpStatus;
//# sourceMappingURL=amqp-transport.d.ts.map