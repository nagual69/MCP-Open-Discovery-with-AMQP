// Phase1 Task8: Skeleton tests for manifest schema & dist metadata integrity
// NOTE: Placeholder only; full assertions implemented in later phases.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { validateManifest, computeDistHashDetailed } = require('../tools/registry/plugin_loader');

function loadFixtureManifest(fixtureDir) {
  const p = path.join(fixtureDir, 'mcp-plugin.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

(async () => {
  try {
    const sampleDir = path.join(__dirname, 'fixtures', 'sample-plugin');
    if (fs.existsSync(sampleDir)) {
      const manifest = loadFixtureManifest(sampleDir);
      if (manifest) {
        const { ok, errors } = validateManifest(manifest);
        console.log('[SkeletonTest] validateManifest ok=', ok, 'errors=', errors.length);
        if (ok && manifest.dist && manifest.dist.hash) {
          const distDir = path.join(sampleDir, 'dist');
          if (fs.existsSync(distDir)) {
            const { hashHex, fileCount, totalBytes } = computeDistHashDetailed(distDir);
            console.log('[SkeletonTest] dist metrics', { hashHex, fileCount, totalBytes });
          }
        }
      }
    } else {
      console.log('[SkeletonTest] No sample plugin fixture present (skipping)');
    }
    console.log('[SkeletonTest] PASS (placeholder)');
  } catch (e) {
    console.error('[SkeletonTest] ERROR', e.message);
    process.exitCode = 1;
  }
})();
