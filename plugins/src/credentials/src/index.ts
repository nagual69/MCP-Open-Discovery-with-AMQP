import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import { buildErrorResponse, buildJsonResponse, buildTextResponse, type ToolResponse } from './shared';
import {
  AddCredentialInputShape,
  GetCredentialInputShape,
  ListCredentialsInputShape,
  ReadOnlyAnnotations,
  RemoveAnnotations,
  RemoveCredentialInputShape,
  RotateKeyInputShape,
  WriteAnnotations,
} from './types';
import { addCredential, getCredential, listCredentials, removeCredential, rotateKey } from './store';

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (...args: any[]) => Promise<ToolResponse>;
  annotations: Record<string, unknown>;
};

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_credentials_add',
    description: 'Stores an encrypted credential (password, API key, SSH key, OAuth token, etc.).',
    inputSchema: AddCredentialInputShape,
    annotations: WriteAnnotations,
    handler: async (args) => {
      try {
        return buildJsonResponse(addCredential(args));
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to add credential');
      }
    },
  },
  {
    name: 'mcp_od_credentials_get',
    description: 'Retrieves and decrypts a stored credential.',
    inputSchema: GetCredentialInputShape,
    annotations: ReadOnlyAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const result = getCredential(args.id);
        const markdown = `## Credential: ${result.id}\n- Type: ${result.type}\n- Username: ${result.username || 'N/A'}\n- URL: ${result.url || 'N/A'}\n- Created: ${result.createdAt}\n\nSecrets are included in the response.`;
        return buildTextResponse(result, markdown, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to get credential');
      }
    },
  },
  {
    name: 'mcp_od_credentials_list',
    description: 'Lists all stored credentials (metadata only, no secrets decrypted).',
    inputSchema: ListCredentialsInputShape,
    annotations: ReadOnlyAnnotations,
    handler: async ({ response_format, ...args }) => {
      try {
        const result = listCredentials(args.type);
        const rows = result.credentials.length
          ? result.credentials.map((credential) => `| ${credential.id} | ${credential.type} | ${credential.username || ''} | ${credential.url || ''} |`).join('\n')
          : '| | | | |';
        const markdown = `## Stored Credentials (${result.credentials.length})\n\n| ID | Type | Username | URL |\n|---|---|---|---|\n${rows}`;
        return buildTextResponse(result, markdown, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to list credentials');
      }
    },
  },
  {
    name: 'mcp_od_credentials_remove',
    description: 'Permanently removes a stored credential.',
    inputSchema: RemoveCredentialInputShape,
    annotations: RemoveAnnotations,
    handler: async (args) => {
      try {
        return buildJsonResponse(removeCredential(args.id));
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to remove credential');
      }
    },
  },
  {
    name: 'mcp_od_credentials_rotate_key',
    description: 'Generates a new encryption key and re-encrypts all stored credentials.',
    inputSchema: RotateKeyInputShape,
    annotations: WriteAnnotations,
    handler: async () => {
      try {
        return buildJsonResponse(rotateKey());
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to rotate encryption key');
      }
    },
  },
];

export async function createPlugin(server: McpServer): Promise<void> {
  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      tool.handler as never,
    );
  }
}