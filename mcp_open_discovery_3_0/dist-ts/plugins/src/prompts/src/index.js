"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const prompts_1 = require("./prompts");
async function createPlugin(server) {
    const extendedServer = server;
    for (const prompt of prompts_1.promptDefinitions) {
        if (typeof extendedServer.registerPrompt === 'function') {
            extendedServer.registerPrompt(prompt.name, {
                description: prompt.description,
                argsSchema: prompt.inputSchema,
            }, prompt.handler);
            continue;
        }
        if (typeof extendedServer.prompt === 'function') {
            extendedServer.prompt(prompt.name, prompt.description, prompt.inputSchema, prompt.handler);
            continue;
        }
        throw new Error('Server does not support prompt registration');
    }
}
//# sourceMappingURL=index.js.map