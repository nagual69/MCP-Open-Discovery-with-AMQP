"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCredential = addCredential;
exports.getCredential = getCredential;
exports.listCredentials = listCredentials;
exports.removeCredential = removeCredential;
exports.rotateKey = rotateKey;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const DATA_DIR = node_path_1.default.join(process.cwd(), 'data');
const CREDS_STORE_PATH = node_path_1.default.join(DATA_DIR, 'mcp_creds_store.json');
const CREDS_KEY_PATH = node_path_1.default.join(DATA_DIR, 'mcp_creds_key');
const AUDIT_LOG_PATH = node_path_1.default.join(DATA_DIR, 'mcp_creds_audit.log');
function ensureDataDir() {
    if (!node_fs_1.default.existsSync(DATA_DIR)) {
        node_fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function getCredsKey() {
    if (process.env.MCP_CREDS_KEY) {
        return Buffer.from(process.env.MCP_CREDS_KEY, 'base64');
    }
    if (!node_fs_1.default.existsSync(CREDS_KEY_PATH)) {
        ensureDataDir();
        const key = node_crypto_1.default.randomBytes(32);
        node_fs_1.default.writeFileSync(CREDS_KEY_PATH, key);
        return key;
    }
    return node_fs_1.default.readFileSync(CREDS_KEY_PATH);
}
function encrypt(text) {
    const key = getCredsKey();
    const iv = node_crypto_1.default.randomBytes(16);
    const cipher = node_crypto_1.default.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return `${iv.toString('base64')}:${encrypted}`;
}
function decrypt(data) {
    const key = getCredsKey();
    const parts = data.split(':');
    if (parts.length < 2) {
        throw new Error('Invalid encrypted data format');
    }
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts.slice(1).join(':');
    const decipher = node_crypto_1.default.createDecipheriv('aes-256-cbc', key, iv);
    let plain = decipher.update(encrypted, 'base64', 'utf8');
    plain += decipher.final('utf8');
    return plain;
}
function loadCredsStore() {
    if (!node_fs_1.default.existsSync(CREDS_STORE_PATH)) {
        return {};
    }
    try {
        return JSON.parse(node_fs_1.default.readFileSync(CREDS_STORE_PATH, 'utf8'));
    }
    catch {
        return {};
    }
}
function saveCredsStore(store) {
    ensureDataDir();
    node_fs_1.default.writeFileSync(CREDS_STORE_PATH, JSON.stringify(store, null, 2));
}
function auditLog(action, id, type) {
    try {
        ensureDataDir();
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            id,
            type,
            pid: process.pid,
        };
        node_fs_1.default.appendFileSync(AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`);
    }
    catch {
    }
}
function toRetrievedCredential(entry) {
    return {
        id: entry.id,
        type: entry.type,
        username: entry.username,
        url: entry.url,
        notes: entry.notes,
        createdAt: entry.createdAt,
        password: entry.password ? decrypt(entry.password) : undefined,
        apiKey: entry.apiKey ? decrypt(entry.apiKey) : undefined,
        sshKey: entry.sshKey ? decrypt(entry.sshKey) : undefined,
        oauthToken: entry.oauthToken ? decrypt(entry.oauthToken) : undefined,
        certificate: entry.certificate ? decrypt(entry.certificate) : undefined,
    };
}
function addCredential(input) {
    if (!input.id || !input.type) {
        throw new Error('id and type are required');
    }
    const store = loadCredsStore();
    if (store[input.id]) {
        throw new Error(`Credential '${input.id}' already exists. Use a different id.`);
    }
    const entry = {
        id: input.id,
        type: input.type,
        username: input.username,
        url: input.url,
        notes: input.notes,
        createdAt: new Date().toISOString(),
    };
    if (input.password) {
        entry.password = encrypt(input.password);
    }
    if (input.type === 'apiKey' && input.url) {
        entry.apiKey = encrypt(input.url);
    }
    store[input.id] = entry;
    saveCredsStore(store);
    auditLog('add', input.id, input.type);
    return {
        success: true,
        message: `Credential '${input.id}' added successfully.`,
        id: input.id,
        type: input.type,
    };
}
function getCredential(id) {
    const store = loadCredsStore();
    const credential = store[id];
    if (!credential) {
        throw new Error(`Credential '${id}' not found.`);
    }
    auditLog('get', id, credential.type);
    return toRetrievedCredential(credential);
}
function listCredentials(type) {
    const store = loadCredsStore();
    return {
        credentials: Object.values(store)
            .filter((credential) => !type || credential.type === type)
            .map((credential) => ({
            id: credential.id,
            type: credential.type,
            username: credential.username,
            url: credential.url,
            createdAt: credential.createdAt,
        })),
    };
}
function removeCredential(id) {
    const store = loadCredsStore();
    const credential = store[id];
    if (!credential) {
        throw new Error(`Credential '${id}' not found.`);
    }
    delete store[id];
    saveCredsStore(store);
    auditLog('remove', id, credential.type);
    return {
        success: true,
        message: `Credential '${id}' removed.`,
    };
}
function rotateKey() {
    const store = loadCredsStore();
    const oldKey = getCredsKey();
    const newKey = node_crypto_1.default.randomBytes(32);
    for (const credential of Object.values(store)) {
        for (const field of ['password', 'apiKey', 'sshKey', 'oauthToken', 'certificate']) {
            const value = credential[field];
            if (!value) {
                continue;
            }
            const parts = value.split(':');
            const iv = Buffer.from(parts[0], 'base64');
            const encrypted = parts.slice(1).join(':');
            const decipher = node_crypto_1.default.createDecipheriv('aes-256-cbc', oldKey, iv);
            let plain = decipher.update(encrypted, 'base64', 'utf8');
            plain += decipher.final('utf8');
            const nextIv = node_crypto_1.default.randomBytes(16);
            const cipher = node_crypto_1.default.createCipheriv('aes-256-cbc', newKey, nextIv);
            let nextEncrypted = cipher.update(plain, 'utf8', 'base64');
            nextEncrypted += cipher.final('base64');
            credential[field] = `${nextIv.toString('base64')}:${nextEncrypted}`;
        }
    }
    node_fs_1.default.writeFileSync(CREDS_KEY_PATH, newKey);
    saveCredsStore(store);
    auditLog('rotate', 'ALL', 'system');
    return {
        success: true,
        message: 'Encryption key rotated. All credentials re-encrypted.',
    };
}
//# sourceMappingURL=store.js.map