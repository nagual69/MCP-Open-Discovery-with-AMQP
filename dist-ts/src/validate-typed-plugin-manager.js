"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
async function main() {
    const workspaceTempBase = path_1.default.join(process.cwd(), '.typed-validation');
    await promises_1.default.mkdir(workspaceTempBase, { recursive: true });
    const tempRoot = await promises_1.default.mkdtemp(path_1.default.join(workspaceTempBase, 'run-'));
    const dataDir = path_1.default.join(tempRoot, 'data');
    const pluginsRoot = path_1.default.join(tempRoot, 'plugins');
    process.env.DATA_DIR = dataDir;
    process.env.PLUGIN_DB_PATH = path_1.default.join(dataDir, 'plugin_store.db');
    process.env.PLUGINS_ROOT = pluginsRoot;
    await promises_1.default.mkdir(dataDir, { recursive: true });
    await promises_1.default.mkdir(pluginsRoot, { recursive: true });
    const [{ closeDb, getPlugin }, pluginManager] = await Promise.all([
        Promise.resolve().then(() => __importStar(require('./plugins/db/plugin-db'))),
        Promise.resolve().then(() => __importStar(require('./plugins/plugin-manager'))),
    ]);
    const { activate, deactivate, getActiveRegistrations, install, setMcpServer, uninstall } = pluginManager;
    const server = new mcp_js_1.McpServer({
        name: 'typed-plugin-manager-validator',
        version: '0.0.0',
    }, {
        capabilities: {
            tools: { listChanged: true },
            resources: { listChanged: true },
            prompts: { listChanged: true },
        },
    });
    setMcpServer(server);
    const pluginZip = path_1.default.join(process.cwd(), 'plugins', 'builtin', 'net-utils@1.0.0.zip');
    const installed = await install(pluginZip, { actor: 'typed_validation' });
    const activated = await activate(installed.pluginId, { actor: 'typed_validation' });
    const activeRecord = getPlugin(installed.pluginId);
    const activeRegistration = getActiveRegistrations().get(installed.pluginId);
    if (!activeRecord || activeRecord.lifecycle_state !== 'active') {
        throw new Error(`Expected ${installed.pluginId} to be active after activation`);
    }
    if (!activeRegistration || activeRegistration.tools.length !== 9) {
        throw new Error(`Expected 9 captured tools for ${installed.pluginId}`);
    }
    const deactivated = await deactivate(installed.pluginId, { actor: 'typed_validation' });
    const inactiveRecord = getPlugin(installed.pluginId);
    if (!inactiveRecord || inactiveRecord.lifecycle_state !== 'inactive') {
        throw new Error(`Expected ${installed.pluginId} to be inactive after deactivation`);
    }
    await uninstall(installed.pluginId, { actor: 'typed_validation' });
    closeDb();
    await promises_1.default.rm(tempRoot, { recursive: true, force: true });
    console.log(JSON.stringify({
        pluginId: installed.pluginId,
        activated,
        deactivated,
        capturedTools: activeRegistration.tools.length,
        validation: 'ok',
    }, null, 2));
}
main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
});
//# sourceMappingURL=validate-typed-plugin-manager.js.map