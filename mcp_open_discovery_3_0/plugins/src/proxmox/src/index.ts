import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import { proxmoxApiRequest } from './client';
import { buildErrorResponse, buildTextResponse, type ToolResponse } from './shared';
import {
  ClusterResourcesInputShape,
  ListNodesInputShape,
  MetricsInputShape,
  NodeInputShape,
  ProxmoxListAnnotations,
  ProxmoxReadAnnotations,
  VmInputShape,
} from './types';

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations: Record<string, unknown>;
  handler: (...args: any[]) => Promise<ToolResponse>;
};

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_proxmox_list_nodes',
    description: 'Returns all nodes in the Proxmox cluster.',
    inputSchema: ListNodesInputShape,
    annotations: ProxmoxReadAnnotations,
    handler: async ({ creds_id, response_format }) => {
      try {
        const result = await proxmoxApiRequest('/api2/json/nodes', creds_id);
        return buildTextResponse(result, `Proxmox Cluster Nodes:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to list Proxmox nodes');
      }
    },
  },
  {
    name: 'mcp_od_proxmox_get_node_details',
    description: 'Returns details for a given Proxmox node.',
    inputSchema: NodeInputShape,
    annotations: ProxmoxReadAnnotations,
    handler: async ({ creds_id, node, response_format }) => {
      try {
        const result = await proxmoxApiRequest(`/api2/json/nodes/${node}/status`, creds_id);
        return buildTextResponse(result, `Node Details for ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : `Failed to get node details for ${node}`);
      }
    },
  },
  {
    name: 'mcp_od_proxmox_list_vms',
    description: 'Returns all VMs for a Proxmox node.',
    inputSchema: NodeInputShape,
    annotations: ProxmoxListAnnotations,
    handler: async ({ creds_id, node, response_format }) => {
      try {
        const result = await proxmoxApiRequest(`/api2/json/nodes/${node}/qemu`, creds_id);
        return buildTextResponse(result, `VMs on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : `Failed to list VMs for ${node}`);
      }
    },
  },
  {
    name: 'mcp_od_proxmox_get_vm_details',
    description: 'Returns config/details for a given VM.',
    inputSchema: VmInputShape,
    annotations: ProxmoxReadAnnotations,
    handler: async ({ creds_id, node, response_format, vmid }) => {
      try {
        const result = await proxmoxApiRequest(`/api2/json/nodes/${node}/qemu/${vmid}/config`, creds_id);
        return buildTextResponse(result, `VM ${vmid} details on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : `Failed to get VM ${vmid} details`);
      }
    },
  },
  {
    name: 'mcp_od_proxmox_list_containers',
    description: 'Returns all LXC containers for a Proxmox node.',
    inputSchema: NodeInputShape,
    annotations: ProxmoxListAnnotations,
    handler: async ({ creds_id, node, response_format }) => {
      try {
        const result = await proxmoxApiRequest(`/api2/json/nodes/${node}/lxc`, creds_id);
        return buildTextResponse(result, `LXC containers on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : `Failed to list containers for ${node}`);
      }
    },
  },
  {
    name: 'mcp_od_proxmox_get_container_details',
    description: 'Returns config/details for a given container.',
    inputSchema: VmInputShape,
    annotations: ProxmoxReadAnnotations,
    handler: async ({ creds_id, node, response_format, vmid }) => {
      try {
        const result = await proxmoxApiRequest(`/api2/json/nodes/${node}/lxc/${vmid}/config`, creds_id);
        return buildTextResponse(result, `Container ${vmid} details on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : `Failed to get container ${vmid} details`);
      }
    },
  },
  {
    name: 'mcp_od_proxmox_list_storage',
    description: 'Returns storage resources for a Proxmox node.',
    inputSchema: NodeInputShape,
    annotations: ProxmoxReadAnnotations,
    handler: async ({ creds_id, node, response_format }) => {
      try {
        const result = await proxmoxApiRequest(`/api2/json/nodes/${node}/storage`, creds_id);
        return buildTextResponse(result, `Storage on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : `Failed to list storage for ${node}`);
      }
    },
  },
  {
    name: 'mcp_od_proxmox_list_networks',
    description: 'Returns network config for a Proxmox node.',
    inputSchema: NodeInputShape,
    annotations: ProxmoxReadAnnotations,
    handler: async ({ creds_id, node, response_format }) => {
      try {
        const result = await proxmoxApiRequest(`/api2/json/nodes/${node}/network`, creds_id);
        return buildTextResponse(result, `Network config for node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : `Failed to list networks for ${node}`);
      }
    },
  },
  {
    name: 'mcp_od_proxmox_cluster_resources',
    description: 'Returns a summary of all cluster resources.',
    inputSchema: ClusterResourcesInputShape,
    annotations: ProxmoxListAnnotations,
    handler: async ({ creds_id, response_format }) => {
      try {
        const result = await proxmoxApiRequest('/api2/json/cluster/resources', creds_id);
        return buildTextResponse(result, `Proxmox Cluster Resources:\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to get cluster resources');
      }
    },
  },
  {
    name: 'mcp_od_proxmox_get_metrics',
    description: 'Returns metrics for a node or VM if vmid is provided.',
    inputSchema: MetricsInputShape,
    annotations: ProxmoxListAnnotations,
    handler: async ({ creds_id, node, response_format, vmid }) => {
      try {
        const endpoint = vmid
          ? `/api2/json/nodes/${node}/qemu/${vmid}/status/current`
          : `/api2/json/nodes/${node}/status`;
        const description = vmid
          ? `Metrics for VM ${vmid} on node ${node}:`
          : `Metrics for node ${node}:`;
        const result = await proxmoxApiRequest(endpoint, creds_id);
        return buildTextResponse(result, `${description}\n\n${JSON.stringify(result, null, 2)}`, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : `Failed to get metrics for ${node}`);
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