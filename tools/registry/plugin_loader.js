/**
 * MCP OD Plugin Loader (Spec-compliant)
 * - Validates mcp-plugin.json against JSON Schema (AJV)
 * - Dynamically imports entry module and calls createPlugin(server)
 * - Proxies server to capture registrations for preflight checks
 */

const path = require('path');
const { pathToFileURL } = require('url');
const Ajv = require('ajv');
const fs = require('fs');

let compiledSchema = null;
function getSchema() {
  if (compiledSchema) return compiledSchema;
  const schemaPath = path.resolve(__dirname, '..', '..', 'docs', 'mcp-od-marketplace', 'specs', 'schemas', 'mcp-plugin.schema.json');
  const raw = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  compiledSchema = ajv.compile(raw);
  return compiledSchema;
}

function validateManifest(manifest) {
  const validate = getSchema();
  const ok = validate(manifest);
  return { ok, errors: ok ? [] : (validate.errors || []) };
}

function topoSortByDependencies(manifests) {
  const idToManifest = new Map(manifests.map(m => [m.name, m]));
  const temp = new Set();
  const perm = new Set();
  const order = [];

  function visit(id, stack = []) {
    if (perm.has(id)) return;
    if (temp.has(id)) throw new Error(`Dependency cycle: ${[...stack, id].join(' -> ')}`);
    temp.add(id);
    const m = idToManifest.get(id);
    if (!m) throw new Error(`Missing manifest for dependency: ${id}`);
    for (const dep of (m.dependencies || [])) visit(dep, [...stack, id]);
    perm.add(id);
    temp.delete(id);
    order.push(m);
  }

  for (const m of manifests) visit(m.name);
  return order;
}

function createServerProxyCaptureOnly(server) {
  const captured = { tools: [], resources: [], prompts: [] };
  const proxy = new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        return (name, cfg, handler) => {
          captured.tools.push({ name, cfg, handler });
          return true; // capture-only stage
        };
      }
      if (prop === 'registerResource') {
        return (name, uriOrTemplate, metadata, reader) => {
          captured.resources.push({ name, uriOrTemplate, metadata, reader });
          return true;
        };
      }
      if (prop === 'registerPrompt') {
        return (name, cfg, cb) => {
          captured.prompts.push({ name, cfg, cb });
          return true;
        };
      }
      return target[prop];
    }
  });
  return { proxy, captured };
}

async function loadSpecPlugin(server, rootDir, manifest, options = {}) {
  // Validate manifest
  const { ok, errors } = validateManifest(manifest);
  if (!ok) {
    const msg = `Manifest validation failed: ${errors.map(e => `${e.instancePath} ${e.message}`).join('; ')}`;
    throw new Error(msg);
  }

  const entryAbs = path.resolve(rootDir, manifest.entry);
  const entryUrl = pathToFileURL(entryAbs).href;
  const mod = await import(entryUrl);
  const create = typeof mod.createPlugin === 'function' ? mod.createPlugin
    : (mod && mod.default && typeof mod.default.createPlugin === 'function' ? mod.default.createPlugin : null);
  if (typeof create !== 'function') {
    throw new Error(`Entry does not export createPlugin(): ${manifest.entry}`);
  }

  const { proxy, captured } = createServerProxyCaptureOnly(server);
  await create(proxy);

  // Preflight: compare declared vs captured (warnings only by default)
  if (manifest.capabilities) {
    const declTools = new Set((manifest.capabilities.tools || []).map(t => t.name));
    const declRes = new Set((manifest.capabilities.resources || []).map(r => r.name));
    const declPrompts = new Set((manifest.capabilities.prompts || []).map(p => p.name));
    const gotTools = new Set(captured.tools.map(t => t.name));
    const gotRes = new Set(captured.resources.map(r => r.name));
    const gotPrompts = new Set(captured.prompts.map(p => p.name));

    const missing = {
      tools: [...declTools].filter(n => !gotTools.has(n)),
      resources: [...declRes].filter(n => !gotRes.has(n)),
      prompts: [...declPrompts].filter(n => !gotPrompts.has(n))
    };
    const msgs = [];
    if (missing.tools.length) msgs.push(`tools: ${missing.tools.join(', ')}`);
    if (missing.resources.length) msgs.push(`resources: ${missing.resources.join(', ')}`);
    if (missing.prompts.length) msgs.push(`prompts: ${missing.prompts.join(', ')}`);
    if (msgs.length) {
      console.warn(`[Plugin Loader] ⚠️  Declared but not registered -> ${msgs.join(' | ')}`);
      if (options.strictCapabilities) {
        throw new Error(`Capabilities mismatch: ${msgs.join(' | ')}`);
      }
    }
  }
  // Optional tool validation using provided validationManager
  if (options.validationManager && captured.tools.length) {
    const tvm = options.validationManager;
    const toValidate = captured.tools.map(t => ({
      name: t.name,
      description: t.cfg?.description || t.cfg?.title || t.name,
      inputSchema: t.cfg?.inputSchema || {}
    }));
    const batch = tvm.validateToolBatch(toValidate, manifest.name || 'spec-plugin');
    if (batch.invalidTools > 0 && tvm.config?.strictMode !== false) {
      const failed = batch.toolResults.filter(r => !r.valid).map(r => r.tool?.name || 'unknown');
      throw new Error(`Tool validation failed: ${batch.invalidTools}/${batch.totalTools} invalid (${failed.join(', ')})`);
    }
  }

  // Forward captured registrations to the real server after successful validation
  for (const t of captured.tools) {
    server.registerTool(t.name, t.cfg, t.handler);
  }
  for (const r of captured.resources) {
    server.registerResource(r.name, r.uriOrTemplate, r.metadata, r.reader);
  }
  for (const p of captured.prompts) {
    server.registerPrompt(p.name, p.cfg, p.cb);
  }

  return { captured };
}

module.exports = {
  validateManifest,
  topoSortByDependencies,
  loadSpecPlugin,
};
