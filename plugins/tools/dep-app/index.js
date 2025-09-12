module.exports = {
  async createPlugin(server) {
    // This plugin registers a tool that calls the lib's tool output format
    server.registerTool(
      'dep_app_use_lib',
      {
        description: 'App uses lib tool',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        }
      },
      async ({ text }) => ({ content: [{ type: 'text', text: `app:${text}` }] })
    );
  }
};
