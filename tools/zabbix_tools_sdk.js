/**
 * Zabbix Tools Module for MCP Open Discovery - SDK Compatible
 * 
 * This module provides tools for integrating with Zabbix monitoring systems
 * using the official MCP SDK patterns with Zod schemas.
 * 
 * Zabbix is a mature, enterprise-grade open source monitoring solution
 * used by 400,000+ installations worldwide including major enterprises.
 */

const { z } = require('zod');

// Zabbix API client configuration
let zabbixClients = new Map(); // credentialId -> client instance

/**
 * Zabbix API Client
 * Handles authentication and API requests to Zabbix servers
 */
class ZabbixAPIClient {
  constructor(baseUrl, username = null, password = null) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.username = username || process.env.ZABBIX_USERNAME || 'Admin';
    this.password = password || process.env.ZABBIX_PASSWORD || 'zabbix';
    this.sessionId = null;
  }

  /**
   * Authenticate with Zabbix API
   */
  async authenticate() {
    try {
      const response = await fetch(`${this.baseUrl}/api_jsonrpc.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json-rpc',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'user.login',
          params: {
            username: this.username,
            password: this.password
          },
          id: 1
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`Zabbix authentication failed: ${data.error.message}`);
      }
      
      this.sessionId = data.result;
      return true;
    } catch (error) {
      throw new Error(`Failed to authenticate with Zabbix: ${error.message}`);
    }
  }

  /**
   * Make authenticated API request to Zabbix
   */
  async apiRequest(method, params = {}) {
    if (!this.sessionId) {
      await this.authenticate();
    }

    try {
      const response = await fetch(`${this.baseUrl}/api_jsonrpc.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json-rpc',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: method,
          params: params,
          auth: this.sessionId,
          id: Date.now()
        })
      });

      const data = await response.json();
      
      if (data.error) {
        // Try to re-authenticate on auth errors
        if (data.error.code === -32602 || data.error.message.includes('Session')) {
          this.sessionId = null;
          await this.authenticate();
          return this.apiRequest(method, params);
        }
        throw new Error(`Zabbix API error: ${data.error.message}`);
      }
      
      return data.result;
    } catch (error) {
      throw new Error(`Zabbix API request failed: ${error.message}`);
    }
  }

  /**
   * Logout from Zabbix API
   */
  async logout() {
    if (this.sessionId) {
      try {
        await this.apiRequest('user.logout');
      } catch (error) {
        // Ignore logout errors
      }
      this.sessionId = null;
    }
  }
}

/**
 * Get or create Zabbix API client for credentials
 */
async function getZabbixClient(baseUrl, username = null, password = null) {
  const clientKey = `${baseUrl}:${username || 'default'}:${password || 'default'}`;
  
  if (!zabbixClients.has(clientKey)) {
    const client = new ZabbixAPIClient(baseUrl, username, password);
    zabbixClients.set(clientKey, client);
  }
  
  return zabbixClients.get(clientKey);
}

