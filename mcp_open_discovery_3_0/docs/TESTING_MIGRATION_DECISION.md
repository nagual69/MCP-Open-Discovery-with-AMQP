# Testing Migration Decision For MCP Open Discovery 3.0

This document records which tests should move into the 3.0 repository based on the extracted repo as it exists today, not just on legacy testing plans.

## Decision Summary

The legacy testing consolidation notes are useful context, but they describe a larger repository and a broader runtime surface than the extracted 3.0 tree currently owns.

The 3.0 repository should keep a small default suite that is:

- self-contained
- typed-runtime focused
- runnable from the 3.0 repo root
- free of legacy `tools/*.js` runtime dependencies

## Bring Over Now

These tests are aligned with the current extracted tree and either already pass or are directly relevant to the typed runtime.

- `testing/test_health_func.js`
  - Validates the typed HTTP health endpoint and transport startup.
- `testing/test_transport_manager.js`
  - Validates transport enablement and status reporting in the typed transport manager.
- `testing/test_transport_integration.js`
  - Validates the typed HTTP transport with a real MCP server instance.
- `testing/test_typed_policy_enforcements.js`
  - Validates typed plugin policy enforcement and plugin manager security behavior.
- `testing/helpers/typed_plugin_harness.js`
  - Shared helper for typed plugin inspection.

These should remain in the default 3.0 suite and are the right basis for early CI.

## Bring Over, But Not In Default CI Yet

These tests may still be valuable, but the current copies are not 3.0-clean enough to be part of the default suite.

### `testing/test_sdk_server.js`

Keep for rewrite, not for default execution.

Reasons:

- still assumes legacy credential manager path `../tools/credentials_manager`
- still expects broad built-in tool registration counts from the old runtime shape
- mixes valid typed smoke checks with legacy-coupled expectations

Recommendation:

- rewrite this into a focused typed server smoke test that checks:
  - server module load
  - stdio initialize round-trip
  - typed plugin source loading through `plugins/src/`
  - plugin registry bootstrap state without hard-coded legacy tool count assumptions

## Defer Until Supporting Runtime Exists In 3.0

These are good candidates later, but should not move yet as default 3.0 tests.

### OAuth tests

- `test_oauth_implementation.js`

Reason:

- depends on a running HTTP server in OAuth-enabled mode and is best added after the 3.0 repo has a stable repo-local OAuth launch path in CI.

### AMQP tests

- `test-amqp-transport.js`
- `validate-amqp-integration.js`
- `test-validated-amqp-client.js`

Reason:

- current versions are tied to legacy AMQP client/runtime files under `tools/`
- 3.0 should add them only after a repo-local typed AMQP client harness exists

### Prompt and resource tests

- `test_prompts.js`
- `test_resources.js`
- `test_resource_read_fixed.js`

Reason:

- current versions either require a running server with prompt/resource content already exposed or import legacy registries under `tools/`
- they should be rewritten once prompt/resource behavior is validated through the typed plugin path in 3.0

### Compliance and audit tests

- `audit_mcp_compliance.js`
- `audit_static_compliance.js`
- `test_native_zod_validation.js`

Reason:

- likely worth bringing later, but not required to stabilize the extracted repo
- should be added after the default build/test path is stable and CI-ready

## Do Not Bring Over As-Is

These do not fit the extracted repo at this stage.

### `master_test_suite.js`

Do not bring it over yet.

Reason:

- it was designed for the larger legacy repository and broader infra lab
- it assumes extensive tool coverage, live infrastructure, and wider operational context than 3.0 currently owns
- bringing it now would expand the maintenance surface faster than the extracted repo can support

### Consolidated legacy tests tied to removed JS registries or old infra assumptions

Examples from the legacy notes:

- `test_container_health.js`
- `test_container_tools.js`
- `test_http_transport.js`
- `test_memory_tools.js`
- `test_proxmox_sdk.js`
- `test_snmp_sdk.js`
- `test_stdio_client.js`
- `test_zabbix_integration.js`
- `test_array_tools_direct.js`

These belong to the legacy cleanup story, not the 3.0 extraction baseline.

## Recommended 3.0 Test Surface

Default commands:

- `npm test`
  - build + transport smoke + typed policy enforcement
- `npm run test:smoke`
  - narrow runtime smoke checks
- `npm run test:policy`
  - typed plugin security and policy checks
- `npm run validate:typed-plugin-manager`
  - packaged plugin lifecycle validation

Non-gating command for rewrite work:

- `npm run test:sdk`

## Reality Check From Current Run

The current extracted repo already proved the right boundary:

- `test_health_func.js` passed
- `test_transport_manager.js` passed
- `test_transport_integration.js` passed
- `test_typed_policy_enforcements.js` is part of the intended typed-default path
- `test_sdk_server.js` failed because of legacy assumptions, not because the extracted typed runtime is broken

That means the correct 3.0 decision is to keep the narrow typed suite, defer broader legacy-derived tests, and rewrite specialized tests only when the 3.0 runtime has the matching local infrastructure.

## Live Lab Validation Notes

Local Docker lab validation against the extracted 3.0 repo found two concrete runtime issues and one lab-default mismatch:

- the typed MCP image installed `net-snmp`, but Alpine splits the client CLIs into `net-snmp-tools`, so SNMP tool calls failed with `spawn snmpget ENOENT`
- the Zabbix problems tool used `problem.get` with `sortfield: 'clock'`, which the Zabbix API rejects with `Application error` and `Sorting by field "clock" not allowed.`
- the repo-local lab advertises `Admin/zabbix`, so the MCP container default `ZABBIX_PASSWORD` should match that local test profile

Those issues should be fixed in the 3.0 repo before treating SNMP and Zabbix lab coverage as representative.

The Zabbix lab bootstrap now also seeds agent-backed test hosts during `-WithZabbix` deploys:

- `Zabbix Test Agent` points to `zabbix-agent:10050`
- `Test Web Server` points to `zabbix-agent-2:10050`
- the stale default `Zabbix server` loopback host is removed so direct MCP reads are no longer dominated by an unavailable seed record