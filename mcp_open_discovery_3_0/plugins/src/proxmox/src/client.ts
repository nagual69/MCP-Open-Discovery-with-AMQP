import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { URL } from 'node:url';

import type {
  CredentialStore,
  ProxmoxApiEnvelope,
  ProxmoxCredentials,
  ProxmoxTicket,
  RetrievedCredential,
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

function decrypt(value: string): string {
  const parts = value.split(':');
  const ivPart = parts[0];
  if (parts.length < 2 || !ivPart) {
    throw new Error('Invalid encrypted credential format');
  }

  const key = getCredsKey();
  const iv = Buffer.from(ivPart, 'base64');
  const encrypted = parts.slice(1).join(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let plainText = decipher.update(encrypted, 'base64', 'utf8');
  plainText += decipher.final('utf8');
  return plainText;
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

function auditLog(action: string, id: string, type: string): void {
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

function getCredential(id: string): RetrievedCredential {
  const store = loadCredsStore();
  const entry = store[id];
  if (!entry) {
    throw new Error(`Credential '${id}' not found.`);
  }

  auditLog('get', id, entry.type);
  const credential: RetrievedCredential = {
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

function listCredentials(): RetrievedCredential[] {
  const store = loadCredsStore();
  return Object.entries(store).map(([id, entry]) => ({
    ...entry,
    id,
  }));
}

function getRealm(notes?: string): string {
  if (!notes) {
    return 'pam';
  }

  const realmMatch = notes.match(/realm:([^,]+)/i);
  return realmMatch?.[1]?.trim() || 'pam';
}

function getVerifySsl(notes?: string): boolean {
  return !notes?.toLowerCase().includes('verify_ssl:false');
}

function resolveProxmoxCredentials(credentialId: string): ProxmoxCredentials {
  const credential = getCredential(credentialId);
  if (credential.type !== 'password') {
    throw new Error(`Credential '${credentialId}' is not a password-type credential.`);
  }

  let hostname: string | undefined;
  let port = 8006;

  if (credential.url) {
    const url = new URL(credential.url);
    hostname = url.hostname;
    port = url.port ? Number.parseInt(url.port, 10) : 8006;
  } else if (credential.customField1) {
    hostname = credential.customField1;
    port = credential.customField2 ? Number.parseInt(credential.customField2, 10) : 8006;
  }

  if (!hostname) {
    throw new Error(`Credential '${credentialId}' is missing a Proxmox hostname or URL.`);
  }

  const result: ProxmoxCredentials = {
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

function resolveDefaultCredentialId(): string {
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

async function fetchProxmoxTicket(credentials: ProxmoxCredentials): Promise<ProxmoxTicket> {
  return new Promise((resolve, reject) => {
    const username = `${credentials.username ?? ''}@${credentials.realm}`;
    const password = credentials.password ?? '';
    const postData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    const request = https.request(
      {
        hostname: credentials.hostname,
        port: credentials.port,
        path: '/api2/json/access/ticket',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
        rejectUnauthorized: credentials.verify_ssl,
      },
      (response) => {
        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        response.on('end', () => {
          try {
            const payload = JSON.parse(body) as ProxmoxApiEnvelope<ProxmoxTicket>;
            if (!payload.data?.ticket) {
              reject(new Error('Authentication failed: invalid Proxmox ticket response'));
              return;
            }

            resolve(payload.data);
          } catch (error) {
            reject(new Error(error instanceof Error ? error.message : 'Failed to parse Proxmox auth response'));
          }
        });
      },
    );

    request.on('error', (error: Error) => {
      reject(new Error(`Auth request failed: ${error.message}`));
    });
    request.write(postData);
    request.end();
  });
}

export async function proxmoxApiRequest<T>(endpoint: string, credsId?: string): Promise<T> {
  const credentialId = credsId || resolveDefaultCredentialId();
  const credentials = resolveProxmoxCredentials(credentialId);
  const ticket = await fetchProxmoxTicket(credentials);

  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, `https://${credentials.hostname}:${credentials.port}`);
    const request = https.request(
      {
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
      },
      (response) => {
        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        response.on('end', () => {
          try {
            const payload = JSON.parse(body) as ProxmoxApiEnvelope<T>;
            if (payload.errors?.length) {
              reject(new Error(`Proxmox API error: ${payload.errors.join(', ')}`));
              return;
            }

            resolve((payload.data ?? payload) as T);
          } catch (error) {
            reject(new Error(error instanceof Error ? error.message : 'Failed to parse Proxmox API response'));
          }
        });
      },
    );

    request.on('error', (error: Error) => {
      reject(new Error(`Proxmox API request failed: ${error.message}`));
    });
    request.end();
  });
}