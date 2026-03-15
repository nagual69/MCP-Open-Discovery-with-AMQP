import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type {
  CiValue,
  MemoryClearResult,
  MemoryGetResult,
  MemoryMigrateResult,
  MemoryMutationResult,
  MemoryQueryResult,
  MemoryRotateKeyResult,
  MemorySaveResult,
  MemoryStatsResult,
} from './types';

type MemoryStoreRow = {
  ci_key: string;
  ci_data: string;
};

type StatsRow = {
  total_cis: number;
  total_size: number;
  oldest: string | null;
  newest: string | null;
};

type AuditRow = {
  count: number;
};

type Statement<Result = unknown> = {
  all: () => Result[];
  get: () => Result;
  run: (...args: unknown[]) => { changes: number };
};

type SQLiteDatabase = {
  pragma: (statement: string) => void;
  exec: (statement: string) => void;
  prepare: <Result = unknown>(statement: string) => Statement<Result>;
};

const Database = require('better-sqlite3') as new (databasePath: string) => SQLiteDatabase;

const GLOBAL_KEY = '__MCP_OD_MEMORY_CMDB__';
const AUTO_SAVE_INTERVAL = parseInt(process.env.MEMORY_AUTO_SAVE_INTERVAL ?? '30000', 10) || 30000;
const AUTO_SAVE_ENABLED = process.env.MEMORY_AUTO_SAVE !== 'false';

type GlobalMemoryState = {
  ciMemory: Record<string, CiValue>;
  memoryDb: MemoryDB | null;
  autoSaveTimer: NodeJS.Timeout | null;
};

const globalState = globalThis as typeof globalThis & {
  [GLOBAL_KEY]?: GlobalMemoryState;
};

if (!globalState[GLOBAL_KEY]) {
  globalState[GLOBAL_KEY] = {
    ciMemory: {},
    memoryDb: null,
    autoSaveTimer: null,
  };
}

function getState(): GlobalMemoryState {
  return globalState[GLOBAL_KEY] as GlobalMemoryState;
}

class MemoryDB {
  private readonly db: SQLiteDatabase;

