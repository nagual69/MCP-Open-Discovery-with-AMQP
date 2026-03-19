# Quick Reference

## Start Modes

- local typed runtime: `npm start`
- stdio only: `npm run start:stdio`
- HTTP only: `npm run start:http`
- HTTP plus AMQP: `npm run start:amqp`
- Docker lab: `npm run docker:up`
- Windows rebuild and redeploy: `npm run deploy:ps`

## Default Runtime Conventions

- HTTP port: `6270`
- health endpoint: `GET /health`
- MCP endpoint: `/mcp`
- root endpoint: `/`
- Docker build context: repo root via `docker/compose.yml`
- typed build output: `dist-ts/`

## Transport Selection

- explicit: `TRANSPORT_MODE=stdio,http,amqp`
- container default: `http,amqp`
- interactive local shell default: `stdio`
- non-interactive host default: `stdio,http`

## Fast Checks

### Health

```bash
curl http://localhost:6270/health
```

### Root Metadata

```bash
curl http://localhost:6270/
```

### Stateless MCP POST

```bash
curl -X POST http://localhost:6270/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Session-Based Initialize

```bash
curl -i -X POST http://localhost:6270/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}'
```

## Key Build And Validation Commands

- typecheck: `npm run typecheck`
- default test suite: `npm test`
- policy tests: `npm run test:policy`
- typed plugin manager validation: `npm run validate:typed-plugin-manager`
- blessed plugin packaging: `npm run build:plugins:blessed`

## Docs To Read First

- `docs/ENVIRONMENT_VARIABLES.md`
- `docs/TRANSPORT_ARCHITECTURE.md`
- `docs/PLUGIN_AUTHORING.md`
- `docs/REPO_EXTRACTION_CHECKLIST.md`
- `docs/LEGACY_ASSET_CURATION.md`

## Important Caveat

The legacy repository contained broader HTTP compatibility documentation around session TTL and Origin controls. Those settings are not yet part of the extracted typed runtime contract, so use the 3.0 docs in this folder as the source of truth.