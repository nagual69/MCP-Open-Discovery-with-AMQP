"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const shared_1 = require("./shared");
const types_1 = require("./types");
const store_1 = require("./store");
const toolDefinitions = [
    {
        name: 'mcp_od_memory_get',
        description: 'Get a CI object from CMDB memory by key.',
        inputSchema: types_1.GetMemoryInputShape,
        annotations: types_1.ReadOnlyAnnotations,
        handler: async ({ response_format, key }) => {
            try {
                const result = (0, store_1.getMemoryValue)(key);
                const markdown = result.value
                    ? `## CI: ${result.key}\n\n\`\`\`json\n${JSON.stringify(result.value, null, 2)}\n\`\`\``
                    : `No CI found for key: ${result.key}`;
                return (0, shared_1.buildTextResponse)(result, markdown, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to get memory value');
            }
        },
    },
    {
        name: 'mcp_od_memory_set',
        description: 'Store a CI object in CMDB memory.',
        inputSchema: types_1.SetMemoryInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async ({ key, value }) => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.setMemoryValue)(key, value));
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to store memory value');
            }
        },
    },
    {
        name: 'mcp_od_memory_merge',
        description: 'Merge data into an existing CI in CMDB memory.',
        inputSchema: types_1.MergeMemoryInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async ({ key, value }) => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.mergeMemoryValue)(key, value));
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to merge memory value');
            }
        },
    },
    {
        name: 'mcp_od_memory_query',
        description: 'Query CMDB memory for CIs matching a pattern.',
        inputSchema: types_1.QueryMemoryInputShape,
        annotations: types_1.ReadOnlyAnnotations,
        handler: async ({ pattern, response_format }) => {
            try {
                const result = (0, store_1.queryMemory)(pattern);
                const markdown = `## Matching CIs (${result.count})\n\n\`\`\`json\n${JSON.stringify(result.matches, null, 2)}\n\`\`\``;
                return (0, shared_1.buildTextResponse)(result, markdown, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to query memory');
            }
        },
    },
    {
        name: 'mcp_od_memory_clear',
        description: 'Clear all memory data from in-memory and SQLite storage.',
        inputSchema: types_1.ClearMemoryInputShape,
        annotations: types_1.ClearAnnotations,
        handler: async () => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.clearMemory)());
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to clear memory');
            }
        },
    },
    {
        name: 'mcp_od_memory_stats',
        description: 'Get statistics about CMDB memory usage.',
        inputSchema: types_1.StatsMemoryInputShape,
        annotations: types_1.ReadOnlyAnnotations,
        handler: async ({ response_format }) => {
            try {
                const result = (0, store_1.getMemoryStats)();
                const markdown = `## Memory Statistics\n\n| Metric | Value |\n|---|---|\n| In-Memory CIs | ${result.inMemoryCIs} |\n| SQLite CIs | ${result.sqliteCIs} |\n| Total Size | ${result.totalSizeBytes} bytes |\n| Audit Entries | ${result.auditEntries} |\n| Oldest CI | ${result.oldestCI || 'N/A'} |\n| Newest CI | ${result.newestCI || 'N/A'} |\n| Auto-Save | ${result.autoSave.enabled} (${result.autoSave.intervalMs}ms) |`;
                return (0, shared_1.buildTextResponse)(result, markdown, response_format);
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to get memory stats');
            }
        },
    },
    {
        name: 'mcp_od_memory_rotate_key',
        description: 'Rotate the memory encryption key.',
        inputSchema: types_1.RotateKeyInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async ({ newKey }) => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.rotateMemoryKey)(newKey));
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to rotate memory key');
            }
        },
    },
    {
        name: 'mcp_od_memory_save',
        description: 'Manually save all CMDB data to SQLite.',
        inputSchema: types_1.SaveMemoryInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async () => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.saveMemory)());
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to save memory');
            }
        },
    },
    {
        name: 'mcp_od_memory_migrate_from_filesystem',
        description: 'Migrate legacy filesystem memory data to SQLite.',
        inputSchema: types_1.MigrateFilesystemInputShape,
        annotations: types_1.WriteAnnotations,
        handler: async ({ oldDataPath }) => {
            try {
                return (0, shared_1.buildJsonResponse)((0, store_1.migrateMemoryFromFilesystem)(oldDataPath));
            }
            catch (error) {
                return (0, shared_1.buildErrorResponse)(error instanceof Error ? error.message : 'Failed to migrate memory from filesystem');
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