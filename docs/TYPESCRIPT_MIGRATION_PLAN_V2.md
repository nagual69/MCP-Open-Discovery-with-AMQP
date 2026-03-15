# MCP Open Discovery — TypeScript Migration Plan V2
## Plugin-First Architecture with Full Type Safety

**Project:** `mcp-open-discovery` + `mcp-od-marketplace` (aligned)  
**Current State:** JavaScript, flat tool registry, no plugin lifecycle  
**Target State:** TypeScript strict mode, plugin-native architecture, typed across both repositories  
**Estimated Effort:** 8–12 weeks at focused pace  
**Node Requirement:** ≥ 23 (already met)  
**Migration Strategy:** Plugin infrastructure first, then tool plugins, then marketplace alignment

---

## How This Plan Differs from V1

The V1 migration plan treated TypeScript as a layer applied to the existing flat architecture. This plan **inverts the order** — we type the new plugin infrastructure first, because that's the shape the codebase will have when migration completes. Typing the old flat registry and then migrating it is wasted effort.

**V2 migration order:**
1. Plugin infrastructure types (the new foundation)
2. Plugin Manager + SQLite store (typed)
3. Plugin lifecycle state machine (typed)
4. Transport layer (typed)
5. Built-in plugins as typed plugin packages
6. Marketplace alignment types
7. Signing authority
8. Strict mode enforcement

---

## Repository Strategy

This plan covers **two repositories** that must be aligned via shared types.

```
mcp-open-discovery/          ← MCP server (this plan's primary focus)
  src/
    types/                   ← shared plugin contract types
    plugins/                 ← plugin manager, db, lifecycle
    transports/              ← streamable HTTP, AMQP, stdio
    tools/                   ← legacy (removed after plugin migration)
  plugins/
    src/<group>/             ← typed plugin packages
    builtin/                 ← pre-built plugin zips

mcp-od-marketplace/          ← Marketplace (aligned via shared spec)
  api/                       ← Express backend (needs TypeScript migration)
  src/                       ← React frontend (already TypeScript)
  shared/                    ← types shared between server and marketplace
```

The alignment bridge is **`mcp-plugin.json` v2** and the type definitions that describe it. Both repositories import from `shared/` (or a published `@vibeforge/mcp-plugin-types` package — see Phase 1).

---

## Phase 0: Pre-Migration Setup (Days 1–3)

### 0.1 Install Toolchain

```bash
# In mcp-open-discovery:
npm install --save-dev typescript @types/node ts-node tsx tsup
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser
npm install --save-dev @types/express @types/ws @types/better-sqlite3
npm install --save-dev @types/adm-zip

# better-sqlite3 replaces sqlite3 (already done in remediation)
# Confirm:
node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')"
```

### 0.2 Create Root `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "allowJs": true,
    "checkJs": false,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "strict": false
  },
  "include": ["src/**/*", "plugins/src/**/*.ts"],
  "exclude": ["node_modules", "dist", "testing", "plugins/builtin"]
}
```

### 0.3 Create `tsconfig.strict.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### 0.4 Create `src/` Directory Skeleton

```
src/
├── index.ts                        ← main entry (migrated from mcp_open_discovery_server.js)
├── config.ts                       ← typed CONFIG object
├── types/
│   ├── index.ts                    ← barrel export
│   ├── plugin.types.ts             ← core plugin contract types
│   ├── lifecycle.types.ts          ← state machine types
│   ├── manifest.types.ts           ← mcp-plugin.json v2 types
│   ├── signing.types.ts            ← signing authority types
│   ├── marketplace.types.ts        ← marketplace API contract types
│   ├── transport.types.ts          ← transport config types
│   └── tool.types.ts               ← tool response / pagination types
├── plugins/
│   ├── db/
│   │   ├── schema.sql              ← (already created in remediation)
│   │   └── plugin-db.ts            ← typed wrapper (migrated from .js)
│   ├── plugin-manager.ts           ← typed lifecycle manager
│   ├── plugin-registry.ts          ← typed registry
│   ├── integrity/
│   │   ├── hash-utils.ts
│   │   └── signature-verifier.ts
│   └── marketplace/
│       ├── marketplace-client.ts   ← typed Marketplace pull client
│       └── local-import.ts         ← typed local file import
├── transports/
│   ├── core/
│   │   ├── transport-manager.ts
│   │   └── streamable-http-transport.ts
│   └── amqp/
│       └── amqp-transport.ts
└── utils/
    ├── pagination.ts
    ├── response-format.ts
    └── logger.ts
```

### 0.5 Establish CI Gate

```powershell
# In rebuild_deploy.ps1, add before docker build:
Write-Host "Running TypeScript typecheck..."
npm run typecheck
if ($LASTEXITCODE -ne 0) {
  Write-Error "TypeScript typecheck failed. Aborting deploy."
  exit 1
}
```

```json
// package.json additions:
{
  "scripts": {
    "build": "tsc --project tsconfig.json",
    "typecheck": "tsc --noEmit",
    "typecheck:strict": "tsc --noEmit --project tsconfig.strict.json",
    "dev": "tsx watch src/index.ts",
    "start:ts": "tsx src/index.ts"
  }
}
```

---

## Phase 1: Core Type Definitions (Days 4–8)

This is the highest-leverage phase. Every subsequent phase builds on these types. Get them right before writing any implementation.

### 1.1 Plugin Manifest Types (`src/types/manifest.types.ts`)

This is the TypeScript representation of `mcp-plugin.json` v2. It must exactly match `docs/specs/schemas/mcp-plugin.schema.v2.json`.

