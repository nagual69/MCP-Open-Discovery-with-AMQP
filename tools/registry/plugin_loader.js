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
let FLAGS;
try { FLAGS = require('./env_flags'); } catch { FLAGS = {}; }

// Environment / feature flags (centralized)
const ALLOW_RUNTIME_DEPS = !!FLAGS.ALLOW_RUNTIME_DEPS;
const STRICT_CAPABILITIES = !!FLAGS.STRICT_CAPABILITIES;
const STRICT_INTEGRITY = !!FLAGS.STRICT_INTEGRITY;

// Restricted core modules (denied unless permission present)
const RESTRICTED_MODULES = [ 'fs', 'child_process', 'net', 'dgram', 'tls', 'http', 'https', 'dns' ];

// Single (v2) schema only – no backward compatibility required
let compiledV2 = null;
function loadV2Schema() {
  if (compiledV2) return compiledV2;
  const ajv = new Ajv({ allErrors: true, strict: false });
  // Allow override via SCHEMA_PATH for development/testing
  let v2Path = process.env.SCHEMA_PATH && String(process.env.SCHEMA_PATH).trim();
  if (v2Path) {
    v2Path = path.isAbsolute(v2Path) ? v2Path : path.resolve(v2Path);
  } else {
    v2Path = path.resolve(__dirname, '..', '..', 'docs', 'mcp-od-marketplace', 'specs', 'schemas', 'mcp-plugin.schema.v2.json');
  }
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
    // dependenciesPolicy handling
    const policy = manifest.dependenciesPolicy || 'bundled-only';
    if (policy === 'external-allowed' && !ALLOW_RUNTIME_DEPS) {
      throw new Error(`Plugin expects external dependencies but runtime deps are disabled`);
    }
    if (policy === 'external-allowlist' && !ALLOW_RUNTIME_DEPS) {
      throw new Error(`external-allowlist policy requires PLUGIN_ALLOW_RUNTIME_DEPS=true`);
    }
    if ((manifest.externalDependencies && manifest.externalDependencies.length) && policy === 'bundled-only') {
      throw new Error(`externalDependencies provided but dependenciesPolicy is 'bundled-only'`);
    }
    // In allowlist mode, enforce integrities presence when STRICT_INTEGRITY is set
    if (policy === 'external-allowlist' && STRICT_INTEGRITY) {
      const hasIntegrity = (dep) => {
        if (!dep) return false;
        if (typeof dep === 'string') return false; // no integrity info
        if (typeof dep === 'object') {
          return Boolean(dep.integrity) || (Array.isArray(dep.integrities) && dep.integrities.length > 0);
        }
        return false;
      };
      const missing = (manifest.externalDependencies || []).filter(d => !hasIntegrity(d));
      if (missing.length > 0) {
        throw new Error(`STRICT_INTEGRITY: ${missing.length} allowlisted externalDependencies missing integrity`);
      }
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
  // Append version query to bust ESM import cache on reloads
  const baseHref = pathToFileURL(entryAbs).href;
  const ver = (manifest.dist && manifest.dist.hash) ? encodeURIComponent(manifest.dist.hash) : String(Date.now());
  const entryUrl = `${baseHref}?v=${ver}`;

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
  // External dependency policy
  const depPolicy = manifest.dependenciesPolicy || 'bundled-only';
  const allowExternal = depPolicy === 'external-allowed' || depPolicy === 'external-allowlist';
  // Build external allowlist
  const allowlist = new Set();
  if (depPolicy === 'external-allowlist' && Array.isArray(manifest.externalDependencies)) {
    for (const d of manifest.externalDependencies) {
      if (typeof d === 'string') allowlist.add(d);
      else if (d && typeof d.name === 'string') allowlist.add(d.name);
    }
  }
  // Global allowlist file (optional): tools/plugins/allowlist-deps.json
  let globalAllow = null;
  try {
    const allowFile = path.resolve(__dirname, '..', 'plugins', 'allowlist-deps.json');
    if (fs.existsSync(allowFile)) {
      const raw = JSON.parse(fs.readFileSync(allowFile, 'utf8'));
      if (Array.isArray(raw)) globalAllow = new Set(raw);
      else if (raw && Array.isArray(raw.allow)) globalAllow = new Set(raw.allow);
      else if (raw && Array.isArray(raw.dependencies)) globalAllow = new Set(raw.dependencies);
    }
  } catch {}
  // Helper to detect core vs relative vs package request
  const isRelativeReq = (req) => req.startsWith('./') || req.startsWith('../') || req.startsWith('/') || req.startsWith('file:');
  const isCoreModule = (req) => {
    try { return require('module').builtinModules.includes(req); } catch { return false; }
  };
  // If sandbox-required policy is set, ensure sandbox availability (env or detector)
  if (depPolicy === 'sandbox-required') {
    try {
      const sandbox = require(path.resolve(__dirname, '..', 'sandbox.js'));
      const available = typeof sandbox.isSandboxAvailable === 'function' ? sandbox.isSandboxAvailable() : /^(1|true)$/i.test(process.env.SANDBOX_AVAILABLE || '');
      if (!available) {
        throw new Error(`dependenciesPolicy 'sandbox-required' but SANDBOX_AVAILABLE=false`);
      }
    } catch (e) {
      throw new Error(`dependenciesPolicy 'sandbox-required' but sandbox not available (${e.message})`);
    }
  }

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
      // External dependency policy enforcement (during create phase)
      const parentFile = parent && parent.filename ? parent.filename : '';
      if (parentFile.startsWith(pluginRoot)) {
        // Ignore core modules and relative paths inside plugin
        if (!isCoreModule(request) && !isRelativeReq(request)) {
          // It's a package/name import, treat as external
          if (!ALLOW_RUNTIME_DEPS) {
            throw new Error(`External dependency '${request}' denied (PLUGIN_ALLOW_RUNTIME_DEPS disabled)`);
          }
          if (!allowExternal) {
            throw new Error(`External dependency '${request}' denied by dependenciesPolicy='${depPolicy}'`);
          }
          if (depPolicy === 'external-allowlist' && !allowlist.has(request)) {
            throw new Error(`External dependency '${request}' not in manifest.externalDependencies allowlist`);
          }
          if (globalAllow && !globalAllow.has(request)) {
            const msg = `External dependency '${request}' not in global allowlist`;
            if (STRICT_INTEGRITY) throw new Error(msg);
            else console.warn(`[Plugin Loader] ${msg}`);
          }
        }
      }
      // Native addon gate: block direct requires ending in .node unless explicitly allowed
      try {
        if (typeof request === 'string' && /\.node$/i.test(request)) {
          const allowNative = !!(FLAGS && FLAGS.ALLOW_NATIVE);
          if (!allowNative) {
            throw new Error(`Native addon requires are disabled (PLUGIN_ALLOW_NATIVE=false): ${request}`);
          }
        }
      } catch {}
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

  // Optional capability reconciliation: if manifest.capabilities provided, compare with captured
  if (manifest.capabilities) {
    const declared = manifest.capabilities || {};
    const toNames = (arr=[]) => arr.map(x => (x && typeof x === 'object' ? x.name : x)).filter(Boolean);
    const decl = {
      tools: new Set(toNames(declared.tools)),
      resources: new Set(toNames(declared.resources)),
      prompts: new Set(toNames(declared.prompts))
    };
    const got = {
      tools: new Set((captured.tools||[]).map(t=>t.name)),
      resources: new Set((captured.resources||[]).map(r=>r.name)),
      prompts: new Set((captured.prompts||[]).map(p=>p.name))
    };
    const diff = (a,b) => ({ missing:[...a].filter(x=>!b.has(x)), extra:[...b].filter(x=>!a.has(x)) });
    const d = {
      tools: diff(decl.tools, got.tools),
      resources: diff(decl.resources, got.resources),
      prompts: diff(decl.prompts, got.prompts)
    };
    const hasMismatch = d.tools.missing.length || d.tools.extra.length || d.resources.missing.length || d.resources.extra.length || d.prompts.missing.length || d.prompts.extra.length;
    if (hasMismatch) {
      const msg = `[Plugin Loader] Capability mismatch for '${manifest.name}': `+
        `tools missing=${d.tools.missing.join(',')} extra=${d.tools.extra.join(',')} `+
        `resources missing=${d.resources.missing.join(',')} extra=${d.resources.extra.join(',')} `+
        `prompts missing=${d.prompts.missing.join(',')} extra=${d.prompts.extra.join(',')}`;
      if (options.strictCapabilities || STRICT_CAPABILITIES) {
        throw new Error(msg);
      } else {
        console.warn(msg);
      }
    }
  }

  // If dryRun, do NOT forward registrations to the real server — return captured only
  if (options.dryRun) {
    return { captured };
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
    try {
      if (typeof server.registerTool === 'function') {
        server.registerTool(t.name, t.cfg, t.handler);
      } else if (typeof server.tool === 'function') {
        server.tool(t.name, t.cfg, t.handler);
      }
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/already\s+registered/i.test(msg)) {
        console.warn(`[Plugin Loader] Tool '${t.name}' already registered; skipping re-register`);
      } else {
        throw e;
      }
    }
  }
  for (const r of captured.resources) {
    try {
      if (typeof server.registerResource === 'function') {
        server.registerResource(r.name, r.uriOrTemplate, r.metadata, r.reader);
      } else if (typeof server.resource === 'function') {
        server.resource(r.name, r.uriOrTemplate, r.reader);
      }
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/already\s+registered/i.test(msg)) {
        console.warn(`[Plugin Loader] Resource '${r.name}' already registered; skipping re-register`);
      } else {
        throw e;
      }
    }
  }
  for (const p of captured.prompts) {
    try {
      if (typeof server.registerPrompt === 'function') {
        server.registerPrompt(p.name, p.cfg, p.cb);
      } else if (typeof server.prompt === 'function') {
        server.prompt(p.name, p.cfg, p.cb);
      }
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/already\s+registered/i.test(msg)) {
        console.warn(`[Plugin Loader] Prompt '${p.name}' already registered; skipping re-register`);
      } else {
        throw e;
      }
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

// Detailed dist hashing: returns aggregate stats and file list
function computeDistHashDetailed(distDir) {
  const files = [];
  (function walk(dir){
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel = path.relative(distDir, full).replace(/\\/g, '/');
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full); else if (st.isFile()) files.push({ rel, bytes: st.size });
    }
  })(distDir);
  files.sort((a,b)=> a.rel.localeCompare(b.rel));
  const h = crypto.createHash('sha256');
  let totalBytes = 0;
  for (const f of files) {
    h.update(f.rel);
    h.update('\0');
    h.update(fs.readFileSync(path.join(distDir, f.rel)));
    totalBytes += f.bytes;
  }
  return { hashHex: h.digest('hex'), fileCount: files.length, totalBytes, files: files.map(f=>f.rel) };
}

