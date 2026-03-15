import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { promptDefinitions } from './prompts';

type ExtendedMcpServer = McpServer & {
  prompt?: (name: string, description: string, inputSchema: Record<string, unknown>, handler: unknown) => unknown;
  registerPrompt?: (name: string, config: Record<string, unknown>, handler: unknown) => unknown;
};

export async function createPlugin(server: McpServer): Promise<void> {
  const extendedServer = server as ExtendedMcpServer;

  for (const prompt of promptDefinitions) {
    if (typeof extendedServer.registerPrompt === 'function') {
      extendedServer.registerPrompt(
        prompt.name,
        {
          description: prompt.description,
          argsSchema: prompt.inputSchema,
        },
        prompt.handler,
      );
      continue;
    }

    if (typeof extendedServer.prompt === 'function') {
      extendedServer.prompt(prompt.name, prompt.description, prompt.inputSchema, prompt.handler);
      continue;
    }

    throw new Error('Server does not support prompt registration');
  }
}