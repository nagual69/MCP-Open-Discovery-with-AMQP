// tools/credentials_tools_sdk.js
// MCP SDK tools for credential management
// Provides secure add, get, list, remove, and rotate operations for multiple credential types

const { z } = require('zod');
const credentialsManager = require('./credentials_manager');

// Schema for credential types - using enum with clear description
const CREDENTIAL_TYPES = ['password', 'apiKey', 'sshKey', 'oauthToken', 'certificate', 'custom'];
const CredentialTypeSchema = z.enum(CREDENTIAL_TYPES)
  .describe('Type of credential. Valid values: password, apiKey, sshKey, oauthToken, certificate, custom');

// MCP Tool: Add Credential
const addCredentialTool = {
  name: 'credentials_add',
  description: 'Add a new encrypted credential to the secure store. Valid types: "password", "apiKey", "sshKey", "oauthToken", "certificate", "custom"',
  inputSchema: z.object({
    id: z.string().describe('Unique credential ID'),
    type: CredentialTypeSchema,
    username: z.string().optional().describe('Username (if applicable)'),
    url: z.string().optional().describe('URL/endpoint (if applicable)'),
    password: z.string().optional().describe('Password to encrypt (use with type="password")'),
    apiKey: z.string().optional().describe('API key to encrypt (use with type="apiKey")'),
    sshKey: z.string().optional().describe('SSH private key to encrypt (use with type="sshKey")'),
    oauthToken: z.string().optional().describe('OAuth token to encrypt (use with type="oauthToken")'),
    certificate: z.string().optional().describe('Certificate/cert data to encrypt (use with type="certificate")'),
    customField1: z.string().optional().describe('Custom field 1 (use with type="custom")'),
    customField2: z.string().optional().describe('Custom field 2 (use with type="custom")'),
    notes: z.string().optional().describe('Notes about this credential'),
  }),
  outputSchema: z.any(),
  handler: async ({ id, type, ...data }) => {
    try {
      // Validate required parameters
      if (!id || !type) {
        return {
          isError: true,
          content: [{ 
            type: 'text', 
            text: 'Failed to add credential: id and type are required parameters' 
          }],
          structuredContent: { 
            success: false, 
            error: 'id and type are required parameters' 
          },
        };
      }
      
      credentialsManager.addCredential(id, type, data);
      return {
        content: [{ 
          type: 'text', 
          text: `Successfully added credential '${id}' of type '${type}'` 
        }],
        structuredContent: { 
          success: true, 
          id, 
          type, 
          message: 'Credential added successfully' 
        },
        isError: false,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ 
          type: 'text', 
          text: `Failed to add credential: ${error.message}` 
        }],
        structuredContent: { 
          success: false, 
          error: error.message 
        },
      };
    }
  },
  annotations: {
    title: 'Add Credential',
    readOnlyHint: false,
    openWorldHint: true,
  },
};

// MCP Tool: Get Credential (with decrypted values)
const getCredentialTool = {
  name: 'credentials_get',
  description: 'Retrieve and decrypt a credential from the secure store',
  inputSchema: z.object({
    id: z.string().describe('Credential ID to retrieve'),
  }),
  outputSchema: z.any(),
  handler: async ({ id }) => {
    try {
      // Validate required parameters
      if (!id) {
        return {
          isError: true,
          content: [{ 
            type: 'text', 
            text: 'Failed to get credential: id is a required parameter' 
          }],
          structuredContent: { 
            success: false, 
            error: 'id is a required parameter' 
          },
        };
      }
      
      const credential = credentialsManager.getCredential(id);
      return {
        content: [{ 
          type: 'text', 
          text: JSON.stringify(credential, null, 2)
        }],
        isError: false,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ 
          type: 'text', 
          text: `Failed to get credential: ${error.message}` 
        }],
        structuredContent: { 
          success: false, 
          error: error.message 
        },
      };
    }
  },
  annotations: {
    title: 'Get Credential',
    readOnlyHint: true,
    openWorldHint: true,
  },
};

