import { z } from 'zod';

export type PromptMessage = {
  role: 'user';
  content: {
    type: 'text';
    text: string;
  };
};

export type PromptResult = {
  description: string;
  messages: PromptMessage[];
};

export type PromptRegistration = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<PromptResult>;
};

export const CmdbPromptInputShape = {
  deviceType: z.string().optional().describe('Type of device discovered (server, network, storage, etc.)'),
  discoveredData: z.string().optional().describe('Raw discovery data from SNMP, network scans, etc.'),
} satisfies z.ZodRawShape;

export const NetworkTopologyPromptInputShape = {
  topologyData: z.string().optional().describe('Network topology discovery data (CDP/LLDP neighbors, routing tables, etc.)'),
  networkSegment: z.string().optional().describe('Specific network segment or VLAN to analyze'),
} satisfies z.ZodRawShape;

export const SecurityAssessmentPromptInputShape = {
  scanResults: z.string().optional().describe('Port scan results, service discovery, vulnerability data'),
  assetType: z.string().optional().describe('Type of asset being assessed (server, network device, application)'),
} satisfies z.ZodRawShape;

export const CapacityPlanningPromptInputShape = {
  utilizationData: z.string().optional().describe('CPU, memory, storage, and network utilization metrics'),
  timeframe: z.string().optional().describe('Planning timeframe (6 months, 1 year, 2 years)'),
} satisfies z.ZodRawShape;

export const IncidentResponsePromptInputShape = {
  alertData: z.string().optional().describe('Alert details, monitoring data, system logs'),
  severity: z.string().optional().describe('Incident severity level (critical, high, medium, low)'),
} satisfies z.ZodRawShape;

function coerceOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', 'yes', '1', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', 'no', '0', 'off'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

export const ProxmoxClusterValidationPromptInputShape = {
  credsId: z.string().optional().describe('Stored credential ID for the Proxmox environment to test'),
  clusterEndpoint: z.string().optional().describe('Cluster URL or logical environment name to reference in the workflow'),
  nodeScope: z.string().optional().describe('Optional node name or comma-separated node list to focus on'),
  persistCiMap: z
    .preprocess(coerceOptionalBoolean, z.boolean().optional())
    .describe('Whether the workflow should persist discovered CIs into CMDB memory'),
  ciKeyPrefix: z.string().optional().describe('Optional CI key prefix, defaulting to proxmox'),
} satisfies z.ZodRawShape;

export type CmdbPromptArgs = z.infer<z.ZodObject<typeof CmdbPromptInputShape>>;
export type NetworkTopologyPromptArgs = z.infer<z.ZodObject<typeof NetworkTopologyPromptInputShape>>;
export type SecurityAssessmentPromptArgs = z.infer<z.ZodObject<typeof SecurityAssessmentPromptInputShape>>;
export type CapacityPlanningPromptArgs = z.infer<z.ZodObject<typeof CapacityPlanningPromptInputShape>>;
export type IncidentResponsePromptArgs = z.infer<z.ZodObject<typeof IncidentResponsePromptInputShape>>;
export type ProxmoxClusterValidationPromptArgs = z.infer<z.ZodObject<typeof ProxmoxClusterValidationPromptInputShape>>;