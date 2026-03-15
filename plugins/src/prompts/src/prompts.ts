import type {
  CapacityPlanningPromptArgs,
  CmdbPromptArgs,
  IncidentResponsePromptArgs,
  NetworkTopologyPromptArgs,
  PromptRegistration,
  PromptResult,
  SecurityAssessmentPromptArgs,
} from './types';
import {
  CapacityPlanningPromptInputShape,
  CmdbPromptInputShape,
  IncidentResponsePromptInputShape,
  NetworkTopologyPromptInputShape,
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
];