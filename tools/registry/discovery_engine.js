/**
 * Discovery Engine - Automatic Tool Discovery and Dependency Analysis
 * 
 * Features:
 * - Scan filesystem for tool modules
 * - Analyze dependencies between modules  
 * - Auto-detect tool categories and capabilities
 * - Generate module loading order
 * - Validate tool compatibility
 * - Detect circular dependencies
 * 
 * This enables zero-configuration tool discovery and intelligent loading
 */

const fs = require('fs');
const path = require('path');

/**
 * Discovery Engine for automatic tool detection and analysis
 */
class DiscoveryEngine {
  constructor() {
    this.discoveredModules = new Map();
    this.dependencies = new Map();
    this.loadOrder = [];
    this.searchPaths = [
      path.join(__dirname, '..'), // tools/ directory
      path.join(__dirname, '../..') // project root for custom tools
    ];
  }

  /**
   * Discover all tool modules in the search paths
   * @returns {Promise<Array>} Array of discovered module configurations
   */
  async discoverToolModules() {
    console.log('[Discovery Engine] 🔍 Starting automatic tool discovery...');
    
    const discovered = [];
    
    for (const searchPath of this.searchPaths) {
      const modules = await this._scanDirectory(searchPath);
      discovered.push(...modules);
    }

    // Analyze dependencies and determine load order
    await this._analyzeDependencies(discovered);
    this.loadOrder = this._calculateLoadOrder();

    console.log(`[Discovery Engine] ✅ Discovered ${discovered.length} tool modules`);
    console.log(`[Discovery Engine] 📋 Load order: ${this.loadOrder.join(' → ')}`);

    return this.loadOrder.map(name => this.discoveredModules.get(name));
  }

  /**
   * Scan directory for tool modules
   * @param {string} dirPath - Directory to scan
   * @returns {Promise<Array>} Array of module configurations
   * @private
   */
  async _scanDirectory(dirPath) {
    const modules = [];

    try {
      const files = await fs.promises.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.promises.stat(filePath);

        if (stat.isFile() && this._isToolModule(file)) {
          const moduleConfig = await this._analyzeModule(filePath, file);
          if (moduleConfig) {
            modules.push(moduleConfig);
            this.discoveredModules.set(moduleConfig.name, moduleConfig);
          }
        }
      }
    } catch (error) {
      console.warn(`[Discovery Engine] ⚠️  Failed to scan ${dirPath}: ${error.message}`);
    }

