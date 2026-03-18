"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const client_1 = require("./client");
const shared_1 = require("./shared");
const types_1 = require("./types");
const toolDefinitions = [
    {
        name: 'mcp_od_proxmox_list_nodes',
        description: 'Returns all nodes in the Proxmox cluster.',
        inputSchema: types_1.ListNodesInputShape,
        annotations: types_1.ProxmoxReadAnnotations,
        handler: async ({ creds_id, response_format }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)('/api2/json/nodes', creds_id);
                return (0, shared_1.buildTextResponse)(result, `Proxmox Cluster Nodes:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to list Proxmox nodes');
            }
        },
    },
    {
        name: 'mcp_od_proxmox_get_node_details',
        description: 'Returns details for a given Proxmox node.',
        inputSchema: types_1.NodeInputShape,
        annotations: types_1.ProxmoxReadAnnotations,
        handler: async ({ creds_id, node, response_format }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)(`/api2/json/nodes/${node}/status`, creds_id);
                return (0, shared_1.buildTextResponse)(result, `Node Details for ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : `Failed to get node details for ${node}`);
            }
        },
    },
    {
        name: 'mcp_od_proxmox_list_vms',
        description: 'Returns all VMs for a Proxmox node.',
        inputSchema: types_1.NodeInputShape,
        annotations: types_1.ProxmoxListAnnotations,
        handler: async ({ creds_id, node, response_format }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)(`/api2/json/nodes/${node}/qemu`, creds_id);
                return (0, shared_1.buildTextResponse)(result, `VMs on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : `Failed to list VMs for ${node}`);
            }
        },
    },
    {
        name: 'mcp_od_proxmox_get_vm_details',
        description: 'Returns config/details for a given VM.',
        inputSchema: types_1.VmInputShape,
        annotations: types_1.ProxmoxReadAnnotations,
        handler: async ({ creds_id, node, response_format, vmid }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)(`/api2/json/nodes/${node}/qemu/${vmid}/config`, creds_id);
                return (0, shared_1.buildTextResponse)(result, `VM ${vmid} details on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : `Failed to get VM ${vmid} details`);
            }
        },
    },
    {
        name: 'mcp_od_proxmox_list_containers',
        description: 'Returns all LXC containers for a Proxmox node.',
        inputSchema: types_1.NodeInputShape,
        annotations: types_1.ProxmoxListAnnotations,
        handler: async ({ creds_id, node, response_format }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)(`/api2/json/nodes/${node}/lxc`, creds_id);
                return (0, shared_1.buildTextResponse)(result, `LXC containers on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : `Failed to list containers for ${node}`);
            }
        },
    },
    {
        name: 'mcp_od_proxmox_get_container_details',
        description: 'Returns config/details for a given container.',
        inputSchema: types_1.VmInputShape,
        annotations: types_1.ProxmoxReadAnnotations,
        handler: async ({ creds_id, node, response_format, vmid }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)(`/api2/json/nodes/${node}/lxc/${vmid}/config`, creds_id);
                return (0, shared_1.buildTextResponse)(result, `Container ${vmid} details on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : `Failed to get container ${vmid} details`);
            }
        },
    },
    {
        name: 'mcp_od_proxmox_list_storage',
        description: 'Returns storage resources for a Proxmox node.',
        inputSchema: types_1.NodeInputShape,
        annotations: types_1.ProxmoxReadAnnotations,
        handler: async ({ creds_id, node, response_format }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)(`/api2/json/nodes/${node}/storage`, creds_id);
                return (0, shared_1.buildTextResponse)(result, `Storage on node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : `Failed to list storage for ${node}`);
            }
        },
    },
    {
        name: 'mcp_od_proxmox_list_networks',
        description: 'Returns network config for a Proxmox node.',
        inputSchema: types_1.NodeInputShape,
        annotations: types_1.ProxmoxReadAnnotations,
        handler: async ({ creds_id, node, response_format }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)(`/api2/json/nodes/${node}/network`, creds_id);
                return (0, shared_1.buildTextResponse)(result, `Network config for node ${node}:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : `Failed to list networks for ${node}`);
            }
        },
    },
    {
        name: 'mcp_od_proxmox_cluster_resources',
        description: 'Returns a summary of all cluster resources.',
        inputSchema: types_1.ClusterResourcesInputShape,
        annotations: types_1.ProxmoxListAnnotations,
        handler: async ({ creds_id, response_format }) => {
            try {
                const result = await (0, client_1.proxmoxApiRequest)('/api2/json/cluster/resources', creds_id);
                return (0, shared_1.buildTextResponse)(result, `Proxmox Cluster Resources:\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to get cluster resources');
            }
        },
    },
    {
        name: 'mcp_od_proxmox_get_metrics',
        description: 'Returns metrics for a node or VM if vmid is provided.',
        inputSchema: types_1.MetricsInputShape,
        annotations: types_1.ProxmoxListAnnotations,
        handler: async ({ creds_id, node, response_format, vmid }) => {
            try {
                const endpoint = vmid
                    ? `/api2/json/nodes/${node}/qemu/${vmid}/status/current`
                    : `/api2/json/nodes/${node}/status`;
                const description = vmid
                    ? `Metrics for VM ${vmid} on node ${node}:`
                    : `Metrics for node ${node}:`;
                const result = await (0, client_1.proxmoxApiRequest)(endpoint, creds_id);
                return (0, shared_1.buildTextResponse)(result, `${description}\n\n${JSON.stringify(result, null, 2)}`, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : `Failed to get metrics for ${node}`);
            }
        },
    },
];
async function createPlugin(server) {
    for (const tool of toolDefinitions) {
        server.registerTool(tool.name, {
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
        }, tool.handler);
    }
}
//# sourceMappingURL=index.js.map