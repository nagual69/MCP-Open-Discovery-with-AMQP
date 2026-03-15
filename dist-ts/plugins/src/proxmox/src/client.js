"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxmoxApiRequest = proxmoxApiRequest;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_https_1 = __importDefault(require("node:https"));
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
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
function decrypt(value) {
    const parts = value.split(':');
    const ivPart = parts[0];
    if (parts.length < 2 || !ivPart) {
        throw new Error('Invalid encrypted credential format');
    }
    const key = getCredsKey();
    const iv = Buffer.from(ivPart, 'base64');
    const encrypted = parts.slice(1).join(':');
    const decipher = node_crypto_1.default.createDecipheriv('aes-256-cbc', key, iv);
    let plainText = decipher.update(encrypted, 'base64', 'utf8');
    plainText += decipher.final('utf8');
    return plainText;
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
function getCredential(id) {
    const store = loadCredsStore();
    const entry = store[id];
    if (!entry) {
        throw new Error(`Credential '${id}' not found.`);
    }
    auditLog('get', id, entry.type);
    const credential = {
        ...entry,
        id,
    };
    if (entry.password) {
        credential.password = decrypt(entry.password);
    }
    if (entry.apiKey) {
        credential.apiKey = decrypt(entry.apiKey);
    }
    if (entry.sshKey) {
        credential.sshKey = decrypt(entry.sshKey);
    }
    if (entry.oauthToken) {
        credential.oauthToken = decrypt(entry.oauthToken);
    }
    if (entry.certificate) {
        credential.certificate = decrypt(entry.certificate);
    }
    return credential;
}
function listCredentials() {
    const store = loadCredsStore();
    return Object.entries(store).map(([id, entry]) => ({
        ...entry,
        id,
    }));
}
function getRealm(notes) {
    if (!notes) {
        return 'pam';
    }
    const realmMatch = notes.match(/realm:([^,]+)/i);
    return realmMatch?.[1]?.trim() || 'pam';
}
function getVerifySsl(notes) {
    return !notes?.toLowerCase().includes('verify_ssl:false');
}
function resolveProxmoxCredentials(credentialId) {
    const credential = getCredential(credentialId);
    if (credential.type !== 'password') {
        throw new Error(`Credential '${credentialId}' is not a password-type credential.`);
    }
    let hostname;
    let port = 8006;
    if (credential.url) {
        const url = new node_url_1.URL(credential.url);
        hostname = url.hostname;
        port = url.port ? Number.parseInt(url.port, 10) : 8006;
    }
    else if (credential.customField1) {
        hostname = credential.customField1;
        port = credential.customField2 ? Number.parseInt(credential.customField2, 10) : 8006;
    }
    if (!hostname) {
        throw new Error(`Credential '${credentialId}' is missing a Proxmox hostname or URL.`);
    }
    const result = {
        hostname,
        port,
        realm: getRealm(credential.notes),
        verify_ssl: getVerifySsl(credential.notes),
    };
    if (credential.username) {
        result.username = credential.username;
    }
    if (credential.password) {
        result.password = credential.password;
    }
    return result;
}
function resolveDefaultCredentialId() {
    const candidates = listCredentials().filter((credential) => {
        if (credential.type !== 'password') {
            return false;
        }
        const matchesUrl = credential.url?.includes(':8006') ?? false;
        const matchesNotes = credential.notes?.toLowerCase().includes('proxmox') ?? false;
        const matchesId = credential.id.toLowerCase().includes('proxmox');
        return matchesUrl || matchesNotes || matchesId;
    });
    const firstCandidate = candidates[0];
    if (!firstCandidate) {
        throw new Error('No Proxmox credentials found. Use credentials_add with type="password" and url="https://hostname:8006".');
    }
    return firstCandidate.id;
}
async function fetchProxmoxTicket(credentials) {
    return new Promise((resolve, reject) => {
        const username = `${credentials.username ?? ''}@${credentials.realm}`;
        const password = credentials.password ?? '';
        const postData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const request = node_https_1.default.request({
            hostname: credentials.hostname,
            port: credentials.port,
            path: '/api2/json/access/ticket',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
            rejectUnauthorized: credentials.verify_ssl,
        }, (response) => {
            let body = '';
            response.on('data', (chunk) => {
                body += chunk.toString();
            });
            response.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    if (!payload.data?.ticket) {
                        reject(new Error('Authentication failed: invalid Proxmox ticket response'));
                        return;
                    }
                    resolve(payload.data);
                }
                catch (error) {
                    reject(new Error(error instanceof Error ? error.message : 'Failed to parse Proxmox auth response'));
                }
            });
        });
        request.on('error', (error) => {
            reject(new Error(`Auth request failed: ${error.message}`));
        });
        request.write(postData);
        request.end();
    });
}
async function proxmoxApiRequest(endpoint, credsId) {
    const credentialId = credsId || resolveDefaultCredentialId();
    const credentials = resolveProxmoxCredentials(credentialId);
    const ticket = await fetchProxmoxTicket(credentials);
    return new Promise((resolve, reject) => {
        const url = new node_url_1.URL(endpoint, `https://${credentials.hostname}:${credentials.port}`);
        const request = node_https_1.default.request({
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: `PVEAuthCookie=${ticket.ticket}`,
                CSRFPreventionToken: ticket.CSRFPreventionToken ?? '',
            },
            rejectUnauthorized: credentials.verify_ssl,
        }, (response) => {
            let body = '';
            response.on('data', (chunk) => {
                body += chunk.toString();
            });
            response.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    if (payload.errors?.length) {
                        reject(new Error(`Proxmox API error: ${payload.errors.join(', ')}`));
                        return;
                    }
                    resolve((payload.data ?? payload));
                }
                catch (error) {
                    reject(new Error(error instanceof Error ? error.message : 'Failed to parse Proxmox API response'));
                }
            });
        });
        request.on('error', (error) => {
            reject(new Error(`Proxmox API request failed: ${error.message}`));
        });
        request.end();
    });
}
//# sourceMappingURL=client.js.map