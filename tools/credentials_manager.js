// tools/credentials_manager.js
// Generic encrypted credentials manager for MCP Open Discovery
// Supports multiple credential types (Proxmox, SNMP, etc.)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CREDS_STORE_PATH = path.join(process.cwd(), 'data', 'mcp_creds_store.json');
const CREDS_KEY_PATH = path.join(process.cwd(), 'data', 'mcp_creds_key');
// Credential types supported: password, apiKey, sshKey, oauthToken, certificate, custom
// Each credential can have arbitrary fields (e.g., username, url, etc.)
// Audit log support
const AUDIT_LOG_PATH = path.join(process.cwd(), 'data', 'mcp_creds_audit.log');

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function auditLog(action, id, type) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    id,
    type,
    user: process.env.USER || process.env.USERNAME || 'unknown',
    pid: process.pid
  };
  fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
}

function addCredential(id, type, data) {
  const store = loadCredsStore();
  store[id] = {
    type,
    ...data,
    password: data.password ? encrypt(data.password) : undefined,
    apiKey: data.apiKey ? encrypt(data.apiKey) : undefined,
    sshKey: data.sshKey ? encrypt(data.sshKey) : undefined,
    oauthToken: data.oauthToken ? encrypt(data.oauthToken) : undefined,
    certificate: data.certificate ? encrypt(data.certificate) : undefined,
  };
  saveCredsStore(store);
  auditLog('add', id, type);
}

function getCredential(id) {
  const store = loadCredsStore();
  if (!store[id]) throw new Error('Credential not found');
  const c = store[id];
  auditLog('get', id, c.type);
  return {
    ...c,
    password: c.password ? decrypt(c.password) : undefined,
    apiKey: c.apiKey ? decrypt(c.apiKey) : undefined,
    sshKey: c.sshKey ? decrypt(c.sshKey) : undefined,
    oauthToken: c.oauthToken ? decrypt(c.oauthToken) : undefined,
    certificate: c.certificate ? decrypt(c.certificate) : undefined,
  };
}

function listCredentials(type) {
  const store = loadCredsStore();
  return Object.entries(store)
    .filter(([_, c]) => !type || c.type === type)
    .map(([id, c]) => ({ id, type: c.type, username: c.username, url: c.url }));
}

function removeCredential(id) {
  const store = loadCredsStore();
  const type = store[id] ? store[id].type : undefined;
  delete store[id];
  saveCredsStore(store);
  auditLog('remove', id, type);
}

function rotateKey(newKey) {
  // Re-encrypt all credentials with a new key
  if (!newKey) newKey = crypto.randomBytes(32);
  const store = loadCredsStore();
  const oldKey = getCredsKey(); // Get old key first
  
  // Helper function to decrypt with old key
  function decryptWithOldKey(data) {
    const [ivB64, encrypted] = data.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', oldKey, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
  
  // Helper function to encrypt with new key
  function encryptWithNewKey(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', newKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return iv.toString('base64') + ':' + encrypted;
  }
  
  // Re-encrypt all credentials
  for (const id in store) {
    const c = store[id];
    try {
      // Decrypt with old key, re-encrypt with new key
      if (c.password) c.password = encryptWithNewKey(decryptWithOldKey(c.password));
      if (c.apiKey) c.apiKey = encryptWithNewKey(decryptWithOldKey(c.apiKey));
      if (c.sshKey) c.sshKey = encryptWithNewKey(decryptWithOldKey(c.sshKey));
      if (c.oauthToken) c.oauthToken = encryptWithNewKey(decryptWithOldKey(c.oauthToken));
      if (c.certificate) c.certificate = encryptWithNewKey(decryptWithOldKey(c.certificate));
    } catch (error) {
      console.error(`Failed to re-encrypt credential ${id}:`, error.message);
      throw error;
    }
  }
  
  // Only write new key after successful re-encryption
  fs.writeFileSync(CREDS_KEY_PATH, newKey);
  saveCredsStore(store);
  auditLog('rotateKey', 'ALL', 'all');
}

// Accept encryption key via env var or file
function getCredsKey() {
  if (process.env.MCP_CREDS_KEY) {
    return Buffer.from(process.env.MCP_CREDS_KEY, 'base64');
  }
  if (!fs.existsSync(CREDS_KEY_PATH)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(CREDS_KEY_PATH, key);
    return key;
  }
  return fs.readFileSync(CREDS_KEY_PATH);
}

function encrypt(text) {
  const key = getCredsKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decrypt(data) {
  const key = getCredsKey();
  const [ivB64, encrypted] = data.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function loadCredsStore() {
  if (!fs.existsSync(CREDS_STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CREDS_STORE_PATH, 'utf-8'));
}

function saveCredsStore(store) {
  fs.writeFileSync(CREDS_STORE_PATH, JSON.stringify(store, null, 2));
}

module.exports = {
  addCredential,
  getCredential,
  listCredentials,
  removeCredential,
  rotateKey,
  auditLog,
};