```typescript
/**
 * Plugin manifest (mcp-plugin.json) v2
 * Canonical contract between Marketplace, plugin authors, and MCP OD Server.
 * Mirrors mcp-plugin.schema.v2.json exactly.
 */

export interface PluginManifestV2 {
  manifestVersion: '2';
  name: string;                         // ^[a-z0-9-_]+$
  version: string;                      // semver
  entry: string;                        // ^dist/.+\.m?js$
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  
  capabilities: PluginCapabilities;
  dependencies?: string[];              // other plugin names to load before this one
  permissions?: PluginPermissions;
  dist: PluginDist;
  externalDependencies?: ExternalDependency[];
  dependenciesPolicy?: DependenciesPolicy;
  signatures?: PluginSignature[];
  sbom?: SbomReference;
  hostRequirements?: HostRequirements;
  engines?: { node?: string };
  
  // Extension fields (x-*)
  [key: `x-${string}`]: unknown;
}

export interface PluginCapabilities {
  tools?: string[];
  resources?: string[];
  prompts?: string[];
}

export interface PluginPermissions {
  network?: boolean;
  fsRead?: boolean;
  fsWrite?: boolean;
  exec?: boolean;
}

export interface PluginDist {
  hash: string;                         // sha256:<64hex>
  hashes?: AdditionalHash[];
  fileCount?: number;
  totalBytes?: number;
  coverage?: 'all' | 'partial';
  checksums?: { files?: FileChecksum[] };
}

export interface AdditionalHash {
  alg: string;
  value: string;
}

export interface FileChecksum {
  path: string;
  sha256: string;
}

export interface ExternalDependency {
  name: string;                         // exact package name
  version: string;                      // exact semver, no ranges
  integrity?: string;
  optional?: boolean;
  source?: 'npm' | 'git' | 'url';
  registry?: string;
  integrities?: Array<{ alg: string; value: string }>;
}

export type DependenciesPolicy =
  | 'bundled-only'
  | 'external-allowed'
  | 'external-allowlist'
  | 'sandbox-required';

export interface PluginSignature {
  alg: string;                          // 'Ed25519' | 'RSA-SHA256'
  signature: string;                    // base64-encoded
  keyId?: string;
  ts?: string;                          // ISO timestamp
}

export interface SbomReference {
  path: string;
  format: 'spdx-2.3';
}

export interface HostRequirements {
  os?: string[];
  cpuArch?: string[];
  features?: string[];
}
```

### 1.2 Plugin Lifecycle Types (`src/types/lifecycle.types.ts`)

```typescript
import { PluginManifestV2 } from './manifest.types';

/**
 * All possible states in the plugin lifecycle state machine.
 *
 * Transitions:
 *   installed → active (via activate)
 *   installed → uninstalling (via uninstall)
 *   active → inactive (via deactivate)
 *   active → updating (during hot swap)
 *   inactive → active (via activate)
 *   inactive → uninstalling (via uninstall)
 *   updating → active (hot swap success)
 *   updating → error (hot swap failure, previous version restored)
 *   error → active (via retry activate)
 *   * → uninstalling (force uninstall — except builtin)
 */
export type PluginLifecycleState =
  | 'installed'
  | 'active'
  | 'inactive'
  | 'error'
  | 'updating'
  | 'uninstalling';

export type PluginSourceType = 'marketplace' | 'local';
export type SignerType = 'vibeforge' | 'enterprise' | 'local' | null;
export type TrustedKeyType = 'vibeforge' | 'enterprise';
export type SigningAlgorithm = 'Ed25519' | 'RSA-SHA256';

/**
 * Full plugin record as stored in SQLite.
 * bundle_blob is excluded from most queries (too large) — use getBundleBlob().
 */
export interface PluginRecord {
  id: string;                           // '<n>@<version>'
  name: string;
  version: string;
  manifest_json: string;
  dist_hash: string;
  bundle_size_bytes: number;
  signature_data: string | null;
  signature_verified: 0 | 1;
  signer_key_id: string | null;
  signer_type: SignerType;
  lifecycle_state: PluginLifecycleState;
  is_builtin: 0 | 1;
  activation_count: number;
  last_activated: string | null;
  last_deactivated: string | null;
  last_error: string | null;
  installed_at: string;
  installed_by: string;
  source_url: string | null;
  source_type: PluginSourceType;
  previous_version_id: string | null;
  update_pending: 0 | 1;
}

/**
 * Lightweight plugin summary (no blob, no full manifest JSON).
 * Used for list operations.
 */
export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  lifecycle_state: PluginLifecycleState;
  is_builtin: boolean;
  installed_at: string;
  source_type: PluginSourceType;
  bundle_size_bytes: number;
}

export interface PluginInstallOptions {
  actor?: string;
  isBuiltin?: boolean;
  autoActivate?: boolean;
}

export interface PluginActivateOptions {
  actor?: string;
}

export interface PluginInstallResult {
  pluginId: string;
  manifest: PluginManifestV2;
  signatureVerified: boolean;
}

export interface PluginActivateResult {
  activated: boolean;
  pluginId: string;
  toolCount?: number;
  alreadyActive?: boolean;
}

export interface PluginHotSwapResult {
  hotSwapped: boolean;
  previousVersion: string;
  newVersion: string;
}

export interface PluginAuditEntry {
  id: number;
  plugin_id: string;
  plugin_name: string;
  version: string;
  event: PluginAuditEvent;
  actor: string;
  detail: string | null;
  occurred_at: string;
}

export type PluginAuditEvent =
  | 'installed'
  | 'activated'
  | 'deactivated'
  | 'updated'
  | 'uninstalled'
  | 'activation_failed'
  | 'signature_verified'
  | 'signature_failed'
  | 'hash_verified'
  | 'hash_failed'
  | 'hot_swap_started'
  | 'hot_swap_completed'
  | 'hot_swap_failed';

export interface PluginExtractionRecord {
  id: number;
  plugin_id: string;
  extraction_path: string;
  extracted_hash: string;
  extracted_at: string;
  is_current: 0 | 1;
}

export interface PluginRegistryStats {
  totalPlugins: number;
  activePlugins: number;
  activeTools: number;
  activeResources: number;
  activePrompts: number;
}

export interface PluginLoaderResult {
  loaded: Array<{
    id: string;
    tools: number;
    resources: number;
    prompts: number;
  }>;
  failed: Array<{ id: string; error: string }>;
  timings?: {
    totalMs: number;
    validationMs?: number;
    importMs?: number;
    reconcileMs?: number;
    registerMs?: number;
  };
  stats?: {
    toolsRegistered: number;
    resourcesRegistered: number;
    promptsRegistered: number;
    invalidTools: number;
    warnings: number;
  };
}
```