function staticSecurityScan(distDir, manifest) {
  const violations = [];
  const perms = manifest.permissions || {}; // v2 permissions object
  const allowed = new Set();
  if (perms.network) allowed.add('net').add('dns').add('http').add('https');
  if (perms.fsRead) allowed.add('fs');
  if (perms.exec) allowed.add('child_process');
  const depPolicy = manifest.dependenciesPolicy || 'bundled-only';
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
          // Native addon usage: flag unless explicitly allowed
          try {
            const allowNative = !!(FLAGS && FLAGS.ALLOW_NATIVE);
            if (!allowNative && /require\(\s*['"][^'"]+\.node['"]\s*\)/.test(src)) {
              violations.push(`native addon (.node) require in ${path.relative(distDir, full)} (PLUGIN_ALLOW_NATIVE=false)`);
            }
          } catch {}
          // Sandbox-required: flag obvious dynamic code execution always; loader will enforce availability
          if (depPolicy === 'sandbox-required') {
            if (/\beval\s*\(/.test(src)) {
              violations.push(`eval() usage in ${path.relative(distDir, full)}`);
            }
            if (/new\s+Function\s*\(/.test(src)) {
              violations.push(`new Function() usage in ${path.relative(distDir, full)}`);
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
  computeDistHashDetailed,
  staticSecurityScan
};