// New hot-reload registry format
const tools = [
  {
    name: "zabbix_host_discover",
    description: "Discover and retrieve hosts from Zabbix monitoring system",
    inputSchema: z.object({
      baseUrl: z.string().describe("Zabbix server base URL (e.g., http://zabbix.company.com)").optional(),
      username: z.string().describe("Zabbix username for authentication").optional(),
      password: z.string().describe("Zabbix password for authentication").optional(),
      groupFilter: z.string().describe("Filter hosts by group name (optional)").optional(),
      templateFilter: z.string().describe("Filter hosts by template name (optional)").optional(),
      limit: z.number().describe("Maximum number of hosts to return (default: 100)").optional()
    }).passthrough(),
  },
  {
    name: "zabbix_get_metrics",
    description: "Retrieve performance metrics and historical data from Zabbix",
    inputSchema: z.object({
      baseUrl: z.string().describe("Zabbix server base URL").optional(),
      username: z.string().describe("Zabbix username for authentication").optional(),
      password: z.string().describe("Zabbix password for authentication").optional(),
      hostName: z.string().describe("Hostname to retrieve metrics for"),
      itemFilter: z.string().describe("Filter items by name pattern (optional)").optional(),
      timeFrom: z.string().describe("Start time for historical data (e.g., \"1h\", \"1d\", \"2024-01-01 00:00:00\")").optional(),
      timeTill: z.string().describe("End time for historical data (optional, defaults to now)").optional(),
      limit: z.number().describe("Maximum number of items to return").optional()
    }).passthrough(),
  },
  {
    name: "zabbix_get_alerts",
    description: "Retrieve alerts and notifications from Zabbix",
    inputSchema: z.object({
      baseUrl: z.string().describe("Zabbix server base URL").optional(),
      username: z.string().describe("Zabbix username for authentication").optional(),
      password: z.string().describe("Zabbix password for authentication").optional(),
      hostFilter: z.string().describe("Filter alerts by hostname (optional)").optional(),
      actionIds: z.array(z.string()).describe("Return only alerts generated by specific actions").optional(),
      eventIds: z.array(z.string()).describe("Return only alerts generated by specific events").optional(),
      limit: z.number().describe("Maximum number of alerts to return").optional()
    }).passthrough(),
  },
  {
    name: "zabbix_get_inventory",
    description: "Retrieve detailed inventory information for hosts from Zabbix",
    inputSchema: z.object({
      baseUrl: z.string().describe("Zabbix server base URL").optional(),
      username: z.string().describe("Zabbix username for authentication").optional(),
      password: z.string().describe("Zabbix password for authentication").optional(),
      hostFilter: z.string().describe("Filter hosts by name pattern (optional)").optional(),
      inventoryMode: z.enum(["automatic", "manual", "disabled"]).describe("Filter by inventory mode").optional(),
      limit: z.number().describe("Maximum number of hosts to return").optional()
    }).passthrough(),
  },
  {
    name: "zabbix_get_problems",
    description: "Retrieve current active problems from Zabbix",
    inputSchema: z.object({
      baseUrl: z.string().describe("Zabbix server base URL").optional(),
      username: z.string().describe("Zabbix username for authentication").optional(),
      password: z.string().describe("Zabbix password for authentication").optional(),
      hostFilter: z.string().describe("Filter problems by hostname (optional)").optional(),
      severityFilter: z.enum(["not_classified", "information", "warning", "average", "high", "disaster"]).describe("Filter by severity level").optional(),
      acknowledged: z.boolean().describe("Filter by acknowledgment status (true=acknowledged, false=unacknowledged)").optional(),
      recent: z.boolean().describe("Show only recent problems (last 24 hours)").optional(),
      limit: z.number().describe("Maximum number of problems to return").optional()
    }).passthrough(),
  },
  {
    name: "zabbix_get_events",
    description: "Retrieve historical events from Zabbix for audit and analysis",
    inputSchema: z.object({
      baseUrl: z.string().describe("Zabbix server base URL").optional(),
      username: z.string().describe("Zabbix username for authentication").optional(),
      password: z.string().describe("Zabbix password for authentication").optional(),
      hostFilter: z.string().describe("Filter events by hostname (optional)").optional(),
      eventType: z.enum(["trigger", "discovery", "autoregistration", "internal"]).describe("Filter by event source type").optional(),
      timeFrom: z.string().describe("Start time for events (e.g., \"1h\", \"1d\", \"2024-01-01 00:00:00\")").optional(),
      timeTill: z.string().describe("End time for events (optional, defaults to now)").optional(),
      acknowledged: z.boolean().describe("Filter by acknowledgment status").optional(),
      limit: z.number().describe("Maximum number of events to return").optional()
    }).passthrough(),
  },
  {
    name: "zabbix_get_triggers",
    description: "Retrieve and manage trigger configurations from Zabbix",
    inputSchema: z.object({
      baseUrl: z.string().describe("Zabbix server base URL").optional(),
      username: z.string().describe("Zabbix username for authentication").optional(),
      password: z.string().describe("Zabbix password for authentication").optional(),
      hostFilter: z.string().describe("Filter triggers by hostname (optional)").optional(),
      statusFilter: z.enum(["enabled", "disabled"]).describe("Filter by trigger status").optional(),
      severityFilter: z.enum(["not_classified", "information", "warning", "average", "high", "disaster"]).describe("Filter by trigger severity").optional(),
      activeOnly: z.boolean().describe("Show only triggers with active problems").optional(),
      templated: z.boolean().describe("Include templated triggers (true=only templated, false=only host triggers)").optional(),
      limit: z.number().describe("Maximum number of triggers to return").optional()
    }).passthrough(),
  },
];