### 1.3 Signing Authority Types (`src/types/signing.types.ts`)

```typescript
export type TrustedKeyType = 'vibeforge' | 'enterprise';
export type SigningAlgorithm = 'Ed25519' | 'RSA-SHA256';

/**
 * Trusted signing key as stored in SQLite.
 * VibeForge keys are pre-seeded from VIBEFORGE_PUBLIC_KEY_PEM env var.
 * Enterprise keys are added via mcp_od_registry_add_signing_key tool.
 */
export interface TrustedSigningKey {
  id: string;
  key_type: TrustedKeyType;
  algorithm: SigningAlgorithm;
  public_key_pem: string;
  owner: string | null;
  enterprise_id: string | null;
  added_at: string;
  added_by: string | null;
  is_active: 0 | 1;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface TrustedKeySummary {
  id: string;
  key_type: TrustedKeyType;
  algorithm: SigningAlgorithm;
  owner: string | null;
  enterprise_id: string | null;
}

export interface SignatureVerificationResult {
  verified: boolean;
  keyId: string | null;
  keyType: TrustedKeyType | null;
  error?: string;
}

export interface AddTrustedKeyInput {
  id: string;
  key_type: TrustedKeyType;
  algorithm: SigningAlgorithm;
  public_key_pem: string;
  owner?: string;
  enterprise_id?: string;
  added_at: string;
  added_by: string;
}
```

### 1.4 Marketplace Types (`src/types/marketplace.types.ts`)

```typescript
/**
 * Types for the MCP OD Server ↔ Marketplace API contract.
 *
 * The server is a PULL-only client.
 * Access is granted by the user on the Marketplace website.
 * The server uses MARKETPLACE_TOKEN env var to authenticate.
 */

export interface MarketplacePlugin {
  id: string;
  name: string;
  version: string;
  latestVersion: string;
  description: string;
  author: string;
  category: string;
  tags: string[];
  downloads: number;
  stars: number;
  isPublic: boolean;
  capabilities: {
    tools: number;
    resources: number;
    prompts: number;
  };
  downloadUrl: string;            // Authenticated download URL for the plugin zip
  signedBy: 'vibeforge' | 'enterprise' | null;
  publishedAt: string;
  updatedAt: string;
}

export interface MarketplaceListResponse {
  plugins: MarketplacePlugin[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MarketplaceTokenRecord {
  id: number;
  token_hash: string;            // SHA256 of actual token — never store plaintext
  marketplace_url: string;
  scope: 'read';
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  is_active: 0 | 1;
}

/**
 * Plugin availability check result.
 * Returned when comparing installed plugins against Marketplace.
 */
export interface PluginUpdateAvailability {
  plugin_name: string;
  installed_version: string;
  latest_version: string;
  update_available: boolean;
  download_url: string | null;
}
```

### 1.5 Tool Response Types (`src/types/tool.types.ts`)

```typescript
import { z } from 'zod';

// ── Shared Schemas (exported for use in all plugin packages) ──

export const ResponseFormatSchema = z.enum(['json', 'markdown'])
  .default('markdown')
  .describe("Output format: 'markdown' for human-readable (default), 'json' for machine-readable/programmatic use");

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20)
    .describe('Maximum results to return per page (default: 20, max: 200)'),
  offset: z.number().int().min(0).default(0)
    .describe('Number of results to skip for pagination (default: 0)')
});

export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
export type PaginationParams = z.infer<typeof PaginationSchema>;

// ── Response Types ────────────────────────────────────────────

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResponse<T = unknown> {
  content: TextContent[];
  structuredContent?: T;
  isError?: boolean;
}

export interface PaginatedResponse<T> {
  total_count: number;
  count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  next_offset: number | null;
  items: T[];
}

// ── Tool Annotations ──────────────────────────────────────────

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

// ── Utility Functions (pure — no deps) ───────────────────────

export function paginateResults<T>(
  allResults: T[],
  limit = 20,
  offset = 0
): PaginatedResponse<T> {
  const total = allResults.length;
  const page = allResults.slice(offset, offset + limit);
  const hasMore = offset + limit < total;
  return {
    total_count: total,
    count: page.length,
    offset,
    limit,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
    items: page
  };
}

export function buildTextResponse<T>(
  data: T,
  markdownText: string,
  format: ResponseFormat
): ToolResponse<T> {
  return {
    content: [{
      type: 'text',
      text: format === 'json' ? JSON.stringify(data, null, 2) : markdownText
    }],
    structuredContent: data
  };
}

export function buildErrorResponse(message: string): ToolResponse<null> {
  return {
    isError: true,
    content: [{ type: 'text', text: message }]
  };
}
```

