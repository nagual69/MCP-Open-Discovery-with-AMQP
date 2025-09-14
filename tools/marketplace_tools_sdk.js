/**
 * Marketplace Tools SDK
 *
 * Tools to integrate with the Plugin Manager as a marketplace interface.
 * These act as the "tool store" for discovering, searching, installing,
 * removing, and managing third-party tool modules.
 */

const { z } = require('zod');
const fs = require('fs');
const path = require('path');
let FLAGS = {};
try { FLAGS = require('./registry/env_flags'); } catch {}

const tools = [
  {
    name: 'tool_store_list',
    description: 'List discovered marketplace plugins and their status',
    inputSchema: z.object({}).optional()
  },
  {
    name: 'tool_store_list_policies',
    description: 'List active plugin policy / feature flags',
    inputSchema: z.object({}).optional()
  },
  {
    name: 'tool_store_search',
    description: 'Search discovered plugins by text and optional type',
    inputSchema: z.object({
      query: z.string().optional().describe('Search text'),
      type: z.string().optional().describe('Filter by manifest.type, e.g., tool-module')
    })
  },
  {
    name: 'tool_store_verify',
    description: 'Verify plugin integrity (dist hash, per-file checksums/coverage) and signature status',
    inputSchema: z.object({
      pluginId: z.string(),
      strictIntegrity: z.boolean().optional().describe('When true, coverage=all is enforced as required')
    })
  },
  {
    name: 'tool_store_install',
    description: 'Install a plugin from a URL or local file path',
    inputSchema: z.object({
      url: z.string().url().optional().describe('HTTP(S) URL to a JS plugin file'),
      filePath: z.string().optional().describe('Local path to a JS plugin file'),
      pluginId: z.string().optional().describe('Explicit plugin ID/filename (optional)'),
      autoLoad: z.boolean().optional().describe('Automatically load after install'),
      checksum: z.string().optional().describe('Optional checksum for the payload'),
      checksumAlgorithm: z.string().optional().describe('Checksum algorithm (default sha256)'),
      signature: z.string().optional().describe('Base64 signature'),
      publicKey: z.string().optional().describe('PEM public key'),
      signatureAlgorithm: z.string().optional().describe('Signature algorithm (default RSA-SHA256)')
    })
  },
  {
    name: 'tool_store_remove',
    description: 'Remove an installed plugin by ID',
    inputSchema: z.object({
      pluginId: z.string()
    })
  },
  {
    name: 'tool_store_show',
    description: 'Show detailed metadata for a plugin (manifest + lock + capabilities)',
    inputSchema: z.object({ pluginId: z.string() })
  },
  {
    name: 'tool_store_rescan_integrity',
    description: 'Recompute dist hash & metrics for a plugin and compare with manifest/lock',
    inputSchema: z.object({ pluginId: z.string() })
  },
  {
    name: 'tool_store_security_report',
    description: 'Show an aggregated plugin security report (policies, signatures, sandbox)',
    inputSchema: z.object({}).optional()
  }
];

