import type { PluginManifestV2 } from './manifest.types';
export type PluginLifecycleState = 'installed' | 'active' | 'inactive' | 'error' | 'updating' | 'uninstalling';
export type PluginSourceType = 'marketplace' | 'local';
export type SignerType = 'vibeforge' | 'enterprise' | 'local' | null;
export type TrustedKeyType = 'vibeforge' | 'enterprise';
export type SigningAlgorithm = 'Ed25519' | 'RSA-SHA256';
export interface PluginRecord {
    id: string;
    name: string;
    version: string;
    manifest_json: string;
    dist_hash: string;
    bundle_size_bytes: number;
    signature_data: string | null;
    signature_verified: 0 | 1;
    signer_key_id: string | null;
    signer_type: SignerType;
    lifecycle_state: PluginLifecycleState;
    is_builtin: 0 | 1;
    activation_count: number;
    last_activated: string | null;
    last_deactivated: string | null;
    last_error: string | null;
    installed_at: string;
    installed_by: string;
    source_url: string | null;
    source_type: PluginSourceType;
    previous_version_id: string | null;
    update_pending: 0 | 1;
}
export interface PluginSummary {
    id: string;
    name: string;
    version: string;
    lifecycle_state: PluginLifecycleState;
    is_builtin: boolean;
    installed_at: string;
    source_type: PluginSourceType;
    bundle_size_bytes: number;
}
export interface PluginInstallOptions {
    actor?: string;
    isBuiltin?: boolean;
    autoActivate?: boolean;
    pluginId?: string;
    checksum?: string;
    checksumAlgorithm?: string;
    signature?: string;
    publicKey?: string;
    signatureAlgorithm?: SigningAlgorithm;
}
export interface PluginActivateOptions {
    actor?: string;
}
export interface PluginInstallResult {
    pluginId: string;
    manifest: PluginManifestV2;
    signatureVerified: boolean;
    payloadChecksumVerified?: boolean;
    payloadSignatureVerified?: boolean;
}
export interface PluginActivateResult {
    activated: boolean;
    pluginId: string;
    toolCount?: number;
    resourceCount?: number;
    promptCount?: number;
    alreadyActive?: boolean;
}
export interface PluginDeactivateResult {
    deactivated: boolean;
    pluginId: string;
}
export interface PluginUninstallResult {
    uninstalled: boolean;
    pluginId: string;
}
export interface PluginHotSwapResult {
    hotSwapped: boolean;
    previousVersion: string;
    newVersion: string;
}
export type PluginAuditEvent = 'installed' | 'activated' | 'deactivated' | 'updated' | 'uninstalled' | 'activation_failed' | 'signature_verified' | 'signature_failed' | 'hash_verified' | 'hash_failed' | 'hot_swap_started' | 'hot_swap_completed' | 'hot_swap_failed';
export interface PluginAuditEntry {
    id: number;
    plugin_id: string;
    plugin_name: string;
    version: string;
    event: PluginAuditEvent;
    actor: string;
    detail: string | null;
    occurred_at: string;
}
export interface PluginExtractionRecord {
    id: number;
    plugin_id: string;
    extraction_path: string;
    extracted_hash: string;
    extracted_at: string;
    is_current: 0 | 1;
}
export interface PluginRegistryStats {
    totalPlugins: number;
    activePlugins: number;
    activeTools: number;
    activeResources: number;
    activePrompts: number;
}
export interface PluginLoaderResultItem {
    id: string;
    name?: string;
    version?: string;
    tools: number;
    resources: number;
    prompts: number;
    path?: string;
}
export interface PluginLoaderErrorItem {
    id: string;
    error: string;
}
export interface PluginLoaderTimings {
    totalMs: number;
    validationMs?: number;
    importMs?: number;
    reconcileMs?: number;
    registerMs?: number;
}
export interface PluginLoaderStats {
    toolsRegistered: number;
    resourcesRegistered: number;
    promptsRegistered: number;
    invalidTools: number;
    warnings: number;
}
export interface PluginLoaderResult {
    loaded: PluginLoaderResultItem[];
    failed: PluginLoaderErrorItem[];
    skipped?: Array<{
        id: string;
        reason: string;
    }>;
    timings?: PluginLoaderTimings;
    stats?: PluginLoaderStats;
}
//# sourceMappingURL=lifecycle.types.d.ts.map