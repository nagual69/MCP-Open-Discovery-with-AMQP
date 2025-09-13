# MCP Open Discovery — AI Agent Guide (Concise, current)

Use this when coding in this repo. It reflects the code as-is and the workflows we actually use.

## Architecture you need to know

- Server: `mcp_open_discovery_server.js` creates one McpServer, registers tools/resources/prompts, and starts transports via `tools/transports/core/transport-manager.js`.
- Registry & hot‑reload: `tools/registry/index.js` (CoreRegistry + HotReloadManager + mcp‑types adapter). Tool modules export `{ tools, handleToolCall }`; the registry calls `server.registerTool(...)` for you.
- Transports:
  - stdio: `tools/transports/core/stdio-transport.js`
  - http (SSE): `tools/transports/core/http-transport.js` with health and optional OAuth
  - amqp: `tools/transports/amqp-transport-integration.js` (server wrapper; base helpers in `tools/transports/base-amqp-transport.js`)
- Data & security:
  - Memory/CMDB (SQLite + encryption): `tools/memory_tools_sdk.js`
  - Credentials (encrypted + audit): `tools/credentials_tools_sdk.js`, `tools/credentials_manager.js`
  - Discovery tools: `tools/{network,nmap,snmp,proxmox,zabbix}_tools_sdk.js`

## How to run and test (Windows/PowerShell)

- Docker (preferred): `./rebuild_deploy.ps1`
- Local dev (Node >= 23): `npm start` (uses TRANSPORT_MODE defaults). Scripts: `start-stdio`, `start-http`, `start-amqp`, `start-all`
- Health: `npm run health` → http://localhost:3000/health
- Quick tests (see `testing/`):
  - `node testing/test_direct_sdk_registration.js` (SDK register/connect smoke)
  - `node testing/test_mcp_bidirectional_routing.js` (transport)
  - `node testing/audit_mcp_compliance.js` (protocol checks)

## Implementing tools (pattern that works here)

- File: `tools/<category>_tools_sdk.js`
- Export:
  - `tools: [{ name, description, inputSchema, annotations? }]` (Zod or JSON Schema)
  - `async function handleToolCall(name, args)` → switch by `name`; return structured object. Simple objects are auto‑wrapped by registry.
- Don’t call `server.registerTool` in modules; registry does it: `tools/registry/index.js`.
- Use descriptive names with prefixes (e.g., `nmap_tcp_connect_scan`, `snmp_device_inventory`).

## Protocol features already wired

- Logging control: `logging/setLevel` handler; notifications/message emitted across transports with per‑session levels.
- Live list updates: notifications/tools|resources|prompts/list_changed and capabilities listChanged: true.
- Progress & cancel: `tools/mcp/progress_helper.js` emits notifications/progress and notifications/cancelled; registry passes `_meta.progressToken` and wires AbortSignal → cancellation.

## AMQP specifics you’ll need

- Integrates via `tools/transports/amqp-transport-integration.js`; keep lifecycle SDK‑compliant (idempotent start, proper send/onmessage wiring). Names default to: `AMQP_EXCHANGE=mcp.notifications`, `AMQP_QUEUE_PREFIX=mcp.discovery`.

## Conventions that matter here

- CMDB keys like `ci:type:identifier` (e.g., `ci:host:192.168.1.10`).
- Credentials via `credentials_*` tools; many discovery tools accept `creds_id`.
- Keep new transports behind the transport manager; don’t couple to the server.

## Pointers to source

- Server: `mcp_open_discovery_server.js`
- Transport manager: `tools/transports/core/transport-manager.js`
- Registry internals: `tools/registry/{index.js,core_registry.js,hot_reload_manager.js,tool_validation_manager.js,mcp_types_adapter.js}`
- Tool examples: `tools/network_tools_sdk.js`, `tools/nmap_tools_sdk.js`

If something seems off (paths/behavior), call it out in your PR so we can align the guide.
**Check Health**: `npm run health` or `http://localhost:3000/health`
**View Logs**: `docker-compose logs -f mcp-server`
**Debug Tools**: Use `testing/test_container_tools.js` for tool validation

Remember: This is a production-ready infrastructure discovery platform. Maintain the high quality standards and comprehensive testing that have achieved 93% success rate across 57 enterprise tools.

## Marketplace & Plugins (Spec-first) 👇

Use this section when working on plugins, marketplace flows, and the standardized manifest v2.

### Storage layout and lifecycle

- Root: `/plugins` (container-mounted, 2GB by default) or `<cwd>/plugins` if the root doesn’t exist.
- Staging: `/plugins/temp` (atomic staging for URL/file installs; auto-created).
- Categorized installs (auto):
  - `/plugins/tools` for tool-heavy plugins
  - `/plugins/resources` for resource-only plugins
  - `/plugins/prompts` for prompt-only plugins
- Discovery: `PluginManager` scans those folders and picks up either:
  - Spec plugin: a directory with `mcp-plugin.json` (manifest v2) + `dist/` + `entry` file
  - Legacy module: a single `.js` file (treated as `type=tool-module`)

Key files produced/consumed:
- `mcp-plugin.json` — manifest v2 (validated against `docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json` or `SCHEMA_PATH` override)
- `dist/` — bundled runtime for the plugin (hash computed over all files)
- `mcp-plugin.sig` or `manifest.signatures[]` — optional digital signature(s) verified against trusted keys
- `install.lock.json` — extended lock v2 written by the manager after successful load (hashes, sizes, signatures, policies)

### Manifest v2 essentials (what the loader enforces)

