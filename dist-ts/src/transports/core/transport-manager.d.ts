import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandler } from 'express';
import type { HealthResponse, TransportManagerResult, TransportMode } from '../../types';
import type { AppConfig } from '../../config';
import { type AmqpTransportRuntime } from '../amqp/amqp-transport';
import { type HttpTransportRuntime } from './streamable-http-transport';
export interface EnvironmentInfo {
    isContainer: boolean;
    isInteractive: boolean;
    nodeEnv: string;
    transportMode?: string;
}
export interface ManagedTransports {
    http?: HttpTransportRuntime;
    amqpRuntime?: AmqpTransportRuntime;
    startedModes: TransportMode[];
}
export interface StartTransportOptions {
    oauthMiddleware?: ((options: {
        requiredScope: string;
        skipPaths: string[];
    }) => RequestHandler) | null;
    amqpRuntime?: AmqpTransportRuntime;
}
export declare function determineEnabledTransports(config: Pick<AppConfig, 'transportModes'>, environment?: EnvironmentInfo): TransportMode[];
export declare function startConfiguredTransports(server: McpServer, config: AppConfig, options?: StartTransportOptions): Promise<{
    results: TransportManagerResult;
    managed: ManagedTransports;
}>;
export declare function stopConfiguredTransports(managed: ManagedTransports): Promise<void>;
export declare function getTransportStatus(config: AppConfig, managed?: ManagedTransports): {
    environment: EnvironmentInfo;
    health: HealthResponse;
    active: TransportMode[];
};
//# sourceMappingURL=transport-manager.d.ts.map