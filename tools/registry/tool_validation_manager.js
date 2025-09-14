/**
 * Tool Validation Manager - MCP Open Discovery
 * 
 * Focused manager for tool validation and compliance:
 * - MCP tool schema validation
 * - Tool registration validation
 * - Duplicate detection and handling
 * - Compliance reporting
 * 
 * DESIGN PRINCIPLES:
 * - Validation First: Fail fast on invalid tools
 * - Clear Reporting: Detailed validation results
 * - Flexible Rules: Configurable validation strictness
 * - Performance: Efficient validation algorithms
 */

const { z } = require('zod');

/**
 * MCP Tool Schema - Based on official MCP protocol
 * Updated to handle both JSON Schema and Zod schemas
 */
const MCPToolSchema = z.object({
  name: z.string()
    .min(1, "Tool name cannot be empty")
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Tool name must start with letter and contain only letters, numbers, underscores, hyphens"),
  
  // Description: presence recommended; detailed length checks handled via custom rules
  description: z.string().min(1, "Tool description should not be empty").optional(),
  
  inputSchema: z.any() // Accept any schema format (JSON Schema, Zod schema, or Zod raw shape)
});

/**
 * Validation severity levels
 */
const VALIDATION_LEVELS = {
  ERROR: 'error',     // Blocks registration
  WARNING: 'warning', // Allows registration with warning
  INFO: 'info'        // Informational only
};

/**
 * Tool Validation Manager
 */
class ToolValidationManager {
  constructor(logger = console) {
    this.logger = logger;
    
    // Validation state
    this.validationRules = new Map();
    this.validationResults = new Map(); // toolName -> ValidationResult
    this.duplicateTracker = new Map();  // toolName -> [moduleNames]
    
    // Configuration
    this.config = {
      strictMode: true,
      allowDuplicates: false,
      maxDescriptionLength: 500,
      minDescriptionLength: 10,
      enableCustomRules: true
    };
    
    // Initialize default validation rules
    this._initializeDefaultRules();
    
    this.logger.log('[Tool Validation] Manager initialized');
  }

  /**
   * Validate a single tool
   * @param {Object} tool - Tool to validate
   * @param {string} moduleName - Module containing the tool
   * @returns {ValidationResult}
   */
  validateTool(tool, moduleName) {
    const result = {
      valid: true,
      tool: tool,
      moduleName: moduleName,
      errors: [],
      warnings: [],
      info: [],
      timestamp: new Date()
    };

    try {
      // Core MCP schema validation
      const mcpValidation = this._validateMCPSchema(tool);
      if (!mcpValidation.success) {
        result.valid = false;
        result.errors.push(...mcpValidation.errors);
      }

      // Duplicate detection
      const duplicateCheck = this._checkForDuplicates(tool.name, moduleName);
      if (duplicateCheck.isDuplicate) {
        if (this.config.allowDuplicates) {
          result.warnings.push(duplicateCheck.message);
        } else {
          result.valid = false;
          result.errors.push(duplicateCheck.message);
        }
      }

      // Custom validation rules
      if (this.config.enableCustomRules) {
        const customValidation = this._runCustomValidation(tool, moduleName);
        result.errors.push(...customValidation.errors);
        result.warnings.push(...customValidation.warnings);
        result.info.push(...customValidation.info);
        
        if (customValidation.errors.length > 0) {
          result.valid = false;
        }
      }

      // Store result
      this.validationResults.set(tool.name, result);

      // Log result
      if (result.valid) {
        if (result.warnings.length > 0) {
          this.logger.warn(`[Tool Validation] ⚠️  ${tool.name}: ${result.warnings.length} warnings`);
        } else {
          this.logger.log(`[Tool Validation] ✅ ${tool.name}: Valid`);
        }
      } else {
        this.logger.error(`[Tool Validation] ❌ ${tool.name}: ${result.errors.length} errors`);
      }

      return result;

    } catch (error) {
      result.valid = false;
      result.errors.push(`Validation exception: ${error.message}`);
      this.logger.error(`[Tool Validation] Exception validating ${tool.name}:`, error.message);
      return result;
    }
  }

