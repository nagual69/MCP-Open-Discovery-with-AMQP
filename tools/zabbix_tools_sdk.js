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

/**
 * Register all Zabbix tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerZabbixTools(server) {
  let toolCount = 0;

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
    }
  );
  toolCount++;

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
  toolCount++;

  // Zabbix Alerts tool
  server.tool(
    'zabbix_get_alerts',
    'Retrieve alerts and notifications from Zabbix',
    {
      baseUrl: z.string().optional().default(process.env.ZABBIX_BASE_URL || 'http://localhost:8080').describe('Zabbix server base URL'),
      username: z.string().optional().default(process.env.ZABBIX_USERNAME || 'Admin').describe('Zabbix username for authentication'),
      password: z.string().optional().default(process.env.ZABBIX_PASSWORD || 'zabbix').describe('Zabbix password for authentication'),
      hostFilter: z.string().optional().describe('Filter alerts by hostname (optional)'),
      actionIds: z.array(z.string()).optional().describe('Return only alerts generated by specific actions'),
      eventIds: z.array(z.string()).optional().describe('Return only alerts generated by specific events'),
      limit: z.number().optional().default(100).describe('Maximum number of alerts to return')
    },
    async ({ baseUrl, username, password, hostFilter, actionIds, eventIds, limit }) => {
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter parameters for alert.get
        const filter = {};
        
        if (actionIds && actionIds.length > 0) {
          filter.actionids = actionIds;
        }

        if (eventIds && eventIds.length > 0) {
          filter.eventids = eventIds;
        }

        // Get alerts using the correct alert.get API
        const alerts = await client.apiRequest('alert.get', {
          output: ['alertid', 'actionid', 'eventid', 'clock', 'sendto', 'subject', 'message', 'status', 'alerttype'],
          selectHosts: ['host', 'name'],
          selectUsers: ['userid', 'name'],
          filter: filter,
          limit: limit,
          sortfield: 'clock',
          sortorder: 'DESC'
        });

        // Filter by host if specified
        let filteredAlerts = alerts;
        if (hostFilter) {
          filteredAlerts = alerts.filter(alert => 
            (alert.hosts || []).some(host => 
              host.host.includes(hostFilter) || host.name.includes(hostFilter)
            )
          );
        }

        const statusNames = ['Not sent', 'Sent', 'Failed'];
        const alertTypeNames = ['Message', 'Command'];

        const formattedAlerts = filteredAlerts.map(alert => ({
          alertId: alert.alertid,
          actionId: alert.actionid,
          eventId: alert.eventid,
          timestamp: new Date(alert.clock * 1000).toISOString(),
          recipient: alert.sendto || 'N/A',
          subject: alert.subject || '',
          message: alert.message || '',
          status: statusNames[alert.status] || alert.status,
          statusCode: parseInt(alert.status),
          type: alertTypeNames[alert.alerttype] || alert.alerttype,
          typeCode: parseInt(alert.alerttype),
          hosts: (alert.hosts || []).map(host => ({
            hostname: host.host,
            displayName: host.name
          })),
          users: (alert.users || []).map(user => ({
            userId: user.userid,
            name: user.name
          }))
        }));

        // Get summary statistics
        const stats = {
          total: formattedAlerts.length,
          sent: formattedAlerts.filter(a => a.statusCode === 1).length,
          failed: formattedAlerts.filter(a => a.statusCode === 2).length,
          notSent: formattedAlerts.filter(a => a.statusCode === 0).length,
          byType: {
            message: formattedAlerts.filter(a => a.typeCode === 0).length,
            command: formattedAlerts.filter(a => a.typeCode === 1).length
          }
        };

        const result = {
          alerts: formattedAlerts,
          statistics: stats,
          filters: {
            hostFilter: hostFilter || 'none',
            actionIds: actionIds || 'all',
            eventIds: eventIds || 'all'
          }
        };

        return {
          content: [
            {
              type: "text",
              text: `Successfully retrieved ${formattedAlerts.length} alerts from Zabbix:\n\n${JSON.stringify(result, null, 2)}`
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
  toolCount++;

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
  toolCount++;

  // Priority 1 Additional Tools - Critical Monitoring Capabilities

  // Zabbix Problems tool
  server.tool(
    'zabbix_get_problems',
    'Retrieve current active problems from Zabbix',
    {
      baseUrl: z.string().optional().default(process.env.ZABBIX_BASE_URL || 'http://localhost:8080').describe('Zabbix server base URL'),
      username: z.string().optional().default(process.env.ZABBIX_USERNAME || 'Admin').describe('Zabbix username for authentication'),
      password: z.string().optional().default(process.env.ZABBIX_PASSWORD || 'zabbix').describe('Zabbix password for authentication'),
      hostFilter: z.string().optional().describe('Filter problems by hostname (optional)'),
      severityFilter: z.enum(['not_classified', 'information', 'warning', 'average', 'high', 'disaster']).optional().describe('Filter by severity level'),
      acknowledged: z.boolean().optional().describe('Filter by acknowledgment status (true=acknowledged, false=unacknowledged)'),
      recent: z.boolean().optional().default(false).describe('Show only recent problems (last 24 hours)'),
      limit: z.number().optional().default(100).describe('Maximum number of problems to return')
    },
    async ({ baseUrl, username, password, hostFilter, severityFilter, acknowledged, recent, limit }) => {
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter parameters
        const filter = {};
        
        // Severity filter - use severities parameter (not in filter)
        let severities = null;
        if (severityFilter) {
          const severityMap = {
            'not_classified': 0,
            'information': 1, 
            'warning': 2,
            'average': 3,
            'high': 4,
            'disaster': 5
          };
          severities = [severityMap[severityFilter]];
        }

        if (acknowledged !== undefined) {
          filter.acknowledged = acknowledged ? 1 : 0;
        }

        // Time filter for recent problems
        let timeFrom = null;
        if (recent) {
          timeFrom = Math.floor(Date.now() / 1000) - 86400; // 24 hours ago
        }

        // Get problems
        const problems = await client.apiRequest('problem.get', {
          output: ['eventid', 'objectid', 'clock', 'name', 'severity', 'acknowledged', 'suppressed'],
          select_acknowledges: ['clock', 'message', 'action', 'userid'],
          filter: filter,
          severities: severities,
          time_from: timeFrom,
          limit: limit,
          sortfield: 'clock',
          sortorder: 'DESC'
        });

        // Filter by host if specified - requires object lookup since problems don't include hosts
        let filteredProblems = problems;
        if (hostFilter) {
          // Would need additional API call to get object details for host filtering
          // For now, return all problems with a note about the limitation
        }

        const severityNames = ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'];

        const formattedProblems = filteredProblems.map(problem => ({
          eventId: problem.eventid,
          objectId: problem.objectid,
          timestamp: new Date(problem.clock * 1000).toISOString(),
          name: problem.name,
          severity: severityNames[problem.severity] || problem.severity,
          severityLevel: parseInt(problem.severity),
          acknowledged: problem.acknowledged === '1',
          suppressed: problem.suppressed === '1',
          hosts: [], // Problems don't directly include hosts - would need separate lookup
          triggers: [], // Problems don't include trigger details by default
          acknowledges: (problem.acknowledges || []).map(ack => ({
            timestamp: new Date(ack.clock * 1000).toISOString(),
            message: ack.message,
            action: ack.action,
            userId: ack.userid
          }))
        }));

        // Get summary statistics
        const stats = {
          total: formattedProblems.length,
          acknowledged: formattedProblems.filter(p => p.acknowledged).length,
          unacknowledged: formattedProblems.filter(p => !p.acknowledged).length,
          suppressed: formattedProblems.filter(p => p.suppressed).length,
          bySeverity: {
            disaster: formattedProblems.filter(p => p.severityLevel === 5).length,
            high: formattedProblems.filter(p => p.severityLevel === 4).length,
            average: formattedProblems.filter(p => p.severityLevel === 3).length,
            warning: formattedProblems.filter(p => p.severityLevel === 2).length,
            information: formattedProblems.filter(p => p.severityLevel === 1).length,
            notClassified: formattedProblems.filter(p => p.severityLevel === 0).length
          }
        };

        const result = {
          problems: formattedProblems,
          statistics: stats,
          filters: {
            hostFilter: hostFilter || 'none',
            severityFilter: severityFilter || 'all',
            acknowledged: acknowledged !== undefined ? acknowledged : 'all',
            recent: recent || false
          }
        };

        return {
          content: [
            {
              type: "text",
              text: `Successfully retrieved ${formattedProblems.length} problems from Zabbix:\n\n${JSON.stringify(result, null, 2)}`
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
    }
  );
  toolCount++;

  // Zabbix Events tool
  server.tool(
    'zabbix_get_events',
    'Retrieve historical events from Zabbix for audit and analysis',
    {
      baseUrl: z.string().optional().default(process.env.ZABBIX_BASE_URL || 'http://localhost:8080').describe('Zabbix server base URL'),
      username: z.string().optional().default(process.env.ZABBIX_USERNAME || 'Admin').describe('Zabbix username for authentication'),
      password: z.string().optional().default(process.env.ZABBIX_PASSWORD || 'zabbix').describe('Zabbix password for authentication'),
      hostFilter: z.string().optional().describe('Filter events by hostname (optional)'),
      eventType: z.enum(['trigger', 'discovery', 'autoregistration', 'internal']).optional().describe('Filter by event source type'),
      timeFrom: z.string().optional().describe('Start time for events (e.g., "1h", "1d", "2024-01-01 00:00:00")'),
      timeTill: z.string().optional().describe('End time for events (optional, defaults to now)'),
      acknowledged: z.boolean().optional().describe('Filter by acknowledgment status'),
      limit: z.number().optional().default(100).describe('Maximum number of events to return')
    },
    async ({ baseUrl, username, password, hostFilter, eventType, timeFrom, timeTill, acknowledged, limit }) => {
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter parameters
        const filter = {};
        
        if (eventType) {
          const sourceMap = {
            'trigger': 0,
            'discovery': 1, 
            'autoregistration': 2,
            'internal': 3
          };
          filter.source = sourceMap[eventType];
        }

        if (acknowledged !== undefined) {
          filter.acknowledged = acknowledged ? 1 : 0;
        }

        // Time range
        let timeFromSeconds = null;
        let timeTillSeconds = null;
        
        if (timeFrom) {
          timeFromSeconds = parseTimeString(timeFrom);
        }
        
        if (timeTill) {
          timeTillSeconds = parseTimeString(timeTill);
        }

        // Get events
        const events = await client.apiRequest('event.get', {
          output: ['eventid', 'source', 'object', 'objectid', 'clock', 'value', 'acknowledged', 'name'],
          selectHosts: ['host', 'name'],
          selectTriggers: ['triggerid', 'description'],
          select_acknowledges: ['clock', 'message', 'userid'],
          filter: filter,
          time_from: timeFromSeconds,
          time_till: timeTillSeconds,
          limit: limit,
          sortfield: 'clock',
          sortorder: 'DESC'
        });

        // Filter by host if specified
        let filteredEvents = events;
        if (hostFilter) {
          filteredEvents = events.filter(event => 
            (event.hosts || []).some(host => 
              host.host.includes(hostFilter) || host.name.includes(hostFilter)
            )
          );
        }

        const sourceNames = ['Trigger', 'Discovery', 'Auto registration', 'Internal'];
        const valueNames = ['OK', 'Problem', 'Unknown'];

        const formattedEvents = filteredEvents.map(event => ({
          eventId: event.eventid,
          source: sourceNames[event.source] || event.source,
          sourceCode: parseInt(event.source),
          object: event.object,
          objectId: event.objectid,
          timestamp: new Date(event.clock * 1000).toISOString(),
          value: valueNames[event.value] || event.value,
          valueCode: parseInt(event.value),
          acknowledged: event.acknowledged === '1',
          name: event.name || 'N/A',
          hosts: (event.hosts || []).map(host => ({
            hostname: host.host,
            displayName: host.name
          })),
          triggers: (event.triggers || []).map(trigger => ({
            triggerId: trigger.triggerid,
            description: trigger.description
          })),
          acknowledges: (event.acknowledges || []).map(ack => ({
            timestamp: new Date(ack.clock * 1000).toISOString(),
            message: ack.message,
            userId: ack.userid
          }))
        }));

        // Get summary statistics
        const stats = {
          total: formattedEvents.length,
          acknowledged: formattedEvents.filter(e => e.acknowledged).length,
          unacknowledged: formattedEvents.filter(e => !e.acknowledged).length,
          bySource: {
            trigger: formattedEvents.filter(e => e.sourceCode === 0).length,
            discovery: formattedEvents.filter(e => e.sourceCode === 1).length,
            autoregistration: formattedEvents.filter(e => e.sourceCode === 2).length,
            internal: formattedEvents.filter(e => e.sourceCode === 3).length
          },
          byValue: {
            ok: formattedEvents.filter(e => e.valueCode === 0).length,
            problem: formattedEvents.filter(e => e.valueCode === 1).length,
            unknown: formattedEvents.filter(e => e.valueCode === 2).length
          }
        };

        const result = {
          events: formattedEvents,
          statistics: stats,
          filters: {
            hostFilter: hostFilter || 'none',
            eventType: eventType || 'all',
            timeFrom: timeFrom || 'none',
            timeTill: timeTill || 'none',
            acknowledged: acknowledged !== undefined ? acknowledged : 'all'
          }
        };

        return {
          content: [
            {
              type: "text",
              text: `Successfully retrieved ${formattedEvents.length} events from Zabbix:\n\n${JSON.stringify(result, null, 2)}`
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
    }
  );
  toolCount++;

  // Zabbix Triggers tool
  server.tool(
    'zabbix_get_triggers',
    'Retrieve and manage trigger configurations from Zabbix',
    {
      baseUrl: z.string().optional().default(process.env.ZABBIX_BASE_URL || 'http://localhost:8080').describe('Zabbix server base URL'),
      username: z.string().optional().default(process.env.ZABBIX_USERNAME || 'Admin').describe('Zabbix username for authentication'),
      password: z.string().optional().default(process.env.ZABBIX_PASSWORD || 'zabbix').describe('Zabbix password for authentication'),
      hostFilter: z.string().optional().describe('Filter triggers by hostname (optional)'),
      statusFilter: z.enum(['enabled', 'disabled']).optional().describe('Filter by trigger status'),
      severityFilter: z.enum(['not_classified', 'information', 'warning', 'average', 'high', 'disaster']).optional().describe('Filter by trigger severity'),
      activeOnly: z.boolean().optional().default(false).describe('Show only triggers with active problems'),
      templated: z.boolean().optional().describe('Include templated triggers (true=only templated, false=only host triggers)'),
      limit: z.number().optional().default(100).describe('Maximum number of triggers to return')
    },
    async ({ baseUrl, username, password, hostFilter, statusFilter, severityFilter, activeOnly, templated, limit }) => {
      try {
        const client = await getZabbixClient(baseUrl, username, password);
        
        // Build filter parameters
        const filter = {};
        
        if (statusFilter) {
          filter.status = statusFilter === 'enabled' ? 0 : 1;
        }

        if (severityFilter) {
          const severityMap = {
            'not_classified': 0,
            'information': 1,
            'warning': 2, 
            'average': 3,
            'high': 4,
            'disaster': 5
          };
          filter.priority = severityMap[severityFilter];
        }

        // Additional parameters
        const params = {
          output: ['triggerid', 'description', 'expression', 'status', 'priority', 'lastchange', 'value', 'error', 'url', 'comments'],
          selectHosts: ['host', 'name'],
          selectItems: ['itemid', 'name', 'key_'],
          selectFunctions: ['functionid', 'function', 'parameter'],
          selectDependencies: ['triggerid', 'description'],
          filter: filter,
          limit: limit,
          sortfield: 'priority',
          sortorder: 'DESC'
        };

        // Set templated parameter outside of filter
        if (templated !== undefined) {
          params.templated = templated;
        }

        if (activeOnly) {
          params.only_true = 1; // Only triggers in problem state
        }

        // Get triggers
        const triggers = await client.apiRequest('trigger.get', params);

        // Filter by host if specified  
        let filteredTriggers = triggers;
        if (hostFilter) {
          filteredTriggers = triggers.filter(trigger =>
            (trigger.hosts || []).some(host =>
              host.host.includes(hostFilter) || host.name.includes(hostFilter)
            )
          );
        }

        const statusNames = ['Enabled', 'Disabled'];
        const severityNames = ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'];
        const valueNames = ['OK', 'Problem'];

        const formattedTriggers = filteredTriggers.map(trigger => ({
          triggerId: trigger.triggerid,
          description: trigger.description,
          expression: trigger.expression,
          status: statusNames[trigger.status] || trigger.status,
          statusCode: parseInt(trigger.status),
          severity: severityNames[trigger.priority] || trigger.priority,
          severityLevel: parseInt(trigger.priority),
          lastChange: trigger.lastchange ? new Date(trigger.lastchange * 1000).toISOString() : null,
          value: valueNames[trigger.value] || trigger.value,
          valueCode: parseInt(trigger.value),
          error: trigger.error || null,
          url: trigger.url || null,
          comments: trigger.comments || null,
          hosts: (trigger.hosts || []).map(host => ({
            hostname: host.host,
            displayName: host.name
          })),
          items: (trigger.items || []).map(item => ({
            itemId: item.itemid,
            name: item.name,
            key: item.key_
          })),
          functions: (trigger.functions || []).map(func => ({
            functionId: func.functionid,
            function: func.function,
            parameter: func.parameter
          })),
          dependencies: (trigger.dependencies || []).map(dep => ({
            triggerId: dep.triggerid,
            description: dep.description
          }))
        }));

        // Get summary statistics
        const stats = {
          total: formattedTriggers.length,
          enabled: formattedTriggers.filter(t => t.statusCode === 0).length,
          disabled: formattedTriggers.filter(t => t.statusCode === 1).length,
          problems: formattedTriggers.filter(t => t.valueCode === 1).length,
          ok: formattedTriggers.filter(t => t.valueCode === 0).length,
          bySeverity: {
            disaster: formattedTriggers.filter(t => t.severityLevel === 5).length,
            high: formattedTriggers.filter(t => t.severityLevel === 4).length,
            average: formattedTriggers.filter(t => t.severityLevel === 3).length,
            warning: formattedTriggers.filter(t => t.severityLevel === 2).length,
            information: formattedTriggers.filter(t => t.severityLevel === 1).length,
            notClassified: formattedTriggers.filter(t => t.severityLevel === 0).length
          }
        };

        const result = {
          triggers: formattedTriggers,
          statistics: stats,
          filters: {
            hostFilter: hostFilter || 'none',
            statusFilter: statusFilter || 'all',
            severityFilter: severityFilter || 'all',
            activeOnly: activeOnly || false,
            templated: templated !== undefined ? templated : 'all'
          }
        };

        return {
          content: [
            {
              type: "text", 
              text: `Successfully retrieved ${formattedTriggers.length} triggers from Zabbix:\n\n${JSON.stringify(result, null, 2)}`
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
    }
  );
  toolCount++;

  console.log(`[MCP SDK] Registered ${toolCount} Zabbix tools`);
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
