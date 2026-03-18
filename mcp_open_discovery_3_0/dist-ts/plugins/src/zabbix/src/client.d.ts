import type { ZabbixClientConfig } from './types';
type UnknownRecord = Record<string, unknown>;
declare class ZabbixApiClient {
    private readonly baseUrl;
    private readonly username;
    private readonly password;
    private sessionId;
    constructor(config: ZabbixClientConfig);
    authenticate(): Promise<void>;
    apiRequest<T>(method: string, params?: UnknownRecord): Promise<T>;
    private buildRequest;
    private post;
}
export declare function resolveZabbixConfig(args: UnknownRecord): ZabbixClientConfig;
export declare function getZabbixClient(config: ZabbixClientConfig): ZabbixApiClient;
export declare function parseTimeString(value?: string): number | undefined;
export {};
//# sourceMappingURL=client.d.ts.map