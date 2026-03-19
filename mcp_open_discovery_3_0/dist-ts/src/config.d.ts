export type TransportMode = 'stdio' | 'http' | 'amqp';
export interface OAuthConfig {
    enabled: boolean;
    realm: string;
    protectedEndpoints: string[];
    supportedScopes: string[];
    authorizationServer: string | null;
    introspectionEndpoint: string | null;
    clientId: string | null;
    clientSecret: string | null;
    resourceServerUri: string;
    tokenCacheTtl: number;
    requireHttps: boolean;
}
export interface AmqpRuntimeConfig {
    enabled: boolean;
    url: string;
    exchange: string;
    queuePrefix: string;
    prefetch: number;
    reconnectDelay: number;
    maxReconnectAttempts: number;
    messageTTL: number;
    queueTTL: number;
    autoRecoveryEnabled: boolean;
    recoveryRetryInterval: number;
    recoveryMaxRetries: number;
    recoveryBackoffMultiplier: number;
    recoveryMaxRetryInterval: number;
}
export interface AppConfig {
    nodeEnv: string;
    transportModes: TransportMode[];
    port: number;
    host: string;
    pluginsRoot: string;
    dataDir: string;
    logLevel: string;
    requireSignatures: boolean;
    allowRuntimeDependencies: boolean;
    strictCapabilities: boolean;
    strictIntegrity: boolean;
    oauth: OAuthConfig;
    amqp: AmqpRuntimeConfig;
}
//# sourceMappingURL=config.d.ts.map