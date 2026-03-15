export interface MarketplacePluginCapabilities {
    tools: number;
    resources: number;
    prompts: number;
}
export interface MarketplacePlugin {
    id: string;
    name: string;
    version: string;
    latestVersion: string;
    description: string;
    author: string;
    category: string;
    tags: string[];
    downloads: number;
    stars: number;
    isPublic: boolean;
    capabilities: MarketplacePluginCapabilities;
    downloadUrl: string;
    signedBy: 'vibeforge' | 'enterprise' | null;
    publishedAt: string;
    updatedAt: string;
}
export interface MarketplaceListResponse {
    plugins: MarketplacePlugin[];
    total: number;
    page: number;
    pageSize: number;
}
export interface MarketplaceTokenRecord {
    id: number;
    token_hash: string;
    marketplace_url: string;
    scope: 'read';
    expires_at: string | null;
    created_at: string;
    last_used_at: string | null;
    is_active: 0 | 1;
}
export interface PluginUpdateAvailability {
    plugin_name: string;
    installed_version: string;
    latest_version: string;
    update_available: boolean;
    download_url: string | null;
}
//# sourceMappingURL=marketplace.types.d.ts.map