import type { PluginRegistryStats } from './lifecycle.types';
export interface AmqpStatus {
    enabled: boolean;
    connected: boolean;
    exchange?: string;
    queuePrefix?: string;
    error?: string;
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
