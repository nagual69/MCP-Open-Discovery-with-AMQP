import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type {
  AddCredentialInput,
  AddCredentialResult,
  CredentialStore,
  CredentialType,
  ListCredentialsResult,
  RemoveCredentialResult,
  RetrievedCredential,
  RotateKeyResult,
  StoredCredentialEntry,
} from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CREDS_STORE_PATH = path.join(DATA_DIR, 'mcp_creds_store.json');
const CREDS_KEY_PATH = path.join(DATA_DIR, 'mcp_creds_key');
const AUDIT_LOG_PATH = path.join(DATA_DIR, 'mcp_creds_audit.log');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getCredsKey(): Buffer {
  if (process.env.MCP_CREDS_KEY) {
    return Buffer.from(process.env.MCP_CREDS_KEY, 'base64');
  }

  if (!fs.existsSync(CREDS_KEY_PATH)) {
    ensureDataDir();
    const key = crypto.randomBytes(32);
    fs.writeFileSync(CREDS_KEY_PATH, key);
    return key;
  }

  return fs.readFileSync(CREDS_KEY_PATH);
}

function encrypt(text: string): string {
  const key = getCredsKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `${iv.toString('base64')}:${encrypted}`;
}

function decrypt(data: string): string {
  const key = getCredsKey();
  const parts = data.split(':');
  if (parts.length < 2) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const encrypted = parts.slice(1).join(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let plain = decipher.update(encrypted, 'base64', 'utf8');
  plain += decipher.final('utf8');
  return plain;
}

function loadCredsStore(): CredentialStore {
  if (!fs.existsSync(CREDS_STORE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(CREDS_STORE_PATH, 'utf8')) as CredentialStore;
  } catch {
    return {};
  }
}

function saveCredsStore(store: CredentialStore): void {
  ensureDataDir();
  fs.writeFileSync(CREDS_STORE_PATH, JSON.stringify(store, null, 2));
}

function auditLog(action: string, id: string, type: CredentialType | 'system'): void {
  try {
    ensureDataDir();
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      id,
      type,
      pid: process.pid,
    };
    fs.appendFileSync(AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch {
  }
}

function toRetrievedCredential(entry: StoredCredentialEntry): RetrievedCredential {
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

export function addCredential(input: AddCredentialInput): AddCredentialResult {
  if (!input.id || !input.type) {
    throw new Error('id and type are required');
  }

  const store = loadCredsStore();
  if (store[input.id]) {
    throw new Error(`Credential '${input.id}' already exists. Use a different id.`);
  }

  const entry: StoredCredentialEntry = {
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

export function getCredential(id: string): RetrievedCredential {
  const store = loadCredsStore();
  const credential = store[id];
  if (!credential) {
    throw new Error(`Credential '${id}' not found.`);
  }

  auditLog('get', id, credential.type);
  return toRetrievedCredential(credential);
}

export function listCredentials(type?: CredentialType): ListCredentialsResult {
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

export function removeCredential(id: string): RemoveCredentialResult {
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

export function rotateKey(): RotateKeyResult {
  const store = loadCredsStore();
  const oldKey = getCredsKey();
  const newKey = crypto.randomBytes(32);

  for (const credential of Object.values(store)) {
    for (const field of ['password', 'apiKey', 'sshKey', 'oauthToken', 'certificate'] as const) {
      const value = credential[field];
      if (!value) {
        continue;
      }

      const parts = value.split(':');
      const iv = Buffer.from(parts[0], 'base64');
      const encrypted = parts.slice(1).join(':');
      const decipher = crypto.createDecipheriv('aes-256-cbc', oldKey, iv);
      let plain = decipher.update(encrypted, 'base64', 'utf8');
      plain += decipher.final('utf8');

      const nextIv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', newKey, nextIv);
      let nextEncrypted = cipher.update(plain, 'utf8', 'base64');
      nextEncrypted += cipher.final('base64');
      credential[field] = `${nextIv.toString('base64')}:${nextEncrypted}`;
    }
  }

  fs.writeFileSync(CREDS_KEY_PATH, newKey);
  saveCredsStore(store);
  auditLog('rotate', 'ALL', 'system');
  return {
    success: true,
    message: 'Encryption key rotated. All credentials re-encrypted.',
  };
}