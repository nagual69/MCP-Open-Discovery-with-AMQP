// tools/prompts_sdk.js
// MCP Prompts registry for Infrastructure Discovery and CMDB Standards

/**
 * Get all available prompts for MCP registration
 * These are properly formatted MCP prompts following the 2025-06-18 specification
 */
function getPrompts() {
  return [
    {
      name: 'cmdb_ci_classification',
      title: 'CMDB CI Classification Standards',
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

    {
      name: 'network_topology_analysis',
      title: 'Network Topology Analysis', 
      description: 'Analyzes network topology data and provides insights for infrastructure mapping',
      arguments: [
        {
          name: 'topologyData',
          description: 'Network topology discovery data (CDP/LLDP neighbors, routing tables, etc.)',
          required: false
        },
        {
          name: 'networkSegment',
          description: 'Specific network segment or VLAN to analyze',
          required: false
        }
      ]
    },

    {
      name: 'security_assessment',
      title: 'Infrastructure Security Assessment',
      description: 'Provides security analysis and recommendations based on infrastructure discovery',
      arguments: [
        {
          name: 'scanResults',
          description: 'Port scan results, service discovery, vulnerability data',
          required: false
        },
        {
          name: 'assetType',
          description: 'Type of asset being assessed (server, network device, application)',
          required: false
        }
      ]
    },

    {
      name: 'capacity_planning',
      title: 'Infrastructure Capacity Planning',
      description: 'Analyzes resource utilization and provides capacity planning recommendations',
      arguments: [
        {
          name: 'utilizationData',
          description: 'CPU, memory, storage, and network utilization metrics',
          required: false
        },
        {
          name: 'timeframe',
          description: 'Planning timeframe (6 months, 1 year, 2 years)',
          required: false
        }
      ]
    },

    {
      name: 'incident_response',
      title: 'Incident Response Playbook',
      description: 'Provides incident response guidance based on infrastructure alerts and monitoring data',
      arguments: [
        {
          name: 'alertData',
          description: 'Alert details, monitoring data, system logs',
          required: false
        },
        {
          name: 'severity',
          description: 'Incident severity level (critical, high, medium, low)',
          required: false
        }
      ]
    }
  ];
}

/**
 * Handle a prompt request and generate appropriate content
 * @param {string} name - Prompt name
 * @param {Object} args - Prompt arguments
 * @returns {Object} Prompt response with description and messages
 */
async function handlePromptRequest(name, args) {
  switch (name) {
    case 'cmdb_ci_classification':
      return generateCMDBClassificationPrompt(args);
    case 'network_topology_analysis':
      return generateNetworkTopologyPrompt(args);
    case 'security_assessment':
      return generateSecurityAssessmentPrompt(args);
    case 'capacity_planning':
      return generateCapacityPlanningPrompt(args);
    case 'incident_response':
      return generateIncidentResponsePrompt(args);
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

function generateCMDBClassificationPrompt(args) {
  let promptText = `As an ITIL v4 expert, help classify Configuration Items (CIs) for a CMDB based on infrastructure discovery data.

CMDB CI Classification Standards:
1. CI Types: Server, Network Device, Storage, Application, Service, Database, Virtual Machine, Container
2. CI Attributes: Name, Type, Status, Location, Owner, Dependencies, Relationships
3. CI Relationships: Depends On, Part Of, Connects To, Hosts, Runs On
4. CI Status: Active, Inactive, Planned, Retired, Under Change

Discovery Context:`;

  if (args.deviceType) {
    promptText += `\nDevice Type: ${args.deviceType}`;
  }

  if (args.discoveredData) {
    promptText += `\nDiscovered Data:\n${args.discoveredData}`;
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

function generateNetworkTopologyPrompt(args) {
  let promptText = `Analyze network topology data and provide insights for infrastructure mapping and optimization.

Network Analysis Framework:
1. Physical Topology: Switches, routers, connections, link utilization
2. Logical Topology: VLANs, subnets, routing domains, broadcast domains
3. Layer 2/3 Relationships: STP topology, OSPF/EIGRP areas, BGP AS paths
4. Redundancy Analysis: Backup paths, single points of failure
5. Performance Metrics: Bandwidth utilization, latency, packet loss

Topology Data:`;

  if (args.topologyData) {
    promptText += `\n${args.topologyData}`;
  }

  if (args.networkSegment) {
    promptText += `\nFocus Segment: ${args.networkSegment}`;
  }

  promptText += `\n\nPlease provide:
1. Network topology summary and key findings
2. Redundancy and resilience assessment
3. Performance bottleneck identification
4. Security segmentation recommendations
5. Optimization opportunities`;

  return {
    description: 'Network topology analysis',
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

function generateSecurityAssessmentPrompt(args) {
  let promptText = `Perform a security assessment based on infrastructure discovery data and provide actionable recommendations.

Security Assessment Framework:
1. Attack Surface Analysis: Open ports, exposed services, network accessibility
2. Vulnerability Assessment: Known CVEs, misconfigurations, weak protocols
3. Access Control Review: Authentication methods, authorization mechanisms
4. Network Security: Firewall rules, segmentation, encryption in transit
5. Compliance Checks: Industry standards (NIST, CIS, ISO 27001)

Discovery Data:`;

  if (args.scanResults) {
    promptText += `\nScan Results:\n${args.scanResults}`;
  }

  if (args.assetType) {
    promptText += `\nAsset Type: ${args.assetType}`;
  }

  promptText += `\n\nPlease provide:
1. Security risk assessment and prioritization
2. Critical vulnerabilities requiring immediate attention
3. Hardening recommendations by asset type
4. Network security improvements
5. Compliance gap analysis and remediation steps`;

  return {
    description: 'Infrastructure security assessment',
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

function generateCapacityPlanningPrompt(args) {
  let promptText = `Analyze infrastructure capacity utilization and provide planning recommendations for future growth.

Capacity Planning Framework:
1. Resource Utilization: CPU, memory, storage, network bandwidth trends
2. Growth Patterns: Historical usage growth, seasonal variations
3. Performance Thresholds: Warning and critical utilization levels
4. Scalability Options: Vertical vs horizontal scaling, cloud integration
5. Cost Optimization: Right-sizing, consolidation opportunities

Utilization Metrics:`;

  if (args.utilizationData) {
    promptText += `\n${args.utilizationData}`;
  }

  if (args.timeframe) {
    promptText += `\nPlanning Timeframe: ${args.timeframe}`;
  } else {
    promptText += `\nPlanning Timeframe: 12 months (default)`;
  }

  promptText += `\n\nPlease provide:
1. Current capacity utilization summary
2. Projected resource requirements based on trends
3. Bottleneck identification and resolution strategies
4. Scaling recommendations with timeline
5. Cost-benefit analysis for recommended changes`;

  return {
    description: 'Infrastructure capacity planning analysis',
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

function generateIncidentResponsePrompt(args) {
  let promptText = `Provide incident response guidance based on infrastructure alerts and monitoring data.

Incident Response Framework:
1. Incident Classification: Severity assessment, impact analysis
2. Initial Response: Immediate containment, stakeholder notification
3. Investigation: Root cause analysis, evidence collection
4. Resolution: Remediation steps, service restoration
5. Post-Incident: Lessons learned, preventive measures

Alert Details:`;

  if (args.alertData) {
    promptText += `\n${args.alertData}`;
  }

  if (args.severity) {
    promptText += `\nSeverity Level: ${args.severity}`;
  } else {
    promptText += `\nSeverity Level: To be determined`;
  }

  promptText += `\n\nPlease provide:
1. Incident severity assessment and classification
2. Immediate response steps and containment actions
3. Investigation approach and data collection strategy
4. Resolution pathway and service restoration plan
5. Post-incident review recommendations`;

  return {
    description: 'Incident response playbook',
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

/**
 * Register all prompts with the MCP server using the correct SDK pattern
 */
function registerAllPrompts(server) {
  try {
    console.log('[MCP SDK] Starting prompt registration...');
    
    const prompts = getPrompts();
    
    // Register prompts handlers using the correct SDK method
    server.setPromptRequestHandlers({
      // Handler for prompts/list
      async listPrompts() {
        return {
          prompts: prompts.map(p => ({
            name: p.name,
            title: p.title,
            description: p.description,
            arguments: p.arguments
          }))
        };
      },
      
      // Handler for prompts/get
      async getPrompt(request) {
        const { name, arguments: args } = request.params;
        
        // Find the requested prompt
        const prompt = prompts.find(p => p.name === name);
        if (!prompt) {
          throw new Error(`Prompt not found: ${name}`);
        }
        
        // Generate dynamic content based on the prompt and arguments
        return await handlePromptRequest(name, args || {});
      }
    });
    
    console.log(`[MCP SDK] Registered ${prompts.length} prompts successfully`);
    
  } catch (error) {
    console.error('[MCP SDK] Error registering prompts:', error.message);
    throw error;
  }
}

module.exports = {
  getPrompts,
  registerAllPrompts,
  handlePromptRequest
};