### 1.6 Barrel Export (`src/types/index.ts`)

```typescript
export * from './manifest.types';
export * from './lifecycle.types';
export * from './signing.types';
export * from './marketplace.types';
export * from './tool.types';
export * from './transport.types';  // From V1 plan — unchanged
```

**Gate:** `npm run typecheck` — zero errors on types-only files.

---

## Phase 2: Plugin Infrastructure (Days 9–18)

### 2.1 Typed Plugin DB (`src/plugins/db/plugin-db.ts`)

Convert `tools/plugins/db/plugin-db.js` to TypeScript. Import all types from `../../../types`.

Key typing work:
```typescript
import Database from 'better-sqlite3';
import {
  PluginRecord, PluginLifecycleState, PluginAuditEvent,
  PluginAuditEntry, PluginExtractionRecord, PluginSummary
} from '../../types';
import { TrustedSigningKey, AddTrustedKeyInput } from '../../types';
import { PluginManifestV2 } from '../../types';

// All DB operation function signatures:
export function insertPlugin(pluginData: InsertPluginInput): void;
export function setPluginLifecycleState(
  pluginId: string,
  state: PluginLifecycleState,
  detail?: string | null
): void;
export function getPlugin(pluginId: string): PluginRecord | undefined;
export function getPluginByName(name: string): PluginRecord | undefined;
export function getActivePlugins(): Pick<PluginRecord, 'id' | 'name' | 'version' | 'manifest_json'>[];
export function getBundleBlob(pluginId: string): Buffer | null;
export function getTrustedSigningKey(keyId: string): TrustedSigningKey | undefined;
export function auditLog(
  pluginId: string,
  pluginName: string,
  version: string,
  event: PluginAuditEvent,
  actor?: string,
  detail?: Record<string, unknown> | null
): void;
```

### 2.2 Typed Plugin Manager (`src/plugins/plugin-manager.ts`)

Convert `tools/plugins/plugin-manager.js` to TypeScript.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  PluginInstallOptions, PluginActivateOptions,
  PluginInstallResult, PluginActivateResult, PluginHotSwapResult,
  PluginSummary
} from '../types';
import { PluginManifestV2 } from '../types';

let mcpServerRef: McpServer | null = null;

export function setMcpServer(server: McpServer): void;
export async function install(source: string, options?: PluginInstallOptions): Promise<PluginInstallResult>;
export async function activate(pluginId: string, options?: PluginActivateOptions): Promise<PluginActivateResult>;
export async function deactivate(pluginId: string, options?: PluginActivateOptions): Promise<{ deactivated: boolean; pluginId: string }>;
export async function update(pluginName: string, newSource: string, options?: PluginActivateOptions): Promise<PluginHotSwapResult>;
export async function uninstall(pluginId: string, options?: PluginActivateOptions): Promise<{ uninstalled: boolean; pluginId: string }>;
export function list(filter?: { state?: string }): PluginSummary[];
export async function listAvailableFromMarketplace(): Promise<MarketplacePlugin[]>;
```

### 2.3 Typed Integrity Utilities (`src/plugins/integrity/`)

**`src/plugins/integrity/hash-utils.ts`:**
```typescript
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

export interface DistHashResult {
  hash: string;       // sha256:<64hex>
  fileCount: number;
  totalBytes: number;
}

export function computeDistHash(distDir: string): DistHashResult;
export function computeDistHashFromZip(zip: AdmZip): string;
export function verifyDistHash(distDir: string, expectedHash: string): boolean;
```

**`src/plugins/integrity/signature-verifier.ts`:**
```typescript
import { SignatureVerificationResult } from '../../types';
import { PluginManifestV2 } from '../../types';

export function verifySignatures(manifest: PluginManifestV2): SignatureVerificationResult;
export function verifySignature(
  distHash: string,
  signature: string,
  publicKeyPem: string,
  algorithm: 'Ed25519' | 'RSA-SHA256'
): boolean;
```

### 2.4 Typed Marketplace Client (`src/plugins/marketplace/marketplace-client.ts`)

```typescript
import { MarketplacePlugin, MarketplaceListResponse, PluginUpdateAvailability } from '../../types';

export interface MarketplaceClientConfig {
  baseUrl: string;
  token: string | null;
}

export class MarketplaceClient {
  constructor(config: MarketplaceClientConfig);
  
  async listAvailable(): Promise<MarketplacePlugin[]>;
  async downloadPlugin(downloadUrl: string): Promise<Buffer>;
  async checkForUpdates(installedPlugins: Array<{ name: string; version: string }>): Promise<PluginUpdateAvailability[]>;
}
```

### 2.5 Typed Plugin Registry (`src/plugins/plugin-registry.ts`)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PluginLoaderResult, PluginRegistryStats } from '../types';

export async function initialize(server: McpServer): Promise<PluginLoaderResult>;
export async function bootstrapBuiltinPlugins(): Promise<void>;
export function getStats(): PluginRegistryStats;
```

**Gate:** `npm run typecheck` — all plugin infrastructure files compile cleanly.

---

## Phase 3: Transport Layer (Days 19–23)

