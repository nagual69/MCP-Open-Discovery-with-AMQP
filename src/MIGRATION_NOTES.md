# Migration Notes

## Dead Code And Consolidation Targets

These were identified while building the new `src/` tree.

### Transport Layer

- `tools/transports/core/transport-manager.js` contains placeholder `grpc` startup, status, cleanup, and recommendation branches even though no gRPC transport exists. The new TypeScript transport manager does not carry that branch forward.
- `tools/transports/core/stdio-transport.js` exposes cleanup and config structures that are effectively no-ops. In the TypeScript tree, stdio is treated as a simple start/stop transport result instead of a standalone module with duplicate boilerplate.
- `tools/transports/core/http-transport.js`, `tools/transports/core/stdio-transport.js`, and `tools/transports/core/transport-manager.js` each define their own logging helpers and status payload shapes. The TypeScript refactor centralizes logging and normalizes transport result contracts.
- `tools/transports/amqp-transport-integration.js` mixes configuration, health reporting, recovery, lifecycle management, and transport startup in one file. The TypeScript refactor isolates AMQP behind a narrow adapter seam so a future extraction can replace the implementation without touching the transport manager.

### Registry And Plugin Layer

- `tools/registry/plugin_manager.js` combines discovery, manifest parsing, signature verification, staging, extraction, installation, loading, unloading, and capability bookkeeping. The new `src/plugins/` modules split these concerns across DB, integrity, marketplace import, manager, and registry modules.
- The current plugin manager contains substantial fallback logic for legacy single-file plugins, fallback trusted-key sources, and fallback discovery paths. Those compatibility branches should remain in legacy code until the migration cutover, but they should not shape the new architecture by default.

## Packaging Findings

- The typed integrity helpers under `src/plugins/integrity/hash-utils.ts` now use the same `rel + '\n' + bytes` contract as `plugins/scripts/build-blessed-plugins.js`. This closes the immediate hash mismatch between typed verification and blessed-plugin packaging.
- `plugins/src/net-utils/` now builds as a standalone typed package with package-local response/schema helpers, then feeds the normal blessed-plugin packaging flow. That makes it the first real end-to-end source package for the new plugin build path.
- `plugins/src/credentials/` now follows the same standalone typed-package pattern. It keeps crypto/file-backed credential storage inside package-local modules instead of depending on the server root `src/` tree.
- `plugins/src/memory-cmdb/` now follows the same standalone typed-package pattern for SQLite-backed CMDB state. It passed strict package typechecking and the packaged install/activate/deactivate/uninstall lifecycle validation flow.
- `plugins/src/prompts/` now provides the first verified prompt-only standalone typed package. That required making the typed loader capture and forward prompt registrations across both `registerPrompt` and legacy `prompt` forms.
- `plugins/src/nmap/` now provides a verified command-execution standalone typed package. It passed strict package typechecking and the packaged install/activate/deactivate lifecycle validation flow under the vendored ZIP packaging path.
- `plugins/src/proxmox/` now provides a verified credential-backed HTTPS API standalone typed package. It passed strict package typechecking and the packaged install/activate/deactivate lifecycle validation flow with all 10 declared tools captured at activation.
- `plugins/src/snmp/` required one additional lifecycle rule beyond successful capability validation: background cleanup timers must not hold the Node.js event loop open after validation completes.
- `plugins/src/zabbix/` now provides a verified env-backed JSON-RPC API standalone typed package. It passed strict package typechecking and the packaged install/activate/deactivate lifecycle validation flow with all 7 declared tools captured at activation.
- `plugins/src/marketplace/` now provides a verified host-coupled administrative typed package. It passed strict package typechecking and the packaged install/activate/deactivate lifecycle validation flow with all 9 declared tools captured through a single host adapter boundary.
- `plugins/src/registry-tools/` now provides a verified host-coupled lifecycle-management typed package. It passed strict package typechecking and the packaged install/activate/deactivate lifecycle validation flow with all 8 declared tools captured through a single host adapter boundary.
- The typed plugin-manager validation exposed several runtime requirements that editor-only checks would miss: schema asset resolution for compiled DB code, correct insert-before-extraction ordering for SQLite foreign keys, and explicit DB teardown on Windows before deleting temp validation directories.
- `src/validate-typed-plugin-manager.ts` is now plugin-agnostic and capability-aware. It resolves the target manifest dynamically, validates against the packaged zip under `plugins/builtin/`, and checks captured tools/resources/prompts against declared manifest capabilities.
- `plugins/scripts/build-blessed-plugins.js` now stages each plugin build, vendors detected runtime dependencies into `dist/node_modules`, and hashes the staged `dist/` tree before writing the ZIP manifest. This keeps source manifests valid for source-root development while making the packaged artifact self-contained.
- Isolated validation now runs from an OS temp directory instead of a workspace subdirectory. `net-utils`, `credentials`, `memory-cmdb`, `prompts`, `nmap`, and `proxmox` all passed install/activate/deactivate validation from that isolated environment.
- Isolated validation now also confirms the process exits cleanly after activation/deactivation. The `snmp` migration exposed that package-local timers must be unref'd or torn down.
- The remaining packaging gap is builder refinement rather than basic isolation: vendored dependency trees are copied whole, which increases ZIP size, and the source-root development path still depends on workspace `node_modules`.
- The remaining host-integration gap is install-time override parity: the typed host plugin manager does not yet expose checksum and signature override inputs that the legacy marketplace tool accepted.
- At this point the current built-in blessed plugin set has verified typed packages across standalone, prompt-only, command-execution, stateful, external API, and host-coupled administrative plugin shapes.

### Refactor Direction

- Prefer composable modules with a single responsibility over multi-hundred-line orchestrators.
- Keep compatibility adapters at boundaries only.
- Remove placeholder transports and no-op cleanup code from the new tree unless they become real runtime requirements.