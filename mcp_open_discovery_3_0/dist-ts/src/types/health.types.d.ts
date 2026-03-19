import type { PluginRegistryStats } from './lifecycle.types';
export type AmqpRecoveryState = 'disabled' | 'idle' | 'waiting' | 'attempting' | 'stopped';
export interface AmqpRecoveryStatus {
    enabled: boolean;
    state: AmqpRecoveryState;
    retryCount: number;
    maxRetries?: number;
    retryIntervalMs?: number;
    maxRetryIntervalMs?: number;
    backoffMultiplier?: number;
    nextRetryAt?: string;
    lastAttemptAt?: string;
    lastError?: string;
}
export interface AmqpStatus {
    enabled: boolean;
    connected: boolean;
    exchange?: string;
    queuePrefix?: string;
    error?: string;
    recovery?: AmqpRecoveryStatus;
}
export interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    registry: PluginRegistryStats;
    uptime: number;
    timestamp: string;
    oauth: {
        enabled: boolean;
        realm: string;
        protectedEndpoints: string[];
    };
    amqp?: AmqpStatus;
}
//# sourceMappingURL=health.types.d.ts.map