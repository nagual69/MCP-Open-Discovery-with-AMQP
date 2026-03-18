# MCP Open Discovery 3.0

MCP Open Discovery 3.0 is the clean TypeScript-first extraction of the MCP Open Discovery server, plugin runtime, and typed transport stack.

This repository is intended to become the new top-level home for the typed runtime currently being developed under the legacy repository's `src/` migration tree. The goal is to keep only the assets required to build, run, test, and package the typed platform, while leaving behind legacy JavaScript runtime paths, historical deployment sprawl, generated artifacts, and repository-specific clutter.

## Current Status

This repository is in extraction/bootstrap mode.

Already scaffolded:

- `src/` for the typed runtime, plugin manager, transport layer, and shared types
- `docker/` for the consolidated typed container image and Compose stack
- `docs/` for repo-local architecture, migration, and operating documentation
- `scripts/` for repo-local build and deploy helpers
- `testing/` for typed validation and lab fixtures

Still to be migrated:

- package metadata and TypeScript config
- typed built-in plugin source packages
- plugin packaging helpers and policy allowlists
- schema and lab support assets used by Docker and plugin validation
- a curated subset of tests and operational documentation

## Extraction Rules

The 3.0 repository should follow these rules during migration:

1. `src/` is the source of truth for runtime code.
2. Only migrate assets that are directly required by the typed runtime, typed plugins, packaging, or tests.
3. Do not carry over the legacy JavaScript host as a default runtime path.
4. Prefer rebuilding generated artifacts rather than copying them.
5. Rewrite docs and scripts to reference this repository as the primary root.

## Target Top-Level Layout

The intended steady-state structure is:

```text
docker/
docs/
plugins/
scripts/
src/
testing/
package.json
tsconfig.json
tsconfig.strict.json
README.md
LICENSE
.gitignore
```

## What Belongs Here

Keep in this repository:

- typed runtime code under `src/`
- typed built-in plugin source packages under `plugins/src/`
- typed Docker assets under `docker/`
- schema, allowlist, and packaging support files required by the typed loader
- only the tests and fixtures that validate the typed runtime
- clean repo metadata and operational docs

## Testing

The default 3.0 test surface is intentionally narrow during extraction.

Current default suite:

- `npm test`
	- typed transport health and integration smoke tests
	- typed policy enforcement validation

Tests that remain useful but are not yet part of the default suite:

- `npm run test:sdk`
	- currently copied for reference, but still needs a 3.0-specific rewrite before it should gate CI
- `npm run validate:typed-plugin-manager`
	- packaged plugin lifecycle validation

See [docs/TESTING_MIGRATION_DECISION.md](docs/TESTING_MIGRATION_DECISION.md) for the extraction-time keep, defer, and leave-behind decisions.

Do not keep here by default:

- legacy `tools/*.js` runtime modules
- checked-in build output such as `dist-ts/`
- local runtime data and secrets
- old deployment variants replaced by the unified typed Docker stack
- historical reports and one-off migration artifacts unless they still guide active work

## Deploy Workflows

Use the repo-local deploy scripts for Docker workflows.

Full redeploy:

- `./scripts/rebuild_deploy.ps1`
- `./scripts/rebuild_deploy.ps1 -WithSnmp -WithZabbix`
- `npm run deploy:ps`

When `-WithZabbix` is enabled, the deploy flow now runs a one-shot lab bootstrap that:

- creates or updates the `Zabbix Test Agent` and `Test Web Server` hosts to point at `zabbix-agent` and `zabbix-agent-2`
- removes the stale default `Zabbix server` loopback host that otherwise reports as unavailable inside the containerized lab

Targeted rebuild/restart of selected services without tearing down the whole lab:

- `./scripts/rebuild_deploy.ps1 -Targeted`
- `./scripts/rebuild_deploy.ps1 -Targeted -WithSnmp -WithZabbix`
- `./scripts/rebuild_deploy.ps1 -Targeted -Services mcp-server,zabbix-web`
- `npm run deploy:ps:targeted`
- `npm run deploy:ps:targeted:lab`

Useful switches:

- `-NoCache` for a targeted clean image rebuild
- `-SkipTypecheck` when you explicitly want a fast Docker-only iteration

## Prompt Notes

- The built-in `proxmox_cluster_validation` prompt accepts boolean-style `persistCiMap` inputs such as `true`, `false`, `yes`, `no`, `1`, `0`, `on`, and `off`.
- The same prompt now requires VM and container CMDB keys to be derived from the live `vmid` field and to skip any resource that does not expose a usable identifier, preventing `ci:proxmox-vm:null` and `ci:proxmox-container:null` records.
- `-NoLogs` to avoid attaching after deploy

Manual rerun of the Zabbix lab host bootstrap:

- `npm run docker:bootstrap:zabbix`

## Immediate Next Step

Use [docs/REPO_EXTRACTION_CHECKLIST.md](docs/REPO_EXTRACTION_CHECKLIST.md) as the source-of-truth migration plan for what to copy, what to rewrite, and what to leave behind.