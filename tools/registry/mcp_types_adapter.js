/**
 * MCP Types Adapter - Clean Integration with mcp-types
 * 
 * This module provides a clean mapping layer between our Zod-based tool definitions
 * and the spec-compliant mcp-types schemas. It eliminates the Zod to JSON conversion
 * issues by using pre-validated, compliant schemas.
 * 
 * Architecture:
 * 1. Tool Definition (Zod) -> Runtime Validation
 * 2. Tool Registration (mcp-types) -> MCP SDK Registration
 * 3. Tool Execution (Zod) -> Parameter Validation
 */

const { ToolSchema } = require('mcp-types');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { z } = require('zod');

const DEBUG_ADAPTER = process.env.DEBUG_ADAPTER === '1' || process.env.DEBUG_ADAPTER === 'true';
const alog = (...args) => { if (DEBUG_ADAPTER) console.log('[MCP Adapter][DEBUG]', ...args); };

/**
 * Convert our Zod-based tool definition to mcp-types compliant format
 * 
 * This function bridges the gap between our developer-friendly Zod schemas
 * and the strict MCP specification requirements.
 * 
 * @param {Object} tool - Our tool definition with Zod schema
 * @returns {Object} mcp-types compliant tool definition
 */
function adaptToolToMCPTypes(tool) {
  // Create base tool structure following mcp-types specification
  const adaptedTool = {
    name: tool.name,
    description: tool.description || `Execute ${tool.name} tool`,
  };

  // Handle inputSchema conversion
  if (tool.inputSchema) {
    if (isZodSchema(tool.inputSchema)) {
      // Convert Zod schema to JSON Schema for MCP compliance
      adaptedTool.inputSchema = convertZodToMCPJsonSchema(tool.inputSchema);
    } else if (isJsonSchema(tool.inputSchema)) {
      // Already JSON Schema - ensure MCP compliance
      adaptedTool.inputSchema = ensureMCPCompliantSchema(tool.inputSchema);
    } else {
      // No schema provided
      adaptedTool.inputSchema = createEmptyMCPSchema();
    }
  } else {
    // No schema provided
    adaptedTool.inputSchema = createEmptyMCPSchema();
  }

  // Add optional properties if present
  if (tool.annotations) {
    adaptedTool.annotations = tool.annotations;
  }

  if (tool.outputSchema) {
    adaptedTool.outputSchema = adaptOutputSchema(tool.outputSchema);
  }

  // Validate against mcp-types schema to ensure compliance
  try {
    ToolSchema.parse(adaptedTool);
    return adaptedTool;
  } catch (error) {
    console.error(`[MCP Adapter] Tool ${tool.name} failed mcp-types validation:`, error.message);
    
    // Return a safe fallback that will pass validation
    return {
      name: tool.name,
      description: tool.description || `Execute ${tool.name} tool`,
      inputSchema: createEmptyMCPSchema()
    };
  }
}

/**
 * Convert Zod schema to MCP-compliant JSON Schema
 * 
 * Uses zod-to-json-schema but ensures MCP specification compliance:
 * - type: "object" 
 * - properties: Record<string, unknown>
 * - required: string[]
 * 
 * @param {Object} zodSchema - Zod schema object
 * @returns {Object} MCP-compliant JSON Schema
 */
function convertZodToMCPJsonSchema(zodSchema) {
  try {
    // Convert using zod-to-json-schema with MCP-specific options
    const jsonSchema = zodToJsonSchema(zodSchema, {
      target: 'jsonSchema7',
      strictTuples: false,
      definitions: {},
      $refStrategy: 'none' // Avoid $ref to keep schemas inline
    });

    // Ensure MCP specification compliance
    const mcpSchema = {
      type: "object",
      properties: jsonSchema.properties || {},
      required: jsonSchema.required || []
    };

    // Clean up any non-MCP properties
    delete mcpSchema.$schema;
    delete mcpSchema.$defs;
    delete mcpSchema.definitions;
    
  alog('Converted Zod → MCP JSON schema keys:', Object.keys(mcpSchema.properties || {}));
  return mcpSchema;
  } catch (error) {
    console.warn(`[MCP Adapter] Failed to convert Zod schema for ${zodSchema.name || 'unknown'}:`, error.message);
    return createEmptyMCPSchema();
  }
}