**Largely unchanged from V1 plan.** Type the transport layer using `TransportConfig` and `TransportResults` from `src/types/transport.types.ts`.

Key addition — the health endpoint now returns `PluginRegistryStats` in the response:

```typescript
// src/types/health.types.ts
import { PluginRegistryStats } from './lifecycle.types';

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  registry: PluginRegistryStats;    // ← now uses typed plugin stats
  uptime: number;
  timestamp: string;
  oauth: { enabled: boolean; realm: string; protectedEndpoints: string[] };
  amqp?: AmqpStatus;
}
```

**Gate:** `npm run build` — transport compiles to `dist/`. Docker build uses `dist/index.js`.

---

## Phase 4: Typed Plugin Packages (Days 24–45)

Each of the 8 built-in plugins is a typed package. This phase migrates tool implementations into typed `createPlugin(server)` entry points.

### Plugin Package Structure

Each plugin package in `plugins/src/<group>/` becomes a TypeScript project:

```
plugins/src/net-utils/
├── package.json          ← local package with build script
├── tsconfig.json         ← extends root, outputs to dist/
├── mcp-plugin.json       ← v2 manifest (dist.hash populated at build)
└── src/
    ├── index.ts          ← createPlugin(server) entry
    ├── tools.ts          ← individual tool implementations
    └── types.ts          ← tool-specific input/output types
```

**`plugins/src/net-utils/tsconfig.json`:**
```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**`plugins/src/net-utils/src/types.ts`:**
```typescript
import { z } from 'zod';
import { ResponseFormatSchema, PaginationSchema } from '../../../src/types';

export const PingInputSchema = z.object({
  host: z.string().min(1).describe('IP address or hostname to ping'),
  count: z.number().int().min(1).max(20).default(4),
  timeout: z.number().int().min(1).max(30).default(5),
  response_format: ResponseFormatSchema
}).strict();

export type PingInput = z.infer<typeof PingInputSchema>;

export interface PingResult {
  host: string;
  reachable: boolean;
  packets_sent: number;
  packets_received: number;
  packet_loss_percent: number;
  min_ms?: number;
  avg_ms?: number;
  max_ms?: number;
}

// Define input schemas and result types for every tool in this group
// nslookup, wget, netstat, telnet, route, ifconfig, arp...
```

**`plugins/src/net-utils/src/index.ts`:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PingInputSchema, PingResult } from './types';
import { buildTextResponse, buildErrorResponse, paginateResults } from '../../../src/types';

export async function createPlugin(server: McpServer): Promise<void> {
  server.registerTool(
    'mcp_od_net_ping',
    {
      title: 'Network Ping',
      description: '...',
      inputSchema: PingInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params): Promise<ReturnType<typeof buildTextResponse<PingResult>>> => {
      try {
        const result = await executePing(params.host, params.count, params.timeout);
        const md = formatPingMarkdown(result);
        return buildTextResponse(result, md, params.response_format);
      } catch (error) {
        return buildErrorResponse(`Ping failed for ${params.host}: ${(error as Error).message}`);
      }
    }
  );
  
  // Register remaining tools...
}
```

### Plugin Migration Order

| Plugin | Group | Tools | Complexity |
|---|---|---|---|
| `net-utils` | net | 8 | Low — establishes pattern |
| `credentials` | credentials | 5 | Low — well-bounded |
| `registry-tools` | registry | 8 | Medium — uses plugin-manager |
| `memory-cmdb` | memory | 9 | Medium — SQLite dependent |
| `zabbix` | zabbix | 7 | Medium — HTTP API |
| `proxmox` | proxmox | 10 | Medium — HTTP API |
| `nmap` | nmap | 5 | High — child process |
| `snmp` | snmp | 12 | High — session state, net-snmp types |

### SNMP Type Challenge

`net-snmp` has minimal TypeScript support. Create a declaration file:

**`src/types/net-snmp.d.ts`:**
```typescript
declare module 'net-snmp' {
  export interface SessionOptions {
    version?: number;
    community?: string;
    timeout?: number;
    retries?: number;
    sourceAddress?: string;
    sourcePort?: number;
  }
  
  export interface Varbind {
    oid: string;
    type: number;
    value: Buffer | string | number | null;
  }
  
  export interface Session {
    get(oids: string[], callback: (error: Error | null, varbinds: Varbind[]) => void): void;
    getNext(oids: string[], callback: (error: Error | null, varbinds: Varbind[]) => void): void;
    walk(oid: string, maxRepetitions: number, feedCallback: (varbinds: Varbind[]) => void, doneCallback: (error: Error | null) => void): void;
    close(): void;
  }
  
  export const Version1: number;
  export const Version2c: number;
  export const Version3: number;
  
  export function createSession(target: string, community: string, options?: SessionOptions): Session;
}
```

**Gate per plugin:** Each plugin's `tsconfig.json` compiles cleanly, `dist/index.js` is generated, build script produces valid zip with correct hash.

---

## Phase 5: Marketplace Alignment (Days 46–55)

### 5.1 Shared Types Package

Create a shared types package usable by both repositories. Either:
- **Option A (simple):** Copy `src/types/manifest.types.ts` and `src/types/marketplace.types.ts` into `mcp-od-marketplace/shared/` manually and keep in sync
- **Option B (proper):** Publish as `@vibeforge/mcp-plugin-types` npm package — both repos install it

For initial implementation, use **Option A**. The shared files are:
- `manifest.types.ts` — `PluginManifestV2` and all sub-interfaces
- `marketplace.types.ts` — `MarketplacePlugin`, `MarketplaceListResponse`

