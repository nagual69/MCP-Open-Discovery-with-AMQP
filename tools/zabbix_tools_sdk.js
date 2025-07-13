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
            user: this.username,
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

/**
 * Register all Zabbix tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerZabbixTools(server) {
  // Zabbix Host Discovery tool
  server.tool(
    'zabbix_host_discover',
    'Discover and retrieve hosts from Zabbix monitoring system',
    {
      baseUrl: z.string().optional().default(process.env.ZABBIX_BASE_URL || 'http://localhost:8080').describe('Zabbix server base URL (e.g., http://zabbix.company.com)'),
      username: z.string().optional().default(process.env.ZABBIX_USERNAME || 'Admin').describe('Zabbix username for authentication'),
      password: z.string().optional().default(process.env.ZABBIX_PASSWORD || 'zabbix').describe('Zabbix password for authentication'),
      groupFilter: z.string().optional().describe('Filter hosts by group name (optional)'),
      templateFilter: z.string().optional().describe('Filter hosts by template name (optional)'),
      limit: z.number().optional().default(100).describe('Maximum number of hosts to return (default: 100)')
    },
    async ({ baseUrl, username, password, groupFilter, templateFilter, limit }) => {
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter parameters
        const filter = {};
        if (groupFilter) {
          // Get group ID first
          const groups = await client.apiRequest('hostgroup.get', {
            filter: { name: groupFilter }
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
          limit: limit
        });

        const formattedHosts = hosts.map(host => ({
          hostId: host.hostid,
          hostname: host.host,
          displayName: host.name,
          status: host.status === '0' ? 'enabled' : 'disabled',
          availability: host.available === '1' ? 'available' : 'unavailable',
          error: host.error || null,
          groups: host.groups.map(g => g.name),
          templates: host.templates.map(t => t.name),
          interfaces: host.interfaces.map(iface => ({
            type: iface.type,
            ip: iface.ip,
            dns: iface.dns,
            port: iface.port
          })),
          tags: host.tags.map(tag => ({
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
    }
  );

  // Zabbix Metrics Retrieval tool
  server.tool(
    'zabbix_get_metrics',
    'Retrieve performance metrics and historical data from Zabbix',
    {
      baseUrl: z.string().optional().default(process.env.ZABBIX_BASE_URL || 'http://localhost:8080').describe('Zabbix server base URL'),
      username: z.string().optional().default(process.env.ZABBIX_USERNAME || 'Admin').describe('Zabbix username for authentication'),
      password: z.string().optional().default(process.env.ZABBIX_PASSWORD || 'zabbix').describe('Zabbix password for authentication'),
      hostName: z.string().describe('Hostname to retrieve metrics for'),
      itemFilter: z.string().optional().describe('Filter items by name pattern (optional)'),
      timeFrom: z.string().optional().describe('Start time for historical data (e.g., "1h", "1d", "2024-01-01 00:00:00")'),
      timeTill: z.string().optional().describe('End time for historical data (optional, defaults to now)'),
      limit: z.number().optional().default(100).describe('Maximum number of items to return')
    },
    async ({ baseUrl, username, password, hostName, itemFilter, timeFrom, timeTill, limit }) => {
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Get host first
        const hosts = await client.apiRequest('host.get', {
          filter: { host: hostName },
          output: ['hostid', 'host', 'name']
        });

        if (hosts.length === 0) {
          throw new Error(`Host '${hostName}' not found in Zabbix`);
        }

        const hostId = hosts[0].hostid;

        // Build item filter
        const search = itemFilter ? { name: itemFilter } : undefined;

        // Get items for the host
        const items = await client.apiRequest('item.get', {
          hostids: hostId,
          output: ['itemid', 'name', 'key_', 'type', 'units', 'lastvalue', 'lastclock'],
          search: search,
          limit: limit,
          sortfield: 'name'
        });

        // If historical data requested, get history
        let historyData = null;
        if (timeFrom && items.length > 0) {
          // Calculate time range
          const timeFromSeconds = parseTimeString(timeFrom);
          const timeTillSeconds = timeTill ? parseTimeString(timeTill) : Math.floor(Date.now() / 1000);

          // Get history for first few items (to avoid overwhelming response)
          const historyItems = items.slice(0, 10);
          historyData = {};

          for (const item of historyItems) {
            try {
              const history = await client.apiRequest('history.get', {
                itemids: item.itemid,
                time_from: timeFromSeconds,
                time_till: timeTillSeconds,
                output: 'extend',
                limit: 100,
                sortfield: 'clock',
                sortorder: 'DESC'
              });

              historyData[item.name] = history.map(h => ({
                timestamp: new Date(h.clock * 1000).toISOString(),
                value: h.value,
                clock: h.clock
              }));
            } catch (error) {
              historyData[item.name] = { error: error.message };
            }
          }
        }

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
          totalItems: formattedItems.length,
          historyData: historyData
        };

        return {
          content: [
            {
              type: "text",
              text: `Successfully retrieved ${formattedItems.length} metrics from Zabbix host '${hostName}':\n\n${JSON.stringify(result, null, 2)}`
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
    }
  );

  // Zabbix Alerts/Problems tool
  server.tool(
    'zabbix_get_alerts',
    'Retrieve current alerts, problems, and events from Zabbix',
    {
      baseUrl: z.string().optional().default(process.env.ZABBIX_BASE_URL || 'http://localhost:8080').describe('Zabbix server base URL'),
      username: z.string().optional().default(process.env.ZABBIX_USERNAME || 'Admin').describe('Zabbix username for authentication'),
      password: z.string().optional().default(process.env.ZABBIX_PASSWORD || 'zabbix').describe('Zabbix password for authentication'),
      hostFilter: z.string().optional().describe('Filter alerts by hostname (optional)'),
      severityFilter: z.enum(['not_classified', 'information', 'warning', 'average', 'high', 'disaster']).optional().describe('Filter by severity level'),
      acknowledged: z.boolean().optional().describe('Filter by acknowledgment status (true=acknowledged, false=unacknowledged)'),
      limit: z.number().optional().default(100).describe('Maximum number of alerts to return')
    },
    async ({ baseUrl, username, password, hostFilter, severityFilter, acknowledged, limit }) => {
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter parameters
        const filter = {};
        
        // Severity mapping
        const severityMap = {
          'not_classified': 0,
          'information': 1,
          'warning': 2,
          'average': 3,
          'high': 4,
          'disaster': 5
        };

        if (severityFilter && severityMap[severityFilter] !== undefined) {
          filter.severity = severityMap[severityFilter];
        }

        if (acknowledged !== undefined) {
          filter.acknowledged = acknowledged ? 1 : 0;
        }

        // Get problems (current issues)
        const problems = await client.apiRequest('problem.get', {
          output: ['eventid', 'objectid', 'name', 'severity', 'acknowledged', 'clock', 'r_clock'],
          selectHosts: ['host', 'name'],
          selectTags: ['tag', 'value'],
          filter: filter,
          recent: 'false', // Get all problems, not just recent
          limit: limit,
          sortfield: 'clock',
          sortorder: 'DESC'
        });

        // Filter by host if specified
        let filteredProblems = problems;
        if (hostFilter) {
          filteredProblems = problems.filter(problem => 
            problem.hosts.some(host => 
              host.host.includes(hostFilter) || host.name.includes(hostFilter)
            )
          );
        }

        const severityNames = ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'];

        const formattedProblems = filteredProblems.map(problem => ({
          eventId: problem.eventid,
          objectId: problem.objectid,
          name: problem.name,
          severity: severityNames[problem.severity] || problem.severity,
          severityLevel: parseInt(problem.severity),
          acknowledged: problem.acknowledged === '1',
          startTime: new Date(problem.clock * 1000).toISOString(),
          resolvedTime: problem.r_clock ? new Date(problem.r_clock * 1000).toISOString() : null,
          hosts: problem.hosts.map(host => ({
            hostname: host.host,
            displayName: host.name
          })),
          tags: problem.tags.map(tag => ({
            tag: tag.tag,
            value: tag.value
          })),
          duration: problem.r_clock ? 
            (problem.r_clock - problem.clock) : 
            (Math.floor(Date.now() / 1000) - problem.clock)
        }));

        // Get summary statistics
        const stats = {
          total: formattedProblems.length,
          acknowledged: formattedProblems.filter(p => p.acknowledged).length,
          unacknowledged: formattedProblems.filter(p => !p.acknowledged).length,
          bySeverity: severityNames.reduce((acc, name, index) => {
            acc[name] = formattedProblems.filter(p => p.severityLevel === index).length;
            return acc;
          }, {})
        };

        const result = {
          problems: formattedProblems,
          statistics: stats,
          filters: {
            hostFilter: hostFilter || 'none',
            severityFilter: severityFilter || 'all',
            acknowledged: acknowledged !== undefined ? acknowledged : 'all'
          }
        };

        return {
          content: [
            {
              type: "text",
              text: `Successfully retrieved ${formattedProblems.length} alerts/problems from Zabbix:\n\n${JSON.stringify(result, null, 2)}`
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
    }
  );

  // Zabbix Inventory tool
  server.tool(
    'zabbix_get_inventory',
    'Retrieve detailed inventory information for hosts from Zabbix',
    {
      baseUrl: z.string().optional().default(process.env.ZABBIX_BASE_URL || 'http://localhost:8080').describe('Zabbix server base URL'),
      username: z.string().optional().default(process.env.ZABBIX_USERNAME || 'Admin').describe('Zabbix username for authentication'),
      password: z.string().optional().default(process.env.ZABBIX_PASSWORD || 'zabbix').describe('Zabbix password for authentication'),
      hostFilter: z.string().optional().describe('Filter hosts by name pattern (optional)'),
      inventoryMode: z.enum(['automatic', 'manual', 'disabled']).optional().describe('Filter by inventory mode'),
      limit: z.number().optional().default(50).describe('Maximum number of hosts to return')
    },
    async ({ baseUrl, username, password, hostFilter, inventoryMode, limit }) => {
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build search and filter parameters
        const search = hostFilter ? { host: hostFilter } : undefined;
        const filter = {};
        
        // Inventory mode mapping
        if (inventoryMode) {
          const modeMap = {
            'disabled': -1,
            'manual': 0,
            'automatic': 1
          };
          filter.inventory_mode = modeMap[inventoryMode];
        }

        // Get hosts with inventory data
        const hosts = await client.apiRequest('host.get', {
          output: ['hostid', 'host', 'name', 'status', 'inventory_mode'],
          selectInventory: 'extend',
          selectGroups: ['name'],
          selectInterfaces: ['type', 'ip', 'dns', 'port'],
          search: search,
          filter: filter,
          limit: limit
        });

        const formattedHosts = hosts.map(host => {
          const inventory = host.inventory || {};
          
          return {
            hostId: host.hostid,
            hostname: host.host,
            displayName: host.name,
            status: host.status === '0' ? 'enabled' : 'disabled',
            inventoryMode: host.inventory_mode === '-1' ? 'disabled' : 
                          host.inventory_mode === '0' ? 'manual' : 'automatic',
            groups: host.groups.map(g => g.name),
            interfaces: host.interfaces.map(iface => ({
              type: iface.type,
              ip: iface.ip,
              dns: iface.dns,
              port: iface.port
            })),
            inventory: {
              type: inventory.type || null,
              name: inventory.name || null,
              alias: inventory.alias || null,
              os: inventory.os || null,
              osShort: inventory.os_short || null,
              osFamily: inventory.os_family || null,
              serialNoA: inventory.serialno_a || null,
              serialNoB: inventory.serialno_b || null,
              tag: inventory.tag || null,
              assetTag: inventory.asset_tag || null,
              macAddressA: inventory.macaddress_a || null,
              macAddressB: inventory.macaddress_b || null,
              hardware: inventory.hardware || null,
              hardwareFull: inventory.hardware_full || null,
              software: inventory.software || null,
              softwareFull: inventory.software_full || null,
              softwareAppA: inventory.software_app_a || null,
              softwareAppB: inventory.software_app_b || null,
              softwareAppC: inventory.software_app_c || null,
              softwareAppD: inventory.software_app_d || null,
              softwareAppE: inventory.software_app_e || null,
              contact: inventory.contact || null,
              location: inventory.location || null,
              locationLat: inventory.location_lat || null,
              locationLon: inventory.location_lon || null,
              notes: inventory.notes || null,
              chassis: inventory.chassis || null,
              model: inventory.model || null,
              hwArch: inventory.hw_arch || null,
              vendor: inventory.vendor || null,
              contractNumber: inventory.contract_number || null,
              installerName: inventory.installer_name || null,
              deploymentStatus: inventory.deployment_status || null,
              urlA: inventory.url_a || null,
              urlB: inventory.url_b || null,
              urlC: inventory.url_c || null,
              hostNetworks: inventory.host_networks || null,
              hostNetmask: inventory.host_netmask || null,
              hostRouter: inventory.host_router || null,
              oobIp: inventory.oob_ip || null,
              oobNetmask: inventory.oob_netmask || null,
              oobRouter: inventory.oob_router || null,
              dateHwPurchase: inventory.date_hw_purchase || null,
              dateHwInstall: inventory.date_hw_install || null,
              dateHwExpiry: inventory.date_hw_expiry || null,
              dateHwDecomm: inventory.date_hw_decomm || null,
              siteAddressA: inventory.site_address_a || null,
              siteAddressB: inventory.site_address_b || null,
              siteAddressC: inventory.site_address_c || null,
              siteCity: inventory.site_city || null,
              siteState: inventory.site_state || null,
              siteCountry: inventory.site_country || null,
              siteZip: inventory.site_zip || null,
              siteRack: inventory.site_rack || null,
              siteNotes: inventory.site_notes || null,
              pocPrimaryName: inventory.poc_1_name || null,
              pocPrimaryEmail: inventory.poc_1_email || null,
              pocPrimaryPhone: inventory.poc_1_phone_a || null,
              pocPrimaryCell: inventory.poc_1_phone_b || null,
              pocPrimaryScreen: inventory.poc_1_screen || null,
              pocPrimaryNotes: inventory.poc_1_notes || null,
              pocSecondaryName: inventory.poc_2_name || null,
              pocSecondaryEmail: inventory.poc_2_email || null,
              pocSecondaryPhone: inventory.poc_2_phone_a || null,
              pocSecondaryCell: inventory.poc_2_phone_b || null,
              pocSecondaryScreen: inventory.poc_2_screen || null,
              pocSecondaryNotes: inventory.poc_2_notes || null
            }
          };
        });

        // Filter out hosts with no meaningful inventory data if not specifically requesting disabled
        const hostsWithInventory = inventoryMode === 'disabled' ? 
          formattedHosts : 
          formattedHosts.filter(host => 
            host.inventoryMode !== 'disabled' || 
            Object.values(host.inventory).some(val => val !== null && val !== '')
          );

        const result = {
          hosts: hostsWithInventory,
          totalHosts: hostsWithInventory.length,
          filters: {
            hostFilter: hostFilter || 'none',
            inventoryMode: inventoryMode || 'all'
          }
        };

        return {
          content: [
            {
              type: "text",
              text: `Successfully retrieved inventory for ${hostsWithInventory.length} hosts from Zabbix:\n\n${JSON.stringify(result, null, 2)}`
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
    }
  );

  console.log('[MCP SDK] Registered 4 Zabbix tools');
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
  registerZabbixTools,
  cleanup
};
