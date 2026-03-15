import type { MarketplacePlugin, PluginUpdateAvailability } from '../../types';
export interface MarketplaceClientConfig {
    baseUrl: string;
    token: string | null;
}
export declare class MarketplaceClient {
    private readonly http;
    constructor(config: MarketplaceClientConfig);
    listAvailable(): Promise<MarketplacePlugin[]>;
    downloadPlugin(downloadUrl: string): Promise<Buffer>;
    checkForUpdates(installedPlugins: Array<{
        name: string;
        version: string;
    }>): Promise<PluginUpdateAvailability[]>;
}
//# sourceMappingURL=marketplace-client.d.ts.map