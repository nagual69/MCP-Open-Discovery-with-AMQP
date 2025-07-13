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

    {
      name: 'infrastructure_security_assessment',
      title: 'Infrastructure Security Assessment',
      description: 'Evaluates security posture of discovered infrastructure components',
      arguments: [
        {
          name: 'scanResults',
          description: 'Security scan results (Nmap, vulnerability scans, etc.)',
          required: true
        },
        {
          name: 'complianceFramework',
          description: 'Compliance framework to assess against (ISO 27001, NIST, PCI-DSS, etc.)',
          required: false
        }
      ]
    },

    {
      name: 'capacity_planning_analysis',
      title: 'Infrastructure Capacity Planning',
      description: 'Analyzes current infrastructure utilization and provides capacity planning recommendations',
      arguments: [
        {
          name: 'utilizationData',
          description: 'Current utilization metrics (CPU, memory, storage, network)',
          required: true
        },
        {
          name: 'growthProjections',
          description: 'Expected growth projections or business requirements',
          required: false
        }
      ]
    },

    {
      name: 'incident_response_playbook',
      title: 'Incident Response Playbook Generator',
      description: 'Generates incident response procedures based on infrastructure discovery and monitoring data',
      arguments: [
        {
          name: 'incidentType',
          description: 'Type of incident (network outage, server failure, security breach, etc.)',
          required: true
        },
        {
          name: 'affectedSystems',
          description: 'List of affected systems or components',
          required: false
        }
      ]
    }
  ];
}

/**
 * Prompt handler that generates the actual prompt content based on the template and arguments
 */
function handlePromptRequest(name, args) {
  switch (name) {
    case 'cmdb_ci_classification':
      return generateCMDBClassificationPrompt(args);
    case 'network_topology_analysis':
      return generateNetworkTopologyPrompt(args);
    case 'infrastructure_security_assessment':
      return generateSecurityAssessmentPrompt(args);
    case 'capacity_planning_analysis':
      return generateCapacityPlanningPrompt(args);
    case 'incident_response_playbook':
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
  let promptText = `As a network infrastructure expert, analyze the following network discovery data to identify topology patterns and device relationships.

Network Analysis Framework:
1. Device Role Identification: Core, Distribution, Access, DMZ, Management
2. Network Segmentation: VLANs, Subnets, Security Zones
3. Redundancy Patterns: Primary/Secondary paths, Load balancing
4. Service Dependencies: Critical vs. Non-critical devices
5. Security Boundaries: Firewalls, ACLs, Network boundaries

Discovery Data:
${args.networkData}`;

  if (args.subnet) {
    promptText += `\nSubnet Context: ${args.subnet}`;
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

function generateSecurityAssessmentPrompt(args) {
  let promptText = `As a cybersecurity expert, analyze the following infrastructure scan results to assess security posture and identify vulnerabilities.

Security Assessment Framework:
1. Vulnerability Analysis: Critical, High, Medium, Low severity issues
2. Attack Surface: Exposed services, ports, protocols
3. Compliance Check: Security standards and best practices
4. Risk Assessment: Business impact and likelihood
5. Remediation Priority: Quick wins vs. strategic improvements

Scan Results:
${args.scanResults}`;

  if (args.complianceFramework) {
    promptText += `\nCompliance Framework: ${args.complianceFramework}`;
  }

  promptText += `\n\nPlease provide:
1. Security risk assessment summary
2. Prioritized vulnerability list
3. Compliance gap analysis
4. Remediation recommendations
5. Security monitoring suggestions`;

  return {
    description: 'Infrastructure security assessment and recommendations',
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
  let promptText = `As an infrastructure capacity planning expert, analyze the following utilization data to provide capacity planning recommendations.

Capacity Planning Framework:
1. Current Utilization: CPU, Memory, Storage, Network trends
2. Growth Patterns: Historical data and trending
3. Resource Bottlenecks: Performance constraints
4. Scaling Options: Vertical vs. Horizontal scaling
5. Cost Optimization: Right-sizing and efficiency

Utilization Data:
${args.utilizationData}`;

  if (args.growthProjections) {
    promptText += `\nGrowth Projections: ${args.growthProjections}`;
  }

  promptText += `\n\nPlease provide:
1. Current capacity assessment
2. Projected resource needs
3. Scaling recommendations
4. Performance optimization opportunities
5. Budget planning guidance`;

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
  let promptText = `As an incident response expert, create a structured response playbook for the following incident scenario.

Incident Response Framework:
1. Initial Assessment: Scope, impact, urgency
2. Containment: Immediate actions to limit damage
3. Investigation: Root cause analysis
4. Recovery: Service restoration procedures
5. Post-Incident: Lessons learned and improvements

Incident Type: ${args.incidentType}`;

  if (args.affectedSystems) {
    promptText += `\nAffected Systems: ${args.affectedSystems}`;
  }

  promptText += `\n\nPlease provide:
1. Incident classification and priority
2. Immediate response steps
3. Investigation procedures
4. Recovery plan
5. Communication templates
6. Post-incident review checklist`;

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
        return handlePromptRequest(name, args || {});
      }
    });
    
    console.log(`[MCP SDK] Registered ${prompts.length} prompts successfully`);
    
  } catch (error) {
    console.error('[MCP SDK] Error registering prompts:', error.message);
    throw error;
  }
}
    
    console.log(`[MCP SDK] Registered ${prompts.length} prompts successfully`);
    return true;
    
  } catch (error) {
    console.error(`[MCP SDK] Error registering prompts: ${error.message}`);
    return false;
  }
}

module.exports = {
  getPrompts,
  registerAllPrompts,
  handlePromptRequest
};
