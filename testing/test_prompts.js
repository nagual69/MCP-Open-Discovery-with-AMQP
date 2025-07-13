/**
 * Test script for MCP Prompts using proper MCP HTTP transport
 */

const http = require('http');

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          // Handle SSE format response
          if (res.headers['content-type']?.includes('text/event-stream')) {
            const lines = body.split('\n');
            let jsonData = null;
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  jsonData = JSON.parse(line.substring(6));
                  break;
                } catch (e) {
                  // Continue looking for valid JSON
                }
              }
            }
            
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: jsonData
            });
          } else {
            // Handle regular JSON response
            const parsed = body ? JSON.parse(body) : null;
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: parsed
            });
          }
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

class MCPPromptClient {
  constructor() {
    this.sessionId = null;
    this.baseOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      }
    };
  }

  async initialize() {
    log('info', 'Initializing MCP session...');
    
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          prompts: {}
        },
        clientInfo: {
          name: 'mcp-prompt-tester',
          version: '1.0.0'
        }
      }
    };

    try {
      const response = await makeRequest(this.baseOptions, initRequest);
      
      log('debug', 'Full initialization response', {
        statusCode: response.statusCode,
        headers: response.headers,
        body: response.body
      });
      
      if (response.statusCode === 200 && response.body) {
        if (response.body.result) {
          log('info', 'MCP session initialized successfully', response.body.result);
          
          this.sessionId = response.headers['mcp-session-id'];
          if (this.sessionId) {
            log('info', `Session ID: ${this.sessionId}`);
            this.baseOptions.headers['mcp-session-id'] = this.sessionId;
            return true;
          } else {
            log('error', 'No session ID returned');
            return false;
          }
        } else if (response.body.error) {
          log('error', 'MCP initialization failed', response.body.error);
          return false;
        }
      } else {
        log('error', 'Unexpected response from server', {
          statusCode: response.statusCode,
          body: response.body
        });
        return false;
      }
    } catch (error) {
      log('error', 'Failed to initialize MCP session', error.message);
      return false;
    }
  }

  async listPrompts() {
    log('info', 'Listing available prompts...');
    
    const listRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'prompts/list',
      params: {}
    };

    try {
      const response = await makeRequest(this.baseOptions, listRequest);
      
      if (response.statusCode === 200 && response.body?.result) {
        const prompts = response.body.result.prompts || [];
        log('info', `Found ${prompts.length} prompts`);
        
        prompts.forEach((prompt, index) => {
          log('info', `Prompt ${index + 1}: ${prompt.name}`, {
            description: prompt.description,
            arguments: prompt.arguments
          });
        });
        
        return prompts;
      } else {
        log('error', 'Failed to list prompts', response.body);
        return [];
      }
    } catch (error) {
      log('error', 'Error listing prompts', error.message);
      return [];
    }
  }

  async testPrompt(promptName, args = {}) {
    log('info', `Testing prompt: ${promptName}`);
    
    const promptRequest = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1000) + 100,
      method: 'prompts/get',
      params: {
        name: promptName,
        arguments: args
      }
    };

    try {
      const response = await makeRequest(this.baseOptions, promptRequest);
      
      log('debug', 'Raw prompt response', {
        statusCode: response.statusCode,
        body: response.body
      });
      
      if (response.statusCode === 200 && response.body) {
        if (response.body.result) {
          const result = response.body.result;
          log('info', `✅ Prompt '${promptName}' succeeded`);
          
          if (result.messages && Array.isArray(result.messages)) {
            log('info', `Generated ${result.messages.length} message(s)`);
            result.messages.forEach((msg, index) => {
              log('info', `Message ${index + 1}:`, {
                role: msg.role,
                contentLength: msg.content?.text?.length || 0,
                preview: msg.content?.text?.substring(0, 200) + '...'
              });
            });
          }
          
          return { success: true, result };
        } else if (response.body.error) {
          log('error', `❌ Prompt '${promptName}' failed`, response.body.error);
          return { success: false, error: response.body.error };
        }
      } else {
        log('error', `❌ Unexpected response for prompt '${promptName}'`, {
          statusCode: response.statusCode,
          body: response.body
        });
        return { success: false, error: 'Unexpected response' };
      }
    } catch (error) {
      log('error', `❌ Error testing prompt '${promptName}'`, error.message);
      return { success: false, error: error.message };
    }
  }

  async runAllPromptTests() {
    log('info', '🚀 Starting MCP Prompt Tests');
    
    const initialized = await this.initialize();
    if (!initialized) {
      log('error', 'Failed to initialize MCP session');
      return;
    }

    const prompts = await this.listPrompts();
    if (prompts.length === 0) {
      log('error', 'No prompts available for testing');
      return;
    }

    const testCases = [
      {
        name: 'cmdb_ci_classification',
        args: {
          deviceType: 'server',
          discoveredData: JSON.stringify({
            hostname: 'web-server-01',
            ip: '192.168.1.100',
            os: 'Ubuntu 20.04',
            services: ['nginx', 'mysql'],
            cpu_cores: 4,
            memory: '8GB'
          })
        }
      },
      {
        name: 'network_topology_analysis',
        args: {
          networkData: JSON.stringify({
            devices: [
              { name: 'router-01', type: 'router', ip: '192.168.1.1' },
              { name: 'switch-01', type: 'switch', ip: '192.168.1.2' },
              { name: 'server-01', type: 'server', ip: '192.168.1.100' }
            ],
            connections: [
              { from: 'router-01', to: 'switch-01', type: 'ethernet' },
              { from: 'switch-01', to: 'server-01', type: 'ethernet' }
            ]
          }),
          subnet: '192.168.1.0/24'
        }
      },
      {
        name: 'infrastructure_health_assessment',
        args: {
          healthData: JSON.stringify({
            servers: [
              { name: 'web-01', cpu: 85, memory: 92, disk: 78, status: 'warning' },
              { name: 'db-01', cpu: 45, memory: 67, disk: 23, status: 'healthy' }
            ],
            network: { latency: 15, packet_loss: 0.1, bandwidth_util: 65 },
            alerts: ['High memory usage on web-01', 'Disk space warning on web-01']
          }),
          systemType: 'server'
        }
      },
      {
        name: 'compliance_gap_analysis',
        args: {
          configData: JSON.stringify({
            framework: 'SOC2',
            systems: [
              { name: 'database-server', encryption: true, access_control: true, logging: false },
              { name: 'web-server', encryption: false, access_control: true, logging: true }
            ],
            policies: ['Data encryption required', 'Access logging mandatory', 'MFA required']
          }),
          complianceFramework: 'SOC2'
        }
      },
      {
        name: 'incident_analysis_guidance',
        args: {
          incidentData: JSON.stringify({
            incident_id: 'INC-2024-001',
            description: 'Database server experiencing high CPU usage',
            affected_systems: ['db-primary', 'web-frontend'],
            start_time: '2024-01-15T10:30:00Z',
            severity: 'High',
            current_status: 'Investigating'
          }),
          severity: 'High'
        }
      }
    ];

    const results = [];
    for (const testCase of testCases) {
      const result = await this.testPrompt(testCase.name, testCase.args);
      results.push({ name: testCase.name, ...result });
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    log('info', '\n📊 TEST SUMMARY');
    log('info', '================');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    log('info', `✅ Successful: ${successful.length}/${results.length}`);
    log('info', `❌ Failed: ${failed.length}/${results.length}`);
    
    if (successful.length > 0) {
      log('info', '\n✅ Successful prompts:');
      successful.forEach(r => log('info', `   - ${r.name}`));
    }
    
    if (failed.length > 0) {
      log('info', '\n❌ Failed prompts:');
      failed.forEach(r => {
        log('info', `   - ${r.name}:`);
        if (r.error) {
          log('info', `     Error: ${r.error.message || JSON.stringify(r.error)}`);
        }
      });
    }
  }
}

async function main() {
  const client = new MCPPromptClient();
  
  try {
    await client.runAllPromptTests();
  } catch (error) {
    log('error', 'Test suite failed', error.message);
  }
  
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MCPPromptClient;
