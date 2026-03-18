import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import { getZabbixClient, parseTimeString, resolveZabbixConfig } from './client';
import { buildErrorResponse, buildTextResponse, getErrorMessage, type ToolResponse } from './shared';
import {
  AlertsInputShape,
  EventsInputShape,
  HostDiscoverInputShape,
  InventoryInputShape,
  MetricsInputShape,
  ProblemsInputShape,
  TriggersInputShape,
  ZabbixIdempotentReadAnnotations,
  ZabbixReadAnnotations,
} from './types';

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations: Record<string, unknown>;
  handler: (...args: any[]) => Promise<ToolResponse>;
};

type UnknownRecord = Record<string, unknown>;

const severityMap: Record<string, number> = {
  not_classified: 0,
  information: 1,
  warning: 2,
  average: 3,
  high: 4,
  disaster: 5,
};

function asArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter((item): item is UnknownRecord => typeof item === 'object' && item !== null) : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBooleanString(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function getPrimaryAgentInterface(host: UnknownRecord): UnknownRecord | undefined {
  const interfaces = asArray(host.interfaces);
  return interfaces.find((iface) => asString(iface.type) === '1' && asBooleanString(iface.main))
    ?? interfaces.find((iface) => asString(iface.type) === '1')
    ?? interfaces[0];
}

function getHostAvailability(host: UnknownRecord): 'available' | 'unavailable' {
  const primaryInterface = getPrimaryAgentInterface(host);
  if (primaryInterface) {
    return asString(primaryInterface.available) === '1' ? 'available' : 'unavailable';
  }

  return asString(host.available) === '1' ? 'available' : 'unavailable';
}

function getHostAvailabilityError(host: UnknownRecord): string | null {
  const primaryInterface = getPrimaryAgentInterface(host);
  return asString(primaryInterface?.error) ?? asString(host.error) ?? null;
}

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_zabbix_host_discover',
    description: 'Discover and retrieve hosts from Zabbix monitoring system.',
    inputSchema: HostDiscoverInputShape,
    annotations: ZabbixReadAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const client = getZabbixClient(resolveZabbixConfig(args));
        const filter: UnknownRecord = {};
        if (typeof args.groupFilter === 'string' && args.groupFilter) {
          const groups = await client.apiRequest<UnknownRecord[]>('hostgroup.get', { filter: { name: args.groupFilter } });
          const firstGroupId = asString(groups[0]?.groupid);
          if (firstGroupId) {
            filter.groupids = firstGroupId;
          }
        }
        const hosts = await client.apiRequest<UnknownRecord[]>('host.get', {
          output: ['hostid', 'host', 'name', 'status', 'available', 'error'],
          selectGroups: ['name'],
          selectTemplates: ['name'],
          selectInterfaces: ['type', 'ip', 'dns', 'port', 'available', 'error', 'main'],
          selectTags: ['tag', 'value'],
          filter,
          limit: typeof args.limit === 'number' ? args.limit : 100,
        });
        const result = hosts.map((host) => ({
          hostId: asString(host.hostid),
          hostname: asString(host.host),
          displayName: asString(host.name),
          status: asString(host.status) === '0' ? 'enabled' : 'disabled',
          availability: getHostAvailability(host),
          error: getHostAvailabilityError(host),
          groups: asArray(host.groups).map((group) => asString(group.name)).filter(Boolean),
          templates: asArray(host.templates).map((template) => asString(template.name)).filter(Boolean),
          interfaces: asArray(host.interfaces).map((iface) => ({
            type: iface.type,
            ip: iface.ip,
            dns: iface.dns,
            port: iface.port,
          })),
          tags: asArray(host.tags).map((tag) => ({ tag: tag.tag, value: tag.value })),
        }));
        return buildTextResponse(result, `Successfully discovered ${result.length} hosts from Zabbix:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_zabbix_get_metrics',
    description: 'Retrieve performance metrics and historical data from Zabbix.',
    inputSchema: MetricsInputShape,
    annotations: ZabbixIdempotentReadAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const client = getZabbixClient(resolveZabbixConfig(args));
        const hosts = await client.apiRequest<UnknownRecord[]>('host.get', {
          filter: { host: args.hostName },
          output: ['hostid', 'host', 'name'],
        });
        const host = hosts[0];
        const hostId = asString(host?.hostid);
        if (!host || !hostId) {
          throw new Error(`Host '${String(args.hostName)}' not found in Zabbix`);
        }
        const items = await client.apiRequest<UnknownRecord[]>('item.get', {
          hostids: hostId,
          output: ['itemid', 'name', 'key_', 'type', 'units', 'lastvalue', 'lastclock'],
          search: typeof args.itemFilter === 'string' && args.itemFilter ? { name: args.itemFilter } : undefined,
          limit: typeof args.limit === 'number' ? args.limit : 100,
          sortfield: 'name',
        });
        const result = {
          host: {
            hostId,
            hostname: asString(host.host),
            displayName: asString(host.name),
          },
          items: items.map((item) => {
            const lastclock = asString(item.lastclock);
            return {
              itemId: asString(item.itemid),
              name: asString(item.name),
              key: asString(item.key_),
              type: item.type,
              units: item.units,
              lastValue: item.lastvalue,
              lastUpdate: lastclock ? new Date(Number.parseInt(lastclock, 10) * 1000).toISOString() : null,
            };
          }),
        };
        return buildTextResponse(result, `Successfully retrieved ${result.items.length} metrics from Zabbix host '${String(args.hostName)}':\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_zabbix_get_alerts',
    description: 'Retrieve alerts and notifications from Zabbix.',
    inputSchema: AlertsInputShape,
    annotations: ZabbixReadAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const client = getZabbixClient(resolveZabbixConfig(args));
        const filter: UnknownRecord = {};
        if (Array.isArray(args.actionIds) && args.actionIds.length) {
          filter.actionids = args.actionIds;
        }
        if (Array.isArray(args.eventIds) && args.eventIds.length) {
          filter.eventids = args.eventIds;
        }
        const alerts = await client.apiRequest<UnknownRecord[]>('alert.get', {
          output: ['alertid', 'actionid', 'eventid', 'clock', 'sendto', 'subject', 'message', 'status', 'alerttype'],
          selectHosts: ['host', 'name'],
          selectUsers: ['userid', 'name'],
          filter,
          limit: typeof args.limit === 'number' ? args.limit : 100,
          sortfield: 'clock',
          sortorder: 'DESC',
        });
        const statusNames = ['Not sent', 'Sent', 'Failed'];
        const alertTypeNames = ['Message', 'Command'];
        const result = alerts.map((alert) => ({
          alertId: asString(alert.alertid),
          actionId: asString(alert.actionid),
          eventId: asString(alert.eventid),
          timestamp: asString(alert.clock) ? new Date(Number.parseInt(asString(alert.clock) ?? '0', 10) * 1000).toISOString() : null,
          recipient: asString(alert.sendto),
          subject: asString(alert.subject),
          message: asString(alert.message),
          status: statusNames[Number.parseInt(asString(alert.status) ?? '-1', 10)] ?? 'Unknown',
          type: alertTypeNames[Number.parseInt(asString(alert.alerttype) ?? '-1', 10)] ?? 'Unknown',
          hosts: asArray(alert.hosts),
          users: asArray(alert.users),
        }));
        return buildTextResponse(result, `Retrieved ${result.length} alerts from Zabbix:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_zabbix_get_inventory',
    description: 'Retrieve detailed inventory information for hosts from Zabbix.',
    inputSchema: InventoryInputShape,
    annotations: ZabbixIdempotentReadAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const client = getZabbixClient(resolveZabbixConfig(args));
        const options: UnknownRecord = {
          output: ['hostid', 'host', 'name', 'inventory_mode'],
          selectInventory: 'extend',
          limit: typeof args.limit === 'number' ? args.limit : 100,
        };
        if (typeof args.hostFilter === 'string' && args.hostFilter) {
          options.search = { name: args.hostFilter };
        }
        if (typeof args.inventoryMode === 'string' && args.inventoryMode) {
          const modeMap: Record<string, number> = { disabled: -1, manual: 0, automatic: 1 };
          options.filter = { inventory_mode: modeMap[args.inventoryMode] };
        }
        const hosts = await client.apiRequest<UnknownRecord[]>('host.get', options);
        const result = hosts.map((host) => ({
          hostId: asString(host.hostid),
          hostname: asString(host.host),
          displayName: asString(host.name),
          inventoryMode: asString(host.inventory_mode) === '-1' ? 'disabled' : asString(host.inventory_mode) === '0' ? 'manual' : 'automatic',
          inventory: host.inventory ?? {},
        }));
        return buildTextResponse(result, `Host inventory data (${result.length} hosts):\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_zabbix_get_problems',
    description: 'Retrieve current active problems from Zabbix.',
    inputSchema: ProblemsInputShape,
    annotations: ZabbixReadAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const client = getZabbixClient(resolveZabbixConfig(args));
        const options: UnknownRecord = {
          output: ['eventid', 'objectid', 'clock', 'name', 'severity', 'acknowledged'],
          selectHosts: ['hostid', 'host', 'name'],
          selectAcknowledges: ['clock', 'message', 'userid'],
          limit: typeof args.limit === 'number' ? args.limit : 100,
        };
        if (typeof args.hostFilter === 'string' && args.hostFilter) {
          const hosts = await client.apiRequest<UnknownRecord[]>('host.get', { filter: { name: args.hostFilter }, output: ['hostid'] });
          if (hosts.length) {
            options.hostids = hosts.map((host) => host.hostid);
          }
        }
        if (typeof args.severityFilter === 'string') {
          options.severities = [severityMap[args.severityFilter]];
        }
        if (typeof args.acknowledged === 'boolean') {
          options.acknowledged = args.acknowledged;
        }
        if (args.recent === true) {
          options.time_from = Math.floor((Date.now() - 86400000) / 1000);
        }
        const problems = await client.apiRequest<UnknownRecord[]>('problem.get', options);
        const severityNames = ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'];
        const result = problems.map((problem) => ({
          eventId: asString(problem.eventid),
          triggerId: asString(problem.objectid),
          timestamp: asString(problem.clock) ? new Date(Number.parseInt(asString(problem.clock) ?? '0', 10) * 1000).toISOString() : null,
          name: asString(problem.name),
          severity: severityNames[Number.parseInt(asString(problem.severity) ?? '0', 10)] ?? 'Unknown',
          acknowledged: asBooleanString(problem.acknowledged),
          hosts: asArray(problem.hosts).map((host) => ({ hostId: host.hostid, hostname: host.host, displayName: host.name })),
          acknowledges: asArray(problem.acknowledges).map((ack) => ({
            timestamp: asString(ack.clock) ? new Date(Number.parseInt(asString(ack.clock) ?? '0', 10) * 1000).toISOString() : null,
            message: ack.message,
            userId: ack.userid,
          })),
        }));
        return buildTextResponse(result, `Active problems (${result.length} problems):\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_zabbix_get_events',
    description: 'Retrieve historical events from Zabbix for audit and analysis.',
    inputSchema: EventsInputShape,
    annotations: ZabbixReadAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const client = getZabbixClient(resolveZabbixConfig(args));
        const options: UnknownRecord = {
          output: ['eventid', 'source', 'object', 'objectid', 'clock', 'value', 'acknowledged', 'name'],
          selectHosts: ['hostid', 'host', 'name'],
          selectRelatedObject: ['triggerid', 'description', 'priority'],
          sortfield: 'clock',
          sortorder: 'DESC',
          limit: typeof args.limit === 'number' ? args.limit : 100,
        };
        if (typeof args.hostFilter === 'string' && args.hostFilter) {
          const hosts = await client.apiRequest<UnknownRecord[]>('host.get', { filter: { name: args.hostFilter }, output: ['hostid'] });
          if (hosts.length) {
            options.hostids = hosts.map((host) => host.hostid);
          }
        }
        if (typeof args.eventType === 'string') {
          const sourceMap: Record<string, number> = { trigger: 0, discovery: 1, autoregistration: 2, internal: 3 };
          options.source = sourceMap[args.eventType];
        }
        const timeFrom = parseTimeString(typeof args.timeFrom === 'string' ? args.timeFrom : undefined);
        const timeTill = parseTimeString(typeof args.timeTill === 'string' ? args.timeTill : undefined);
        if (typeof timeFrom === 'number') {
          options.time_from = timeFrom;
        }
        if (typeof timeTill === 'number') {
          options.time_till = timeTill;
        }
        if (typeof args.acknowledged === 'boolean') {
          options.acknowledged = args.acknowledged;
        }
        const events = await client.apiRequest<UnknownRecord[]>('event.get', options);
        const sources = ['Trigger', 'Discovery', 'Auto registration', 'Internal'];
        const objectTypes = ['Trigger', 'Discovered host', 'Discovered service', 'Auto-registered host', 'Item', 'LLD rule'];
        const result = events.map((event) => ({
          eventId: asString(event.eventid),
          source: sources[Number.parseInt(asString(event.source) ?? '0', 10)] ?? 'Unknown',
          objectType: objectTypes[Number.parseInt(asString(event.object) ?? '0', 10)] ?? 'Unknown',
          objectId: asString(event.objectid),
          timestamp: asString(event.clock) ? new Date(Number.parseInt(asString(event.clock) ?? '0', 10) * 1000).toISOString() : null,
          value: asString(event.value) === '1' ? 'PROBLEM' : 'OK',
          acknowledged: asBooleanString(event.acknowledged),
          name: asString(event.name),
          hosts: asArray(event.hosts).map((host) => ({ hostId: host.hostid, hostname: host.host, displayName: host.name })),
          relatedObject: event.relatedObject ?? null,
        }));
        return buildTextResponse(result, `Historical events (${result.length} events):\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
  {
    name: 'mcp_od_zabbix_get_triggers',
    description: 'Retrieve and manage trigger configurations from Zabbix.',
    inputSchema: TriggersInputShape,
    annotations: ZabbixIdempotentReadAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const client = getZabbixClient(resolveZabbixConfig(args));
        const options: UnknownRecord = {
          output: ['triggerid', 'description', 'expression', 'status', 'priority', 'lastchange', 'value', 'error'],
          selectHosts: ['hostid', 'host', 'name'],
          selectItems: ['itemid', 'name', 'key_'],
          expandExpression: true,
          sortfield: 'priority',
          sortorder: 'DESC',
          limit: typeof args.limit === 'number' ? args.limit : 100,
        };
        if (typeof args.hostFilter === 'string' && args.hostFilter) {
          const hosts = await client.apiRequest<UnknownRecord[]>('host.get', { filter: { name: args.hostFilter }, output: ['hostid'] });
          if (hosts.length) {
            options.hostids = hosts.map((host) => host.hostid);
          }
        }
        const filter: UnknownRecord = {};
        if (typeof args.statusFilter === 'string') {
          filter.status = args.statusFilter === 'enabled' ? 0 : 1;
        }
        if (typeof args.severityFilter === 'string') {
          filter.priority = severityMap[args.severityFilter];
        }
        if (args.activeOnly === true) {
          filter.value = 1;
        }
        if (Object.keys(filter).length) {
          options.filter = filter;
        }
        if (typeof args.templated === 'boolean') {
          options.templated = args.templated;
        }
        const triggers = await client.apiRequest<UnknownRecord[]>('trigger.get', options);
        const severityNames = ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'];
        const result = triggers.map((trigger) => ({
          triggerId: asString(trigger.triggerid),
          description: asString(trigger.description),
          expression: asString(trigger.expression),
          status: asString(trigger.status) === '0' ? 'enabled' : 'disabled',
          severity: severityNames[Number.parseInt(asString(trigger.priority) ?? '0', 10)] ?? 'Unknown',
          lastChange: asString(trigger.lastchange) ? new Date(Number.parseInt(asString(trigger.lastchange) ?? '0', 10) * 1000).toISOString() : null,
          value: asString(trigger.value) === '1' ? 'PROBLEM' : 'OK',
          error: asString(trigger.error) ?? null,
          hosts: asArray(trigger.hosts).map((host) => ({ hostId: host.hostid, hostname: host.host, displayName: host.name })),
          items: asArray(trigger.items).map((item) => ({ itemId: item.itemid, name: item.name, key: item.key_ })),
        }));
        return buildTextResponse(result, `Zabbix triggers (${result.length} triggers):\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(getErrorMessage(error));
      }
    },
  },
];

export async function createPlugin(server: McpServer): Promise<void> {
  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      tool.handler as never,
    );
  }
}