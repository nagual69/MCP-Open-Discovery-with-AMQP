const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { registerAllTools } = require('../tools/registry/index');

(async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  try {
    const res = await registerAllTools(server);
    console.log('Registered tools:', res.tools);
    const toolsList = await server.server.request({ method: 'tools/list' }, require('@modelcontextprotocol/sdk/types.js').ListToolsResultSchema);
    console.log('tools/list ok, count:', toolsList.tools.length);
    // Simulate a call to a simple tool with params
    const callResult = await server.server.request({ method: 'tools/call', params: { name: 'test_simple', arguments: { message: 'hello', count: 2 } } }, require('@modelcontextprotocol/sdk/types.js').CompatibilityCallToolResultSchema);
    console.log('tools/call ok, isError:', !!callResult.isError, 'contentLen:', callResult.content?.length ?? 0);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