### 5.2 Marketplace Backend TypeScript Migration

The `mcp-od-marketplace/api/` directory is currently JavaScript. This is a separate migration effort:

```
mcp-od-marketplace/api/
├── src/
│   ├── models/
│   │   ├── Tool.ts               ← Mongoose model typed with PluginManifestV2
│   │   └── User.ts
│   ├── routes/
│   │   ├── plugins.ts            ← typed Express routes
│   │   └── auth.ts
│   ├── services/
│   │   ├── plugin-validator.ts   ← validates uploaded mcp-plugin.json against v2 schema
│   │   ├── signing-service.ts    ← VibeForge signing (private key in env)
│   │   └── distribution.ts      ← manages plugin download URLs
│   └── types/
│       └── index.ts              ← imports from shared/
```

Key typing in Marketplace backend:

```typescript
// api/src/models/Tool.ts
import { PluginManifestV2, PluginCapabilities } from '../../shared/manifest.types';

interface ToolDocument extends Document {
  name: string;
  slug: string;
  manifest: PluginManifestV2;         // ← the full v2 manifest
  bundleUrl: string;                  // storage location
  distHash: string;                   // mirrors manifest.dist.hash
  signatureStatus: 'signed-vibeforge' | 'signed-enterprise' | 'unsigned';
  status: 'draft' | 'review' | 'published' | 'archived';
  isPublic: boolean;
  author: Types.ObjectId;
  stats: { downloads: number; views: number; stars: number };
}
```

### 5.3 Plugin Download API Endpoint

The Marketplace needs to expose an authenticated download endpoint that the MCP OD Server calls:

```typescript
// api/src/routes/plugins.ts

// GET /api/plugins/available
// Returns MarketplaceListResponse — only plugins the token has access to
router.get('/available', authenticateMarketplaceToken, async (req, res) => {
  const plugins = await PluginService.getAvailableForToken(req.tokenScope);
  res.json(plugins satisfies MarketplaceListResponse);
});

// GET /api/plugins/:name/:version/download  
// Returns plugin zip binary — authenticated, rate-limited
router.get('/:name/:version/download', authenticateMarketplaceToken, async (req, res) => {
  const bundle = await PluginService.getBundle(req.params.name, req.params.version);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('X-Plugin-Hash', bundle.distHash);
  res.send(bundle.data);
});
```

**Gate:** Both repositories typecheck. The shared types compile without errors in both contexts.

---

## Phase 6: Signing Authority (Days 56–62)

### 6.1 VibeForge Signing Infrastructure

**Server-side (verification only — never the private key):**

```typescript
// src/plugins/integrity/signature-verifier.ts

import * as crypto from 'crypto';
import { getTrustedSigningKey } from '../db/plugin-db';
import { PluginManifestV2 } from '../../types';
import { SignatureVerificationResult } from '../../types';

export function verifySignatures(manifest: PluginManifestV2): SignatureVerificationResult {
  const signatures = manifest.signatures ?? [];
  const distHash = manifest.dist?.hash;
  
  if (!distHash) {
    return { verified: false, keyId: null, keyType: null, error: 'No dist.hash to verify against' };
  }
  
  for (const sig of signatures) {
    if (!sig.keyId) continue;
    const key = getTrustedSigningKey(sig.keyId);
    if (!key || !key.is_active) continue;
    
    try {
      const isValid = verifySignature(distHash, sig.signature, key.public_key_pem, key.algorithm);
      if (isValid) {
        return { verified: true, keyId: key.id, keyType: key.key_type };
      }
    } catch {
      continue;
    }
  }
  
  return { verified: false, keyId: null, keyType: null, error: 'No valid signature found against trusted keys' };
}

export function verifySignature(
  distHash: string,
  signature: string,
  publicKeyPem: string,
  algorithm: 'Ed25519' | 'RSA-SHA256'
): boolean {
  const verify = crypto.createVerify(algorithm);
  verify.update(distHash);
  return verify.verify(publicKeyPem, Buffer.from(signature, 'base64'));
}
```

**Marketplace-side (signing — private key never leaves Marketplace):**

```typescript
// mcp-od-marketplace/api/src/services/signing-service.ts

import * as crypto from 'crypto';
import { PluginManifestV2, PluginSignature } from '../../shared/manifest.types';

export class SigningService {
  private readonly privateKey: crypto.KeyObject;
  private readonly keyId: string;
  
  constructor() {
    // Private key loaded from environment — never stored in DB
    const pem = process.env.VIBEFORGE_SIGNING_PRIVATE_KEY_PEM;
    if (!pem) throw new Error('VIBEFORGE_SIGNING_PRIVATE_KEY_PEM not configured');
    this.privateKey = crypto.createPrivateKey(pem);
    this.keyId = process.env.VIBEFORGE_SIGNING_KEY_ID ?? 'vibeforge-primary-v1';
  }
  
  signManifest(manifest: PluginManifestV2): PluginSignature {
    const distHash = manifest.dist.hash;
    const sign = crypto.createSign('Ed25519');
    sign.update(distHash);
    const signature = sign.sign(this.privateKey, 'base64');
    
    return {
      alg: 'Ed25519',
      signature,
      keyId: this.keyId,
      ts: new Date().toISOString()
    };
  }
  
  // Enterprise plugin signing (operator provides their own private key temporarily)
  // This runs in a secure signing context — key is used and discarded, never persisted
  signWithEnterpriseKey(manifest: PluginManifestV2, privateKeyPem: string, keyId: string): PluginSignature {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const distHash = manifest.dist.hash;
    const sign = crypto.createSign('Ed25519');
    sign.update(distHash);
    const signature = sign.sign(privateKey, 'base64');
    return { alg: 'Ed25519', signature, keyId, ts: new Date().toISOString() };
  }
}
```

