import type {
  CapacityPlanningPromptArgs,
  CmdbPromptArgs,
  IncidentResponsePromptArgs,
  NetworkTopologyPromptArgs,
  ProxmoxClusterValidationPromptArgs,
  PromptRegistration,
  PromptResult,
  SecurityAssessmentPromptArgs,
} from './types';
import {
  CapacityPlanningPromptInputShape,
  CmdbPromptInputShape,
  IncidentResponsePromptInputShape,
  NetworkTopologyPromptInputShape,
  ProxmoxClusterValidationPromptInputShape,
  SecurityAssessmentPromptInputShape,
} from './types';

function asPromptResult(description: string, text: string): PromptResult {
  return {
    description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

function generateCmdbClassificationPrompt(args: CmdbPromptArgs): PromptResult {
  let promptText = `As an ITIL v4 expert, help classify Configuration Items (CIs) for a CMDB based on infrastructure discovery data.

CMDB CI Classification Standards:
1. CI Types: Server, Network Device, Storage, Application, Service, Database, Virtual Machine, Container
2. CI Attributes: Name, Type, Status, Location, Owner, Dependencies, Relationships
3. CI Relationships: Depends On, Part Of, Connects To, Hosts, Runs On
4. CI Status: Active, Inactive, Planned, Retired, Under Change

Discovery Context:`;

  if (args.deviceType) promptText += `\nDevice Type: ${args.deviceType}`;
  if (args.discoveredData) promptText += `\nDiscovered Data:\n${args.discoveredData}`;

  promptText += `\n\nPlease provide:
1. Recommended CI classification and type
2. Key attributes to capture
3. Suggested relationships to other CIs
4. CMDB naming convention
5. Lifecycle status recommendation`;

  return asPromptResult('CMDB CI classification guidance', promptText);
}

function generateNetworkTopologyPrompt(args: NetworkTopologyPromptArgs): PromptResult {
  let promptText = `Analyze network topology data and provide insights for infrastructure mapping and optimization.

Network Analysis Framework:
1. Physical Topology: Switches, routers, connections, link utilization
2. Logical Topology: VLANs, subnets, routing domains, broadcast domains
3. Layer 2/3 Relationships: STP topology, OSPF/EIGRP areas, BGP AS paths
4. Redundancy Analysis: Backup paths, single points of failure
5. Performance Metrics: Bandwidth utilization, latency, packet loss

Topology Data:`;

  if (args.topologyData) promptText += `\n${args.topologyData}`;
  if (args.networkSegment) promptText += `\nFocus Segment: ${args.networkSegment}`;

  promptText += `\n\nPlease provide:
1. Network topology summary and key findings
2. Redundancy and resilience assessment
3. Performance bottleneck identification
4. Security segmentation recommendations
5. Optimization opportunities`;

  return asPromptResult('Network topology analysis', promptText);
}

function generateSecurityAssessmentPrompt(args: SecurityAssessmentPromptArgs): PromptResult {
  let promptText = `Perform a security assessment based on infrastructure discovery data and provide actionable recommendations.

Security Assessment Framework:
1. Attack Surface Analysis: Open ports, exposed services, network accessibility
2. Vulnerability Assessment: Known CVEs, misconfigurations, weak protocols
3. Access Control Review: Authentication methods, authorization mechanisms
4. Network Security: Firewall rules, segmentation, encryption in transit
5. Compliance Checks: Industry standards (NIST, CIS, ISO 27001)

Discovery Data:`;

  if (args.scanResults) promptText += `\nScan Results:\n${args.scanResults}`;
  if (args.assetType) promptText += `\nAsset Type: ${args.assetType}`;

  promptText += `\n\nPlease provide:
1. Security risk assessment and prioritization
2. Critical vulnerabilities requiring immediate attention
3. Hardening recommendations by asset type
4. Network security improvements
5. Compliance gap analysis and remediation steps`;

  return asPromptResult('Infrastructure security assessment', promptText);
}

function generateCapacityPlanningPrompt(args: CapacityPlanningPromptArgs): PromptResult {
  let promptText = `Analyze infrastructure capacity utilization and provide planning recommendations for future growth.

Capacity Planning Framework:
1. Resource Utilization: CPU, memory, storage, network bandwidth trends
2. Growth Patterns: Historical usage growth, seasonal variations
3. Performance Thresholds: Warning and critical utilization levels
4. Scalability Options: Vertical vs horizontal scaling, cloud integration
5. Cost Optimization: Right-sizing, consolidation opportunities

Utilization Metrics:`;

  if (args.utilizationData) promptText += `\n${args.utilizationData}`;
  if (args.timeframe) promptText += `\nPlanning Timeframe: ${args.timeframe}`;
  else promptText += `\nPlanning Timeframe: 12 months (default)`;

  promptText += `\n\nPlease provide:
1. Current capacity utilization summary
2. Projected resource requirements based on trends
3. Bottleneck identification and resolution strategies
4. Scaling recommendations with timeline
5. Cost-benefit analysis for recommended changes`;

  return asPromptResult('Infrastructure capacity planning analysis', promptText);
}

function generateIncidentResponsePrompt(args: IncidentResponsePromptArgs): PromptResult {
  let promptText = `Provide incident response guidance based on infrastructure alerts and monitoring data.

Incident Response Framework:
1. Incident Classification: Severity assessment, impact analysis
2. Initial Response: Immediate containment, stakeholder notification
3. Investigation: Root cause analysis, evidence collection
4. Resolution: Remediation steps, service restoration
5. Post-Incident: Lessons learned, preventive measures

Alert Details:`;

  if (args.alertData) promptText += `\n${args.alertData}`;
  if (args.severity) promptText += `\nSeverity Level: ${args.severity}`;
  else promptText += `\nSeverity Level: To be determined`;

  promptText += `\n\nPlease provide:
1. Incident severity assessment and classification
2. Immediate response steps and containment actions
3. Investigation approach and data collection strategy
4. Resolution pathway and service restoration plan
5. Post-incident review recommendations`;

  return asPromptResult('Incident response playbook', promptText);
}

function normalizePersistCiMap(value: ProxmoxClusterValidationPromptArgs['persistCiMap']): 'yes' | 'no' | 'ask the user' {
  if (value === true) {
    return 'yes';
  }

  if (value === false) {
    return 'no';
  }

  return 'ask the user';
}

function generateProxmoxClusterValidationPrompt(args: ProxmoxClusterValidationPromptArgs): PromptResult {
  const ciKeyPrefix = args.ciKeyPrefix || 'proxmox';
  const persistCiMap = normalizePersistCiMap(args.persistCiMap);

  let promptText = `Run a Proxmox cluster validation workflow, then build a CMDB memory map of the discovered cluster.

Operator goals:
1. Ask for any missing connection or scope inputs before running tools.
2. Exercise the Proxmox discovery surface in both JSON and markdown response modes.
3. Persist the resulting cluster inventory into CMDB memory using stable ci:type:identifier keys.

Known contract details:
1. The Proxmox plugin expects a stored credential ID via creds_id.
2. The VM and container identifier argument vmid is a string in the tool schema. Even when the ID looks numeric, pass it as a string.
3. Prefer cluster-wide discovery first, then node-level detail calls.

Provided context:`;

  if (args.credsId) promptText += `
Credential ID: ${args.credsId}`;
  if (args.clusterEndpoint) promptText += `
Cluster Endpoint: ${args.clusterEndpoint}`;
  if (args.nodeScope) promptText += `
Node Scope: ${args.nodeScope}`;
  promptText += `
Persist CI Map: ${persistCiMap}`;
  promptText += `
CI Key Prefix: ${ciKeyPrefix}`;

  promptText += `

Workflow:
1. If credsId is missing, ask the user for the existing credential ID or enough information to create one in the credentials store.
2. If nodeScope or persistCiMap is missing and needed, ask concise follow-up questions before running discovery.
3. Run these Proxmox tools in JSON mode first:
   - mcp_od_proxmox_list_nodes
   - mcp_od_proxmox_cluster_resources
   - for each selected node: mcp_od_proxmox_get_node_details, mcp_od_proxmox_get_metrics, mcp_od_proxmox_list_vms, mcp_od_proxmox_list_containers, mcp_od_proxmox_list_storage, mcp_od_proxmox_list_networks
4. Derive identifiers from live list results before any detail or memory write call:
  - use the vmid field from mcp_od_proxmox_list_vms, mcp_od_proxmox_list_containers, or mcp_od_proxmox_cluster_resources
  - convert that identifier with String(item.vmid)
  - if vmid is null, undefined, or empty, do not call a detail tool and do not write a CI key; report the skipped resource explicitly
  - never build CI keys from a null identifier and never write ci:${ciKeyPrefix}-vm:null or ci:${ciKeyPrefix}-container:null
5. For each discovered VM: call mcp_od_proxmox_get_vm_details and mcp_od_proxmox_get_metrics with vmid passed as String(item.vmid).
6. For each discovered container: call mcp_od_proxmox_get_container_details with vmid passed as String(item.vmid).
7. Re-run the same read coverage in markdown mode to confirm both output formats behave correctly.
8. Report any failing tool calls with the exact tool name, node, and identifier that failed.
9. Build or update CMDB memory records with mcp_od_memory_set or mcp_od_memory_merge using keys like:
   - ci:${ciKeyPrefix}-cluster:<cluster-name-or-endpoint>
   - ci:${ciKeyPrefix}-node:<node>
   - ci:${ciKeyPrefix}-vm:<vmid>
   - ci:${ciKeyPrefix}-container:<vmid>
   - ci:${ciKeyPrefix}-storage:<node>:<storage>
   - ci:${ciKeyPrefix}-network:<node>:<iface>
10. Include relationships in stored CI values where available, such as cluster membership, hosting node, network attachments, and backing storage.
11. If persistCiMap is true, call mcp_od_memory_save after populating or updating the CI map.
12. Finish with a concise summary that includes tested tools, nodes covered, discovered VM and container counts, and memory keys created or updated.

Guardrails:
1. Keep this workflow read-only against Proxmox.
2. Do not coerce vmid to a number.
3. Always prefer the explicit vmid field over parsing the id field when both are present.
4. Use representative live data from the cluster rather than hard-coded sample identifiers.
5. If the cluster is large, state any sampling or scoping decisions explicitly.`;

  return asPromptResult('Proxmox cluster validation and CMDB mapping workflow', promptText);
}

export const promptDefinitions: PromptRegistration[] = [
  {
    name: 'cmdb_ci_classification',
    description:
      'CMDB CI Classification Standards - Provides guidance for classifying Configuration Items (CIs) in the CMDB according to ITIL v4 standards',
    inputSchema: CmdbPromptInputShape,
    handler: async (args) => generateCmdbClassificationPrompt(args as CmdbPromptArgs),
  },
  {
    name: 'network_topology_analysis',
    description: 'Network Topology Analysis - Analyzes network topology data and provides insights for infrastructure mapping',
    inputSchema: NetworkTopologyPromptInputShape,
    handler: async (args) => generateNetworkTopologyPrompt(args as NetworkTopologyPromptArgs),
  },
  {
    name: 'security_assessment',
    description:
      'Infrastructure Security Assessment - Provides security analysis and recommendations based on infrastructure discovery',
    inputSchema: SecurityAssessmentPromptInputShape,
    handler: async (args) => generateSecurityAssessmentPrompt(args as SecurityAssessmentPromptArgs),
  },
  {
    name: 'capacity_planning',
    description:
      'Infrastructure Capacity Planning - Analyzes resource utilization and provides capacity planning recommendations',
    inputSchema: CapacityPlanningPromptInputShape,
    handler: async (args) => generateCapacityPlanningPrompt(args as CapacityPlanningPromptArgs),
  },
  {
    name: 'incident_response',
    description:
      'Incident Response Playbook - Provides incident response guidance based on infrastructure alerts and monitoring data',
    inputSchema: IncidentResponsePromptInputShape,
    handler: async (args) => generateIncidentResponsePrompt(args as IncidentResponsePromptArgs),
  },
  {
    name: 'proxmox_cluster_validation',
    description:
      'Proxmox Cluster Validation - Asks for missing Proxmox inputs, exercises cluster discovery in JSON and markdown modes, and builds a CMDB memory map for the cluster',
    inputSchema: ProxmoxClusterValidationPromptInputShape,
    handler: async (args) => generateProxmoxClusterValidationPrompt(args as ProxmoxClusterValidationPromptArgs),
  },
];