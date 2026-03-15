import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PluginManifestV2 } from '../types';
export interface CapturedRegistrations {
    tools: Array<{
        name: string;
        config: unknown;
        handler: unknown;
    }>;
    resources: Array<{
        name: string;
        uriOrTemplate: unknown;
        metadata: unknown;
        reader: unknown;
    }>;
    prompts: Array<{
        name: string;
        config: unknown;
        handler: unknown;
    }>;
}
export interface PluginLoadResult {
    captured: CapturedRegistrations;
}
export declare function loadAndRegisterPlugin(server: McpServer, rootDir: string, manifest: PluginManifestV2): Promise<PluginLoadResult>;
//# sourceMappingURL=plugin-loader.d.ts.map