// MCP Tool: List Credentials (safe - no sensitive data)
const listCredentialsTool = {
  name: 'credentials_list',
  description: 'List all stored credentials (IDs, types, usernames only - no sensitive data)',
  inputSchema: z.object({
    type: CredentialTypeSchema.optional().describe('Filter by credential type'),
  }),
  outputSchema: z.any(),
  handler: async ({ type }) => {
    try {
      const credentials = credentialsManager.listCredentials(type);
      return {
        content: [{ 
          type: 'text', 
          text: JSON.stringify(credentials, null, 2)
        }],
        isError: false,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ 
          type: 'text', 
          text: `Failed to list credentials: ${error.message}` 
        }],
      };
    }
  },
  annotations: {
    title: 'List Credentials',
    readOnlyHint: true,
    openWorldHint: true,
  },
};

// MCP Tool: Remove Credential
const removeCredentialTool = {
  name: 'credentials_remove',
  description: 'Remove a credential from the secure store',
  inputSchema: z.object({
    id: z.string().describe('Credential ID to remove'),
  }),
  outputSchema: z.any(),
  handler: async ({ id }) => {
    try {
      // Validate required parameters
      if (!id) {
        return {
          isError: true,
          content: [{ 
            type: 'text', 
            text: 'Failed to remove credential: id is a required parameter' 
          }],
          structuredContent: { 
            success: false, 
            error: 'id is a required parameter' 
          },
        };
      }
      
      credentialsManager.removeCredential(id);
      return {
        content: [{ 
          type: 'text', 
          text: `Successfully removed credential '${id}'` 
        }],
        structuredContent: { 
          success: true, 
          id, 
          message: 'Credential removed successfully' 
        },
        isError: false,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ 
          type: 'text', 
          text: `Failed to remove credential: ${error.message}` 
        }],
        structuredContent: { 
          success: false, 
          error: error.message 
        },
      };
    }
  },
  annotations: {
    title: 'Remove Credential',
    readOnlyHint: false,
    openWorldHint: true,
  },
};

// MCP Tool: Rotate Encryption Key
const rotateKeyTool = {
  name: 'credentials_rotate_key',
  description: 'Rotate the encryption key and re-encrypt all stored credentials',
  inputSchema: z.object({
    newKey: z.string().optional().describe('New 32-byte key (base64). If not provided, generates a new random key.'),
  }),
  outputSchema: z.any(),
  handler: async ({ newKey }) => {
    try {
      const key = newKey ? Buffer.from(newKey, 'base64') : require('crypto').randomBytes(32);
      credentialsManager.rotateKey(key);
      return {
        content: [{ 
          type: 'text', 
          text: 'Successfully rotated encryption key and re-encrypted all credentials' 
        }],
        structuredContent: { 
          success: true, 
          message: 'Key rotation completed successfully' 
        },
        isError: false,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ 
          type: 'text', 
          text: `Failed to rotate key: ${error.message}` 
        }],
        structuredContent: { 
          success: false, 
          error: error.message 
        },
      };
    }
  },
  annotations: {
    title: 'Rotate Encryption Key',
    readOnlyHint: false,
    openWorldHint: true,
  },
};

// Resource: Audit Log
const auditLogResource = {
  uri: 'credentials://audit/log',
  name: 'Credential Audit Log',
  description: 'Audit log of all credential operations',
  mimeType: 'application/json',
  getContent: async (params) => {
    try {
      const fs = require('fs');
      const AUDIT_LOG_PATH = require('path').join('/tmp', 'mcp_creds_audit.log');
      
      if (!fs.existsSync(AUDIT_LOG_PATH)) {
        return {
          content: [{ type: 'text', text: 'No audit log entries found' }],
          structuredContent: [],
          isError: false,
        };
      }
      
      const logData = fs.readFileSync(AUDIT_LOG_PATH, 'utf-8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
      return {
        content: [{ type: 'json', json: logData }],
        structuredContent: logData,
        isError: false,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Audit log error: ${error.message}` }],
        structuredContent: { error: error.message },
      };
    }
  },
};

function getCredentialTools() {
  return [
    addCredentialTool,
    getCredentialTool,
    listCredentialsTool,
    removeCredentialTool,
    rotateKeyTool,
  ];
}

function getCredentialResources() {
  return [auditLogResource];
}

module.exports = {
  getCredentialTools,
  getCredentialResources,
};