  /**
   * Validate an array of tools from a module
   * @param {Array} tools - Array of tools to validate
   * @param {string} moduleName - Module containing the tools
   * @returns {BatchValidationResult}
   */
  validateToolBatch(tools, moduleName) {
    const batchResult = {
      moduleName: moduleName,
      totalTools: tools.length,
      validTools: 0,
      invalidTools: 0,
      toolResults: [],
      summary: {
        errors: 0,
        warnings: 0,
        info: 0
      },
      timestamp: new Date()
    };

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      
      try {
        const result = this.validateTool(tool, moduleName);
        batchResult.toolResults.push(result);

        if (result.valid) {
          batchResult.validTools++;
        } else {
          batchResult.invalidTools++;
        }

        batchResult.summary.errors += result.errors.length;
        batchResult.summary.warnings += result.warnings.length;
        batchResult.summary.info += result.info.length;

      } catch (error) {
        this.logger.error(`[Tool Validation] Error validating tool ${i} in ${moduleName}:`, error.message);
        batchResult.invalidTools++;
        batchResult.summary.errors++;
      }
    }

    // Log batch summary
    if (batchResult.invalidTools === 0) {
      this.logger.log(`[Tool Validation] ✅ ${moduleName}: All ${batchResult.totalTools} tools valid`);
    } else {
      this.logger.error(`[Tool Validation] ❌ ${moduleName}: ${batchResult.invalidTools}/${batchResult.totalTools} tools invalid`);
    }