async function handleToolCall(name, args) {
  const { getPluginManager } = require('./registry/index.js');
  const pm = getPluginManager();
  await pm.initialize();

  switch (name) {
    case 'tool_store_list': {
      const list = pm.listPlugins();
      const stats = pm.getStats();
      return { content: [{ type: 'text', text: JSON.stringify({ plugins: list, stats }, null, 2) }] };
    }
    case 'tool_store_list_policies': {
      const flags = {
        PLUGIN_ALLOW_RUNTIME_DEPS: String(!!FLAGS.ALLOW_RUNTIME_DEPS),
        STRICT_CAPABILITIES: String(!!FLAGS.STRICT_CAPABILITIES),
        REQUIRE_SIGNATURES: String(!!FLAGS.REQUIRE_SIGNATURES),
        SANDBOX_AVAILABLE: process.env.SANDBOX_AVAILABLE || null,
        STRICT_SBOM: String(!!FLAGS.STRICT_SBOM),
        STRICT_INTEGRITY: String(!!FLAGS.STRICT_INTEGRITY),
      };
      return { content: [{ type: 'text', text: JSON.stringify({ flags }, null, 2) }] };
    }
    case 'tool_store_search': {
      const results = pm.search({ query: args?.query, type: args?.type });
      return { content: [{ type: 'text', text: JSON.stringify({ results }, null, 2) }] };
    }
    case 'tool_store_verify': {
      const plugin = pm.getPlugin(args.pluginId);
      if (!plugin) return { content: [{ type: 'text', text: 'Plugin not found' }], isError: true };
      const rootDir = fs.existsSync(plugin.path) && fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
      const distDir = path.join(rootDir, 'dist');
  const { computeDistHashDetailed } = require('./registry/plugin_loader');
      const strictIntegrity = args?.strictIntegrity || /^(1|true)$/i.test(process.env.STRICT_INTEGRITY || '');
      const report = { pluginId: plugin.id, issues: [] };
      if (!plugin.manifest?.dist?.hash) {
        report.issues.push('Missing dist.hash (non-v2 plugin?)');
        return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }], isError: true };
      }
      if (!fs.existsSync(distDir)) {
        report.issues.push('dist directory missing');
        return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }], isError: true };
      }
      const { hashHex, fileCount, totalBytes, files } = computeDistHashDetailed(distDir);
      const declared = String(plugin.manifest.dist.hash).replace(/^sha256:/, '');
      const hashMatch = hashHex.toLowerCase() === declared.toLowerCase();
      report.hash = { declared, recomputed: hashHex, match: hashMatch };
      report.counts = { fileCountDeclared: plugin.manifest.dist.fileCount || null, totalBytesDeclared: plugin.manifest.dist.totalBytes || null, fileCountActual: fileCount, totalBytesActual: totalBytes };

      // Per-file checksums and coverage
      const checksums = plugin.manifest.dist.checksums?.files || [];
      const seen = new Set();
      let mismatches = [];
      for (const entry of checksums) {
        if (!entry?.path || !entry?.sha256) continue;
        const abs = path.join(distDir, entry.path.replace(/^dist\//, '').replace(/^\.\//, ''));
        if (!fs.existsSync(abs)) { report.issues.push(`Checksum path listed but missing: ${entry.path}`); continue; }
        const data = fs.readFileSync(abs);
        const h = require('crypto').createHash('sha256').update(data).digest('hex');
        if (h.toLowerCase() !== String(entry.sha256).toLowerCase()) {
          mismatches.push({ path: entry.path, declared: entry.sha256, actual: h });
        }
        seen.add(entry.path.replace(/^dist\//, '').replace(/^\.\//, ''));
      }
      report.checksums = { mismatchesCount: mismatches.length, mismatches: mismatches.slice(0, 5) };
      if (mismatches.length) report.issues.push(`${mismatches.length} checksum mismatches`);
      if (plugin.manifest.dist.coverage === 'all') {
        const missing = files.filter(f => !seen.has(f));
        report.coverage = { required: true, missingCount: missing.length, sampleMissing: missing.slice(0, 5) };
        if (missing.length && strictIntegrity) report.issues.push(`coverage=all with ${missing.length} files missing checksums`);
      } else {
        report.coverage = { required: false };
      }

      // Signature status (from manager state and lock if present)
      let lock = null;
      try { const lp = path.join(rootDir, 'install.lock.json'); if (fs.existsSync(lp)) lock = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch {}
      report.signature = { verified: !!plugin._signatureVerified, signerKeyId: plugin._signerKeyId || null, lockVerified: !!(lock && lock.signatureVerified), lockSignerKeyId: lock?.signerKeyId || null };
      const isError = !hashMatch || mismatches.length > 0 || (strictIntegrity && report.coverage.required && report.coverage.missingCount > 0);
      return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }], isError };
    }
    case 'tool_store_install': {
      if (!args?.url && !args?.filePath) {
        return { content: [{ type: 'text', text: 'Either url or filePath is required' }], isError: true };
      }
      const opts = { pluginId: args?.pluginId, autoLoad: !!args?.autoLoad };
      if (args?.checksum) { opts.checksum = args.checksum; }
      if (args?.checksumAlgorithm) { opts.checksumAlgorithm = args.checksumAlgorithm; }
      if (args?.signature) { opts.signature = args.signature; }
      if (args?.publicKey) { opts.publicKey = args.publicKey; }
      if (args?.signatureAlgorithm) { opts.signatureAlgorithm = args.signatureAlgorithm; }
      const res = args.url
        ? await pm.installFromUrl(args.url, opts)
        : await pm.installFromFile(args.filePath, opts);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: res.success === false };
    }
    case 'tool_store_remove': {
      const ok = await pm.removePlugin(args.pluginId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: ok }, null, 2) }], isError: !ok };
    }
    case 'tool_store_show': {
      const plugin = pm.getPlugin(args.pluginId);
      if (!plugin) return { content: [{ type: 'text', text: 'Plugin not found' }], isError: true };
      const rootDir = fs.existsSync(plugin.path) && fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
      let lock = null;
      try { const lp = path.join(rootDir, 'install.lock.json'); if (fs.existsSync(lp)) lock = JSON.parse(fs.readFileSync(lp,'utf8')); } catch {}
      const extra = {
        signatures: plugin.manifest?.signatures || null,
        distHashes: plugin.manifest?.dist?.hashes || null,
        sbom: plugin.manifest?.sbom || null,
        signatureStatus: { verified: !!plugin._signatureVerified, signerKeyId: plugin._signerKeyId || null }
      };
      return { content: [{ type: 'text', text: JSON.stringify({ manifest: plugin.manifest, lock, capabilitySnapshot: plugin.capabilitySnapshot || null, extra }, null, 2) }] };
    }
    case 'tool_store_rescan_integrity': {
      const plugin = pm.getPlugin(args.pluginId);
      if (!plugin) return { content: [{ type: 'text', text: 'Plugin not found' }], isError: true };
      if (!(plugin.manifest && plugin.manifest.dist && plugin.manifest.dist.hash)) {
        return { content: [{ type: 'text', text: 'Plugin missing dist metadata (not v2 spec?)' }], isError: true };
      }
      const rootDir = fs.existsSync(plugin.path) && fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
      const distDir = path.join(rootDir, 'dist');
      if (!fs.existsSync(distDir)) return { content: [{ type: 'text', text: 'dist directory missing' }], isError: true };
  const { computeDistHashDetailed } = require('./registry/plugin_loader');
      const { hashHex, fileCount, totalBytes } = computeDistHashDetailed(distDir);
      const declared = (plugin.manifest.dist.hash || '').replace(/^sha256:/,'');
      const match = hashHex.toLowerCase() === declared.toLowerCase();
      return { content: [{ type: 'text', text: JSON.stringify({ recomputed: { hashHex, fileCount, totalBytes }, declared, match }, null, 2) }], isError: !match };
    }
    case 'tool_store_security_report': {
      const { getPluginSecurityReport } = require('./registry/index.js');
      const report = getPluginSecurityReport();
      return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
    }
    default:
      throw new Error(`Unknown marketplace tool: ${name}`);
  }
}

module.exports = { tools, handleToolCall };
