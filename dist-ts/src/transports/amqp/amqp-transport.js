"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAmqpRuntimeAdapter = void 0;
exports.startAmqpTransport = startAmqpTransport;
exports.getAmqpTransportStatus = getAmqpTransportStatus;
function log(level, message, data) {
    const rendered = data === undefined ? '' : ` ${JSON.stringify(data)}`;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [AMQP] ${message}${rendered}`;
    if (level === 'error') {
        console.error(line);
        return;
    }
    if (level === 'warn') {
        console.warn(line);
        return;
    }
    console.log(line);
}
function tryLoadLegacyAmqpModule() {
    try {
        return require('../../../tools/transports/amqp-transport-integration.js');
    }
    catch {
        return null;
    }
}
class LegacyAmqpRuntimeAdapter {
    legacyModule;
    constructor(legacyModule = tryLoadLegacyAmqpModule()) {
        this.legacyModule = legacyModule;
    }
    async start(server, config) {
        if (!this.legacyModule?.startAmqpServer) {
            return {
                mode: 'amqp',
                started: false,
                error: 'AMQP runtime adapter is not configured',
            };
        }
        if (this.legacyModule.initializeAmqpIntegration) {
            await this.legacyModule.initializeAmqpIntegration(log);
        }
        const result = await this.legacyModule.startAmqpServer(() => Promise.resolve(server), log, {
            amqpUrl: config.url,
            exchange: config.exchange,
            queuePrefix: config.queuePrefix,
            prefetchCount: config.prefetch,
        });
        const started = Boolean(result.success);
        return {
            mode: 'amqp',
            started,
            details: started ? 'AMQP transport started via legacy adapter' : undefined,
            error: started ? undefined : String(result.error ?? 'AMQP startup failed'),
        };
    }
    getStatus() {
        const status = this.legacyModule?.getAmqpStatus?.() ?? {};
        return {
            enabled: Boolean(status.transport ?? status.connected),
            connected: Boolean(status.connected),
            exchange: typeof status.exchangeName === 'string' ? status.exchangeName : undefined,
            queuePrefix: typeof status.queuePrefix === 'string' ? status.queuePrefix : undefined,
            error: typeof status.error === 'string' ? status.error : undefined,
        };
    }
}
exports.LegacyAmqpRuntimeAdapter = LegacyAmqpRuntimeAdapter;
async function startAmqpTransport(server, config, runtime = new LegacyAmqpRuntimeAdapter()) {
    if (!config.enabled) {
        return { mode: 'amqp', started: false, details: 'AMQP transport disabled' };
    }
    return runtime.start(server, config);
}
function getAmqpTransportStatus(runtime = new LegacyAmqpRuntimeAdapter()) {
    return runtime.getStatus?.() ?? { enabled: false, connected: false };
}
//# sourceMappingURL=amqp-transport.js.map