    return batchResult;
  }

  /**
   * Get validation results for a specific tool
   * @param {string} toolName - Name of the tool
   * @returns {ValidationResult|null}
   */
  getValidationResult(toolName) {
    return this.validationResults.get(toolName) || null;
  }

  /**
   * Get all validation results
   * @returns {Map} All validation results
   */
  getAllValidationResults() {
    return new Map(this.validationResults);
  }

  /**
   * Get validation summary statistics
   * @returns {Object} Summary statistics
   */
  getValidationSummary() {
    const summary = {
      totalToolsValidated: this.validationResults.size,
      validTools: 0,
      invalidTools: 0,
      totalErrors: 0,
      totalWarnings: 0,
      totalInfo: 0,
      duplicatesFound: 0,
      moduleBreakdown: new Map()
    };

    for (const [toolName, result] of this.validationResults) {
      if (result.valid) {
        summary.validTools++;
      } else {
        summary.invalidTools++;
      }

      summary.totalErrors += result.errors.length;
      summary.totalWarnings += result.warnings.length;
      summary.totalInfo += result.info.length;

      // Module breakdown
      if (!summary.moduleBreakdown.has(result.moduleName)) {
        summary.moduleBreakdown.set(result.moduleName, {
          total: 0,
          valid: 0,
          invalid: 0
        });
      }
      
      const moduleStats = summary.moduleBreakdown.get(result.moduleName);
      moduleStats.total++;
      if (result.valid) {
        moduleStats.valid++;
      } else {
        moduleStats.invalid++;
      }
    }

    // Count duplicates
    for (const [toolName, modules] of this.duplicateTracker) {
      if (modules.length > 1) {
        summary.duplicatesFound++;
      }
    }

    return summary;
  }

  /**
   * Generate compliance report
   * @returns {Object} Detailed compliance report
   */
  generateComplianceReport() {
    const summary = this.getValidationSummary();
    const report = {
      timestamp: new Date(),
      overall: {
        compliant: summary.invalidTools === 0,
        complianceRate: summary.totalToolsValidated > 0 ? 
          Math.round((summary.validTools / summary.totalToolsValidated) * 100) : 0
      },
      summary,
      issues: [],
      recommendations: []
    };

    // Collect major issues
    if (summary.invalidTools > 0) {
      report.issues.push(`${summary.invalidTools} tools failed validation`);
    }
    
    if (summary.duplicatesFound > 0) {
      report.issues.push(`${summary.duplicatesFound} duplicate tools found`);
    }

    // Generate recommendations
    if (summary.totalWarnings > 0) {
      report.recommendations.push('Review and address validation warnings');
    }
    
    if (summary.duplicatesFound > 0 && this.config.allowDuplicates) {
      report.recommendations.push('Consider disabling duplicate tools or enabling strict mode');
    }

    // Detailed results for failed tools
    report.failedTools = [];
    for (const [toolName, result] of this.validationResults) {
      if (!result.valid) {
        report.failedTools.push({
          name: toolName,
          module: result.moduleName,
          errors: result.errors,
          warnings: result.warnings
        });
      }
    }

    return report;
  }

  /**
   * Clear all validation results
   */
  clearResults() {
    this.validationResults.clear();
    this.duplicateTracker.clear();
    this.logger.log('[Tool Validation] Cleared all validation results');
  }

  /**
   * Remove all validation results and duplicate tracking entries for a given module.
   * This is used by the plugin manager on unload/reload to avoid stale duplicates.
   * @param {string} moduleName
   */
  removeModule(moduleName) {
    if (!moduleName) return;
    // Remove tool validation results belonging to this module
    for (const [toolName, result] of this.validationResults) {
      if (result && result.moduleName === moduleName) {
        this.validationResults.delete(toolName);
      }
    }
    // Remove the module from duplicate tracker entries
    for (const [toolName, modules] of this.duplicateTracker) {
      const idx = modules.indexOf(moduleName);
      if (idx !== -1) {
        modules.splice(idx, 1);
        if (modules.length === 0) {
          this.duplicateTracker.delete(toolName);
        } else {
          this.duplicateTracker.set(toolName, modules);
        }
      }
    }
    this.logger.log(`[Tool Validation] Purged validation state for module: ${moduleName}`);
  }

  /**
   * Update validation configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.log('[Tool Validation] Configuration updated:', newConfig);
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Validate tool against MCP schema
   * @param {Object} tool - Tool to validate
   * @returns {Object} Validation result
   * @private
   */
  _validateMCPSchema(tool) {
    try {
      MCPToolSchema.parse(tool);
      
      // Additional validation for inputSchema
      if (tool.inputSchema) {
        // Accept: Zod schema instance, JSON Schema, or Zod raw shape (plain object)
        if (tool.inputSchema._def) {
          return { success: true, errors: [] };
        } else if (typeof tool.inputSchema === 'object') {
          // JSON Schema often has a top-level 'type'; raw shapes do not. Accept both.
          return { success: true, errors: [] };
        } else {
          return { success: false, errors: ['inputSchema must be an object or Zod schema'] };
        }
      }
      
      return { success: true, errors: [] };
    } catch (error) {
      const errors = [];
      
      if (error.errors) {
        for (const err of error.errors) {
          errors.push(`${err.path.join('.')}: ${err.message}`);
        }
      } else {
        errors.push(error.message);
      }
      
      return { success: false, errors };
    }
  }

  /**
   * Check for duplicate tool names
   * @param {string} toolName - Name of the tool
   * @param {string} moduleName - Module containing the tool
   * @returns {Object} Duplicate check result
   * @private
   */
  _checkForDuplicates(toolName, moduleName) {
    if (!this.duplicateTracker.has(toolName)) {
      this.duplicateTracker.set(toolName, []);
    }
    
    const modules = this.duplicateTracker.get(toolName);
    const isDuplicate = modules.length > 0;
    
    if (!modules.includes(moduleName)) {
      modules.push(moduleName);
    }
    
    return {
      isDuplicate,
      modules: [...modules],
      message: isDuplicate ? 
        `Duplicate tool name '${toolName}' found in modules: ${modules.join(', ')}` :
        null
    };
  }

  /**
   * Run custom validation rules
   * @param {Object} tool - Tool to validate
   * @param {string} moduleName - Module containing the tool
   * @returns {Object} Custom validation results
   * @private
   */
  _runCustomValidation(tool, moduleName) {
    const result = {
      errors: [],
      warnings: [],
      info: []
    };

    // Check description quality
    if (tool.description) {
      if (tool.description.length < this.config.minDescriptionLength) {
        result.warnings.push(`Description is very short (${tool.description.length} chars)`);
      }
      
      if (tool.description === tool.name) {
        result.warnings.push('Description should not be identical to tool name');
      }
      
      if (!/[.!?]$/.test(tool.description)) {
        result.info.push('Description should end with punctuation');
      }
    } else {
      result.warnings.push('Description is missing');
    }

    // Check input schema completeness
    if (tool.inputSchema && tool.inputSchema.properties) {
      const props = Object.keys(tool.inputSchema.properties);
      const required = tool.inputSchema.required || [];
      
      if (props.length > 0 && required.length === 0) {
        result.warnings.push('Tool has parameters but none are marked as required');
      }
      
      // Check for parameter descriptions
      for (const propName of props) {
        const prop = tool.inputSchema.properties[propName];
        if (!prop.description) {
          result.info.push(`Parameter '${propName}' missing description`);
        }
      }
    }

    return result;
  }

  /**
   * Initialize default validation rules
   * @private
   */
  _initializeDefaultRules() {
    this.validationRules.set('mcp_schema', {
      name: 'MCP Schema Compliance',
      severity: VALIDATION_LEVELS.ERROR,
      enabled: true
    });
    
    this.validationRules.set('duplicate_detection', {
      name: 'Duplicate Tool Detection',
      severity: this.config.allowDuplicates ? VALIDATION_LEVELS.WARNING : VALIDATION_LEVELS.ERROR,
      enabled: true
    });
    
    this.validationRules.set('description_quality', {
      name: 'Description Quality Check',
      severity: VALIDATION_LEVELS.WARNING,
      enabled: true
    });
  }
}

module.exports = {
  ToolValidationManager,
  VALIDATION_LEVELS,
  MCPToolSchema
};
