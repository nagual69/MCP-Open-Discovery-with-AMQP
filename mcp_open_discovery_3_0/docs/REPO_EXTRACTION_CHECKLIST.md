# MCP Open Discovery 3.0 Extraction Checklist

This checklist defines the curated set of assets that should move from the current repository into the clean `mcp_open_discovery_3_0` repository.

The principle is simple: migrate only what the typed runtime actually depends on.

## 1. Migrate First

These items are required before the new repository can become self-contained.

### Root metadata and build config

- `package.json`
  - Required by the Docker build and by every TypeScript build/test script.
  - Rewrite package name, repository URL, homepage, and issue tracker to the new VibeForge GitHub location.
  - Remove scripts that exist only for the legacy JS host.
- `tsconfig.json`
- `tsconfig.strict.json`
- `.gitignore`
- `LICENSE`
- `NOTICE`
  - Keep if the new repository continues to distribute the same licensed codebase and notices.
- `SECURITY.md`
  - Recommended if this becomes the public canonical repository.
- `example.env`
  - Move as `.env.example` after sanitizing and trimming to typed-runtime settings.

### Typed runtime code

- `src/**`
  - Already partly copied into the new repository.
  - Treat the new repository copy as authoritative once extraction starts.

### Typed built-in plugin source packages

- `plugins/src/credentials/**`
- `plugins/src/marketplace/**`
- `plugins/src/memory-cmdb/**`
- `plugins/src/net-utils/**`
- `plugins/src/nmap/**`
- `plugins/src/prompts/**`
- `plugins/src/proxmox/**`
- `plugins/src/registry-tools/**`
- `plugins/src/snmp/**`
- `plugins/src/zabbix/**`

These are required because the typed plugin registry boots built-ins from `plugins/src/` at runtime.

### Plugin packaging and policy support

- `plugins/scripts/build-blessed-plugins.js`
  - Required if you want to continue building packaged blessed plugins in the new repository.
- `tools/plugins/allowlist-deps.json`
  - Required by `src/plugins/plugin-loader.ts` for external dependency allowlist enforcement.

### Schema and DB support files

- `docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json`
  - Required by the plugin loader and Docker runtime configuration.
- `src/plugins/db/schema.sql`
  - Already present in the new repository and must remain in sync with the DB layer.

### Docker lab support files

- `docker/keycloak-master-realm.json`
- `docker/keycloak-realm.json`
  - Required by the OAuth profile in `docker/compose.yml`.

### Test fixtures used by Compose

- `testing/test-data/nginx.conf`
- `testing/test-data/html/**`
  - Required by the Zabbix lab profile in `docker/compose.yml`.

## 2. Migrate Next

These items are not strictly required for first boot, but they are part of a clean, usable 3.0 repository.

### Tests

Migrate only typed-runtime-relevant tests.

Start with:

- typed transport tests
- typed health/runtime smoke tests
- typed plugin manager validation tests
- policy enforcement tests for the typed runtime
- any helper files used only by those tests

Do not bulk-copy `testing/` without filtering. This repo should not inherit legacy tests that exist only to validate the old JS runtime.

### Documentation

Curate and rewrite, do not mass-copy.

Likely worth migrating:

- environment variable reference
- transport architecture notes
- marketplace/schema notes that still apply to the typed runtime
- migration notes that explain design decisions still relevant in 3.0

Likely not worth migrating as-is:

- one-off remediation reports
- historical deployment reports
- duplicated marketing collateral
- docs that explain superseded legacy deployment layouts

### Scripts

Migrate only the scripts that still make sense for the typed runtime.

Likely candidates:

- unified deploy scripts rewritten for this repo root
- packaging scripts for built-in plugins
- any health or validation script still referenced by package scripts

## 3. Rewrite During Extraction

These files already exist in the new repository, but they still point back to the old repository structure and should be updated as part of the extraction.

### `docker/Dockerfile`

Current assumptions to fix:

- expects root-level `package.json`
- expects root-level `tsconfig*.json`
- expects `plugins/`, `docs/`, and `tools/plugins/` to exist at the new repo root

### `docker/compose.yml`

Current assumptions to fix:

- build path still assumes an old nested layout via `context: ../..`
- still points to `src/docker/Dockerfile` instead of the new repo-local `docker/Dockerfile`
- mounts Keycloak realm files from the old repository's `docker/` path pattern
- mounts Zabbix test fixtures from the old repository's `testing/test-data/` path pattern

### `src/plugins/plugin-registry.ts`

Current runtime expectation:

- built-in plugins must live at `plugins/src/`

This is fine for the new repo. The action item is to make sure `plugins/src/` is actually migrated, not to change the code.

### `src/plugins/plugin-loader.ts`

Current runtime expectation:

- global dependency allowlist lives at `tools/plugins/allowlist-deps.json`

You can either:

1. keep that path in the new repo for compatibility, or
2. move the file to a cleaner location and update the loader.

My recommendation is to keep compatibility for the first extraction pass, then simplify later.

## 4. Rebuild Instead of Copying

Do not migrate these as source-of-truth artifacts.

- `dist-ts/`
- packaged ZIP outputs under `plugins/builtin/`
  - Copy only if needed temporarily for validation; long term they should be rebuilt in 3.0.
- `data/`
- log files such as `server_out.txt` and `server_err.txt`
- temporary plugin extraction directories

## 5. Leave Behind

These should remain in the legacy repository unless a specific typed-runtime dependency is found.

- legacy JS runtime modules under `tools/` outside the minimal plugin policy assets
- old Docker and Compose files replaced by the unified typed stack
- historical reports, remediations, and audit artifacts that are no longer operationally useful
- root-level experimental or reference material that is not part of build, test, or packaging
- local credential stores and secrets

## 6. Clean Extraction Sequence

Use this order.

1. Copy `package.json`, `tsconfig.json`, and `tsconfig.strict.json`.
2. Copy `plugins/src/` for the typed built-in plugins.
3. Copy `plugins/scripts/build-blessed-plugins.js`.
4. Copy `tools/plugins/allowlist-deps.json`.
5. Copy the schema JSON into `docs/mcp-od-marketplace/specs/schemas/`.
6. Copy Keycloak realm JSON into `docker/`.
7. Copy `testing/test-data/` fixtures needed by Compose.
8. Rewrite `docker/Dockerfile` and `docker/compose.yml` to use the new repo root directly.
9. Rewrite package metadata and scripts for the new repository identity.
10. Add only the typed tests you intend to keep.
11. Run typecheck, build, plugin validation, and Docker smoke tests from the new repo root.

## 7. Suggested Keep/Drop Decision Table

Keep:

- `src/`
- `plugins/src/`
- `plugins/scripts/build-blessed-plugins.js`
- `docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json`
- `tools/plugins/allowlist-deps.json`
- `docker/keycloak-master-realm.json`
- `docker/keycloak-realm.json`
- `testing/test-data/`
- root metadata and TypeScript config

Drop by default:

- `dist-ts/`
- `data/`
- legacy `tools/*.js` runtime paths
- old Compose variants
- historical reports and generated artifacts

## 8. Definition of Done

The 3.0 repository is cleanly extracted when all of the following are true:

- the repo builds from its own root with no path dependency on the legacy repository
- Docker builds from `docker/Dockerfile` without reaching outside the new repo root
- Compose runs from `docker/compose.yml` without referencing old-root relative paths
- built-in typed plugins are discovered from `plugins/src/`
- plugin schema validation works from the new repo-local docs path
- typed tests pass without importing the legacy JS runtime as a default path
- README, package metadata, and scripts all describe the new repository as the primary project