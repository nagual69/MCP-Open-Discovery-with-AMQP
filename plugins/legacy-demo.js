module.exports = {
  tools: [{ name: 'legacy-demo_legacy', description: 'legacy tool', inputSchema: { type:'object', properties:{}, additionalProperties:false } }],
  async handleToolCall(name, args){ return { content:[{ type:'text', text:'ok'}] }; }
};