    return modules;
  }

  /**
   * Check if file is a tool module
   * @param {string} filename - File name to check
   * @returns {boolean} True if it's a tool module
   * @private
   */
  _isToolModule(filename) {
    return filename.endsWith('_tools_sdk.js') || 
           filename.endsWith('_tools.js') ||
           (filename.endsWith('.js') && filename.includes('tools'));
  }

  /**
   * Analyze a module to extract metadata
   * @param {string} filePath - Path to module file
   * @param {string} filename - Module filename
   * @returns {Promise<Object|null>} Module configuration or null
   * @private
   */
  async _analyzeModule(filePath, filename) {
    try {
      // Read file content to analyze
      const content = await fs.promises.readFile(filePath, 'utf8');
      
      // Extract module name and category
      const name = filename.replace(/\.(js|ts)$/, '');
      const category = this._detectCategory(name, content);
      
      // Check if module exports the required structure
      if (!this._hasRequiredExports(content)) {
        console.warn(`[Discovery Engine] ⚠️  Skipping ${filename}: Missing required exports`);
        return null;
      }

      // Extract dependencies
      const dependencies = this._extractDependencies(content);

      return {
        name,
        category,
        filePath,
        filename,
        dependencies,
        loader: () => require(filePath),
        metadata: {
          toolCount: this._estimateToolCount(content),
          hasInitialize: content.includes('initialize'),
          hasCleanup: content.includes('cleanup'),
          complexity: this._assessComplexity(content)
        }
      };
    } catch (error) {
      console.warn(`[Discovery Engine] ⚠️  Failed to analyze ${filename}: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect module category from name and content
   * @param {string} name - Module name
   * @param {string} content - File content
   * @returns {string} Detected category
   * @private
   */
  _detectCategory(name, content) {
    // Category detection based on name patterns
    const patterns = {
      'Memory': /memory|cache|store/i,
      'Network': /network|ping|wget|dns/i,
      'NMAP': /nmap|scan|port/i,
      'Proxmox': /proxmox|vm|container/i,
      'SNMP': /snmp|mib|oid/i,
      'Zabbix': /zabbix|monitor|alert/i,
      'Credentials': /credential|auth|password|key/i,
      'Registry': /registry|management|admin/i
    };

    for (const [category, pattern] of Object.entries(patterns)) {
      if (pattern.test(name) || pattern.test(content)) {
        return category;
      }
    }

    return 'Other';
  }

  /**
   * Check if module has required exports
   * @param {string} content - File content
   * @returns {boolean} True if has required exports
   * @private
   */
  _hasRequiredExports(content) {
    return content.includes('module.exports') && 
           content.includes('tools') && 
           content.includes('handleToolCall');
  }

  /**
   * Extract dependencies from module content
   * @param {string} content - File content
   * @returns {Array<string>} Array of dependency names
   * @private
   */
  _extractDependencies(content) {
    const dependencies = [];
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    let match;

    while ((match = requireRegex.exec(content)) !== null) {
      const dep = match[1];
      // Only include local dependencies, not npm packages
      if (dep.startsWith('./') || dep.startsWith('../')) {
        dependencies.push(dep);
      }
    }

    return dependencies;
  }

  /**
   * Estimate tool count from content
   * @param {string} content - File content
   * @returns {number} Estimated tool count
   * @private
   */
  _estimateToolCount(content) {
    const toolMatches = content.match(/name:\s*['"][^'"]+['"]/g);
    return toolMatches ? toolMatches.length : 0;
  }

  /**
   * Assess module complexity
   * @param {string} content - File content
   * @returns {string} Complexity level
   * @private
   */
  _assessComplexity(content) {
    const lines = content.split('\n').length;
    if (lines > 500) return 'high';
    if (lines > 200) return 'medium';
    return 'low';
  }

  /**
   * Analyze dependencies between modules
   * @param {Array} modules - Discovered modules
   * @private
   */
  async _analyzeDependencies(modules) {
    for (const module of modules) {
      this.dependencies.set(module.name, module.dependencies);
    }
  }

  /**
   * Calculate optimal loading order based on dependencies
   * @returns {Array<string>} Ordered list of module names
   * @private
   */
  _calculateLoadOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (moduleName) => {
      if (visiting.has(moduleName)) {
        throw new Error(`Circular dependency detected involving ${moduleName}`);
      }
      
      if (visited.has(moduleName)) {
        return;
      }

      visiting.add(moduleName);
      
      const deps = this.dependencies.get(moduleName) || [];
      for (const dep of deps) {
        const depName = this._resolveModuleName(dep);
        if (depName && this.discoveredModules.has(depName)) {
          visit(depName);
        }
      }

      visiting.delete(moduleName);
      visited.add(moduleName);
      order.push(moduleName);
    };

    // Visit all modules
    for (const moduleName of this.discoveredModules.keys()) {
      if (!visited.has(moduleName)) {
        visit(moduleName);
      }
    }

    return order;
  }

  /**
   * Resolve dependency path to module name
   * @param {string} depPath - Dependency path
   * @returns {string|null} Module name or null
   * @private
   */
  _resolveModuleName(depPath) {
    const basename = path.basename(depPath, '.js');
    return this.discoveredModules.has(basename) ? basename : null;
  }

  /**
   * Get discovery statistics
   * @returns {Object} Discovery statistics
   */
  getStats() {
    const categories = {};
    const complexities = { low: 0, medium: 0, high: 0 };
    let totalTools = 0;

    for (const module of this.discoveredModules.values()) {
      categories[module.category] = (categories[module.category] || 0) + 1;
      complexities[module.metadata.complexity]++;
      totalTools += module.metadata.toolCount;
    }

    return {
      totalModules: this.discoveredModules.size,
      totalTools,
      categories,
      complexities,
      hasCircularDependencies: false // TODO: Implement detection
    };
  }
}

module.exports = { DiscoveryEngine };
