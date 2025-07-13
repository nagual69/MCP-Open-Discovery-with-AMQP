// tools/prompts_sdk.js
// MCP Prompts registry for Infrastructure Discovery and CMDB Standards
const { z } = require('zod');

function getPrompts() {
  return [
    {
      name: 'cmdb_ci_classification',
      title: 'CMDB CI Classification Standards',
      description: 'Provides guidance for classifying Configuration Items (CIs) in the CMDB according to ITIL v4 standards',
      argsSchema: z.object({
        deviceType: z.string().optional().describe('Type of device discovered (server, network, storage, etc.)'),
        discoveredData: z.string().optional().describe('Raw discovery data from SNMP, network scans, etc.')
      }),
      callback: async ({ deviceType, discoveredData }) => {
        let promptText = `As an ITIL v4 expert, help classify Configuration Items (CIs) for a CMDB based on infrastructure discovery data.

CMDB CI Classification Standards:
1. CI Types: Server, Network Device, Storage, Application, Service, Database, Virtual Machine, Container
2. CI Attributes: Name, Type, Status, Location, Owner, Dependencies, Relationships
3. CI Relationships: Depends On, Part Of, Connects To, Hosts, Runs On
4. CI Status: Active, Inactive, Planned, Retired, Under Change

Discovery Context:`;

        if (deviceType) {
          promptText += `\nDevice Type: ${deviceType}`;
        }

        if (discoveredData) {
          promptText += `\nDiscovered Data:\n${discoveredData}`;
        }

        promptText += `\n\nPlease provide:
1. Recommended CI classification and type
2. Key attributes to capture
3. Suggested relationships to other CIs
4. CMDB naming convention
5. Lifecycle status recommendation`;

        return {
          description: 'CMDB CI classification guidance',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: promptText
              }
            }
          ]
        };
      }
    },

    {
      name: 'network_topology_analysis',
      title: 'Network Topology Analysis',
      description: 'Analyzes network discovery data to identify topology patterns and infrastructure relationships',
      argsSchema: z.object({
        networkData: z.string().describe('Network discovery data (SNMP, ping, traceroute results)'),
        subnet: z.string().optional().describe('Network subnet being analyzed')
      }),
      callback: async ({ networkData, subnet }) => {
        let promptText = `As a network infrastructure expert, analyze the following network discovery data to identify topology patterns and device relationships.

Network Analysis Framework:
1. Device Role Identification: Core, Distribution, Access, DMZ, Management
2. Network Segmentation: VLANs, Subnets, Security Zones
3. Redundancy Patterns: Primary/Secondary paths, Load balancing
4. Service Dependencies: Critical vs. Non-critical devices
5. Security Boundaries: Firewalls, ACLs, Network boundaries

Discovery Data:
${networkData}`;

        if (subnet) {
          promptText += `\nSubnet Context: ${subnet}`;
        }

        promptText += `\n\nPlease provide:
1. Network topology map description
2. Device role classifications
3. Critical path identification
4. Redundancy and failover analysis
5. Security zone recommendations
6. Suggested CMDB relationships`;

        return {
          description: 'Network topology analysis and recommendations',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: promptText
              }
            }
          ]
        };
      }
    },

    {
      name: 'infrastructure_health_assessment',
      title: 'Infrastructure Health Assessment',
      description: 'Evaluates infrastructure health metrics and provides operational recommendations',
      argsSchema: z.object({
        healthData: z.string().describe('Infrastructure health metrics (CPU, memory, disk, network)'),
        systemType: z.string().optional().describe('Type of system (server, network device, storage)')
      }),
      callback: async ({ healthData, systemType }) => {
        let promptText = `As an infrastructure monitoring expert, assess the following health metrics and provide operational recommendations.

Health Assessment Framework:
1. Performance Thresholds: CPU (<80%), Memory (<85%), Disk (<90%)
2. Availability Metrics: Uptime, Error rates, Response times
3. Capacity Planning: Growth trends, Resource utilization
4. Risk Assessment: Single points of failure, Aging hardware
5. Maintenance Windows: Optimal timing, Impact analysis

Health Metrics:
${healthData}`;

        if (systemType) {
          promptText += `\nSystem Type: ${systemType}`;
        }

        promptText += `\n\nPlease provide:
1. Current health status assessment
2. Performance bottleneck identification
3. Capacity planning recommendations
4. Risk mitigation strategies
5. Monitoring threshold suggestions
6. Maintenance scheduling recommendations`;

        return {
          description: 'Infrastructure health assessment and recommendations',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: promptText
              }
            }
          ]
        };
      }
    },

    {
      name: 'compliance_gap_analysis',
      title: 'Infrastructure Compliance Gap Analysis',
      description: 'Identifies compliance gaps in infrastructure configuration and security',
      argsSchema: z.object({
        configData: z.string().describe('Infrastructure configuration data'),
        complianceFramework: z.string().optional().describe('Compliance framework (SOX, PCI-DSS, HIPAA, etc.)')
      }),
      callback: async ({ configData, complianceFramework }) => {
        let promptText = `As a compliance and security expert, analyze the infrastructure configuration for compliance gaps and security vulnerabilities.

Compliance Assessment Framework:
1. Configuration Standards: Hardening guidelines, Security baselines
2. Access Controls: Authentication, Authorization, Privilege management
3. Data Protection: Encryption, Backup, Retention policies
4. Monitoring: Logging, Alerting, Audit trails
5. Change Management: Approval processes, Documentation, Testing

Configuration Data:
${configData}`;

        if (complianceFramework) {
          promptText += `\nCompliance Framework: ${complianceFramework}`;
        }

        promptText += `\n\nPlease provide:
1. Compliance gap identification
2. Security vulnerability assessment
3. Configuration hardening recommendations
4. Policy compliance status
5. Remediation prioritization
6. Audit trail requirements`;

        return {
          description: 'Compliance gap analysis and remediation guidance',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: promptText
              }
            }
          ]
        };
      }
    },

    {
      name: 'incident_analysis_guidance',
      title: 'Infrastructure Incident Analysis',
      description: 'Provides structured analysis framework for infrastructure incidents and outages',
      argsSchema: z.object({
        incidentData: z.string().describe('Incident details, symptoms, and initial findings'),
        severity: z.string().optional().describe('Incident severity level')
      }),
      callback: async ({ incidentData, severity }) => {
        let promptText = `As an incident response expert, provide structured analysis guidance for the following infrastructure incident.

Incident Analysis Framework:
1. Root Cause Analysis: Technical, Process, Human factors
2. Impact Assessment: Business impact, User impact, System dependencies
3. Timeline Analysis: Event sequence, Response times, Resolution steps
4. Communication: Stakeholder updates, Status reporting, Documentation
5. Prevention: Lessons learned, Process improvements, Monitoring enhancements

Incident Details:
${incidentData}`;

        if (severity) {
          promptText += `\nSeverity Level: ${severity}`;
        }

        promptText += `\n\nPlease provide:
1. Incident classification and priority
2. Root cause analysis approach
3. Impact assessment methodology
4. Investigation checklist
5. Communication plan template
6. Post-incident review framework`;

        return {
          description: 'Infrastructure incident analysis guidance',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: promptText
              }
            }
          ]
        };
      }
    }
  ];
}

