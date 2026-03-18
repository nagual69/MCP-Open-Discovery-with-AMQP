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
        pluginId?: string;
        checksum?: string;
        checksumAlgorithm?: string;
        signature?: string;
        publicKey?: string;
        signatureAlgorithm?: 'Ed25519' | 'RSA-SHA256';
    }): Promise<PluginInstallResult>;
    uninstall(pluginId: string, options?: {
        actor?: string;
    }): Promise<{
        uninstalled: boolean;
        pluginId: string;
    }>;
};
//# sourceMappingURL=host-adapter.d.ts.map