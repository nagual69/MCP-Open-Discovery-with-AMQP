"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketplaceClient = void 0;
const axios_1 = __importDefault(require("axios"));
function normalizeBaseUrl(baseUrl) {
    return baseUrl.replace(/\/+$/, '');
}
function compareSemver(left, right) {
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
class MarketplaceClient {
    http;
    constructor(config) {
        this.http = axios_1.default.create({
            baseURL: normalizeBaseUrl(config.baseUrl),
            headers: config.token ? { Authorization: `Bearer ${config.token}` } : undefined,
        });
    }
    async listAvailable() {
        const response = await this.http.get('/api/plugins/available');
        return Array.isArray(response.data) ? response.data : response.data.plugins;
    }
    async downloadPlugin(downloadUrl) {
        const response = await this.http.get(downloadUrl, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    }
    async checkForUpdates(installedPlugins) {
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
exports.MarketplaceClient = MarketplaceClient;
//# sourceMappingURL=marketplace-client.js.map