  constructor() {
    const dbPath = process.env.MEMORY_DB_PATH || path.join(process.cwd(), 'data', 'mcp_memory.db');
    const dataDir = path.dirname(dbPath);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_store (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ci_key     TEXT    UNIQUE NOT NULL,
        ci_data    TEXT    NOT NULL,
        ci_type    TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS memory_audit (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        action     TEXT    NOT NULL,
        ci_key     TEXT,
        details    TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS memory_keys (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        key_data   TEXT    NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        active     INTEGER DEFAULT 1
      );
    `);
  }

  getMemoryData(): MemoryStoreRow[] {
    return this.db.prepare<MemoryStoreRow>('SELECT * FROM memory_store ORDER BY updated_at DESC').all();
  }

  storeMemoryData(ciKey: string, ciData: string, ciType: string): void {
    this.db
      .prepare(`
        INSERT INTO memory_store (ci_key, ci_data, ci_type, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(ci_key) DO UPDATE SET ci_data=excluded.ci_data, ci_type=excluded.ci_type, updated_at=excluded.updated_at
      `)
      .run(ciKey, ciData, ciType);
    this.audit('store', ciKey, `type=${ciType}`);
  }

  clearAllData(): number {
    const result = this.db.prepare('DELETE FROM memory_store').run();
    this.audit('clear', 'ALL', 'Cleared all memory data');
    return result.changes;
  }

  getStats(): StatsRow & { audit_entries: number } {
    const row = this.db
      .prepare<StatsRow>(
        'SELECT COUNT(*) as total_cis, COALESCE(SUM(LENGTH(ci_data)),0) as total_size, MIN(created_at) as oldest, MAX(updated_at) as newest FROM memory_store',
      )
      .get();
    const audit = this.db.prepare<AuditRow>('SELECT COUNT(*) as count FROM memory_audit').get();
    return {
      ...row,
      audit_entries: audit.count,
    };
  }

  storeMemoryKey(keyData: string): void {
    this.db.prepare('UPDATE memory_keys SET active = 0').run();
    this.db.prepare('INSERT INTO memory_keys (key_data, active) VALUES (?, 1)').run(keyData);
  }

  private audit(action: string, ciKey: string, details: string): void {
    try {
      this.db.prepare('INSERT INTO memory_audit (action, ci_key, details) VALUES (?, ?, ?)').run(action, ciKey, details);
    } catch {
    }
  }
}

function determineCiType(value: CiValue): string {
  if (value.hostname || value.ip_address) {
    return 'host';
  }
  if (value.cluster_name || value.proxmox_version) {
    return 'cluster';
  }
  if (value.service_name || value.protocol) {
    return 'service';
  }
  if (value.network_range || value.gateway) {
    return 'network';
  }
  if (value.storage_type || value.total_capacity) {
    return 'storage';
  }
  return 'general';
}

function ensureInitialized(): GlobalMemoryState {
  const state = getState();

  if (!state.memoryDb) {
    state.memoryDb = new MemoryDB();
    for (const row of state.memoryDb.getMemoryData()) {
      try {
        state.ciMemory[row.ci_key] = JSON.parse(row.ci_data) as CiValue;
      } catch {
      }
    }

    if (AUTO_SAVE_ENABLED && !state.autoSaveTimer) {
      state.autoSaveTimer = setInterval(() => {
        try {
          triggerSave();
        } catch {
        }
      }, AUTO_SAVE_INTERVAL);
    }
  }

  return state;
}

export function getMemoryValue(key: string): MemoryGetResult {
  const state = ensureInitialized();
  return {
    key,
    value: state.ciMemory[key] ?? null,
  };
}

export function setMemoryValue(key: string, value: CiValue): MemoryMutationResult {
  const state = ensureInitialized();
  state.ciMemory[key] = value;
  const savedCount = triggerSave();
  return {
    success: true,
    key,
    savedCount,
    value,
  };
}

export function mergeMemoryValue(key: string, value: CiValue): MemoryMutationResult {
  const state = ensureInitialized();
  const existing = state.ciMemory[key] ?? {};
  const merged = {
    ...existing,
    ...value,
  };
  state.ciMemory[key] = merged;
  const savedCount = triggerSave();
  return {
    success: true,
    key,
    savedCount,
    value: merged,
  };
}

export function queryMemory(pattern?: string): MemoryQueryResult {
  const state = ensureInitialized();
  const matches: Record<string, CiValue> = {};
  const matcher = pattern ? new RegExp(pattern.replace(/\*/g, '.*')) : null;

  for (const [key, value] of Object.entries(state.ciMemory)) {
    if (!matcher || matcher.test(key)) {
      matches[key] = value;
    }
  }

  return {
    count: Object.keys(matches).length,
    ...(pattern ? { pattern } : {}),
    matches,
  };
}

export function clearMemory(): MemoryClearResult {
  const state = ensureInitialized();
  const clearedMemoryCount = Object.keys(state.ciMemory).length;
  state.ciMemory = {};
  const clearedPersistentCount = state.memoryDb?.clearAllData() ?? 0;
  return {
    success: true,
    clearedMemoryCount,
    clearedPersistentCount,
  };
}

export function getMemoryStats(): MemoryStatsResult {
  const state = ensureInitialized();
  const stats = state.memoryDb?.getStats();
  return {
    inMemoryCIs: Object.keys(state.ciMemory).length,
    sqliteCIs: stats?.total_cis ?? 0,
    totalSizeBytes: stats?.total_size ?? 0,
    auditEntries: stats?.audit_entries ?? 0,
    oldestCI: stats?.oldest ?? null,
    newestCI: stats?.newest ?? null,
    autoSave: {
      enabled: AUTO_SAVE_ENABLED,
      intervalMs: AUTO_SAVE_INTERVAL,
    },
  };
}

export function rotateMemoryKey(newKey?: string): MemoryRotateKeyResult {
  const state = ensureInitialized();
  const nextKey = newKey ?? crypto.randomBytes(32).toString('hex');
  state.memoryDb?.storeMemoryKey(nextKey);
  return {
    success: true,
    message: 'Memory encryption key rotated successfully.',
    keyLength: nextKey.length,
  };
}

export function triggerSave(): number {
  const state = ensureInitialized();

  for (const [key, value] of Object.entries(state.ciMemory)) {
    state.memoryDb?.storeMemoryData(key, JSON.stringify(value), determineCiType(value));
  }

  return Object.keys(state.ciMemory).length;
}

export function saveMemory(): MemorySaveResult {
  return {
    success: true,
    count: triggerSave(),
  };
}

export function migrateMemoryFromFilesystem(oldDataPath?: string): MemoryMigrateResult {
  const state = ensureInitialized();
  const sourcePath = oldDataPath || path.join(process.cwd(), 'data', 'memory_data.json');

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`File not found: ${sourcePath}`);
  }

  const rawData = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as Record<string, CiValue>;
  let migratedCount = 0;

  for (const [key, value] of Object.entries(rawData)) {
    state.ciMemory[key] = value;
    state.memoryDb?.storeMemoryData(key, JSON.stringify(value), determineCiType(value));
    migratedCount += 1;
  }

  return {
    success: true,
    migratedCount,
    sourcePath,
  };
}