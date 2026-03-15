"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const shared_1 = require("./shared");
const types_1 = require("./types");
const store_1 = require("./store");
const toolDefinitions = [
    {
        name: 'mcp_od_credentials_add',
        description: 'Stores an encrypted credential (password, API key, SSH key, OAuth token, etc.).',
        inputSchema: types_1.AddCredentialInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async (args) => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.addCredential)(args));
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to add credential');
            }
        },
    },
    {
        name: 'mcp_od_credentials_get',
        description: 'Retrieves and decrypts a stored credential.',
        inputSchema: types_1.GetCredentialInputShape,
        annotations: types_1.ReadOnlyAnnotations,
        handler: async ({ response_format, ...args }) => {
            try {
                const result = (0, store_1.getCredential)(args.id);
                const markdown = `## Credential: ${result.id}\n- Type: ${result.type}\n- Username: ${result.username || 'N/A'}\n- URL: ${result.url || 'N/A'}\n- Created: ${result.createdAt}\n\nSecrets are included in the response.`;
                return (0, shared_1.buildTextResponse)(result, markdown, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to get credential');
            }
        },
    },
    {
        name: 'mcp_od_credentials_list',
        description: 'Lists all stored credentials (metadata only, no secrets decrypted).',
        inputSchema: types_1.ListCredentialsInputShape,
        annotations: types_1.ReadOnlyAnnotations,
        handler: async ({ response_format, ...args }) => {
            try {
                const result = (0, store_1.listCredentials)(args.type);
                const rows = result.credentials.length
                    ? result.credentials.map((credential) => `| ${credential.id} | ${credential.type} | ${credential.username || ''} | ${credential.url || ''} |`).join('\n')
                    : '| | | | |';
                const markdown = `## Stored Credentials (${result.credentials.length})\n\n| ID | Type | Username | URL |\n|---|---|---|---|\n${rows}`;
                return (0, shared_1.buildTextResponse)(result, markdown, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to list credentials');
            }
        },
    },
    {
        name: 'mcp_od_credentials_remove',
        description: 'Permanently removes a stored credential.',
        inputSchema: types_1.RemoveCredentialInputShape,
        annotations: types_1.RemoveAnnotations,
        handler: async (args) => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.removeCredential)(args.id));
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to remove credential');
            }
        },
    },
    {
        name: 'mcp_od_credentials_rotate_key',
        description: 'Generates a new encryption key and re-encrypts all stored credentials.',
        inputSchema: types_1.RotateKeyInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async () => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.rotateKey)());
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to rotate encryption key');
            }
        },
    },
];
async function createPlugin(server) {
    for (const tool of toolDefinitions) {
        server.registerTool(tool.name, {
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
        }, tool.handler);
    }
}
//# sourceMappingURL=index.js.map