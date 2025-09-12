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
// Lightweight dist metadata cache to avoid re-hashing unchanged plugin dist trees
const _distHashCache = new Map(); // key: distDir -> { fingerprint, result }
// Global external dependencies allowlist cache
let _globalAllowlistCache = { loaded: false, pathsTried: [], set: null };

// Environment / feature flags (centralized, dynamic)
let _ENV_FLAGS_MOD = null;
try { _ENV_FLAGS_MOD = require('./env_flags'); } catch { _ENV_FLAGS_MOD = null; }
function getFlags() {
  try {
    if (_ENV_FLAGS_MOD && typeof _ENV_FLAGS_MOD.getFlags === 'function') return _ENV_FLAGS_MOD.getFlags();
  } catch {}
  // Fallback direct env read
  const bool = (v) => /^(1|true|yes|on)$/i.test(String(v || ''));
  return {
    ALLOW_RUNTIME_DEPS: bool(process.env.PLUGIN_ALLOW_RUNTIME_DEPS),
    STRICT_CAPABILITIES: bool(process.env.STRICT_CAPABILITIES) || bool(process.env.PLUGIN_STRICT_CAPABILITIES),
    STRICT_INTEGRITY: bool(process.env.STRICT_INTEGRITY)
  };
}

// Restricted core modules (denied unless permission present)
const RESTRICTED_MODULES = [ 'fs', 'child_process', 'net', 'dgram', 'tls', 'http', 'https', 'dns' ];

