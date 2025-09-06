/**
 * Management UI - Web Interface for Registry Control
 * 
 * Features:
 * - Real-time registry status dashboard
 * - Module loading/unloading controls
 * - Tool testing and validation interface
 * - Performance metrics visualization
 * - Hot-reload monitoring
 * - Interactive tool explorer
 * 
 * This provides a comprehensive web-based management interface
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Web-based Management UI for the Registry System
 */
class ManagementUI {
  constructor(registry, options = {}) {
    this.registry = registry;
  this.port = options.port || 8080;
    this.server = null;
    this.enabled = options.enabled !== false;
    this.websockets = new Set();
  this.autoPort = options.autoPort !== false; // try next ports if in use
  }

  /**
   * Start the management UI server
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.enabled) {
      console.log('[Management UI] ⚠️  Disabled by configuration');
      return;
    }

    this.server = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      const tryListen = (attempt = 0, port = this.port) => {
        this.server.once('error', (err) => {
          if (err && err.code === 'EADDRINUSE' && this.autoPort && attempt < 20) {
            const nextPort = port + 1;
            console.warn(`[Management UI] Port ${port} in use; trying ${nextPort}...`);
            tryListen(attempt + 1, nextPort);
          } else {
            reject(err);
          }
        });
        this.server.listen(port, () => {
          // Successfully bound
          this.port = this.server.address().port;
          console.log(`[Management UI] 🚀 Started on http://localhost:${this.port}`);
          resolve();
        });
      };
      tryListen(0, this.port);
    });
  }

  /**
   * Stop the management UI server
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('[Management UI] ⏹️  Stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Handle HTTP requests
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @private
   */
  _handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      switch (url.pathname) {
        case '/':
          this._serveDashboard(res);
          break;
        case '/api/status':
          this._serveStatus(res);
          break;
        case '/api/modules':
          this._serveModules(res);
          break;
        case '/api/tools':
          this._serveTools(res);
          break;
        case '/api/metrics':
          this._serveMetrics(res);
          break;
        case '/api/reload':
          this._handleReload(req, res);
          break;
        case '/api/unload':
          this._handleUnload(req, res);
          break;
        case '/api/test-tool':
          this._handleToolTest(req, res);
          break;
        default:
          this._serve404(res);
      }
    } catch (error) {
      this._serveError(res, error);
    }
  }

  /**
   * Serve the main dashboard HTML
   * @param {Object} res - Response object
   * @private
   */
  _serveDashboard(res) {
    const html = this._generateDashboardHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Generate dashboard HTML
   * @returns {string} HTML content
   * @private
   */
  _generateDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Registry Management Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 1rem; text-align: center; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 1rem 0; padding: 1.5rem; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat { text-align: center; padding: 1rem; background: linear-gradient(135deg, #3498db, #2980b9); color: white; border-radius: 8px; }
        .stat-value { font-size: 2rem; font-weight: bold; }
        .stat-label { font-size: 0.9rem; opacity: 0.9; }
        .module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
        .module { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; background: white; }
        .module.active { border-color: #27ae60; background: #f8fff9; }
        .module-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .module-name { font-weight: bold; color: #2c3e50; }
        .module-category { background: #3498db; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
        .tool-list { font-size: 0.9rem; color: #666; }
        .actions { margin-top: 1rem; }
        .btn { background: #3498db; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-right: 0.5rem; }
        .btn:hover { background: #2980b9; }
        .btn.danger { background: #e74c3c; }
        .btn.danger:hover { background: #c0392b; }
        .btn.success { background: #27ae60; }
        .btn.success:hover { background: #219a52; }
        .status { font-weight: bold; }
        .status.ready { color: #27ae60; }
        .status.error { color: #e74c3c; }
        .refresh { float: right; }
        pre { background: #f8f9fa; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔧 MCP Open Discovery Registry Management</h1>
        <p>Real-time monitoring and control for the dynamic tool registry</p>
    </div>
    
    <div class="container">
        <div class="stats" id="stats">
            <!-- Stats will be loaded here -->
        </div>
        
        <div class="card">
            <h2>Registry Status <button class="btn refresh" onclick="loadStatus()">🔄 Refresh</button></h2>
            <div id="status-content">
                <!-- Status will be loaded here -->
            </div>
        </div>
        
        <div class="card">
            <h2>Modules</h2>
            <div class="module-grid" id="modules">
                <!-- Modules will be loaded here -->
            </div>
        </div>
        
        <div class="card">
            <h2>Performance Metrics</h2>
            <div id="metrics">
                <!-- Metrics will be loaded here -->
            </div>
        </div>
    </div>

    <script>
        // Auto-refresh every 5 seconds
        setInterval(loadAll, 5000);
        
        // Load initial data
        loadAll();
        
        async function loadAll() {
            await Promise.all([
                loadStatus(),
                loadModules(),
                loadMetrics()
            ]);
        }
        
        async function loadStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                document.getElementById('stats').innerHTML = \`
                    <div class="stat">
                        <div class="stat-value">\${data.summary.modules}</div>
                        <div class="stat-label">Modules</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">\${data.summary.tools}</div>
                        <div class="stat-label">Tools</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">\${data.summary.categories}</div>
                        <div class="stat-label">Categories</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">\${data.summary.hotReloadEnabled ? 'ON' : 'OFF'}</div>
                        <div class="stat-label">Hot Reload</div>
                    </div>
                \`;
                
                document.getElementById('status-content').innerHTML = \`
                    <p><strong>State:</strong> <span class="status \${data.summary.state}">\${data.summary.state.toUpperCase()}</span></p>
                    <p><strong>Database:</strong> \${data.summary.dbInitialized ? '✅ Connected' : '❌ Not Connected'}</p>
                    <p><strong>Hot Reload:</strong> \${data.summary.hotReloadEnabled ? '🔥 Enabled' : '❄️ Disabled'}</p>
                    <pre>\${JSON.stringify(data.summary.categoryBreakdown, null, 2)}</pre>
                \`;
            } catch (error) {
                console.error('Failed to load status:', error);
            }
        }
        
        async function loadModules() {
            try {
                const response = await fetch('/api/modules');
                const modules = await response.json();
                
                const moduleGrid = document.getElementById('modules');
                moduleGrid.innerHTML = modules.map(module => \`
                    <div class="module \${module.active ? 'active' : ''}">
                        <div class="module-header">
                            <span class="module-name">\${module.name}</span>
                            <span class="module-category">\${module.category}</span>
                        </div>
                        <div class="tool-list">
                            <strong>Tools:</strong> \${module.tools.join(', ') || 'None'}
                        </div>
                        <div class="actions">
                            <button class="btn success" onclick="reloadModule('\${module.name}')">🔄 Reload</button>
                            <button class="btn danger" onclick="unloadModule('\${module.name}')">🗑️ Unload</button>
                        </div>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('Failed to load modules:', error);
            }
        }
        
        async function loadMetrics() {
            try {
                const response = await fetch('/api/metrics');
                const metrics = await response.json();
                
                document.getElementById('metrics').innerHTML = \`
                    <pre>\${JSON.stringify(metrics, null, 2)}</pre>
                \`;
            } catch (error) {
                console.error('Failed to load metrics:', error);
            }
        }
        
        async function reloadModule(moduleName) {
            try {
                const response = await fetch('/api/reload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ module: moduleName })
                });
                const result = await response.json();
                alert(\`Reload result: \${result.success ? 'Success' : 'Failed - ' + result.error}\`);
                loadAll();
            } catch (error) {
                alert('Failed to reload module: ' + error.message);
            }
        }
        
        async function unloadModule(moduleName) {
            if (!confirm(\`Are you sure you want to unload \${moduleName}?\`)) return;
            
            try {
                // Implementation would go here
                alert('Unload functionality not yet implemented');
            } catch (error) {
                alert('Failed to unload module: ' + error.message);
            }
        }
    </script>
</body>
</html>`;
  }

  /**
   * Serve registry status
   * @param {Object} res - Response object
   * @private
   */
  _serveStatus(res) {
    const status = this.registry.getStats();
    // Attempt to enrich with validation and plugin details if accessible via registry
    try {
      const getValidationManager = this.registry.getValidationManager || (require('./index').getValidationManager);
      const getPluginManager = this.registry.getPluginManager || (require('./index').getPluginManager);
      const vm = typeof getValidationManager === 'function' ? getValidationManager() : null;
      const pm = typeof getPluginManager === 'function' ? getPluginManager() : null;

      status.validation = vm ? vm.getValidationSummary() : null;
      status.plugins = pm ? {
        stats: pm.getStats(),
        list: pm.listPlugins()
      } : null;
    } catch (e) {
      // Non-fatal; leave as is
    }
    this._serveJSON(res, status);
  }

  /**
   * Serve modules information
   * @param {Object} res - Response object
   * @private
   */
  _serveModules(res) {
    const modules = [];
    
    // Get modules from registry
    if (this.registry.modules) {
      for (const [name, moduleInfo] of this.registry.modules.entries()) {
        modules.push({
          name,
          category: moduleInfo.category,
          tools: moduleInfo.tools || [],
          active: moduleInfo.active !== false,
          loadedAt: moduleInfo.loaded_at
        });
      }
    }

    this._serveJSON(res, modules);
  }

  /**
   * Serve tools information
   * @param {Object} res - Response object
   * @private
   */
  _serveTools(res) {
    const tools = [];
    
    // Get tools from registry
    if (this.registry.registeredTools) {
      for (const toolName of this.registry.registeredTools) {
        tools.push({
          name: toolName,
          category: 'Unknown', // TODO: Get from registry
          module: 'Unknown'    // TODO: Get from registry
        });
      }
    }

    this._serveJSON(res, tools);
  }

  /**
   * Serve performance metrics
   * @param {Object} res - Response object
   * @private
   */
  _serveMetrics(res) {
    const metrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      registryStats: this.registry.getStats(),
      timestamp: new Date().toISOString()
    };

    this._serveJSON(res, metrics);
  }

  /**
   * Handle module reload requests
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @private
   */
  async _handleReload(req, res) {
    if (req.method !== 'POST') {
      this._serve405(res);
      return;
    }

    try {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const { module } = JSON.parse(body || '{}');
        if (!module) return this._serveJSON(res, { success: false, error: 'module is required' });
        const { getHotReloadManager, reregisterModuleTools } = require('./index');
        try {
          const hrm = getHotReloadManager();
          const result = await hrm.reloadModule(module, { force: true }).catch(e => ({ success: false, error: e.message }));
          if (result && result.success) {
            try { await reregisterModuleTools(module); } catch {}
          }
          this._serveJSON(res, { success: !!(result && result.success), result });
        } catch (e) {
          this._serveJSON(res, { success: false, error: e.message });
        }
      });
    } catch (error) {
      this._serveError(res, error);
    }
  }

  /**
   * Handle tool testing requests
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @private
   */
  async _handleToolTest(req, res) {
    if (req.method !== 'POST') {
      this._serve405(res);
      return;
    }
    try {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const { name, args } = JSON.parse(body || '{}');
        if (!name) return this._serveJSON(res, { success: false, error: 'name is required' });
        const { getServerInstance } = require('./index');
        const server = getServerInstance();
        if (!server) return this._serveJSON(res, { success: false, error: 'Server not initialized' });
        try {
          // Test harness: mock server stores handlers in server.tools
          const tool = server.tools && server.tools[name];
          if (!tool || typeof tool.handler !== 'function') {
            return this._serveJSON(res, { success: false, error: 'Tool handler not found' });
          }
          const result = await tool.handler(args || {});
          this._serveJSON(res, { success: true, result });
        } catch (e) {
          this._serveJSON(res, { success: false, error: e.message });
        }
      });
    } catch (error) {
      this._serveError(res, error);
    }
  }

  /**
   * Handle module unload requests
   */
  async _handleUnload(req, res) {
    if (req.method !== 'POST') {
      this._serve405(res);
      return;
    }
    try {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const { module } = JSON.parse(body || '{}');
        if (!module) return this._serveJSON(res, { success: false, error: 'module is required' });
        const { dynamicUnloadModule } = require('./index');
        try {
          const result = await dynamicUnloadModule(module);
          this._serveJSON(res, result);
        } catch (e) {
          this._serveJSON(res, { success: false, error: e.message });
        }
      });
    } catch (error) {
      this._serveError(res, error);
    }
  }

  /**
   * Serve JSON response
   * @param {Object} res - Response object
   * @param {Object} data - Data to send
   * @private
   */
  _serveJSON(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Serve 404 error
   * @param {Object} res - Response object
   * @private
   */
  _serve404(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  /**
   * Serve 405 error
   * @param {Object} res - Response object
   * @private
   */
  _serve405(res) {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  }

  /**
   * Serve error response
   * @param {Object} res - Response object
   * @param {Error} error - Error object
   * @private
   */
  _serveError(res, error) {
    console.error('[Management UI] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

module.exports = { ManagementUI };