// New hot-reload handleToolCall function
async function handleToolCall(name, args) {
  // Set defaults for common parameters
  const baseUrl = args.baseUrl || process.env.ZABBIX_BASE_URL || 'http://localhost:8080';
  const username = args.username || process.env.ZABBIX_USERNAME || 'Admin';
  const password = args.password || process.env.ZABBIX_PASSWORD || 'zabbix';

  switch (name) {
    case "zabbix_host_discover":
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter parameters
        const filter = {};
        if (args.groupFilter) {
          // Get group ID first
          const groups = await client.apiRequest('hostgroup.get', {
            filter: { name: args.groupFilter }
          });
          if (groups.length > 0) {
            filter.groupids = groups[0].groupid;
          }
        }

        // Get hosts with basic information
        const hosts = await client.apiRequest('host.get', {
          output: ['hostid', 'host', 'name', 'status', 'available', 'error'],
          selectGroups: ['name'],
          selectTemplates: ['name'],
          selectInterfaces: ['type', 'ip', 'dns', 'port'],
          selectTags: ['tag', 'value'],
          filter: filter,
          limit: args.limit || 100
        });

        const formattedHosts = hosts.map(host => ({
          hostId: host.hostid,
          hostname: host.host,
          displayName: host.name,
          status: host.status === '0' ? 'enabled' : 'disabled',
          availability: host.available === '1' ? 'available' : 'unavailable',
          error: host.error || null,
          groups: (host.groups || []).map(g => g.name),
          templates: (host.templates || []).map(t => t.name),
          interfaces: (host.interfaces || []).map(iface => ({
            type: iface.type,
            ip: iface.ip,
            dns: iface.dns,
            port: iface.port
          })),
          tags: (host.tags || []).map(tag => ({
            tag: tag.tag,
            value: tag.value
          }))
        }));

        return {
          content: [
            {
              type: "text",
              text: `Successfully discovered ${formattedHosts.length} hosts from Zabbix:\n\n${JSON.stringify(formattedHosts, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error discovering Zabbix hosts: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case "zabbix_get_metrics":
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Get host first
        const hosts = await client.apiRequest('host.get', {
          filter: { host: args.hostName },
          output: ['hostid', 'host', 'name']
        });

        if (hosts.length === 0) {
          throw new Error(`Host '${args.hostName}' not found in Zabbix`);
        }

        const hostId = hosts[0].hostid;
        const search = args.itemFilter ? { name: args.itemFilter } : undefined;

        // Get items for the host
        const items = await client.apiRequest('item.get', {
          hostids: hostId,
          output: ['itemid', 'name', 'key_', 'type', 'units', 'lastvalue', 'lastclock'],
          search: search,
          limit: args.limit || 100,
          sortfield: 'name'
        });

        const formattedItems = items.map(item => ({
          itemId: item.itemid,
          name: item.name,
          key: item.key_,
          type: item.type,
          units: item.units,
          lastValue: item.lastvalue,
          lastUpdate: item.lastclock ? new Date(item.lastclock * 1000).toISOString() : null
        }));

        const result = {
          host: {
            hostId: hosts[0].hostid,
            hostname: hosts[0].host,
            displayName: hosts[0].name
          },
          items: formattedItems,
          totalItems: formattedItems.length
        };

        return {
          content: [
            {
              type: "text",
              text: `Successfully retrieved ${formattedItems.length} metrics from Zabbix host '${args.hostName}':\n\n${JSON.stringify(result, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving Zabbix metrics: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case "zabbix_get_alerts":
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter parameters for alert.get
        const filter = {};
        
        if (args.actionIds && args.actionIds.length > 0) {
          filter.actionids = args.actionIds;
        }

        if (args.eventIds && args.eventIds.length > 0) {
          filter.eventids = args.eventIds;
        }

        // Get alerts using the correct alert.get API
        const alerts = await client.apiRequest('alert.get', {
          output: ['alertid', 'actionid', 'eventid', 'clock', 'sendto', 'subject', 'message', 'status', 'alerttype'],
          selectHosts: ['host', 'name'],
          selectUsers: ['userid', 'name'],
          filter: filter,
          limit: args.limit || 100,
          sortfield: 'clock',
          sortorder: 'DESC'
        });

        const statusNames = ['Not sent', 'Sent', 'Failed'];
        const alertTypeNames = ['Message', 'Command'];

        const formattedAlerts = alerts.map(alert => ({
          alertId: alert.alertid,
          actionId: alert.actionid,
          eventId: alert.eventid,
          timestamp: new Date(parseInt(alert.clock) * 1000).toISOString(),
          recipient: alert.sendto,
          subject: alert.subject,
          message: alert.message,
          status: statusNames[parseInt(alert.status)] || 'Unknown',
          type: alertTypeNames[parseInt(alert.alerttype)] || 'Unknown',
          hosts: alert.hosts || [],
          users: alert.users || []
        }));

        return {
          content: [
            {
              type: "text",
              text: `Retrieved ${formattedAlerts.length} alerts from Zabbix:\n\n${JSON.stringify(formattedAlerts, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving Zabbix alerts: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case "zabbix_get_inventory":
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter for hosts
        const hostOptions = {
          output: ['hostid', 'host', 'name', 'inventory_mode'],
          selectInventory: 'extend',
          limit: args.limit || 100
        };

        if (args.hostFilter) {
          hostOptions.search = { name: args.hostFilter };
        }

        if (args.inventoryMode) {
          const modeMap = { 'disabled': -1, 'manual': 0, 'automatic': 1 };
          hostOptions.filter = { inventory_mode: modeMap[args.inventoryMode] };
        }

        const hosts = await client.apiRequest('host.get', hostOptions);

        const formattedHosts = hosts.map(host => ({
          hostId: host.hostid,
          hostname: host.host,
          displayName: host.name,
          inventoryMode: host.inventory_mode === '-1' ? 'disabled' : 
                        host.inventory_mode === '0' ? 'manual' : 'automatic',
          inventory: host.inventory || {}
        }));

        return {
          content: [
            {
              type: "text",
              text: `Host inventory data (${formattedHosts.length} hosts):\n\n${JSON.stringify(formattedHosts, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving Zabbix inventory: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case "zabbix_get_problems":
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter for problems
        const problemOptions = {
          output: ['eventid', 'objectid', 'clock', 'name', 'severity', 'acknowledged'],
          selectHosts: ['hostid', 'host', 'name'],
          selectAcknowledges: ['clock', 'message', 'userid'],
          sortfield: 'clock',
          sortorder: 'DESC',
          limit: args.limit || 100
        };

        if (args.hostFilter) {
          const hosts = await client.apiRequest('host.get', {
            filter: { name: args.hostFilter },
            output: ['hostid']
          });
          if (hosts.length > 0) {
            problemOptions.hostids = hosts.map(h => h.hostid);
          }
        }

        if (args.severityFilter) {
          const severityMap = {
            'not_classified': 0,
            'information': 1,
            'warning': 2,
            'average': 3,
            'high': 4,
            'disaster': 5
          };
          problemOptions.severities = [severityMap[args.severityFilter]];
        }

        if (typeof args.acknowledged === 'boolean') {
          problemOptions.acknowledged = args.acknowledged;
        }

        if (args.recent) {
          problemOptions.time_from = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
        }

        const problems = await client.apiRequest('problem.get', problemOptions);

        const formattedProblems = problems.map(problem => ({
          eventId: problem.eventid,
          triggerId: problem.objectid,
          timestamp: new Date(parseInt(problem.clock) * 1000).toISOString(),
          name: problem.name,
          severity: ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'][parseInt(problem.severity)],
          acknowledged: problem.acknowledged === '1',
          hosts: (problem.hosts || []).map(h => ({
            hostId: h.hostid,
            hostname: h.host,
            displayName: h.name
          })),
          acknowledges: (problem.acknowledges || []).map(ack => ({
            timestamp: new Date(parseInt(ack.clock) * 1000).toISOString(),
            message: ack.message,
            userId: ack.userid
          }))
        }));

        return {
          content: [
            {
              type: "text",
              text: `Active problems (${formattedProblems.length} problems):\n\n${JSON.stringify(formattedProblems, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving Zabbix problems: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case "zabbix_get_events":
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter for events
        const eventOptions = {
          output: ['eventid', 'source', 'object', 'objectid', 'clock', 'value', 'acknowledged', 'name'],
          selectHosts: ['hostid', 'host', 'name'],
          selectRelatedObject: ['triggerid', 'description', 'priority'],
          sortfield: 'clock',
          sortorder: 'DESC',
          limit: args.limit || 100
        };

        if (args.hostFilter) {
          const hosts = await client.apiRequest('host.get', {
            filter: { name: args.hostFilter },
            output: ['hostid']
          });
          if (hosts.length > 0) {
            eventOptions.hostids = hosts.map(h => h.hostid);
          }
        }

        if (args.eventType) {
          const sourceMap = {
            'trigger': 0,
            'discovery': 1,
            'autoregistration': 2,
            'internal': 3
          };
          eventOptions.source = sourceMap[args.eventType];
        }

        if (args.timeFrom) {
          eventOptions.time_from = parseTimeString(args.timeFrom);
        }

        if (args.timeTill) {
          eventOptions.time_till = parseTimeString(args.timeTill);
        }

        if (typeof args.acknowledged === 'boolean') {
          eventOptions.acknowledged = args.acknowledged;
        }

        const events = await client.apiRequest('event.get', eventOptions);

        const formattedEvents = events.map(event => ({
          eventId: event.eventid,
          source: ['Trigger', 'Discovery', 'Auto registration', 'Internal'][parseInt(event.source)],
          objectType: ['Trigger', 'Discovered host', 'Discovered service', 'Auto-registered host', 'Item', 'LLD rule'][parseInt(event.object)],
          objectId: event.objectid,
          timestamp: new Date(parseInt(event.clock) * 1000).toISOString(),
          value: event.value === '1' ? 'PROBLEM' : 'OK',
          acknowledged: event.acknowledged === '1',
          name: event.name,
          hosts: (event.hosts || []).map(h => ({
            hostId: h.hostid,
            hostname: h.host,
            displayName: h.name
          })),
          relatedObject: event.relatedObject || null
        }));

        return {
          content: [
            {
              type: "text",
              text: `Historical events (${formattedEvents.length} events):\n\n${JSON.stringify(formattedEvents, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving Zabbix events: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case "zabbix_get_triggers":
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter for triggers
        const triggerOptions = {
          output: ['triggerid', 'description', 'expression', 'status', 'priority', 'lastchange', 'value', 'error'],
          selectHosts: ['hostid', 'host', 'name'],
          selectItems: ['itemid', 'name', 'key_'],
          expandExpression: true,
          sortfield: 'priority',
          sortorder: 'DESC',
          limit: args.limit || 100
        };

        if (args.hostFilter) {
          const hosts = await client.apiRequest('host.get', {
            filter: { name: args.hostFilter },
            output: ['hostid']
          });
          if (hosts.length > 0) {
            triggerOptions.hostids = hosts.map(h => h.hostid);
          }
        }

        if (args.statusFilter) {
          triggerOptions.filter = triggerOptions.filter || {};
          triggerOptions.filter.status = args.statusFilter === 'enabled' ? 0 : 1;
        }

        if (args.severityFilter) {
          const severityMap = {
            'not_classified': 0,
            'information': 1,
            'warning': 2,
            'average': 3,
            'high': 4,
            'disaster': 5
          };
          triggerOptions.filter = triggerOptions.filter || {};
          triggerOptions.filter.priority = severityMap[args.severityFilter];
        }

        if (args.activeOnly) {
          triggerOptions.filter = triggerOptions.filter || {};
          triggerOptions.filter.value = 1; // PROBLEM state
        }

        if (typeof args.templated === 'boolean') {
          triggerOptions.templated = args.templated;
        }

        const triggers = await client.apiRequest('trigger.get', triggerOptions);

        const formattedTriggers = triggers.map(trigger => ({
          triggerId: trigger.triggerid,
          description: trigger.description,
          expression: trigger.expression,
          status: trigger.status === '0' ? 'enabled' : 'disabled',
          severity: ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'][parseInt(trigger.priority)],
          lastChange: trigger.lastchange ? new Date(parseInt(trigger.lastchange) * 1000).toISOString() : null,
          value: trigger.value === '1' ? 'PROBLEM' : 'OK',
          error: trigger.error || null,
          hosts: (trigger.hosts || []).map(h => ({
            hostId: h.hostid,
            hostname: h.host,
            displayName: h.name
          })),
          items: (trigger.items || []).map(i => ({
            itemId: i.itemid,
            name: i.name,
            key: i.key_
          }))
        }));

        return {
          content: [
            {
              type: "text",
              text: `Zabbix triggers (${formattedTriggers.length} triggers):\n\n${JSON.stringify(formattedTriggers, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving Zabbix triggers: ${error.message}`
            }
          ],
          isError: true
        };
      }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown Zabbix tool: ${name}`
          }
        ],
        isError: true
      };
  }
}

/**
 * Helper function to parse time strings into Unix timestamps
 */
function parseTimeString(timeStr) {
  // Handle relative time strings like "1h", "1d", "1w"
  const relativeMatch = timeStr.match(/^(\d+)([hdwmy])$/);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];
    const now = Math.floor(Date.now() / 1000);
    
    const multipliers = {
      'h': 3600,       // hours
      'd': 86400,      // days  
      'w': 604800,     // weeks
      'm': 2592000,    // months (30 days)
      'y': 31536000    // years (365 days)
    };
    
    return now - (value * multipliers[unit]);
  }
  
  // Handle absolute timestamps
  const timestamp = Date.parse(timeStr);
  if (!isNaN(timestamp)) {
    return Math.floor(timestamp / 1000);
  }
  
  // If we can't parse it, return current time minus 1 hour
  return Math.floor(Date.now() / 1000) - 3600;
}

/**
 * Cleanup function to close all Zabbix connections
 */
async function cleanup() {
  for (const client of zabbixClients.values()) {
    try {
      await client.logout();
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  zabbixClients.clear();
}

module.exports = {
  tools, 
  handleToolCall, 
  cleanup,
  // Utility functions for external use
  getZabbixClient,
  parseTimeString
};
