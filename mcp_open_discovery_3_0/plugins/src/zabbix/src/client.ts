import type { JsonRpcRequest, JsonRpcResponse, ZabbixClientConfig } from './types';

const clients = new Map<string, ZabbixApiClient>();

type UnknownRecord = Record<string, unknown>;

class ZabbixApiClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private sessionId: string | null = null;

  constructor(config: ZabbixClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.username = config.username;
    this.password = config.password;
  }

  async authenticate(): Promise<void> {
    const payload: JsonRpcRequest<UnknownRecord> = {
      jsonrpc: '2.0',
      method: 'user.login',
      params: {
        username: this.username,
        password: this.password,
      },
      id: 1,
    };
    const data = await this.post<string>(payload);
    if (!data) {
      throw new Error('Zabbix authentication failed: missing session ID');
    }
    this.sessionId = data;
  }

  async apiRequest<T>(method: string, params: UnknownRecord = {}): Promise<T> {
    if (!this.sessionId) {
      await this.authenticate();
    }

    try {
      return await this.post<T>(this.buildRequest(method, params));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Session') || message.includes('-32602')) {
        this.sessionId = null;
        await this.authenticate();
        return this.post<T>(this.buildRequest(method, params));
      }
      throw error;
    }
  }

  private buildRequest(method: string, params: UnknownRecord): JsonRpcRequest<UnknownRecord> {
    const payload: JsonRpcRequest<UnknownRecord> = {
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now(),
      };

    if (this.sessionId) {
      payload.auth = this.sessionId;
    }

    return payload;
  }

  private async post<T>(payload: JsonRpcRequest<UnknownRecord>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api_jsonrpc.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json-rpc' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Zabbix HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JsonRpcResponse<T>;
    if (data.error) {
      throw new Error(`Zabbix API error: ${data.error.message}`);
    }
    if (typeof data.result === 'undefined') {
      throw new Error('Zabbix API returned no result');
    }

    return data.result;
  }
}

export function resolveZabbixConfig(args: UnknownRecord): ZabbixClientConfig {
  return {
    baseUrl: typeof args.baseUrl === 'string' && args.baseUrl ? args.baseUrl : process.env.ZABBIX_BASE_URL || 'http://localhost:8080',
    username: typeof args.username === 'string' && args.username ? args.username : process.env.ZABBIX_USERNAME || 'Admin',
    password: typeof args.password === 'string' && args.password ? args.password : process.env.ZABBIX_PASSWORD || 'zabbix',
  };
}

export function getZabbixClient(config: ZabbixClientConfig): ZabbixApiClient {
  const key = `${config.baseUrl}:${config.username}:${config.password}`;
  let client = clients.get(key);
  if (!client) {
    client = new ZabbixApiClient(config);
    clients.set(key, client);
  }
  return client;
}

export function parseTimeString(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const relative = value.match(/^(\d+)([hdwmy])$/);
  if (relative) {
    const magnitude = Number.parseInt(relative[1] ?? '0', 10);
    const unit = relative[2];
    const multipliers: Record<string, number> = { h: 3600, d: 86400, w: 604800, m: 2592000, y: 31536000 };
    if (!unit) {
      return Math.floor(Date.now() / 1000) - 3600;
    }
    return Math.floor(Date.now() / 1000) - (magnitude * (multipliers[unit] ?? 3600));
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) - 3600 : Math.floor(parsed / 1000);
}