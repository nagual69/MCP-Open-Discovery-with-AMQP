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
const crypto = require('crypto');

// Environment / feature flags
const ALLOW_RUNTIME_DEPS = /^(1|true)$/i.test(process.env.PLUGIN_ALLOW_RUNTIME_DEPS || '');
const STRICT_CAPABILITIES = /^(1|true)$/i.test(process.env.STRICT_CAPABILITIES || process.env.PLUGIN_STRICT_CAPABILITIES || '');

// Restricted core modules (denied unless permission present)
const RESTRICTED_MODULES = [ 'fs', 'child_process', 'net', 'dgram', 'tls', 'http', 'https', 'dns' ];

// Single (v2) schema only – no backward compatibility required
let compiledV2 = null;
function loadV2Schema() {
  if (compiledV2) return compiledV2;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const v2Path = path.resolve(__dirname, '..', '..', 'docs', 'mcp-od-marketplace', 'specs', 'schemas', 'mcp-plugin.schema.v2.json');
  if (!fs.existsSync(v2Path)) throw new Error('mcp-plugin.schema.v2.json not found');
  const v2Raw = JSON.parse(fs.readFileSync(v2Path, 'utf8'));
  compiledV2 = ajv.compile(v2Raw);
  return compiledV2;
}

function validateManifest(manifest) {
  if (!manifest || manifest.manifestVersion !== '2') {
    return { ok: false, errors: [ { instancePath: '/manifestVersion', message: 'manifestVersion must be "2"' } ] };
  }
  const validator = loadV2Schema();
  const ok = validator(manifest);
  return { ok, errors: ok ? [] : (validator.errors || []) };
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
      // Modern MCP SDK method names: server.tool / server.resource / server.prompt
      if (prop === 'resource') {
        return (name, uri, reader) => {
          // Normalize to legacy captured shape
            captured.resources.push({ name, uriOrTemplate: uri, metadata: { uri }, reader });
          return true;
        };
      }
      if (prop === 'prompt') {
        return (name, cfg, handler) => {
          captured.prompts.push({ name, cfg, cb: handler });
          return true;
        };
      }
      if (prop === 'tool') {
        return (name, cfg, handler) => {
          captured.tools.push({ name, cfg, handler });
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

  // Enforce v2 additional runtime policies
  const isV2 = true; // only version supported
  {
    // externalDependencies forbidden unless feature flag + policy
    if (Array.isArray(manifest.externalDependencies) && manifest.externalDependencies.length > 0 && !ALLOW_RUNTIME_DEPS) {
      throw new Error(`externalDependencies declared but PLUGIN_ALLOW_RUNTIME_DEPS not enabled`);
    }
    // dependenciesPolicy must align with environment
    if (manifest.dependenciesPolicy === 'external-allowed' && !ALLOW_RUNTIME_DEPS) {
      throw new Error(`Plugin expects external dependencies but runtime deps are disabled`);
    }
  }

  // Dist hash verification (v2): compute sha256 over ordered dist contents
  {
    if (!manifest.dist || !manifest.dist.hash) {
      throw new Error('v2 manifest missing dist.hash');
    }
    const declared = manifest.dist.hash; // format sha256:HEX
    const match = declared.match(/^sha256:([a-fA-F0-9]{64})$/);
    if (!match) throw new Error(`Invalid dist.hash format: ${declared}`);
    const distDir = path.resolve(rootDir, 'dist');
    if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
      throw new Error('dist directory missing for v2 plugin');
    }
    const computedHex = computeDistHash(distDir);
    if (computedHex.toLowerCase() !== match[1].toLowerCase()) {
      throw new Error(`dist hash mismatch: manifest=${match[1]} computed=${computedHex}`);
    }
  }

  // Static security scan (basic): detect restricted core module imports without permission
  {
    const violations = staticSecurityScan(path.resolve(rootDir, 'dist'), manifest);
    if (violations.length) {
      throw new Error('Security scan failed: ' + violations.join('; '));
    }
  }

  const entryAbs = path.resolve(rootDir, manifest.entry);
  const entryUrl = pathToFileURL(entryAbs).href;

  // Runtime sandbox (lightweight): intercept restricted core module loading originating from this plugin's dist during createPlugin execution.
  // We only enforce during initial create() call; long-lived code should have already required what it needs.
  const Module = require('module');
  const originalLoad = Module._load;
  const pluginRoot = path.resolve(rootDir);
  const perms = manifest.permissions || {};
  const runtimeAllowed = new Set();
  if (perms.network) ['net','dns','http','https','tls'].forEach(m=>runtimeAllowed.add(m));
  if (perms.fsRead || perms.fsWrite) runtimeAllowed.add('fs');
  if (perms.exec) runtimeAllowed.add('child_process');
  const restrictedSet = new Set(RESTRICTED_MODULES);
  let mod;
  try {
    Module._load = function(request, parent, isMain) {
      // Only inspect core restricted modules
      if (restrictedSet.has(request)) {
        const parentFile = parent && parent.filename ? parent.filename : '';
        if (parentFile.startsWith(pluginRoot) && !runtimeAllowed.has(request)) {
          throw new Error(`Plugin '${manifest.name}' attempted to require restricted core module '${request}' without permission`);
        }
      }
      return originalLoad.apply(this, arguments);
    };
    mod = await import(entryUrl);
  } finally {
    Module._load = originalLoad; // restore regardless of success/failure
  }
  const create = typeof mod.createPlugin === 'function' ? mod.createPlugin
    : (mod && mod.default && typeof mod.default.createPlugin === 'function' ? mod.default.createPlugin : null);
  if (typeof create !== 'function') {
    throw new Error(`Entry does not export createPlugin(): ${manifest.entry}`);
  }

  const { proxy, captured } = createServerProxyCaptureOnly(server);
  await create(proxy);

  // Manifest.capabilities not part of shared v2 schema; ignore if present (future extension placeholder)
  if (manifest.capabilities) {
    console.warn('[Plugin Loader] ℹ️  Ignoring non-spec manifest.capabilities (using captured registrations instead)');
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
    if (typeof server.registerTool === 'function') {
      server.registerTool(t.name, t.cfg, t.handler);
    } else if (typeof server.tool === 'function') {
      server.tool(t.name, t.cfg, t.handler);
    }
  }
  for (const r of captured.resources) {
    if (typeof server.registerResource === 'function') {
      server.registerResource(r.name, r.uriOrTemplate, r.metadata, r.reader);
    } else if (typeof server.resource === 'function') {
      server.resource(r.name, r.uriOrTemplate, r.reader);
    }
  }
  for (const p of captured.prompts) {
    if (typeof server.registerPrompt === 'function') {
      server.registerPrompt(p.name, p.cfg, p.cb);
    } else if (typeof server.prompt === 'function') {
      server.prompt(p.name, p.cfg, p.cb);
    }
  }

  return { captured };
}

// === Helpers ===
function computeDistHash(distDir) {
  // Ordered list (lexicographical) of files hashed concatenated path + NUL + content
  const files = [];
  (function walk(dir){
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel = path.relative(distDir, full).replace(/\\/g, '/');
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full); else if (st.isFile()) files.push(rel);
    }
  })(distDir);
  files.sort();
  const h = crypto.createHash('sha256');
  for (const rel of files) {
    h.update(rel);
    h.update('\0');
    h.update(fs.readFileSync(path.join(distDir, rel)));
  }
  return h.digest('hex');
}

