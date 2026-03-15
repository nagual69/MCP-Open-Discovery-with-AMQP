import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MarketplacePlugin, PluginActivateOptions, PluginActivateResult, PluginDeactivateResult, PluginHotSwapResult, PluginInstallOptions, PluginInstallResult, PluginSummary, PluginUninstallResult } from '../types';
import { type CapturedRegistrations } from './plugin-loader';
export declare function setMcpServer(server: McpServer): void;
export declare function install(source: string, options?: PluginInstallOptions): Promise<PluginInstallResult>;
export declare function activate(pluginIdValue: string, options?: PluginActivateOptions): Promise<PluginActivateResult>;
export declare function deactivate(pluginIdValue: string, options?: PluginActivateOptions): Promise<PluginDeactivateResult>;
export declare function update(pluginName: string, newSource: string, options?: PluginActivateOptions): Promise<PluginHotSwapResult>;
export declare function uninstall(pluginIdValue: string, options?: PluginActivateOptions): Promise<PluginUninstallResult>;
export declare function list(filter?: {
    state?: string;
}): PluginSummary[];
export declare function listAvailableFromMarketplace(): Promise<MarketplacePlugin[]>;
export declare function getMcpServer(): McpServer | null;
export declare function getActiveRegistrations(): Map<string, CapturedRegistrations>;
//# sourceMappingURL=plugin-manager.d.ts.map