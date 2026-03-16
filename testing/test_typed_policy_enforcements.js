const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, content, 'utf8');
}

function computeDistHash(distDir) {
  const files = [];

  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(path.relative(distDir, fullPath).replace(/\\/g, '/'));
      }
    }
  })(distDir);

  files.sort();
  const hash = crypto.createHash('sha256');
  for (const relPath of files) {
    hash.update(relPath);
    hash.update('\n');
    hash.update(fs.readFileSync(path.join(distDir, relPath)));
  }
  return `sha256:${hash.digest('hex')}`;
}

async function createSpecPlugin(rootDir, { name, entryCode, manifestExtras = {} }) {
  const distDir = path.join(rootDir, 'dist');
  const entryPath = path.join(distDir, 'index.js');
  await writeFile(entryPath, entryCode);
  const distHash = computeDistHash(distDir);
  const manifest = {
    manifestVersion: '2',
    name,
    version: '1.0.0',
    entry: 'dist/index.js',
    dist: { hash: distHash },
    ...manifestExtras,
  };
  await writeFile(path.join(rootDir, 'mcp-plugin.json'), JSON.stringify(manifest, null, 2));
}

function captureEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mcpod-typed-policy-'));
  const envKeys = [
    'DATA_DIR',
    'PLUGIN_DB_PATH',
    'PLUGINS_ROOT',
    'STRICT_CAPABILITIES',
    'PLUGIN_STRICT_CAPABILITIES',
    'SANDBOX_AVAILABLE',
    'PLUGIN_ALLOW_NATIVE',
    'PLUGIN_ALLOW_RUNTIME_DEPS',
    'STRICT_INTEGRITY',
    'REQUIRE_SIGNATURES',
    'PLUGIN_REQUIRE_SIGNED',
  ];
  const originalEnv = captureEnv(envKeys);

  const dataDir = path.join(tempRoot, 'data');
  const pluginsRoot = path.join(tempRoot, 'plugins');
  const casesRoot = path.join(tempRoot, 'cases');

  process.env.DATA_DIR = dataDir;
  process.env.PLUGIN_DB_PATH = path.join(dataDir, 'plugin_store.db');
  process.env.PLUGINS_ROOT = pluginsRoot;
  delete process.env.STRICT_CAPABILITIES;
  delete process.env.PLUGIN_STRICT_CAPABILITIES;
  delete process.env.SANDBOX_AVAILABLE;
  delete process.env.PLUGIN_ALLOW_NATIVE;
  delete process.env.PLUGIN_ALLOW_RUNTIME_DEPS;
  delete process.env.STRICT_INTEGRITY;
  delete process.env.REQUIRE_SIGNATURES;
  delete process.env.PLUGIN_REQUIRE_SIGNED;

  await ensureDir(dataDir);
  await ensureDir(pluginsRoot);
  await ensureDir(casesRoot);

  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
  const pluginManager = require('../dist-ts/src/plugins/plugin-manager');
  const pluginDb = require('../dist-ts/src/plugins/db/plugin-db');
  const server = new McpServer(
    { name: 'typed-policy-suite', version: '0.0.0' },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      },
    },
  );

  pluginManager.setMcpServer(server);

  const failures = [];

  async function runCase(name, executor) {
    try {
      await executor();
      console.log(`PASS: ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ name, message });
      console.error(`FAIL: ${name} :: ${message}`);
    }
  }

  async function installCasePlugin(caseName, config) {
    const pluginRoot = path.join(casesRoot, caseName);
    await createSpecPlugin(pluginRoot, config);
    return pluginManager.install(pluginRoot, { actor: 'typed_policy_suite' });
  }

  async function cleanupPlugin(pluginId) {
    if (!pluginId) {
      return;
    }
    try {
      await pluginManager.deactivate(pluginId, { actor: 'typed_policy_suite' });
    } catch {
    }
    try {
      await pluginManager.uninstall(pluginId, { actor: 'typed_policy_suite' });
    } catch {
    }
  }

  const validToolRegistration = (toolName) => `module.exports.createPlugin = async (server) => {
  server.registerTool('${toolName}', {
    description: 'Typed policy test tool',
    inputSchema: { type: 'object', properties: {} }
  }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
};`;

  await runCase('valid typed plugin activates', async () => {
    let pluginId;
    try {
      const installed = await installCasePlugin('valid-typed-plugin', {
        name: 'valid-typed-plugin',
        entryCode: validToolRegistration('valid_tool'),
        manifestExtras: { capabilities: { tools: ['valid_tool'] } },
      });
      pluginId = installed.pluginId;
      const activated = await pluginManager.activate(pluginId, { actor: 'typed_policy_suite' });
      if (!activated.activated) {
        throw new Error('Expected valid typed plugin to activate successfully');
      }
    } finally {
      await cleanupPlugin(pluginId);
    }
  });

  await runCase('strict capabilities rejects mismatch', async () => {
    process.env.STRICT_CAPABILITIES = 'true';
    let pluginId;
    try {
      const installed = await installCasePlugin('strict-capability-mismatch', {
        name: 'strict-capability-mismatch',
        entryCode: validToolRegistration('other_tool'),
        manifestExtras: { capabilities: { tools: ['declared_tool'] } },
      });
      pluginId = installed.pluginId;
      try {
        await pluginManager.activate(pluginId, { actor: 'typed_policy_suite' });
        throw new Error('Expected capability mismatch to fail activation');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/Capability mismatch/i.test(message)) {
          throw error;
        }
      }
    } finally {
      delete process.env.STRICT_CAPABILITIES;
      await cleanupPlugin(pluginId);
    }
  });

  await runCase('sandbox-required rejects unavailable sandbox', async () => {
    delete process.env.SANDBOX_AVAILABLE;
    let pluginId;
    try {
      const installed = await installCasePlugin('sandbox-required-no', {
        name: 'sandbox-required-no',
        entryCode: validToolRegistration('sandbox_tool'),
        manifestExtras: {
          capabilities: { tools: ['sandbox_tool'] },
          dependenciesPolicy: 'sandbox-required',
        },
      });
      pluginId = installed.pluginId;
      try {
        await pluginManager.activate(pluginId, { actor: 'typed_policy_suite' });
        throw new Error('Expected sandbox-required plugin to fail activation');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/sandbox-required|SANDBOX_AVAILABLE/i.test(message)) {
          throw error;
        }
      }
    } finally {
      await cleanupPlugin(pluginId);
    }
  });

  await runCase('native addon gate rejects .node require', async () => {
    delete process.env.PLUGIN_ALLOW_NATIVE;
    let pluginId;
    try {
      const installed = await installCasePlugin('native-addon-denied', {
        name: 'native-addon-denied',
        entryCode: `module.exports.createPlugin = async () => { require('addon.node'); };`,
      });
      pluginId = installed.pluginId;
      try {
        await pluginManager.activate(pluginId, { actor: 'typed_policy_suite' });
        throw new Error('Expected native addon require to fail activation');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/native addon|PLUGIN_ALLOW_NATIVE/i.test(message)) {
          throw error;
        }
      }
    } finally {
      await cleanupPlugin(pluginId);
    }
  });

  await runCase('runtime dependency gate rejects external require', async () => {
    delete process.env.PLUGIN_ALLOW_RUNTIME_DEPS;
    let pluginId;
    try {
      const installed = await installCasePlugin('runtime-dependency-denied', {
        name: 'runtime-dependency-denied',
        entryCode: `module.exports.createPlugin = async () => { require('left-pad'); };`,
        manifestExtras: { dependenciesPolicy: 'external-allowed' },
      });
      pluginId = installed.pluginId;
      try {
        await pluginManager.activate(pluginId, { actor: 'typed_policy_suite' });
        throw new Error('Expected external dependency gate to fail activation');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/runtime deps are disabled|PLUGIN_ALLOW_RUNTIME_DEPS|External dependency/i.test(message)) {
          throw error;
        }
      }
    } finally {
      await cleanupPlugin(pluginId);
    }
  });

  await runCase('required signatures reject unsigned install', async () => {
    process.env.REQUIRE_SIGNATURES = 'true';
    try {
      try {
        await installCasePlugin('unsigned-plugin-denied', {
          name: 'unsigned-plugin-denied',
          entryCode: validToolRegistration('unsigned_tool'),
          manifestExtras: { capabilities: { tools: ['unsigned_tool'] } },
        });
        throw new Error('Expected unsigned plugin install to fail when signatures are required');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/Signature verification failed/i.test(message)) {
          throw error;
        }
      }
    } finally {
      delete process.env.REQUIRE_SIGNATURES;
    }
  });

  restoreEnv(originalEnv);
  try {
    pluginDb.closeDb?.();
  } catch {
  }
  await fsp.rm(tempRoot, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`Typed policy enforcements test: FAIL (${failures.length} failure(s))`);
    for (const failure of failures) {
      console.error(` - ${failure.name}: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log('Typed policy enforcements test: PASS');
}

main().catch(async (error) => {
  console.error('Typed policy enforcements test: FAIL', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});