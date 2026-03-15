"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMemoryValue = getMemoryValue;
exports.setMemoryValue = setMemoryValue;
exports.mergeMemoryValue = mergeMemoryValue;
exports.queryMemory = queryMemory;
exports.clearMemory = clearMemory;
exports.getMemoryStats = getMemoryStats;
exports.rotateMemoryKey = rotateMemoryKey;
exports.triggerSave = triggerSave;
exports.saveMemory = saveMemory;
exports.migrateMemoryFromFilesystem = migrateMemoryFromFilesystem;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const Database = require('better-sqlite3');
const GLOBAL_KEY = '__MCP_OD_MEMORY_CMDB__';
const AUTO_SAVE_INTERVAL = parseInt(process.env.MEMORY_AUTO_SAVE_INTERVAL ?? '30000', 10) || 30000;
const AUTO_SAVE_ENABLED = process.env.MEMORY_AUTO_SAVE !== 'false';
const globalState = globalThis;
if (!globalState[GLOBAL_KEY]) {
    globalState[GLOBAL_KEY] = {
        ciMemory: {},
        memoryDb: null,
        autoSaveTimer: null,
    };
}
function getState() {
    return globalState[GLOBAL_KEY];
}
class MemoryDB {
    db;
    constructor() {
        const dbPath = process.env.MEMORY_DB_PATH || node_path_1.default.join(process.cwd(), 'data', 'mcp_memory.db');
        const dataDir = node_path_1.default.dirname(dbPath);
        if (!node_fs_1.default.existsSync(dataDir)) {
            node_fs_1.default.mkdirSync(dataDir, { recursive: true });
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
    getMemoryData() {
        return this.db.prepare('SELECT * FROM memory_store ORDER BY updated_at DESC').all();
    }
    storeMemoryData(ciKey, ciData, ciType) {
        this.db
            .prepare(`
        INSERT INTO memory_store (ci_key, ci_data, ci_type, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(ci_key) DO UPDATE SET ci_data=excluded.ci_data, ci_type=excluded.ci_type, updated_at=excluded.updated_at
      `)
            .run(ciKey, ciData, ciType);
        this.audit('store', ciKey, `type=${ciType}`);
    }
    clearAllData() {
        const result = this.db.prepare('DELETE FROM memory_store').run();
        this.audit('clear', 'ALL', 'Cleared all memory data');
        return result.changes;
    }
    getStats() {
        const row = this.db
            .prepare('SELECT COUNT(*) as total_cis, COALESCE(SUM(LENGTH(ci_data)),0) as total_size, MIN(created_at) as oldest, MAX(updated_at) as newest FROM memory_store')
            .get();
        const audit = this.db.prepare('SELECT COUNT(*) as count FROM memory_audit').get();
        return {
            ...row,
            audit_entries: audit.count,
        };
    }
    storeMemoryKey(keyData) {
        this.db.prepare('UPDATE memory_keys SET active = 0').run();
        this.db.prepare('INSERT INTO memory_keys (key_data, active) VALUES (?, 1)').run(keyData);
    }
    audit(action, ciKey, details) {
        try {
            this.db.prepare('INSERT INTO memory_audit (action, ci_key, details) VALUES (?, ?, ?)').run(action, ciKey, details);
        }
        catch {
        }
    }
}
function determineCiType(value) {
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
function ensureInitialized() {
    const state = getState();
    if (!state.memoryDb) {
        state.memoryDb = new MemoryDB();
        for (const row of state.memoryDb.getMemoryData()) {
            try {
                state.ciMemory[row.ci_key] = JSON.parse(row.ci_data);
            }
            catch {
            }
        }
        if (AUTO_SAVE_ENABLED && !state.autoSaveTimer) {
            state.autoSaveTimer = setInterval(() => {
                try {
                    triggerSave();
                }
                catch {
                }
            }, AUTO_SAVE_INTERVAL);
        }
    }
    return state;
}
function getMemoryValue(key) {
    const state = ensureInitialized();
    return {
        key,
        value: state.ciMemory[key] ?? null,
    };
}
function setMemoryValue(key, value) {
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
function mergeMemoryValue(key, value) {
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
function queryMemory(pattern) {
    const state = ensureInitialized();
    const matches = {};
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
function clearMemory() {
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
function getMemoryStats() {
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
function rotateMemoryKey(newKey) {
    const state = ensureInitialized();
    const nextKey = newKey ?? node_crypto_1.default.randomBytes(32).toString('hex');
    state.memoryDb?.storeMemoryKey(nextKey);
    return {
        success: true,
        message: 'Memory encryption key rotated successfully.',
        keyLength: nextKey.length,
    };
}
function triggerSave() {
    const state = ensureInitialized();
    for (const [key, value] of Object.entries(state.ciMemory)) {
        state.memoryDb?.storeMemoryData(key, JSON.stringify(value), determineCiType(value));
    }
    return Object.keys(state.ciMemory).length;
}
function saveMemory() {
    return {
        success: true,
        count: triggerSave(),
    };
}
function migrateMemoryFromFilesystem(oldDataPath) {
    const state = ensureInitialized();
    const sourcePath = oldDataPath || node_path_1.default.join(process.cwd(), 'data', 'memory_data.json');
    if (!node_fs_1.default.existsSync(sourcePath)) {
        throw new Error(`File not found: ${sourcePath}`);
    }
    const rawData = JSON.parse(node_fs_1.default.readFileSync(sourcePath, 'utf8'));
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
//# sourceMappingURL=store.js.map