// tools/prompts_sdk.js
// MCP Prompts for Infrastructure Discovery and CMDB Standards
const { 
  ListPromptsRequestSchema,
  GetPromptRequestSchema 
} = require('@modelcontextprotocol/sdk/types');

const PROMPTS = {
  'cmdb_ci_classification': {
    name: 'cmdb_ci_classification',
    description: 'Provides guidance for classifying Configuration Items (CIs) in the CMDB according to ITIL v4 standards',
    arguments: [
      {
        name: 'deviceType',
        description: 'Type of device discovered (server, network, storage, etc.)',
        required: false
      },
      {
        name: 'discoveredData',
        description: 'Raw discovery data from SNMP, network scans, etc.',
        required: false
      }
    ]
  },
  'network_topology_analysis': {
    name: 'network_topology_analysis',
    description: 'Analyzes network discovery data to identify topology patterns and infrastructure relationships',
    arguments: [
      {
        name: 'networkData',
        description: 'Network discovery data (SNMP, ping, traceroute results)',
        required: true
      },
      {
        name: 'subnet',
        description: 'Network subnet being analyzed',
        required: false
      }
    ]
  },
  'infrastructure_health_assessment': {
    name: 'infrastructure_health_assessment',
    description: 'Evaluates infrastructure health metrics and provides operational recommendations',
    arguments: [
      {
        name: 'healthData',
        description: 'Infrastructure health metrics (CPU, memory, disk, network)',
        required: true
      },
      {
        name: 'systemType',
        description: 'Type of system (server, network device, storage)',
        required: false
      }
    ]
  },
  'compliance_gap_analysis': {
    name: 'compliance_gap_analysis',
    description: 'Identifies compliance gaps in infrastructure configuration and security',
    arguments: [
      {
        name: 'configData',
        description: 'Infrastructure configuration data',
        required: true
      },
      {
        name: 'complianceFramework',
        description: 'Compliance framework (SOX, PCI-DSS, HIPAA, etc.)',
        required: false
      }
    ]
  },
  'incident_analysis_guidance': {
    name: 'incident_analysis_guidance',
    description: 'Provides structured analysis framework for infrastructure incidents and outages',
    arguments: [
      {
        name: 'incidentData',
        description: 'Incident details, symptoms, and initial findings',
        required: true
      },
      {
        name: 'severity',
        description: 'Incident severity level',
        required: false
      }
    ]
  }
};

function generatePromptResponse(promptName, args) {
  switch (promptName) {
    case 'cmdb_ci_classification': {
      const { deviceType, discoveredData } = args || {};
      
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

    case 'network_topology_analysis': {
      const { networkData, subnet } = args || {};
      
      let promptText = `As a network infrastructure expert, analyze the following network discovery data to identify topology patterns and device relationships.

Network Analysis Framework:
1. Device Role Identification: Core, Distribution, Access, DMZ, Management
2. Network Segmentation: VLANs, Subnets, Security Zones
3. Redundancy Patterns: Primary/Secondary paths, Load balancing
4. Service Dependencies: Critical vs. Non-critical devices
5. Security Boundaries: Firewalls, ACLs, Network boundaries

Discovery Data:
${networkData || 'No network data provided'}`;

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

    case 'infrastructure_health_assessment': {
      const { healthData, systemType } = args || {};
      
      let promptText = `As an infrastructure monitoring expert, assess the following health metrics and provide operational recommendations.

Health Assessment Framework:
1. Performance Thresholds: CPU (<80%), Memory (<85%), Disk (<90%)
2. Availability Metrics: Uptime, Error rates, Response times
3. Capacity Planning: Growth trends, Resource utilization
4. Risk Assessment: Single points of failure, Aging hardware
5. Maintenance Windows: Optimal timing, Impact analysis

Health Metrics:
${healthData || 'No health data provided'}`;

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

    case 'compliance_gap_analysis': {
      const { configData, complianceFramework } = args || {};
      
      let promptText = `As a compliance and security expert, analyze the infrastructure configuration for compliance gaps and security vulnerabilities.

Compliance Assessment Framework:
1. Configuration Standards: Hardening guidelines, Security baselines
2. Access Controls: Authentication, Authorization, Privilege management
3. Data Protection: Encryption, Backup, Retention policies
4. Monitoring: Logging, Alerting, Audit trails
5. Change Management: Approval processes, Documentation, Testing

Configuration Data:
${configData || 'No configuration data provided'}`;

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

    case 'incident_analysis_guidance': {
      const { incidentData, severity } = args || {};
      
      let promptText = `As an incident response expert, provide structured analysis guidance for the following infrastructure incident.

Incident Analysis Framework:
1. Root Cause Analysis: Technical, Process, Human factors
2. Impact Assessment: Business impact, User impact, System dependencies
3. Timeline Analysis: Event sequence, Response times, Resolution steps
4. Communication: Stakeholder updates, Status reporting, Documentation
5. Prevention: Lessons learned, Process improvements, Monitoring enhancements

Incident Details:
${incidentData || 'No incident data provided'}`;

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

    default:
      throw new Error(`Prompt not found: ${promptName}`);
  }
}

function registerPrompts(server) {
  console.log('[PROMPTS] Registering infrastructure analysis prompts...');

  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    console.log('[PROMPTS] Listing prompts - found', Object.keys(PROMPTS).length, 'prompts');
    return {
      prompts: Object.values(PROMPTS)
    };
  });

  // Get specific prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    console.log('[PROMPTS] Getting prompt:', request.params.name);
    const prompt = PROMPTS[request.params.name];
    if (!prompt) {
      throw new Error(`Prompt not found: ${request.params.name}`);
    }

    try {
      const response = generatePromptResponse(request.params.name, request.params.arguments);
      console.log('[PROMPTS] Generated prompt response for:', request.params.name);
      return response;
    } catch (error) {
      console.error('[PROMPTS] Error generating prompt response:', error);
      throw error;
    }
  });

  console.log(`[PROMPTS] Successfully registered ${Object.keys(PROMPTS).length} infrastructure analysis prompts`);
}

module.exports = {
  registerPrompts,
  PROMPTS,
  generatePromptResponse
};
