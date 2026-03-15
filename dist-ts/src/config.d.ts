export type TransportMode = 'stdio' | 'http' | 'amqp';
export interface OAuthConfig {
    enabled: boolean;
    realm: string;
    protectedEndpoints: string[];
}
export interface AppConfig {
    nodeEnv: string;
    transportModes: TransportMode[];
    port: number;
    host: string;
    pluginsRoot: string;
    dataDir: string;
    requireSignatures: boolean;
    allowRuntimeDependencies: boolean;
    strictCapabilities: boolean;
    strictIntegrity: boolean;
    oauth: OAuthConfig;
}
//# sourceMappingURL=config.d.ts.map