# MCP Open Discovery 3.0

MCP Open Discovery 3.0 is the clean TypeScript-first extraction of the MCP Open Discovery server, plugin runtime, and typed transport stack.

This folder is intended to run as its own repository root. npm scripts, Docker assets, typed plugins, schema files, and deploy helpers are all expected to work directly from `mcp_open_discovery_3_0` without depending on the legacy repository layout.

## Current Status

This repository is runnable as a standalone typed-runtime workspace.

Already in place:

- `src/` for the typed runtime, plugin manager, transport layer, and shared types
- `docker/` for the consolidated typed container image and Compose stack
- `docs/` for repo-local architecture, migration, and operating documentation
- `scripts/` for repo-local build and deploy helpers
- `testing/` for typed validation and lab fixtures

Remaining cleanup is mostly curation rather than extraction:

- remove or rewrite stale migration-only docs
- trim generated artifacts that should not be checked in long term
- continue reducing compatibility shims where typed-only paths are already authoritative

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

## Standalone Quick Start

From the `mcp_open_discovery_3_0` folder:

- `npm install`
- `npm run typecheck`
- `npm start` for the typed runtime on the host
- `npm run docker:up` for the repo-local Docker stack
- `npm run deploy:ps` for the full Windows rebuild/redeploy flow

Notes:

- Docker commands operate against `docker/compose.yml` inside this folder and build from this folder's own root.
- The SNMP plugin can execute either against local Net-SNMP binaries or against the local `mcp-server` container discovered from Docker Compose metadata. Set `MCP_OD_SNMP_DOCKER_CONTAINER` if you need to override container discovery.
- Committing `package-lock.json` is recommended for repeatable standalone npm installs.

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