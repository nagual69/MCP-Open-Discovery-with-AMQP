// tools/prompts_sdk.js
// MCP Prompts registry for Open Discovery
const { z } = require('zod');

// Example: Code Review Prompt
const codeReviewPrompt = {
  name: 'code_review',
  title: 'Request Code Review',
  description: 'Asks the LLM to analyze code quality and suggest improvements',
  argsSchema: z.object({
    code: z.string(),
    language: z.string().optional(),
  }),
  callback: async ({ code, language }) => {
    return {
      description: 'Code review prompt',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please review this${language ? ' ' + language : ''} code:\n${code}`
          }
        }
      ]
    };
  }
};

function getPrompts() {
  return [codeReviewPrompt];
}

// Internal registry for dynamic management
const registeredPrompts = {};
let mcpServerInstance = null;

function registerAllPrompts(server) {
  mcpServerInstance = server;
  const prompts = getPrompts();
  for (const prompt of prompts) {
    addPrompt(prompt, server);
  }
}

function isServerConnected(server) {
  return server && server.server && server.server.transport;
}

function addPrompt(prompt, server = mcpServerInstance) {
  if (!server) throw new Error('MCP server instance not set');
  if (registeredPrompts[prompt.name]) {
    throw new Error(`Prompt '${prompt.name}' already registered`);
  }
  const reg = server.prompt(
    prompt.name,
    prompt.title || undefined,
    prompt.description || undefined,
    prompt.argsSchema || undefined,
    prompt.callback
  );
  registeredPrompts[prompt.name] = reg;
  // Only notify if server is connected
  if (isServerConnected(server)) {
    server.server.sendPromptListChanged();
  }
  return reg;
}

function removePrompt(name, server = mcpServerInstance) {
  const reg = registeredPrompts[name];
  if (reg) {
    reg.remove();
    delete registeredPrompts[name];
    if (isServerConnected(server)) {
      server.server.sendPromptListChanged();
    }
    return true;
  }
  return false;
}

function enablePrompt(name) {
  const reg = registeredPrompts[name];
  if (reg) {
    reg.enable();
    if (isServerConnected(mcpServerInstance)) {
      mcpServerInstance.server.sendPromptListChanged();
    }
    return true;
  }
  return false;
}

function disablePrompt(name) {
  const reg = registeredPrompts[name];
  if (reg) {
    reg.disable();
    if (isServerConnected(mcpServerInstance)) {
      mcpServerInstance.server.sendPromptListChanged();
    }
    return true;
  }
  return false;
}

function listRegisteredPrompts() {
  return Object.keys(registeredPrompts);
}

module.exports = {
  getPrompts,
  registerAllPrompts,
  addPrompt,
  removePrompt,
  enablePrompt,
  disablePrompt,
  listRegisteredPrompts
};
