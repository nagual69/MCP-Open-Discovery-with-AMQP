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

function loadModule<T>(candidates: string[]): T {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate) as T;
    }
  }

  throw new Error(`Unable to locate host module. Tried: ${candidates.join(', ')}`);
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function toUnknownRecord(value: unknown): UnknownRecord {
  return value as UnknownRecord;
}

export function getPluginManager(): TypedPluginManager {
  const typedPath = path.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'plugin-manager.js');
  const legacyPath = path.join(process.cwd(), 'tools', 'plugins', 'plugin-manager.js');
  const module = loadModule<TypedPluginManager>([typedPath, legacyPath]);

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
  const legacyPath = path.join(process.cwd(), 'tools', 'plugins', 'db', 'plugin-db.js');
  return loadModule<TypedPluginDb>([typedPath, legacyPath]);
}