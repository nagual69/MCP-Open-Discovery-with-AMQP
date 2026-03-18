import axios, { type AxiosInstance } from 'axios';

import type { MarketplaceListResponse, MarketplacePlugin, PluginUpdateAvailability } from '../../types';

export interface MarketplaceClientConfig {
  baseUrl: string;
  token: string | null;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split(/[-.]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[-.]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

export class MarketplaceClient {
  private readonly http: AxiosInstance;

  constructor(config: MarketplaceClientConfig) {
    this.http = axios.create({
      baseURL: normalizeBaseUrl(config.baseUrl),
      headers: config.token ? { Authorization: `Bearer ${config.token}` } : undefined,
    });
  }

  async listAvailable(): Promise<MarketplacePlugin[]> {
    const response = await this.http.get<MarketplaceListResponse | MarketplacePlugin[]>('/api/plugins/available');
    return Array.isArray(response.data) ? response.data : response.data.plugins;
  }

  async downloadPlugin(downloadUrl: string): Promise<Buffer> {
    const response = await this.http.get<ArrayBuffer>(downloadUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  async checkForUpdates(installedPlugins: Array<{ name: string; version: string }>): Promise<PluginUpdateAvailability[]> {
    const available = await this.listAvailable();
    const byName = new Map(available.map((plugin) => [plugin.name, plugin]));

    return installedPlugins.map((installed) => {
      const match = byName.get(installed.name);
      const latestVersion = match?.latestVersion ?? installed.version;
      return {
        plugin_name: installed.name,
        installed_version: installed.version,
        latest_version: latestVersion,
        update_available: match ? compareSemver(latestVersion, installed.version) > 0 : false,
        download_url: match?.downloadUrl ?? null,
      };
    });
  }
}