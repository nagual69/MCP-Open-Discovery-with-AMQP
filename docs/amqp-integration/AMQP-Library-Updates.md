
Guidance: Bringing MCP Open Discovery Into Compliance

The MCP Open Discovery project (the original consumer of this transport) needs the following changes to work with the refactored library:

1. Remove AMQPMessage Envelope Usage
Find: Any code that constructs or expects { message, timestamp, type, correlationId } envelope objects.

Replace: Send/receive raw JSON-RPC messages directly. The transport now handles correlationId and replyTo via AMQP message properties automatically.

// BEFORE (Open Discovery code):
const envelope: AMQPMessage = {
    message: jsonRpcMessage,
    timestamp: Date.now(),
    type: 'request',
    correlationId: '...'
};
channel.publish(exchange, key, Buffer.from(JSON.stringify(envelope)));

// AFTER:
// Just use the transport's send() method — it handles everything:
await transport.send(jsonRpcMessage);

2. Supply a Custom routingKeyStrategy for Tool Categories
The hardcoded getToolCategory() function (nmap_, snmp_, proxmox_, etc.) has been removed from the transport. Move this logic into Open Discovery and pass it as a configuration option:

// In Open Discovery project — define your category routing:
function openDiscoveryRoutingStrategy(method: string, messageType: 'request' | 'notification'): string {
    const category = getToolCategory(method); // your existing function
    const normalised = method.replace(/\//g, '.');
    return `mcp.${messageType}.${category}.${normalised}`;
}

function getToolCategory(method: string): string {
    if (method.startsWith('nmap_'))     return 'nmap';
    if (method.startsWith('snmp_'))     return 'snmp';
    if (method.startsWith('proxmox_'))  return 'proxmox';
    if (method.startsWith('zabbix_'))   return 'zabbix';
    // ... etc.
    return 'general';
}

// Pass to transport:
const transport = new AMQPServerTransport({
    amqpUrl: process.env.AMQP_URL || 'amqp://localhost:5672',
    queuePrefix: 'mcp.discovery',
    exchangeName: 'mcp.discovery',
    routingKeyStrategy: openDiscoveryRoutingStrategy,  // <-- inject here
});

3. Move parseTransportMode() into Open Discovery
This function parsed stdio | http | amqp mode strings — it's application orchestration logic, not transport logic. Copy it from the old amqp-utils.ts into the Open Discovery codebase:

// In Open Discovery:
export function parseTransportMode(input: string): 'stdio' | 'sse' | 'amqp' {
    const lower = input.toLowerCase().trim();
    if (lower === 'stdio') return 'stdio';
    if (lower === 'http' || lower === 'sse') return 'sse';
    if (lower === 'amqp' || lower === 'rabbitmq') return 'amqp';
    return 'stdio';
}

4. Stop Intercepting onmessage
If Open Discovery wraps the transport's onmessage for debug timing or tracking, that pattern is now incompatible. The SDK's Protocol class chains onmessage during connect() and expects to own it directly.

Instead: Use an MCP SDK-level middleware or post-connect hook for debugging:

// BEFORE (fragile — breaks SDK chaining):
transport.onmessage = (msg) => { console.time('process'); originalHandler(msg); console.timeEnd('process'); };

// AFTER (safe — works with SDK):
const server = new Server(...);
await server.connect(transport);
// The SDK now owns onmessage. Hook into SDK-level handlers for tracking.

5. Update Queue Binding Patterns
If Open Discovery binds additional queues to the exchange, the routing key format has changed:

Before	After
notifications.{method}	mcp.notification.{method}
mcp.request.nmap.nmap_scan	mcp.request.nmap_scan (default) or mcp.request.nmap.nmap_scan (with custom strategy)
mcp.notification.nmap	mcp.notification.nmap_scan (default)
Update any bindQueue() patterns accordingly, or supply a routingKeyStrategy that reproduces the old format.

6. Replace DEFAULT_AMQP_CONFIG Import
// BEFORE:
import { DEFAULT_AMQP_CONFIG } from 'amqp-mcp-transport';
const url = DEFAULT_AMQP_CONFIG.AMQP_URL;

// AFTER:
import { getDefaultConfig } from 'amqp-mcp-transport';
const config = getDefaultConfig();  // reads env vars at call time
const url = config.AMQP_URL;

7. Update Import Paths
The AMQPMessage type no longer exists. Remove any imports of it:

// BEFORE:
import { AMQPMessage, AMQPServerTransport } from 'amqp-mcp-transport';

// AFTER:
import { AMQPServerTransport } from 'amqp-mcp-transport';

8. Set maxMessageSize If Needed
The default is 1 MB. If Open Discovery handles larger payloads (e.g., base64-encoded scan results), increase it:

const transport = new AMQPServerTransport({
    // ...
    maxMessageSize: 10 * 1024 * 1024,  // 10 MB
});

Summary Checklist for Open Discovery
#	Action	Effort
1	Remove all AMQPMessage envelope construction/detection	Medium
2	Move getToolCategory() + TOOL_CATEGORIES into Open Discovery; pass as routingKeyStrategy	Small
3	Move parseTransportMode() into Open Discovery	Small
4	Remove any onmessage wrapper/interceptor patterns	Small
5	Update queue binding patterns to mcp.{type}.{method} format	Small
6	Replace DEFAULT_AMQP_CONFIG with getDefaultConfig()	Small
7	Remove AMQPMessage type imports	Small
8	Configure maxMessageSize if payloads exceed 1 MB	Small