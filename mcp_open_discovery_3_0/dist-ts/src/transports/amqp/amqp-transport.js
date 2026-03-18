"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAmqpTransport = startAmqpTransport;
exports.getAmqpTransportStatus = getAmqpTransportStatus;
const amqp_server_transport_1 = require("./amqp-server-transport");
async function startAmqpTransport(server, config, runtime = new amqp_server_transport_1.NativeAmqpRuntimeAdapter()) {
    if (!config.enabled) {
        return { mode: 'amqp', started: false, details: 'AMQP transport disabled' };
    }
    return runtime.start(server, config);
}
function getAmqpTransportStatus(runtime = new amqp_server_transport_1.NativeAmqpRuntimeAdapter()) {
    return runtime.getStatus?.() ?? { enabled: false, connected: false };
}
//# sourceMappingURL=amqp-transport.js.map