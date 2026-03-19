import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandler } from 'express';

import { clearManagedTransports, setManagedTransports } from '../../runtime/transport-state';
import type {
  AmqpStatus,
  AmqpTransportConfig,
  HealthResponse,
  HttpTransportConfig,
  TransportManagerResult,
  TransportMode,
  TransportStartResult,
} from '../../types';
import type { AppConfig } from '../../config';
import { createLogger } from '../../utils';
import { getStats } from '../../plugins/plugin-registry';
import { getAmqpTransportStatus, startAmqpTransport, type AmqpTransportRuntime } from '../amqp/amqp-transport';
import { NativeAmqpRuntimeAdapter } from '../amqp/amqp-server-transport';
import {
  startStreamableHttpTransport,
  stopStreamableHttpTransport,
  type HttpTransportRuntime,
} from './streamable-http-transport';

const logger = createLogger('TRANSPORT_MANAGER');

export interface EnvironmentInfo {
  isContainer: boolean;
  isInteractive: boolean;
  nodeEnv: string;
  transportMode?: string;
}

export interface ManagedTransports {
  stdioTransport?: StdioServerTransport;
  http?: HttpTransportRuntime;
  amqpRuntime?: AmqpTransportRuntime;
  startedModes: TransportMode[];
}

export interface StartTransportOptions {
  oauthMiddleware?: ((options: { requiredScope: string; skipPaths: string[] }) => RequestHandler) | null;
  protectedResourceMetadataHandler?: RequestHandler | null;
  amqpRuntime?: AmqpTransportRuntime;
}

function detectEnvironment(): EnvironmentInfo {
  const isContainer = Boolean(process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST || process.env.container);
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return {
    isContainer,
    isInteractive,
    nodeEnv: process.env.NODE_ENV || 'development',
    transportMode: process.env.TRANSPORT_MODE,
  };
}

export function determineEnabledTransports(config: Pick<AppConfig, 'transportModes'>, environment = detectEnvironment()): TransportMode[] {
  if (config.transportModes.length > 0) {
    return config.transportModes;
  }
  if (environment.transportMode) {
    return environment.transportMode
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry): entry is TransportMode => entry === 'stdio' || entry === 'http' || entry === 'amqp');
  }
  if (environment.isContainer) {
    return ['http', 'amqp'];
  }
  if (environment.isInteractive) {
    return ['stdio'];
  }
  return ['stdio', 'http'];
}

function buildHealthResponse(config: AppConfig, amqpStatus?: AmqpStatus): HealthResponse {
  return {
    status: 'healthy',
    version: '2.0.0',
    registry: getStats(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    oauth: config.oauth,
    amqp: amqpStatus,
  };
}

function createHttpConfig(config: AppConfig): HttpTransportConfig {
  return {
    enabled: true,
    mode: 'http',
    host: config.host,
    port: config.port,
    healthPath: '/health',
    mcpPath: '/mcp',
    oauthEnabled: config.oauth.enabled,
  };
}

function createAmqpConfig(config: AppConfig): AmqpTransportConfig {
  return {
    enabled: config.amqp.enabled,
    mode: 'amqp',
    url: config.amqp.url,
    exchange: config.amqp.exchange,
    queuePrefix: config.amqp.queuePrefix,
    prefetch: config.amqp.prefetch,
    reconnectDelay: config.amqp.reconnectDelay,
    maxReconnectAttempts: config.amqp.maxReconnectAttempts,
    messageTTL: config.amqp.messageTTL,
    queueTTL: config.amqp.queueTTL,
    autoRecoveryEnabled: config.amqp.autoRecoveryEnabled,
    recoveryRetryInterval: config.amqp.recoveryRetryInterval,
    recoveryMaxRetries: config.amqp.recoveryMaxRetries,
    recoveryBackoffMultiplier: config.amqp.recoveryBackoffMultiplier,
    recoveryMaxRetryInterval: config.amqp.recoveryMaxRetryInterval,
  };
}

export async function startConfiguredTransports(
  server: McpServer,
  config: AppConfig,
  options: StartTransportOptions = {},
): Promise<{ results: TransportManagerResult; managed: ManagedTransports }> {
  const enabled = determineEnabledTransports(config);
  const results: TransportStartResult[] = [];
  const managed: ManagedTransports = {
    amqpRuntime: options.amqpRuntime ?? new NativeAmqpRuntimeAdapter(),
    startedModes: [],
  };

  for (const mode of enabled) {
    if (mode === 'stdio') {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      managed.stdioTransport = transport;
      results.push({ mode: 'stdio', started: true, details: 'Stdio transport connected' });
      managed.startedModes.push('stdio');
      continue;
    }

    if (mode === 'http') {
      const http = await startStreamableHttpTransport(server, createHttpConfig(config), {
        oauthMiddleware: options.oauthMiddleware ?? null,
        protectedResourceMetadataHandler: options.protectedResourceMetadataHandler ?? null,
        authorizationServer: config.oauth.authorizationServer,
        getHealthResponse: () => buildHealthResponse(config, getAmqpTransportStatus(managed.amqpRuntime)),
      });
      managed.http = http.runtime;
      results.push(http.result);
      managed.startedModes.push('http');
      continue;
    }

    if (mode === 'amqp') {
      const amqpResult = await startAmqpTransport(server, createAmqpConfig(config), managed.amqpRuntime);
      results.push(amqpResult);
      if (amqpResult.started) {
        managed.startedModes.push('amqp');
      }
    }
  }

  setManagedTransports(managed);

  logger.info('Transport startup complete', {
    enabled,
    started: results.filter((result) => result.started).map((result) => result.mode),
    failed: results.filter((result) => !result.started).map((result) => ({ mode: result.mode, error: result.error })),
  });

  return { results: { transports: results }, managed };
}

export async function stopConfiguredTransports(managed: ManagedTransports): Promise<void> {
  if (managed.http) {
    await stopStreamableHttpTransport(managed.http);
  }
  if (managed.amqpRuntime?.stop) {
    await managed.amqpRuntime.stop();
  }
  clearManagedTransports();
}

export function getTransportStatus(config: AppConfig, managed: ManagedTransports = { startedModes: [] }): {
  environment: EnvironmentInfo;
  health: HealthResponse;
  active: TransportMode[];
} {
  const environment = detectEnvironment();
  const active = [...new Set(managed.startedModes ?? [])];

  return {
    environment,
    health: buildHealthResponse(config, getAmqpTransportStatus(managed.amqpRuntime)),
    active,
  };
}