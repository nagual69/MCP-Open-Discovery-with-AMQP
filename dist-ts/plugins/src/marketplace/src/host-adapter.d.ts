import type { PluginExtractionRecord, PluginInstallResult, PluginRecord, PluginSummaryRecord } from './types';
export declare function getPluginDb(): {
    getPlugin(pluginId: string): PluginRecord | undefined;
    getAllPlugins(filter?: {
        state?: string;
    }): PluginSummaryRecord[];
    getCurrentExtraction(pluginId: string): PluginExtractionRecord | undefined;
};
export declare function getPluginManager(): {
    install(source: string, options?: {
        actor?: string;
        autoActivate?: boolean;
    }): Promise<PluginInstallResult>;
    uninstall(pluginId: string, options?: {
        actor?: string;
    }): Promise<{
        uninstalled: boolean;
        pluginId: string;
    }>;
};
//# sourceMappingURL=host-adapter.d.ts.map