/**
 * Ensure JSON Schema is MCP compliant
 * 
 * @param {Object} jsonSchema - Existing JSON Schema
 * @returns {Object} MCP-compliant JSON Schema
 */
function ensureMCPCompliantSchema(jsonSchema) {
  return {
    type: "object",
    properties: jsonSchema.properties || {},
    required: jsonSchema.required || []
  };
}

/**
 * Create empty MCP-compliant schema for tools with no parameters
 * 
 * @returns {Object} Empty MCP schema
 */
function createEmptyMCPSchema() {
  return {
    type: "object",
    properties: {},
    required: []
  };
}

/**
 * Adapt output schema to MCP format
 * 
 * @param {Object} outputSchema - Tool output schema
 * @returns {Object} MCP-compliant output schema
 */
function adaptOutputSchema(outputSchema) {
  if (isZodSchema(outputSchema)) {
    return convertZodToMCPJsonSchema(outputSchema);
  } else if (isJsonSchema(outputSchema)) {
    return ensureMCPCompliantSchema(outputSchema);
  }
  
  return createEmptyMCPSchema();
}

/**
 * Check if object is a Zod schema
 * 
 * @param {any} obj - Object to check
 * @returns {boolean} True if Zod schema
 */
function isZodSchema(obj) {
  return obj && typeof obj === 'object' && (
    typeof obj.safeParse === 'function' ||
    typeof obj.parse === 'function' ||
    (obj._def && typeof obj._def === 'object')
  );
}

/**
 * Check if object is a JSON Schema
 * 
 * @param {any} obj - Object to check
 * @returns {boolean} True if JSON Schema
 */
function isJsonSchema(obj) {
  return obj && typeof obj === 'object' && (
    obj.type || 
    obj.$schema || 
    obj.properties ||
    (typeof obj.type === 'string')
  );
}

/**
 * Create parameter validator function for runtime validation
 * 
 * This allows us to keep using Zod for runtime parameter validation
 * while using clean JSON Schema for MCP registration.
 * 
 * @param {Object} zodSchema - Original Zod schema for validation
 * @returns {Function} Validation function
 */
function createParameterValidator(zodSchema) {
  if (!isZodSchema(zodSchema)) {
    alog('No Zod schema provided - no validation needed');
    // No validation needed
    return (params) => {
      alog('No validation - passing through params:', JSON.stringify(params, null, 2));
      return { success: true, data: params };
    };
  }

  alog('Creating Zod validator for schema:', zodSchema._def?.typeName || 'unknown');

  return (params) => {
    try {
      alog('Validating params:', JSON.stringify(params, null, 2));
      alog('Using Zod schema:', zodSchema._def?.typeName || 'unknown');
      
      const result = zodSchema.safeParse(params);
      alog('Zod validation result:', {
        success: result.success,
        errorCount: result.error ? result.error.errors?.length : 0,
        data: result.success ? 'valid' : 'invalid'
      });
      
      if (!result.success) {
        alog('Zod validation errors:', JSON.stringify(result.error.errors, null, 2));
      }
      
      return result;
    } catch (error) {
      console.error(`[MCP Adapter] Validation exception:`, error.message);
      return {
        success: false,
        error: {
          message: error.message,
          issues: error.errors || []
        }
      };
    }
  };
}

/**
 * Validation summary for debugging
 * 
 * @param {Object} tool - Tool definition
 * @returns {Object} Validation summary
 */