// Single (v2) schema only – no backward compatibility required
// Allow override via SCHEMA_PATH for development / testing; caches compiled validator.
let compiledV2 = null;
let compiledSchemaPath = null;
function loadV2Schema() {
  const override = process.env.SCHEMA_PATH && process.env.SCHEMA_PATH.trim();
  // Recompile if override path changes between calls
  if (compiledV2 && compiledSchemaPath === override) return compiledV2;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const defaultPath = path.resolve(__dirname, '..', '..', 'docs', 'mcp-od-marketplace', 'specs', 'schemas', 'mcp-plugin.schema.v2.json');
  const schemaPath = override ? path.resolve(override) : defaultPath;
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`mcp-plugin.schema.v2.json not found at '${schemaPath}' (override=${!!override})`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse plugin schema JSON at ${schemaPath}: ${e.message}`);
  }
  try {
    compiledV2 = ajv.compile(raw);
    compiledSchemaPath = override || null;
  } catch (e) {
    throw new Error(`Failed to compile plugin schema: ${e.message}`);
  }
  return compiledV2;
}

function validateManifest(manifest) {
  if (!manifest || manifest.manifestVersion !== '2') {
    return { ok: false, errors: [ { instancePath: '/manifestVersion', path: 'manifestVersion', message: 'manifestVersion must be "2"' } ] };
  }
  const validator = loadV2Schema();
  const ok = validator(manifest);
  // Enhance errors with friendly path + message combo
  const errors = ok ? [] : (validator.errors || []).map(e => ({
    instancePath: e.instancePath || '/',
    path: formatAjvPath(e.instancePath || '/'),
    message: e.message || 'validation error',
    keyword: e.keyword,
    params: e.params
  }));
  return { ok, errors };
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
  const { ALLOW_RUNTIME_DEPS, STRICT_CAPABILITIES, STRICT_INTEGRITY } = getFlags();
  // Validate manifest
  const { ok, errors } = validateManifest(manifest);
  if (!ok) {
    const { IntegrityError } = require('./errors');
    const msg = `Manifest validation failed: ${errors.map(e => `${e.instancePath} ${e.message}`).join('; ')}`;
    throw new IntegrityError(msg, { errors });
  }

  // Enforce v2 additional runtime policies
  const isV2 = true; // only version supported
  {
    // externalDependencies forbidden unless feature flag + policy (baseline)
    const { PolicyError } = require('./errors');
    if (Array.isArray(manifest.externalDependencies) && manifest.externalDependencies.length > 0 && !ALLOW_RUNTIME_DEPS) {
      throw new PolicyError(`externalDependencies declared but PLUGIN_ALLOW_RUNTIME_DEPS not enabled`);
    }
    const policy = manifest.dependenciesPolicy || 'bundled-only';
    if (policy === 'external-allowed' && !ALLOW_RUNTIME_DEPS) {
      throw new PolicyError(`Plugin expects external dependencies but runtime deps are disabled`);
    }
    if (policy === 'external-allowlist') {
      if (!ALLOW_RUNTIME_DEPS) throw new PolicyError(`Policy external-allowlist requires PLUGIN_ALLOW_RUNTIME_DEPS`);
      if (!Array.isArray(manifest.externalDependencies) || manifest.externalDependencies.length === 0) {
        throw new PolicyError(`external-allowlist policy requires non-empty externalDependencies array`);
      }
      // Require integrity/integrities fields when entries are objects
      const entries = manifest.externalDependencies;
      const bad = entries.filter(d => typeof d === 'object' && d !== null && !('integrity' in d) && !('integrities' in d));
      if (bad.length) {
        throw new PolicyError(`external-allowlist entries must include integrity/integrities fields`);
      }
    }
    if (policy === 'sandbox-required') {
      // Prefer sandbox detector module; fallback to env variable
      let sandboxAvailable = false;
      try {
        const sandbox = require('../sandbox');
        if (sandbox && typeof sandbox.isAvailable === 'function') {
          sandboxAvailable = !!sandbox.isAvailable();
        }
      } catch {}
      if (!sandboxAvailable) sandboxAvailable = !!process.env.SANDBOX_AVAILABLE;
      if (!sandboxAvailable) {
        throw new PolicyError(`sandbox-required policy but sandbox is not available`);
      }
      // sandbox-required implies ALLOW_RUNTIME_DEPS for declared externals
      if (manifest.externalDependencies && manifest.externalDependencies.length > 0 && !ALLOW_RUNTIME_DEPS) {
        throw new PolicyError(`sandbox-required with external deps requires PLUGIN_ALLOW_RUNTIME_DEPS`);
      }
    }
    // Soft warnings / informational messages
    if (policy === 'bundled-only' && manifest.externalDependencies && manifest.externalDependencies.length) {
      console.warn(`[Plugin Loader] ⚠ Policy 'bundled-only' but externalDependencies array is non-empty`);
    }
    if (!['bundled-only','external-allowed','external-allowlist','sandbox-required'].includes(policy)) {
      console.warn(`[Plugin Loader] ⚠ Unknown dependenciesPolicy '${policy}' (treating as bundled-only)`);
    }
  }

  // Dist integrity & metadata verification (hash, fileCount, totalBytes, checksums, coverage)
  {
    const { IntegrityError } = require('./errors');
    if (!manifest.dist || !manifest.dist.hash) {
      throw new IntegrityError('v2 manifest missing dist.hash');
    }
    const declared = manifest.dist.hash; // format sha256:HEX
    const match = declared.match(/^sha256:([a-fA-F0-9]{64})$/);
    if (!match) throw new IntegrityError(`Invalid dist.hash format: ${declared}`);
    const distDir = path.resolve(rootDir, 'dist');
    if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
      throw new IntegrityError('dist directory missing for v2 plugin');
    }
    const { hashHex: computedHex, fileCount, totalBytes, files } = computeDistHashDetailed(distDir);
    if (computedHex.toLowerCase() !== match[1].toLowerCase()) {
      throw new IntegrityError(`dist hash mismatch: manifest=${match[1]} computed=${computedHex}`);
    }

    // Metadata consistency (soft warnings unless STRICT_CAPABILITIES repurposed? keep warnings now)
    if (manifest.dist.fileCount && manifest.dist.fileCount !== fileCount) {
      console.warn(`[Plugin Loader] ⚠ dist.fileCount mismatch (manifest=${manifest.dist.fileCount} actual=${fileCount})`);
    }
    if (manifest.dist.totalBytes && manifest.dist.totalBytes !== totalBytes) {
      console.warn(`[Plugin Loader] ⚠ dist.totalBytes mismatch (manifest=${manifest.dist.totalBytes} actual=${totalBytes})`);
    }

    // Per-file checksums validation (if provided)
    if (manifest.dist.checksums && Array.isArray(manifest.dist.checksums.files)) {
      const checksumEntries = manifest.dist.checksums.files;
      const seen = new Set();
      let mismatches = 0;
      for (const entry of checksumEntries) {
        if (!entry || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') continue; // schema handles errors
        if (seen.has(entry.path)) {
          throw new IntegrityError(`Duplicate checksum path detected: ${entry.path}`);
        }
        const normalized = entry.path
          .replace(/^dist\//, '')
          .replace(/^\.\//, '');
        seen.add(normalized);
        const abs = path.join(distDir, normalized);
        if (!fs.existsSync(abs)) {
          console.warn(`[Plugin Loader] ⚠ checksum path listed but file missing: ${entry.path}`);
          continue;
        }
        const data = fs.readFileSync(abs);
        const h = crypto.createHash('sha256').update(data).digest('hex');
        if (h.toLowerCase() !== entry.sha256.toLowerCase()) {
          mismatches++;
          console.warn(`[Plugin Loader] ⚠ checksum mismatch for ${entry.path} manifest=${entry.sha256} actual=${h}`);
        }
      }
      // Coverage check: if coverage=all expect each dist file represented
      if (manifest.dist.coverage === 'all') {
        const missing = files.filter(f => !seen.has(f));
        if (missing.length) {
          const msg = `coverage=all but ${missing.length} files lack checksums (e.g. ${missing.slice(0,3).join(', ')})`;
          if (STRICT_INTEGRITY) {
            throw new IntegrityError(msg);
          } else {
            console.warn(`[Plugin Loader] ⚠ ${msg}`);
          }
        }
      }
      if (mismatches > 0) {
        throw new IntegrityError(`Per-file checksum validation failed (${mismatches} mismatches)`);
      }
    }
  }

  // Static security scan (basic): detect restricted core module imports without permission
  {
    const violations = staticSecurityScan(path.resolve(rootDir, 'dist'), manifest);
    if (violations.length) {
      const { PolicyError } = require('./errors');
      throw new PolicyError('Security scan failed: ' + violations.join('; '));
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
  const policy = manifest.dependenciesPolicy || 'bundled-only';
  const allowlist = (policy === 'external-allowlist' || policy === 'sandbox-required') && Array.isArray(manifest.externalDependencies)
    ? new Set(manifest.externalDependencies.map(d => typeof d === 'string' ? d : d.name || d.id || String(d)))
    : null;
  // Load global allowlist (ops-controlled) if present
  const globalAllow = getGlobalAllowlistDependencies();
  const coreModules = new Set(Module.builtinModules || []);
  const isSandbox = policy === 'sandbox-required';
  // For sandbox-required, wrap global Function / eval temporarily
  const originalEval = global.eval;
  const originalFunction = global.Function;
  let mod;
  let create;
  let capturedResult = null;
  try {
    Module._load = function(request, parent, isMain) {
      const parentFile = parent && parent.filename ? parent.filename : '';
      // Restricted core modules check
      if (restrictedSet.has(request)) {
        if (parentFile.startsWith(pluginRoot) && !runtimeAllowed.has(request)) {
          throw new Error(`Plugin '${manifest.name}' attempted to require restricted core module '${request}' without permission`);
        }
      }
      // External allowlist enforcement: only for modules that are NOT relative/absolute/core
      if (allowlist && parentFile.startsWith(pluginRoot)) {
        const isExternalRef = !request.startsWith('.') && !path.isAbsolute(request) && !coreModules.has(request);
        if (isExternalRef) {
          // Require both manifest allowlist and global ops allowlist (if provided)
          const inManifest = allowlist.has(request);
          const inGlobal = !globalAllow || globalAllow.has(request);
          if (!inManifest) {
            throw new Error(`Plugin '${manifest.name}' attempted to require module '${request}' not in plugin external allowlist`);
          }
          if (!inGlobal) {
            throw new Error(`Plugin '${manifest.name}' attempted to require module '${request}' not in global allowlist`);
          }
        }
      }
      if (isSandbox && parentFile.startsWith(pluginRoot)) {
        // Disallow loading of native addons (.node) and dynamic vm module
        if (/\.node$/i.test(request)) {
          throw new Error(`Plugin '${manifest.name}' attempted to load native addon '${request}' in sandbox-required mode`);
        }
      }
      return originalLoad.apply(this, arguments);
    };
    if (isSandbox) {
      global.eval = function() { throw new Error(`eval blocked in sandbox-required plugin '${manifest.name}'`); };
      global.Function = function() { throw new Error(`Function constructor blocked in sandbox-required plugin '${manifest.name}'`); };
    }
    mod = await import(entryUrl);
    create = typeof mod.createPlugin === 'function' ? mod.createPlugin
      : (mod && mod.default && typeof mod.default.createPlugin === 'function' ? mod.default.createPlugin : null);
    if (typeof create !== 'function') {
      const { PolicyError } = require('./errors');
      throw new PolicyError(`Entry does not export createPlugin(): ${manifest.entry}`);
    }
  const { proxy, captured } = createServerProxyCaptureOnly(server);
  await create(proxy);
  capturedResult = captured;
  } finally {
    Module._load = originalLoad; // restore regardless of success/failure
    if (isSandbox) {
      global.eval = originalEval;
      global.Function = originalFunction;
    }
  }
  // Use capturedResult gathered during create() execution
  const captured = capturedResult || { tools: [], resources: [], prompts: [] };

  // Capability reconciliation (if manifest.capabilities present treat as declared intent)
  let capabilityDiff = null;
  if (manifest.capabilities) {
    const declared = {
      tools: (manifest.capabilities.tools || []).map(t => t.name),
      resources: (manifest.capabilities.resources || []).map(r => r.name),
      prompts: (manifest.capabilities.prompts || []).map(p => p.name)
    };
    const registered = {
      tools: captured.tools.map(t => t.name),
      resources: captured.resources.map(r => r.name),
      prompts: captured.prompts.map(p => p.name)
    };
    const missingDeclared = {
      tools: declared.tools.filter(n => !registered.tools.includes(n)),
      resources: declared.resources.filter(n => !registered.resources.includes(n)),
      prompts: declared.prompts.filter(n => !registered.prompts.includes(n))
    };
    const undeclaredRegistered = {
      tools: registered.tools.filter(n => !declared.tools.includes(n)),
      resources: registered.resources.filter(n => !declared.resources.includes(n)),
      prompts: registered.prompts.filter(n => !declared.prompts.includes(n))
    };
    capabilityDiff = { declared, registered, missingDeclared, undeclaredRegistered };
    const hasIssues = Object.values(missingDeclared).some(arr => arr.length) || Object.values(undeclaredRegistered).some(arr => arr.length);
    if (hasIssues) {
      const msg = `[Plugin Loader] Capability diff for '${manifest.name}': missingDeclared=${JSON.stringify(missingDeclared)} undeclaredRegistered=${JSON.stringify(undeclaredRegistered)}`;
      const { CapabilityMismatchError } = require('./errors');
      if (STRICT_CAPABILITIES) {
        throw new CapabilityMismatchError(msg + ' (STRICT_CAPABILITIES)', capabilityDiff);
      } else {
        console.warn(msg);
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

  // Debug summary emission is scoped here where manifest/captured/capabilityDiff are defined
  if (process.env.DEBUG_REGISTRY) {
    try {
      const summary = {
        plugin: manifest?.name,
        version: manifest?.version,
        policy: manifest?.dependenciesPolicy || 'bundled-only',
        dist: {
          hash: manifest?.dist?.hash,
          fileCountDeclared: manifest?.dist?.fileCount,
          totalBytesDeclared: manifest?.dist?.totalBytes
        },
        captured: {
          tools: captured?.tools?.length || 0,
          resources: captured?.resources?.length || 0,
          prompts: captured?.prompts?.length || 0
        },
        capabilityDiff
      };
      console.log('[Plugin Loader][DEBUG] Summary:', JSON.stringify(summary, null, 2));
    } catch (e) {
      console.warn('[Plugin Loader][DEBUG] Failed to emit summary:', e.message);
    }
  }

  return { captured, capabilityDiff };
}

// === Helpers ===
function computeDistHash(distDir) {
  return computeDistHashDetailed(distDir).hashHex;
}

function computeDistHashDetailed(distDir) {
  // Build a lightweight fingerprint: sum of mtimes + sizes + file count.
  let fileCount = 0; let totalBytes = 0; let mtimeSum = 0;
  const files = [];
  (function walk(dir){
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel = path.relative(distDir, full).replace(/\\/g, '/');
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full); else if (st.isFile()) {
        files.push(rel);
        fileCount++;
        totalBytes += st.size;
        mtimeSum += Number(st.mtimeMs || 0);
      }
    }
  })(distDir);
  files.sort();
  const fingerprint = `${fileCount}:${totalBytes}:${mtimeSum}`;
  const cached = _distHashCache.get(distDir);
  if (cached && cached.fingerprint === fingerprint) {
    return cached.result;
  }
  const h = crypto.createHash('sha256');
  for (const rel of files) {
    h.update(rel);
    h.update('\0');
    h.update(fs.readFileSync(path.join(distDir, rel)));
  }
  const result = { hashHex: h.digest('hex'), fileCount, totalBytes, files };
  _distHashCache.set(distDir, { fingerprint, result });
  return result;
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
  computeDistHashDetailed,
  staticSecurityScan
};

// ---- Local helpers (kept after exports for bundlers) ----
function formatAjvPath(instancePath) {
  if (!instancePath || instancePath === '/') return '';
  // Convert /a/b/0/c -> a.b[0].c for readability
  const parts = instancePath.split('/').filter(Boolean);
  const out = [];
  for (const p of parts) {
    const idx = Number(p);
    if (!Number.isNaN(idx) && String(idx) === p) {
      out.push(`[${idx}]`);
    } else {
      if (out.length > 0 && out[out.length - 1].endsWith(']')) out.push('.');
      if (out.length > 0 && !out[out.length - 1].endsWith('.') && out[out.length - 1] !== '') out.push('.');
      out.push(p);
    }
  }
  return out.join('').replace(/^\./, '');
}

function getGlobalAllowlistDependencies() {
  try {
    const base = path.resolve(__dirname, '..');
    const candidate = path.join(base, 'plugins', 'allowlist-deps.json');
    if (!_globalAllowlistCache.loaded) {
      _globalAllowlistCache.pathsTried = [candidate];
      _globalAllowlistCache.loaded = true;
    }
    if (!fs.existsSync(candidate)) return null;
    const stat = fs.statSync(candidate);
    const mtime = stat.mtimeMs;
    if (_globalAllowlistCache.mtime === mtime && _globalAllowlistCache.set) {
      return _globalAllowlistCache.set;
    }
    const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.dependencies) ? raw.dependencies : []);
    const set = new Set(arr.map(x => typeof x === 'string' ? x : (x && x.name) ? x.name : x));
    _globalAllowlistCache.set = set;
    _globalAllowlistCache.mtime = mtime;
    return set;
  } catch (e) {
    console.warn('[Plugin Loader] ⚠ Failed to read global allowlist:', e.message);
    return null;
  }
}
