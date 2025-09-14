# Plugin Author Quick Steps (v2)

Use this as a copy-pasteable snippet for your plugin README.

## Build → Hash → Sign → Package → Install

1) Build your plugin
- Produce an ESM entry under `dist/` (e.g., `dist/index.js` or `dist/index.mjs`).
- Ensure all runtime deps are bundled unless your target host allows externals.

2) Compute `dist.hash`
- Hash all regular files under `dist/` using SHA256 over ordered paths + file bytes.
- Set `manifest.dist.hash` to `sha256:<64hex>`.

3) (Optional) Sign the hash
- Sign the literal `dist.hash` string with your private key.
- Add `mcp-plugin.sig` or fill `manifest.signatures[]` with the signature, algorithm, and optional key id.

4) Package
- Include `mcp-plugin.json`, the `dist/` folder, and any docs.
- Do not change dist contents after computing the hash.

5) Install
- The OD server (and Marketplace host) will recompute and verify the hash.
- If signatures are required by the host, they’ll be verified against trusted keys.

## Manifest minimum (v2)

```json
{
  "manifestVersion": "2",
  "name": "your-plugin-id",
  "version": "1.0.0",
  "entry": "dist/index.mjs",
  "dist": { "hash": "sha256:<64hex>" }
}
```

## Tips
- Prefer `dependenciesPolicy: "bundled-only"`. If externals are needed, pin exact versions in `externalDependencies[]` and coordinate with the host allowlist.
- Use `dependencies[]` to load after other plugins by name.
- For best reproducibility, generate `dist.fileCount` and `dist.totalBytes` in your manifest.
