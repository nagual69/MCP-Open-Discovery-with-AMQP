const fs = require('fs');
const path = require('path');
const { z } = require('zod');

function normalizeInputSchema(inputSchema) {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return inputSchema;
  }
  if (typeof inputSchema.parse === 'function' || inputSchema._def) {
    return inputSchema;
  }
  return z.object(inputSchema);
}

function resolvePluginEntry(pluginName) {
  return path.resolve(__dirname, '..', '..', 'dist-ts', 'plugins', 'src', pluginName, 'src', 'index.js');
}

async function captureTypedPlugin(pluginName) {
  const entry = resolvePluginEntry(pluginName);
  if (!fs.existsSync(entry)) {
    throw new Error(`Typed plugin build not found for ${pluginName}. Run npm run build:ts first.`);
  }

  const plugin = require(entry);
  if (!plugin || typeof plugin.createPlugin !== 'function') {
    throw new Error(`Typed plugin ${pluginName} does not export createPlugin()`);
  }

  const tools = [];
  const prompts = [];
  const resources = [];

  const server = {
    registerTool(name, config, handler) {
      tools.push({
        name,
        description: config?.description,
        inputSchema: normalizeInputSchema(config?.inputSchema),
        annotations: config?.annotations,
        handler,
      });
    },
    registerPrompt(name, config, handler) {
      prompts.push({ name, description: config?.description, inputSchema: normalizeInputSchema(config?.inputSchema), handler });
    },
    prompt(name, config, handler) {
      prompts.push({ name, description: config?.description, inputSchema: normalizeInputSchema(config?.inputSchema), handler });
    },
    registerResource(name, config, handler) {
      resources.push({ name, description: config?.description, inputSchema: normalizeInputSchema(config?.inputSchema), handler });
    },
    resource(name, config, handler) {
      resources.push({ name, description: config?.description, inputSchema: normalizeInputSchema(config?.inputSchema), handler });
    },
  };

  await plugin.createPlugin(server);

  return {
    pluginName,
    tools,
    prompts,
    resources,
    findTool(name) {
      return tools.find((tool) => tool.name === name);
    },
  };
}

module.exports = {
  captureTypedPlugin,
  resolvePluginEntry,
};