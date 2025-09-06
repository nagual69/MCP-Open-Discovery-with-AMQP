module.exports = {
  async createPlugin(server) {
    server.registerTool(
      'dep_lib_echo',
      {
        description: 'Echo from library',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        }
      },
      async ({ text }) => ({ content: [{ type: 'text', text: `lib:${text}` }] })
    );
  }
};
