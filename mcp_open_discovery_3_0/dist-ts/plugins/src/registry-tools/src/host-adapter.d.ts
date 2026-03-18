import type { AuditEntry, MarketplacePlugin, PluginSummaryRecord } from './types';
type UnknownRecord = Record<string, unknown>;
type TypedPluginManager = {
    list(filter?: {
        state?: string;
    }): PluginSummaryRecord[];
    listAvailableFromMarketplace(): Promise<MarketplacePlugin[]>;
    install(source: string, options?: {
        actor?: string;
        autoActivate?: boolean;
    }): Promise<UnknownRecord>;
    activate(pluginId: string, options?: {
        actor?: string;
    }): Promise<UnknownRecord>;
    deactivate(pluginId: string, options?: {
        actor?: string;
    }): Promise<UnknownRecord>;
    update(pluginName: string, source: string, options?: {
        actor?: string;
    }): Promise<UnknownRecord>;
};
type TypedPluginDb = {
    getAuditLog(pluginId: string, limit?: number): AuditEntry[];
    insertTrustedKey(keyData: UnknownRecord): void;
};
export declare function getPluginManager(): TypedPluginManager;
export declare function getPluginDb(): TypedPluginDb;
export {};
//# sourceMappingURL=host-adapter.d.ts.map