### 6.2 Enterprise Key Management Flow

```
Enterprise workflow:
1. Enterprise generates Ed25519 keypair locally
2. Enterprise uploads PUBLIC key to Marketplace website → stored in marketplace DB
3. Enterprise admin adds public key to MCP OD Server via mcp_od_registry_add_signing_key tool
4. Enterprise signs their private plugin bundles locally before upload
5. Marketplace stores signed bundle
6. MCP OD Server verifies signature against enterprise's trusted public key on install

Toby / VibeForge workflow:
1. VibeForge private key lives ONLY in Marketplace signing service env var
2. On plugin publish, Marketplace signs the bundle automatically
3. VibeForge public key is seeded into all MCP OD Server instances via VIBEFORGE_PUBLIC_KEY_PEM env
4. Install automatically verifies against seeded VibeForge key
```

---

## Phase 7: Strict Mode Enforcement (Days 63–68)

Enable strict mode incrementally, per-plugin first, then globally.

### 7.1 Per-Plugin Strict Mode

For each plugin package that has completed typed migration:

**`plugins/src/net-utils/tsconfig.strict.json`:**
```json
{
  "extends": "../../../tsconfig.strict.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

Run `tsc --project plugins/src/net-utils/tsconfig.strict.json --noEmit` per plugin.

### 7.2 Infrastructure Strict Mode

`src/plugins/` and `src/transports/` should pass strict before `src/tools/` (legacy).

### 7.3 Common Strict Mode Patterns in Plugin Code

```typescript
// noUncheckedIndexedAccess: guard array access
const firstTool = manifest.capabilities?.tools?.[0];  // string | undefined
if (!firstTool) return;

// strictNullChecks: guard DB results
const plugin = pluginDb.getPlugin(pluginId);
if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);

// exactOptionalPropertyTypes: explicit undefined union
interface PluginFilter {
  state?: PluginLifecycleState | undefined;  // not just PluginLifecycleState?
}
```

### 7.4 Final Global Strict Enablement

After all modules pass per-file strict checks:
```json
// tsconfig.json — final state
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**Gate:** `npm run typecheck:strict` — zero errors across entire `src/` tree.

---

## Phase 8: Finalization (Days 69–75)

### 8.1 Remove Legacy JavaScript

```bash
# Archive original tool files (no longer needed — tools are in plugin packages)
mkdir -p archive/legacy-tools
mv tools/*_tools_sdk.js archive/legacy-tools/
mv tools/registry/ archive/legacy-tools/registry/
mv tools/mcp/ archive/legacy-tools/mcp/

# Verify nothing broke
npm run build && npm test
```

### 8.2 Update Dockerfile

```dockerfile
FROM node:23-alpine

WORKDIR /home/mcpuser/app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and TypeScript config
COPY tsconfig*.json ./
COPY src/ ./src/
COPY plugins/ ./plugins/

# Build TypeScript
RUN npm run build

# Build blessed plugin zips
RUN node plugins/scripts/build-blessed-plugins.js

# Runtime
COPY docker/ ./docker/
COPY docs/ ./docs/
COPY example.env ./

CMD ["node", "dist/index.js"]
```

### 8.3 Final Verification Suite

```bash
# Full typecheck
npm run typecheck:strict

# All tests pass
npm test
npm run test:http-session:docker
npm run test:audit

# Plugin lifecycle smoke test
npm start &
sleep 5

# Verify plugin-native tools/list
curl -s -X POST http://localhost:6270/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq '[.result.tools[].name] | sort | length'
# Should be ≥ 70

# Verify deactivate → invisible → reactivate → visible
curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mcp_od_registry_deactivate","arguments":{"plugin_id":"snmp@1.0.0"}}}'

curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}' \
  | jq '[.result.tools[] | select(.name | startswith("mcp_od_snmp"))] | length'
# Should be 0 — SNMP tools invisible while plugin inactive

curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"mcp_od_registry_activate","arguments":{"plugin_id":"snmp@1.0.0"}}}'

curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/list"}' \
  | jq '[.result.tools[] | select(.name | startswith("mcp_od_snmp"))] | length'
# Should be 12 — SNMP tools visible again

# Hot swap test
curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"mcp_od_registry_update","arguments":{"plugin_name":"net-utils","source":"./plugins/builtin/net-utils@1.0.1.zip"}}}'
# Should succeed and report hot swap completed

# Audit log confirms hot swap
curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"mcp_od_registry_audit_log","arguments":{"plugin_id":"net-utils@1.0.1","response_format":"json"}}}' \
  | jq '.result.structuredContent[] | select(.event == "hot_swap_completed")'
```

---

## Migration Tracking Checklist

### Phase 0 — Toolchain Setup
- [ ] TypeScript + dev tooling installed
- [ ] `tsconfig.json` and `tsconfig.strict.json` created
- [ ] `src/` directory skeleton created
- [ ] `better-sqlite3` installed (replaces `sqlite3`)
- [ ] CI typecheck gate added to deploy scripts