- `manifestVersion: "2"` (required)
- `name`, `id`, `version` (string)
- `entry` (path under `dist/`)
- `dist` object:
  - `hash: "sha256:<64-hex>"` (required) — recomputed over the entire `dist/` tree
  - `fileCount`, `totalBytes` (optional consistency hints)
  - `checksums.files[]` with `{ path, sha256 }` (optional; if `coverage: "all"`, every dist file should be covered — warning unless `STRICT_INTEGRITY=true`)
- `dependenciesPolicy`: one of `bundled-only` (default), `external-allowed`, `external-allowlist`, `sandbox-required`
  - `external-allowed/allowlist` require `PLUGIN_ALLOW_RUNTIME_DEPS=true`
  - `external-allowlist` requires `externalDependencies` entries with `integrity/integrities`
  - `sandbox-required` needs sandbox available and may allow external deps only when `PLUGIN_ALLOW_RUNTIME_DEPS=true`
- `externalDependencies` (optional): strings or objects; enforced by allowlists and policies
- `permissions` (optional): `{ network, fsRead, fsWrite, exec }`
- `signatures[]` (optional): verified against trusted keys when signatures are required
- `capabilities` (optional): declared `{ tools[], resources[], prompts[] }` compared to captured registrations (diffs warn; strict when `STRICT_CAPABILITIES`)

Runtime protections (enforced during `createPlugin()` execution):
- Restricted core require interception (e.g., `fs`, `child_process`, `net`, `http`, `https`, `dns`, `tls`) unless permissions allow
- External module allowlist enforcement for `external-allowlist`/`sandbox-required` (+ global allowlist file)
- Sandbox-required: blocks native addons and eval/Function usage during create phase

See `tools/registry/plugin_loader.js` and `tools/registry/plugin_manager.js` for the definitive behavior.

### Ops surfaces (marketplace tools)

Provided by `tools/marketplace_tools_sdk.js`:
- `tool_store_list` — list discovered plugins and stats
- `tool_store_list_policies` — show current policy flags
- `tool_store_search` — free-text search with optional type filter
- `tool_store_install` — install from `url` or `filePath` (auto-load optional)
- `tool_store_remove` — uninstall by id
- `tool_store_verify` — integrity/signature verification report
- `tool_store_rescan_integrity` — recompute dist hash and compare
- `tool_store_show` — manifest + lock + capability snapshot
- `tool_store_security_report` — aggregated policies/signatures/sandbox report

Also available (registry-level): `plugin_list`, `plugin_load`, `plugin_unload`, `plugin_activate` in `tools/registry_tools_sdk.js`.

Environment & policy flags (full list in `docs/ENVIRONMENT_VARIABLES.md`):
- `REQUIRE_SIGNATURES` / `PLUGIN_REQUIRE_SIGNED`
- `PLUGIN_TRUSTED_KEY_IDS` (loads certs via credentials manager; fallback `tools/plugins/trusted_keys.json`)
- `PLUGIN_ALLOW_RUNTIME_DEPS`, `STRICT_INTEGRITY`, `STRICT_CAPABILITIES`, `STRICT_SBOM`, `SANDBOX_AVAILABLE`, `PLUGINS_ROOT`, `SCHEMA_PATH`
- Global external allowlist file: `tools/plugins/allowlist-deps.json`

### Writing a spec plugin (developer view)

- Build your plugin to a `dist/` folder that exports `createPlugin(server)` from the configured `entry` file.
- During `createPlugin(server)`, call server registration APIs (either modern `server.tool/resource/prompt` or legacy `registerTool/registerResource/registerPrompt`).
- The loader validates, captures registrations, optionally validates tools, then registers with the real server.

Minimal “contract” for a spec plugin:
- Input: `server` instance provided by Open Discovery
- Behavior: call registration methods; avoid restricted requires without permissions
- Output: tools/resources/prompts become visible to clients; capability diffs logged if declared
- Error modes: schema/integrity/policy failures block load; violations raise errors with clear messages

### Migration checklist (legacy → spec v2)

1) Create a plugin folder and move your legacy tool module logic into a `dist/` entry (e.g., `dist/index.js`) exporting `createPlugin(server)` and performing registrations there.
2) Author `mcp-plugin.json` with:
   - `manifestVersion: "2"`, `name`, `id`, `version`, `entry`
   - `dist.hash` (`sha256:<hex>`); optionally set `fileCount`, `totalBytes`, `checksums.files[]`, and `coverage`
   - Set `dependenciesPolicy` and `externalDependencies` if you rely on runtime deps; add precise `permissions` as needed
   - Optional: `signatures[]` and `sbom`
3) Ensure `dist/` contains all runtime files; compute the `sha256` over entire `dist/` (the loader will recompute and verify).
4) Optional but recommended: sign the plugin by placing `mcp-plugin.sig` (or fill `signatures[]`) and configure `PLUGIN_TRUSTED_KEY_IDS`.
5) Install: zip the folder and use `tool_store_install` (URL or file path) or copy under `/plugins/<category>/<id>`.
6) Verify: run `tool_store_verify` and `tool_store_show`; check `install.lock.json` created by the manager for lock v2 data.
7) Load/activate: use `plugin_load` (and `plugin_activate` if needed) or `pm.loadAllSpecPlugins()` at startup.

Tip: during development you can keep legacy modules for fast iteration, but plan to migrate them to v2 for integrity/signature enforcement and marketplace compatibility.

### Quick references

- Schema path: `docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json` (overridable via `SCHEMA_PATH`)
- Env variables: `docs/ENVIRONMENT_VARIABLES.md`
- Code: `tools/registry/plugin_manager.js`, `tools/registry/plugin_loader.js`, `tools/marketplace_tools_sdk.js`
