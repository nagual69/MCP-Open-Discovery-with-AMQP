/**
 * Parameter Type Detection System
 * Determines whether tools have array parameters that require special MCP SDK handling
 */

/**
 * Detects if a tool has array parameters that need special handling
 * @param {object} tool - The tool object with inputSchema
 * @returns {boolean} - True if tool has array parameters
 * 
 * Validated - Function ID#1008 - ARRAY PARAMETER DETECTION (DECISION LOGIC)
 */
function hasArrayParameters(tool) {
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
    return false;
  }

  // Handle Zod schemas
  if (tool.inputSchema._def && tool.inputSchema._def.typeName === 'ZodObject') {
    const shape = typeof tool.inputSchema._def.shape === 'function' 
      ? tool.inputSchema._def.shape() 
      : tool.inputSchema._def.shape;
    
    // Check if any parameters are ZodArray types
    return Object.values(shape).some(paramType => {
      if (!paramType || !paramType._def) return false;
      if (paramType._def.typeName === 'ZodArray') return true;
      if (paramType._def.typeName === 'ZodOptional' && paramType._def.innerType?._def?.typeName === 'ZodArray') return true;
      return false;
    });
  }

  // Handle JSON Schema
  if (tool.inputSchema.type === 'object' && tool.inputSchema.properties) {
    return Object.values(tool.inputSchema.properties).some(prop => {
      return prop.type === 'array' || 
             (prop.anyOf && prop.anyOf.some(option => option.type === 'array'));
    });
  }

  return false;
}

/**
 * Gets the appropriate schema for MCP registration based on parameter type
 * @param {object} tool - The tool object with inputSchema
 * @returns {object} - The schema to use for registration
 * 
 * Validated - Function ID#1009 - SCHEMA PREPARATION (POTENTIAL ERROR POINT)
 */
function getRegistrationSchema(tool) {
  if (!tool.inputSchema) {
    return { type: 'object', properties: {}, additionalProperties: true };
  }

  // If tool has array parameters, use original schema
  if (hasArrayParameters(tool)) {
    return tool.inputSchema;
  }

  // For simple parameters, return the full schema (don't extract shape!)
  // The zodToJsonSchema conversion will handle the proper conversion
  return tool.inputSchema;
}

/**
 * Determines which MCP SDK registration method to use
 * @param {object} tool - The tool object
 * @returns {string} - 'server.tool' or 'server.registerTool'
 */
function getRegistrationMethod(tool) {
  return hasArrayParameters(tool) ? 'server.tool' : 'server.registerTool';
}

/**
 * Comprehensive parameter analysis for debugging
 * @param {object} tool - The tool object
 * @returns {object} - Analysis results
 */
function analyzeParameters(tool) {
  const hasArrays = hasArrayParameters(tool);
  const method = getRegistrationMethod(tool);
  const schema = getRegistrationSchema(tool);
  
  let parameterTypes = {};
  
  if (tool.inputSchema && tool.inputSchema._def && tool.inputSchema._def.typeName === 'ZodObject') {
    const shape = typeof tool.inputSchema._def.shape === 'function' 
      ? tool.inputSchema._def.shape() 
      : tool.inputSchema._def.shape;
    
    parameterTypes = Object.entries(shape).reduce((types, [key, paramType]) => {
      if (paramType && paramType._def) {
        types[key] = paramType._def.typeName;
        if (paramType._def.typeName === 'ZodOptional' && paramType._def.innerType) {
          types[key] += ` -> ${paramType._def.innerType._def.typeName}`;
        }
      } else {
        types[key] = 'unknown';
      }
      return types;
    }, {});
  }
  
  return {
    hasArrayParameters: hasArrays,
    recommendedMethod: method,
    parameterTypes,
    schemaType: hasArrays ? 'ZodObject' : 'ZodRawShape',
    toolName: tool.name
  };
}

module.exports = {
  hasArrayParameters,
  getRegistrationSchema,
  getRegistrationMethod,
  analyzeParameters
};