### Phase 1 — Type Definitions
- [ ] `src/types/manifest.types.ts` — full `PluginManifestV2` hierarchy
- [ ] `src/types/lifecycle.types.ts` — lifecycle state machine types
- [ ] `src/types/signing.types.ts` — signing authority types
- [ ] `src/types/marketplace.types.ts` — pull contract types
- [ ] `src/types/tool.types.ts` — response types, pagination utilities
- [ ] `src/types/transport.types.ts` — (from V1 plan, unchanged)
- [ ] `src/types/index.ts` — barrel export
- [ ] `npm run typecheck` — zero errors on types-only files

### Phase 2 — Plugin Infrastructure
- [ ] `src/plugins/db/plugin-db.ts` — fully typed
- [ ] `src/plugins/plugin-manager.ts` — fully typed
- [ ] `src/plugins/plugin-registry.ts` — fully typed
- [ ] `src/plugins/integrity/hash-utils.ts`
- [ ] `src/plugins/integrity/signature-verifier.ts`
- [ ] `src/plugins/marketplace/marketplace-client.ts`
- [ ] `src/plugins/marketplace/local-import.ts`
- [ ] `npm run typecheck` — plugin infrastructure clean

### Phase 3 — Transport Layer
- [ ] `src/transports/core/transport-manager.ts`
- [ ] `src/transports/core/streamable-http-transport.ts`
- [ ] `src/transports/amqp/amqp-transport.ts`
- [ ] `src/index.ts` — main entry
- [ ] `npm run build` — compiles to `dist/`
- [ ] Docker build uses `dist/index.js`

### Phase 4 — Typed Plugin Packages
- [ ] `plugins/src/net-utils/` — 8 tools, typed
- [ ] `plugins/src/credentials/` — 5 tools, typed
- [ ] `plugins/src/registry-tools/` — 8 tools, typed
- [ ] `plugins/src/memory-cmdb/` — 9 tools, typed
- [ ] `plugins/src/zabbix/` — 7 tools, typed
- [ ] `plugins/src/proxmox/` — 10 tools, typed
- [ ] `plugins/src/nmap/` — 5 tools, typed
- [ ] `plugins/src/snmp/` — 12 tools, typed (net-snmp.d.ts created)
- [ ] `src/types/net-snmp.d.ts` created
- [ ] All 8 plugin packages compile to `dist/`
- [ ] Build script generates valid zips in `plugins/builtin/`
- [ ] Full test suite passes: `npm test`

### Phase 5 — Marketplace Alignment
- [ ] Shared types extracted to `shared/` in Marketplace repo
- [ ] `PluginManifestV2` used in Marketplace `Tool` mongoose model
- [ ] Marketplace `/api/plugins/available` endpoint typed
- [ ] Marketplace `/api/plugins/:name/:version/download` endpoint typed
- [ ] Server `MarketplaceClient` connects to Marketplace endpoints

### Phase 6 — Signing Authority
- [ ] `src/plugins/integrity/signature-verifier.ts` handles both VibeForge and enterprise keys
- [ ] VibeForge public key seeded from `VIBEFORGE_PUBLIC_KEY_PEM` env
- [ ] Enterprise key management via `mcp_od_registry_add_signing_key` tool
- [ ] Marketplace `SigningService` signs bundles at publish time
- [ ] Enterprise self-signing workflow documented and tested

### Phase 7 — Strict Mode
- [ ] Each plugin package passes `tsconfig.strict.json`
- [ ] `src/plugins/` passes strict
- [ ] `src/transports/` passes strict
- [ ] Root `tsconfig.json` set to `strict: true`
- [ ] `npm run typecheck:strict` — zero errors

### Phase 8 — Finalization
- [ ] Legacy `tools/` JS files archived
- [ ] `Dockerfile` updated
- [ ] `rebuild_deploy.ps1` includes typecheck gate
- [ ] Full smoke test (deactivate/reactivate, hot swap, audit log)
- [ ] README updated with plugin architecture and TypeScript build instructions

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `net-snmp` lacks TypeScript types | High | Manual `net-snmp.d.ts` declaration file — type the interfaces you use, stub the rest |
| MCP SDK `sendToolListChanged()` API doesn't exist | Medium | Check SDK v1.12.1 source; fallback: send `notifications/tools/list_changed` manually |
| Hot swap causes duplicate tool registrations | Medium | Track registered tools per plugin in a Map; clear before re-registering on hot swap |
| `better-sqlite3` doesn't support blob retrieval cleanly | Low | `Buffer` return type — confirmed working with BLOB columns |
| Marketplace frontend still uses JS in API layer | Medium | Align via shared types Option A (file copy) initially; proper package later |
| Enterprise signing key management complexity | Low | Ed25519 is well-supported in Node crypto; keep the key management tooling simple |
| Plugin circular dependencies | Low | Topological sort already in manifest-loader spec; carry it into typed implementation |

---

## Success Criteria

Migration is complete when ALL of the following are true:

1. `npm run typecheck:strict` reports zero errors across the entire `src/` tree
2. All 8 tool groups exist as typed plugin packages in `plugins/src/`
3. `npm test`, `npm run test:http-session:docker`, and `npm run test:audit` all pass
4. Deactivate → tools disappear from `tools/list`; reactivate → tools return
5. Hot swap completes without server restart, with audit log entry
6. Local zip import installs successfully with hash verification
7. Marketplace pull works with `MARKETPLACE_TOKEN` env var set
8. VibeForge-signed plugins verify on install; unsigned plugins are accepted or rejected per `REQUIRE_SIGNATURES`
9. Enterprise signing keys can be added and verified
10. Docker build is self-contained — produces running server from `src/` + `plugins/src/` alone
