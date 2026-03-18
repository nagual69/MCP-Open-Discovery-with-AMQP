import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from './config';
import { getStats } from './plugins/plugin-registry';
import { type ManagedTransports } from './transports';
export declare function createAppConfig(): AppConfig;
export declare function createMcpServer(): Promise<McpServer>;
export declare function startServer(config?: AppConfig): Promise<{
    server: McpServer;
    stats: ReturnType<typeof getStats>;
}>;
export declare function stopServer(): Promise<void>;
export declare function installProcessHandlers(): void;
export declare function runServerAsMain(config?: AppConfig): Promise<void>;
export declare function getServerInstance(): McpServer | null;
export declare function getManagedTransports(): ManagedTransports | null;
//# sourceMappingURL=server.d.ts.map