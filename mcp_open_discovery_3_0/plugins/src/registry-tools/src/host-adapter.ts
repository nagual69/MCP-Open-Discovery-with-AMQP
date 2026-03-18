import fs from 'node:fs';
import path from 'node:path';

import type { AuditEntry, MarketplacePlugin, PluginSummaryRecord } from './types';

type UnknownRecord = Record<string, unknown>;

type TypedPluginManager = {
  list(filter?: { state?: string }): PluginSummaryRecord[];
  listAvailableFromMarketplace(): Promise<MarketplacePlugin[]>;
  install(source: string, options?: { actor?: string; autoActivate?: boolean }): Promise<UnknownRecord>;
  activate(pluginId: string, options?: { actor?: string }): Promise<UnknownRecord>;
  deactivate(pluginId: string, options?: { actor?: string }): Promise<UnknownRecord>;
  update(pluginName: string, source: string, options?: { actor?: string }): Promise<UnknownRecord>;
};

type TypedPluginDb = {
  getAuditLog(pluginId: string, limit?: number): AuditEntry[];
  insertTrustedKey(keyData: UnknownRecord): void;
};

function loadTypedModule<T>(modulePath: string): T {
  if (!fs.existsSync(modulePath)) {
    throw new Error(`Unable to locate typed host module at ${modulePath}. Build the typed host before loading this plugin.`);
  }

  return require(modulePath) as T;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function toUnknownRecord(value: unknown): UnknownRecord {
  return value as UnknownRecord;
}

export function getPluginManager(): TypedPluginManager {
  const typedPath = path.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'plugin-manager.js');
  const module = loadTypedModule<TypedPluginManager>(typedPath);

  return {
    list(filter?: { state?: string }): PluginSummaryRecord[] {
      return module.list(filter).map((plugin) => ({
        id: String(toUnknownRecord(plugin).id ?? ''),
        name: String(toUnknownRecord(plugin).name ?? ''),
        version: String(toUnknownRecord(plugin).version ?? ''),
        lifecycle_state: String(toUnknownRecord(plugin).lifecycle_state ?? ''),
        is_builtin: normalizeBoolean(toUnknownRecord(plugin).is_builtin),
      }));
    },
    listAvailableFromMarketplace(): Promise<MarketplacePlugin[]> {
      return module.listAvailableFromMarketplace();
    },
    install(source: string, options?: { actor?: string; autoActivate?: boolean }): Promise<UnknownRecord> {
      return module.install(source, options);
    },
    activate(pluginId: string, options?: { actor?: string }): Promise<UnknownRecord> {
      return module.activate(pluginId, options);
    },
    deactivate(pluginId: string, options?: { actor?: string }): Promise<UnknownRecord> {
      return module.deactivate(pluginId, options);
    },
    update(pluginName: string, source: string, options?: { actor?: string }): Promise<UnknownRecord> {
      return module.update(pluginName, source, options);
    },
  };
}

export function getPluginDb(): TypedPluginDb {
  const typedPath = path.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'db', 'plugin-db.js');
  return loadTypedModule<TypedPluginDb>(typedPath);
}