function staticSecurityScan(distDir, manifest) {
  const violations = [];
  const perms = manifest.permissions || {}; // v2 permissions object
  const allowed = new Set();
  if (perms.network) allowed.add('net').add('dns').add('http').add('https');
  if (perms.fsRead) allowed.add('fs');
  if (perms.exec) allowed.add('child_process');
  // NOTE: fsWrite would still allow fs but write operations enforced at runtime (future)
  (function walk(dir){
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full); else if (st.isFile() && /\.(m?js|cjs|js)$/.test(entry)) {
        const src = fs.readFileSync(full, 'utf8');
        for (const modName of RESTRICTED_MODULES) {
          const safe = modName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!allowed.has(modName) && new RegExp(`require\\(\\s*['\"]${safe}['\"]\\s*\\)`).test(src)) {
              violations.push(`${modName} import in ${path.relative(distDir, full)}`);
            }
            if (!allowed.has(modName) && new RegExp(`from\\s+['\"]${safe}['\"]`).test(src)) {
              violations.push(`${modName} import in ${path.relative(distDir, full)}`);
            }
          }
      }
    }
  })(distDir);
  return violations;
}

module.exports = {
  validateManifest,
  topoSortByDependencies,
  loadSpecPlugin,
  computeDistHash,
  staticSecurityScan
};
