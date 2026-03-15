import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Express } from 'express';
import type { Server as HttpServer } from 'node:http';
import type { HealthResponse, HttpTransportConfig, TransportStartResult } from '../../types';
export interface HttpTransportRuntime {
    app: Express;
    server: HttpServer;
    sessions: Record<string, StreamableHTTPServerTransport>;
}
export interface StartHttpTransportOptions {
    getHealthResponse?: () => HealthResponse;
    oauthMiddleware?: ((options: {
        requiredScope: string;
        skipPaths: string[];
    }) => express.RequestHandler) | null;
}
export declare function startStreamableHttpTransport(server: McpServer, config: HttpTransportConfig, options?: StartHttpTransportOptions): Promise<{
    result: TransportStartResult;
    runtime: HttpTransportRuntime;
}>;
export declare function stopStreamableHttpTransport(runtime: HttpTransportRuntime): Promise<void>;
//# sourceMappingURL=streamable-http-transport.d.ts.map