function getValidationSummary(tool) {
  const adapted = adaptToolToMCPTypes(tool);
  
  return {
    toolName: tool.name,
    originalSchema: {
      present: !!tool.inputSchema,
      type: tool.inputSchema ? (isZodSchema(tool.inputSchema) ? 'zod' : 'json') : 'none'
    },
    adaptedSchema: {
      type: adapted.inputSchema.type,
      propertiesCount: Object.keys(adapted.inputSchema.properties || {}).length,
      requiredCount: (adapted.inputSchema.required || []).length
    },
    mcpCompliant: true // We ensure this through validation
  };
}

module.exports = {
  adaptToolToMCPTypes,
  createParameterValidator,
  getValidationSummary,
  convertZodToMCPJsonSchema,
  ensureMCPCompliantSchema,
  createEmptyMCPSchema,
  isZodSchema,
  isJsonSchema,
  jsonSchemaToZodShape,
  getZodRawShape
};

/**
 * Extract Zod raw shape from a Zod object schema in a version-tolerant way.
 * @param {any} zodSchema
 * @returns {import('zod').ZodRawShape|undefined}
 */
function getZodRawShape(zodSchema) {
  if (!isZodSchema(zodSchema)) return undefined;
  try {
    // ZodObject may expose .shape or _def.shape()
    if (zodSchema.shape && typeof zodSchema.shape === 'object') {
      return zodSchema.shape;
    }
    if (zodSchema._def && typeof zodSchema._def.shape === 'function') {
      return zodSchema._def.shape();
    }
  } catch (_) {}
  return undefined;
}

/**
 * Minimal JSON Schema (object) -> Zod raw shape converter.
 * Supports common primitives and required fields. Best-effort mapping.
 * @param {any} jsonSchema
 * @returns {import('zod').ZodRawShape|undefined}
 */
function jsonSchemaToZodShape(jsonSchema) {
  if (!isJsonSchema(jsonSchema) || jsonSchema.type !== 'object') return undefined;
  const properties = jsonSchema.properties || {};
  const required = new Set(Array.isArray(jsonSchema.required) ? jsonSchema.required : []);

  /** @type {import('zod').ZodRawShape} */
  const shape = {};

  for (const [key, prop] of Object.entries(properties)) {
    shape[key] = jsonToZod(prop, required.has(key));
  }

  return shape;
}

/**
 * Convert a JSON Schema property to a Zod schema.
 * Handles string, number/integer, boolean, arrays (of primitives), enums, and nested objects (shallow).
 * @param {any} schema
 * @param {boolean} required
 */
function jsonToZod(schema, required) {
  let zschema;
  if (!schema || typeof schema !== 'object') {
    zschema = z.any();
  } else if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    // Enum of strings only (common case)
    if (schema.enum.every((v) => typeof v === 'string')) {
      zschema = z.enum([...schema.enum]);
    } else {
      zschema = z.union(schema.enum.map((v) => z.literal(v)));
    }
  } else {
    const type = schema.type;
    switch (type) {
      case 'string': {
        let s = z.string();
        if (typeof schema.minLength === 'number') s = s.min(schema.minLength);
        if (typeof schema.maxLength === 'number') s = s.max(schema.maxLength);
        zschema = s;
        break;
      }
      case 'number':
      case 'integer': {
        let n = z.number();
        if (typeof schema.minimum === 'number') n = n.min(schema.minimum);
        if (typeof schema.maximum === 'number') n = n.max(schema.maximum);
        zschema = n;
        break;
      }
      case 'boolean': {
        zschema = z.boolean();
        break;
      }
      case 'array': {
        const items = schema.items ? jsonToZod(schema.items, true) : z.any();
        zschema = z.array(items);
        break;
      }
      case 'object': {
        const innerShape = jsonSchemaToZodShape(schema) || {};
        zschema = z.object(innerShape);
        break;
      }
      default: {
        zschema = z.any();
      }
    }
  }

  return required ? zschema : zschema.optional();
}