// Internal registry for dynamic management
const registeredPrompts = {};
let mcpServerInstance = null;

function registerAllPrompts(server) {
  mcpServerInstance = server;
  const prompts = getPrompts();
  for (const prompt of prompts) {
    addPrompt(prompt, server);
  }
}

function isServerConnected(server) {
  return server && server.server && server.server.transport;
}

function addPrompt(prompt, server = mcpServerInstance) {
  if (!server) throw new Error('MCP server instance not set');
  if (registeredPrompts[prompt.name]) {
    throw new Error(`Prompt '${prompt.name}' already registered`);
  }
  const reg = server.prompt(
    prompt.name,
    prompt.title || undefined,
    prompt.description || undefined,
    prompt.argsSchema || undefined,
    prompt.callback
  );
  registeredPrompts[prompt.name] = reg;
  // Only notify if server is connected
  if (isServerConnected(server)) {
    server.server.sendPromptListChanged();
  }
  return reg;
}

function removePrompt(name, server = mcpServerInstance) {
  const reg = registeredPrompts[name];
  if (reg) {
    reg.remove();
    delete registeredPrompts[name];
    if (isServerConnected(server)) {
      server.server.sendPromptListChanged();
    }
    return true;
  }
  return false;
}

function enablePrompt(name) {
  const reg = registeredPrompts[name];
  if (reg) {
    reg.enable();
    if (isServerConnected(mcpServerInstance)) {
      mcpServerInstance.server.sendPromptListChanged();
    }
    return true;
  }
  return false;
}

function disablePrompt(name) {
  const reg = registeredPrompts[name];
  if (reg) {
    reg.disable();
    if (isServerConnected(mcpServerInstance)) {
      mcpServerInstance.server.sendPromptListChanged();
    }
    return true;
  }
  return false;
}

function listRegisteredPrompts() {
  return Object.keys(registeredPrompts);
}

module.exports = {
  getPrompts,
  registerAllPrompts,
  addPrompt,
  removePrompt,
  enablePrompt,
  disablePrompt,
  listRegisteredPrompts
};
