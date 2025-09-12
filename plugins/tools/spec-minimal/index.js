async function createPlugin(server) {
  server.registerTool(
    'spec_echo',
    {
      title: 'Spec Echo',
      description: 'Echo a message back',
      inputSchema: {
        type: 'object',
        properties: { msg: { type: 'string' } },
        required: ['msg']
      }
    },
    async (args) => {
      return { content: [{ type: 'text', text: `echo:${args.msg}` }] };
    }
  );
}

module.exports = { createPlugin };
