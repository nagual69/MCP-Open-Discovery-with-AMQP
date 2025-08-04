// tools/credentials_tools_sdk.js
// MCP SDK tools for credential management
// Provides secure add, get, list, remove, and rotate operations for multiple credential types

const credentialsManager = require('./credentials_manager');
const { z } = require('zod');

// Schema for credential types - using enum with clear description
const CREDENTIAL_TYPES = ['password', 'apiKey', 'sshKey', 'oauthToken', 'certificate', 'custom'];

// MCP Tools array with native Zod schemas
const tools = [
  {
    name: 'credentials_add',
    description: 'Add a new encrypted credential to the secure store. Valid types: "password", "apiKey", "sshKey", "oauthToken", "certificate", "custom"',
    inputSchema: z.object({
      id: z.string().describe("Unique credential ID"),
      type: z.enum(CREDENTIAL_TYPES).describe("Type of credential"),
      username: z.string().optional().describe("Username (if applicable)"),
      url: z.string().optional().describe("URL/endpoint (if applicable)"),
      password: z.string().optional().describe("Password to encrypt (use with type=\"password\")"),
      apiKey: z.string().optional().describe("API key to encrypt (use with type=\"apiKey\")"),
      sshKey: z.string().optional().describe("SSH private key to encrypt (use with type=\"sshKey\")"),
      oauthToken: z.string().optional().describe("OAuth token to encrypt (use with type=\"oauthToken\")"),
      certificate: z.string().optional().describe("Certificate/cert data to encrypt (use with type=\"certificate\")"),
      customField1: z.string().optional().describe("Custom field 1 (use with type=\"custom\")"),
      customField2: z.string().optional().describe("Custom field 2 (use with type=\"custom\")"),
      notes: z.string().optional().describe("Notes about this credential"),
    }),
  },
  {
    name: 'credentials_get',
    description: 'Retrieve and decrypt a credential from the secure store',
    inputSchema: z.object({
      id: z.string().describe("Credential ID to retrieve"),
    }),
  },
  {
    name: 'credentials_list',
    description: 'List all stored credentials (IDs, types, usernames only - no sensitive data)',
    inputSchema: z.object({
      type: z.enum(CREDENTIAL_TYPES).optional().describe("Filter by credential type"),
    }),
  },
  {
    name: 'credentials_remove',
    description: 'Remove a credential from the secure store',
    inputSchema: z.object({
      id: z.string().describe("Credential ID to remove"),
    }),
  },
  {
    name: 'credentials_rotate_key',
    description: 'Rotate the encryption key and re-encrypt all stored credentials',
    inputSchema: z.object({
      newKey: z.string().optional().describe("New 32-byte key (base64). If not provided, generates a new random key."),
    }),
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'credentials_add':
      return await addCredential(args);
    case 'credentials_get':
      return await getCredential(args);
    case 'credentials_list':
      return await listCredentials(args);
    case 'credentials_remove':
      return await removeCredential(args);
    case 'credentials_rotate_key':
      return await rotateKey(args);
    default:
      throw new Error(`Unknown credentials tool: ${name}`);
  }
}

async function addCredential({ id, type, ...data }) {
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
        text: `Successfully added credential: ${id}` 
      }],
      structuredContent: { 
        success: true, 
        id, 
        type 
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
}

async function getCredential({ id }) {
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
      structuredContent: { 
        success: true, 
        credential 
      },
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
}

async function listCredentials({ type }) {
  try {
    const credentials = credentialsManager.listCredentials(type);
    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify(credentials, null, 2)
      }],
      structuredContent: { 
        success: true, 
        credentials 
      },
      isError: false,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ 
        type: 'text', 
        text: `Failed to list credentials: ${error.message}` 
      }],
      structuredContent: { 
        success: false, 
        error: error.message 
      },
    };
  }
}

async function removeCredential({ id }) {
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
        text: `Successfully removed credential: ${id}` 
      }],
      structuredContent: { 
        success: true, 
        id 
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
}

async function rotateKey({ newKey }) {
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
}

// Resource: Audit Log
const auditLogResource = {
  uri: 'credentials://audit/log',
  name: 'Credential Audit Log',
  description: 'Audit log of all credential operations',
  mimeType: 'application/json',
  getContent: async (uri) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const AUDIT_LOG_PATH = path.join(process.cwd(), 'data', 'mcp_creds_audit.log');
      
      let logData = [];
      if (fs.existsSync(AUDIT_LOG_PATH)) {
        const logContent = fs.readFileSync(AUDIT_LOG_PATH, 'utf8');
        const lines = logContent.trim().split('\n').filter(line => line.trim());
        logData = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        });
      }
      
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(logData, null, 2)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ error: error.message }, null, 2)
        }]
      };
    }
  },
};

function getCredentialResources() {
  return [auditLogResource];
}

module.exports = {
  tools,
  handleToolCall,
  getCredentialResources,
};
