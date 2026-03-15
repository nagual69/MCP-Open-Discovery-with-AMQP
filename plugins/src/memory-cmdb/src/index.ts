import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

import { buildErrorResponse, buildJsonResponse, buildTextResponse, type ToolResponse } from './shared';
import {
  ClearAnnotations,
  ClearMemoryInputShape,
  GetMemoryInputShape,
  QueryMemoryInputShape,
  ReadOnlyAnnotations,
  RotateKeyInputShape,
  SaveMemoryInputShape,
  SetMemoryInputShape,
  StatsMemoryInputShape,
  MigrateFilesystemInputShape,
  WriteAnnotations,
  MergeMemoryInputShape,
} from './types';
import {
  clearMemory,
  getMemoryStats,
  getMemoryValue,
  mergeMemoryValue,
  migrateMemoryFromFilesystem,
  rotateMemoryKey,
  saveMemory,
  setMemoryValue,
  queryMemory,
} from './store';

type ToolRegistration = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (...args: any[]) => Promise<ToolResponse>;
  annotations: Record<string, unknown>;
};

const toolDefinitions: ToolRegistration[] = [
  {
    name: 'mcp_od_memory_get',
    description: 'Get a CI object from CMDB memory by key.',
    inputSchema: GetMemoryInputShape,
    annotations: ReadOnlyAnnotations,
    handler: async ({ response_format, key }) => {
      try {
        const result = getMemoryValue(key);
        const markdown = result.value
          ? `## CI: ${result.key}\n\n\`\`\`json\n${JSON.stringify(result.value, null, 2)}\n\`\`\``
          : `No CI found for key: ${result.key}`;
        return buildTextResponse(result, markdown, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to get memory value');
      }
    },
  },
  {
    name: 'mcp_od_memory_set',
    description: 'Store a CI object in CMDB memory.',
    inputSchema: SetMemoryInputShape,
    annotations: WriteAnnotations,
    handler: async ({ key, value }) => {
      try {
        return buildJsonResponse(setMemoryValue(key, value));
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to store memory value');
      }
    },
  },
  {
    name: 'mcp_od_memory_merge',
    description: 'Merge data into an existing CI in CMDB memory.',
    inputSchema: MergeMemoryInputShape,
    annotations: WriteAnnotations,
    handler: async ({ key, value }) => {
      try {
        return buildJsonResponse(mergeMemoryValue(key, value));
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to merge memory value');
      }
    },
  },
  {
    name: 'mcp_od_memory_query',
    description: 'Query CMDB memory for CIs matching a pattern.',
    inputSchema: QueryMemoryInputShape,
    annotations: ReadOnlyAnnotations,
    handler: async ({ pattern, response_format }) => {
      try {
        const result = queryMemory(pattern);
        const markdown = `## Matching CIs (${result.count})\n\n\`\`\`json\n${JSON.stringify(result.matches, null, 2)}\n\`\`\``;
        return buildTextResponse(result, markdown, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to query memory');
      }
    },
  },
  {
    name: 'mcp_od_memory_clear',
    description: 'Clear all memory data from in-memory and SQLite storage.',
    inputSchema: ClearMemoryInputShape,
    annotations: ClearAnnotations,
    handler: async () => {
      try {
        return buildJsonResponse(clearMemory());
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to clear memory');
      }
    },
  },
  {
    name: 'mcp_od_memory_stats',
    description: 'Get statistics about CMDB memory usage.',
    inputSchema: StatsMemoryInputShape,
    annotations: ReadOnlyAnnotations,
    handler: async ({ response_format }) => {
      try {
        const result = getMemoryStats();
        const markdown = `## Memory Statistics\n\n| Metric | Value |\n|---|---|\n| In-Memory CIs | ${result.inMemoryCIs} |\n| SQLite CIs | ${result.sqliteCIs} |\n| Total Size | ${result.totalSizeBytes} bytes |\n| Audit Entries | ${result.auditEntries} |\n| Oldest CI | ${result.oldestCI || 'N/A'} |\n| Newest CI | ${result.newestCI || 'N/A'} |\n| Auto-Save | ${result.autoSave.enabled} (${result.autoSave.intervalMs}ms) |`;
        return buildTextResponse(result, markdown, response_format);
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to get memory stats');
      }
    },
  },
  {
    name: 'mcp_od_memory_rotate_key',
    description: 'Rotate the memory encryption key.',
    inputSchema: RotateKeyInputShape,
    annotations: WriteAnnotations,
    handler: async ({ newKey }) => {
      try {
        return buildJsonResponse(rotateMemoryKey(newKey));
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to rotate memory key');
      }
    },
  },
  {
    name: 'mcp_od_memory_save',
    description: 'Manually save all CMDB data to SQLite.',
    inputSchema: SaveMemoryInputShape,
    annotations: WriteAnnotations,
    handler: async () => {
      try {
        return buildJsonResponse(saveMemory());
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to save memory');
      }
    },
  },
  {
    name: 'mcp_od_memory_migrate_from_filesystem',
    description: 'Import filesystem memory data into SQLite.',
    inputSchema: MigrateFilesystemInputShape,
    annotations: WriteAnnotations,
    handler: async ({ oldDataPath }) => {
      try {
        return buildJsonResponse(migrateMemoryFromFilesystem(oldDataPath));
      } catch (error) {
        return buildErrorResponse(error instanceof Error ? error.message : 'Failed to migrate memory from filesystem');
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