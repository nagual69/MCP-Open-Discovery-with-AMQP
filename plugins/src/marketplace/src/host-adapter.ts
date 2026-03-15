import fs from 'node:fs';
import path from 'node:path';

import type {
  PluginExtractionRecord,
  PluginInstallResult,
  PluginRecord,
  PluginSummaryRecord,
} from './types';

type UnknownRecord = Record<string, unknown>;

type TypedPluginDb = {
  getPlugin(pluginId: string): PluginRecord | undefined;
  getAllPlugins(filter?: { state?: string }): PluginSummaryRecord[];
  getCurrentExtraction(pluginId: string): PluginExtractionRecord | undefined;
};

type TypedPluginManager = {
  install(
    source: string,
    options?: {
      actor?: string;
      autoActivate?: boolean;
      pluginId?: string;
      checksum?: string;
      checksumAlgorithm?: string;
      signature?: string;
      publicKey?: string;
      signatureAlgorithm?: 'Ed25519' | 'RSA-SHA256';
    },
  ): Promise<PluginInstallResult>;
  uninstall(pluginId: string, options?: { actor?: string }): Promise<{ uninstalled: boolean; pluginId: string }>;
};

type LegacyPluginDb = {
  getPlugin(pluginId: string): UnknownRecord | undefined;
  getAllPlugins(filter?: UnknownRecord): UnknownRecord[];
  getCurrentExtraction(pluginId: string): UnknownRecord | undefined;
};

type LegacyPluginManager = {
  install(source: string, options?: UnknownRecord): Promise<PluginInstallResult>;
  uninstall(pluginId: string, options?: UnknownRecord): Promise<{ uninstalled?: boolean; pluginId?: string }>;
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

function normalizePluginRecord(record: UnknownRecord): PluginRecord {
  return {
    id: String(record.id ?? ''),
    name: String(record.name ?? ''),
    version: String(record.version ?? ''),
    lifecycle_state: String(record.lifecycle_state ?? ''),
    is_builtin: normalizeBoolean(record.is_builtin),
    installed_at: String(record.installed_at ?? ''),
    source_type: String(record.source_type ?? ''),
    bundle_size_bytes: Number(record.bundle_size_bytes ?? 0),
    manifest_json: String(record.manifest_json ?? '{}'),
  };
}

function normalizePluginSummary(record: UnknownRecord): PluginSummaryRecord {
  return {
    id: String(record.id ?? ''),
    name: String(record.name ?? ''),
    version: String(record.version ?? ''),
    lifecycle_state: String(record.lifecycle_state ?? ''),
    is_builtin: normalizeBoolean(record.is_builtin),
    installed_at: String(record.installed_at ?? ''),
    source_type: String(record.source_type ?? ''),
    bundle_size_bytes: Number(record.bundle_size_bytes ?? 0),
  };
}

export function getPluginDb(): {
  getPlugin(pluginId: string): PluginRecord | undefined;
  getAllPlugins(filter?: { state?: string }): PluginSummaryRecord[];
  getCurrentExtraction(pluginId: string): PluginExtractionRecord | undefined;
} {
  const typedPath = path.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'db', 'plugin-db.js');
  const legacyPath = path.join(process.cwd(), 'tools', 'plugins', 'db', 'plugin-db.js');
  const module = loadModule<TypedPluginDb | LegacyPluginDb>([typedPath, legacyPath]);

  return {
    getPlugin(pluginId: string): PluginRecord | undefined {
      const record = module.getPlugin(pluginId);
      if (!record) {
        return undefined;
      }
      return 'manifest_json' in record ? (record as PluginRecord) : normalizePluginRecord(record as UnknownRecord);
    },
    getAllPlugins(filter?: { state?: string }): PluginSummaryRecord[] {
      return module.getAllPlugins(filter).map((record) => normalizePluginSummary(record as UnknownRecord));
    },
    getCurrentExtraction(pluginId: string): PluginExtractionRecord | undefined {
      const extraction = module.getCurrentExtraction(pluginId) as UnknownRecord | undefined;
      if (!extraction || typeof extraction.extraction_path !== 'string') {
        return undefined;
      }
      return { extraction_path: extraction.extraction_path };
    },
  };
}

export function getPluginManager(): {
  install(
    source: string,
    options?: {
      actor?: string;
      autoActivate?: boolean;
      pluginId?: string;
      checksum?: string;
      checksumAlgorithm?: string;
      signature?: string;
      publicKey?: string;
      signatureAlgorithm?: 'Ed25519' | 'RSA-SHA256';
    },
  ): Promise<PluginInstallResult>;
  uninstall(pluginId: string, options?: { actor?: string }): Promise<{ uninstalled: boolean; pluginId: string }>;
} {
  const typedPath = path.join(process.cwd(), 'dist-ts', 'src', 'plugins', 'plugin-manager.js');
  const legacyPath = path.join(process.cwd(), 'tools', 'plugins', 'plugin-manager.js');
  const module = loadModule<TypedPluginManager | LegacyPluginManager>([typedPath, legacyPath]);

  return {
    async install(
      source: string,
      options?: {
        actor?: string;
        autoActivate?: boolean;
        pluginId?: string;
        checksum?: string;
        checksumAlgorithm?: string;
        signature?: string;
        publicKey?: string;
        signatureAlgorithm?: 'Ed25519' | 'RSA-SHA256';
      },
    ): Promise<PluginInstallResult> {
      return module.install(source, options);
    },
    async uninstall(pluginId: string, options?: { actor?: string }): Promise<{ uninstalled: boolean; pluginId: string }> {
      const result = await module.uninstall(pluginId, options);
      return {
        uninstalled: normalizeBoolean((result as UnknownRecord).uninstalled),
        pluginId: String((result as UnknownRecord).pluginId ?? pluginId),
      };
    },
  };
}