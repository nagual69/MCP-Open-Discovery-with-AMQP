import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PluginLoaderResult, PluginRegistryStats } from '../types';
export declare function initialize(server: McpServer): Promise<PluginLoaderResult>;
export declare function bootstrapBuiltinPlugins(): Promise<void>;
export declare function getStats(): PluginRegistryStats;
//# sourceMappingURL=plugin-registry.d.ts.map