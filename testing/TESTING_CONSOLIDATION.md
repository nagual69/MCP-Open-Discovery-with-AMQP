# Testing Consolidation Plan

This document summarizes the consolidation decisions made for the `testing/` directory and explains the recommended actions, rationale, and next steps.

## Goals

- Consolidate redundant test scripts into a single `master_test_suite.js` as the primary test entry point.
- Keep specialized, high-value tests separate (audit, OAuth, Zod validation, AMQP validation, SSE, SDK server tests).
- Archive deprecated or redundant scripts to `testing/archive/` before deletion (safe rollback).
- Update `package.json` scripts to point to the consolidated suite and preserved tests.
- Provide a clear deletion/archival plan and CI integration guidance.

## Categories

- Keep (specialized):
  - `audit_mcp_compliance.js`
  - `audit_static_compliance.js`
  - `test_native_zod_validation.js`
  - `test_oauth_implementation.js`
  - `test_prompts.js`
  - `test_resources.js`
  - `test_resource_read_fixed.js`
  - `test_sdk_server.js`
  - `test_tools_with_sse.js`
  - `test-amqp-transport.js`
  - `validate-amqp-integration.js`
  - `test-validated-amqp-client.js`
  - `test_snmp_network.js`

- Consolidated into master suite (remove standalone):
  - `test_container_health.js`
  - `test_container_tools.js`
  - `test_http_transport.js`
  - `test_memory_tools.js`
  - `test_proxmox_sdk.js`
  - `test_snmp_sdk.js`
  - `test_stdio_client.js`
  - `test_zabbix_integration.js`
  - `test_array_tools_direct.js`

- Archive (low-value or obsolete):
  - Any lingering quick/debug scripts not part of master or keep lists (e.g., `debug_*.js`, `forensic_test.js`) — move to `testing/archive/`.

## Actions Taken

- `package.json` scripts updated:
  - `test` now runs `testing/master_test_suite.js` (single entrypoint).
  - Preserved specialized npm scripts: `test:amqp`, `test:audit`, `test:zod`, `test:oauth`, `test:plugin-validation`, `test:spec-plugin`, `test:spec-plugin-deps`, `test-registry`.

## Recommended next steps (implementation)

1. Create `testing/archive/` and move files marked for Archive there. Keep a short README inside `archive/` explaining why each file was archived.
2. Remove (or delete) files flagged as fully redundant once CI green for master suite and audit tests.
3. Update CI config to use `npm test` for default test runs and add specialized job matrix entries for AMQP, OAuth, and Zod validations.
4. Add lightweight README snippet in repository root referencing `testing/TESTING_CONSOLIDATION.md` and showing common commands.

## CI Guidance

- Default job: `npm ci && npm test` (uses `master_test_suite.js`)
- Special jobs: `npm run test:amqp`, `npm run test:audit`, `npm run test:zod`

## Rationale

The `testing/` folder contained many overlapping scripts. Consolidation reduces maintenance surface area, ensures a single authoritative test runner, and keeps specialized tests where they provide unique value.

---

For any deletions, the team should verify backups or accept the archive copy. If you'd like, I can proceed to move files to `testing/archive/` and remove the fully redundant ones.
