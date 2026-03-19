import Database from 'better-sqlite3';
import type { AddTrustedKeyInput, PluginAuditEntry, PluginAuditEvent, PluginExtractionRecord, PluginLifecycleState, PluginRecord, PluginSummary, PluginSourceType, SignerType, TrustedSigningKey, TrustedKeySummary } from '../../types';
export interface InsertPluginInput {
    id: string;
    name: string;
    version: string;
    manifest_json: string;
    bundle_blob: Buffer;
    dist_hash: string;
    bundle_size_bytes: number;
    signature_data: string | null;
    signature_verified: 0 | 1;
    signer_key_id: string | null;
    signer_type: SignerType;
    lifecycle_state: PluginLifecycleState;
    is_builtin: 0 | 1;
    installed_at: string;
    installed_by: string;
    source_url: string | null;
    source_type: PluginSourceType;
    previous_version_id?: string | null;
    update_pending?: 0 | 1;
}
export interface ActivePluginRecord extends Pick<PluginRecord, 'id' | 'name' | 'version' | 'manifest_json'> {
}
export declare function getDb(): Database.Database;
export declare function closeDb(): void;
export declare function insertPlugin(pluginData: InsertPluginInput): void;
export declare function setPluginLifecycleState(pluginId: string, state: PluginLifecycleState, detail?: string | null): void;
export declare function setPluginCapabilityActiveState(pluginId: string, isActive: boolean): void;
export declare function getPlugin(pluginId: string): PluginRecord | undefined;
export declare function getPluginByName(name: string): PluginRecord | undefined;
export declare function getActivePlugins(): ActivePluginRecord[];
export declare function getAllPlugins(filter?: {
    state?: PluginLifecycleState;
}): PluginSummary[];
export declare function getActiveToolNames(): string[];
export declare function getBundleBlob(pluginId: string): Buffer | null;
export declare function getTrustedSigningKey(keyId: string): TrustedSigningKey | undefined;
export declare function getAllTrustedKeys(): TrustedKeySummary[];
export declare function insertTrustedKey(keyData: AddTrustedKeyInput): void;
export declare function saveExtractionRecord(pluginId: string, extractionPath: string, extractedHash: string): void;
export declare function getCurrentExtraction(pluginId: string): PluginExtractionRecord | undefined;
export declare function auditLog(pluginId: string, pluginName: string, version: string, event: PluginAuditEvent, actor?: string, detail?: Record<string, unknown> | null): void;
export declare function getAuditLog(pluginId: string, limit?: number): PluginAuditEntry[];
export declare function deletePlugin(pluginId: string): void;
export declare function getPromptCounts(): number;
//# sourceMappingURL=plugin-db.d.ts.map