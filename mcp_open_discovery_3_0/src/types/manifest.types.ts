export interface PluginManifestV2 {
  manifestVersion: '2';
  name: string;
  version: string;
  entry: string;
  description?: string;
  capabilities?: PluginCapabilities;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  dependencies?: string[];
  dist: PluginDist;
  permissions?: PluginPermissions;
  externalDependencies?: ExternalDependency[];
  dependenciesPolicy?: DependenciesPolicy;
  signatures?: PluginSignature[];
  sbom?: SbomReference;
  hostRequirements?: HostRequirements;
  engines?: PluginEngines;
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
  hash: string;
  hashes?: AdditionalHash[];
  fileCount?: number;
  totalBytes?: number;
  coverage?: 'all' | 'partial';
  checksums?: PluginChecksums;
}

export interface PluginChecksums {
  files?: FileChecksum[];
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
  name: string;
  version: string;
  integrity?: string;
  optional?: boolean;
  source?: 'npm' | 'git' | 'url';
  registry?: string;
  integrities?: IntegrityEntry[];
}

export interface IntegrityEntry {
  alg: string;
  value: string;
}

export type DependenciesPolicy =
  | 'bundled-only'
  | 'external-allowed'
  | 'external-allowlist'
  | 'sandbox-required';

export interface PluginSignature {
  alg: string;
  signature: string;
  keyId?: string;
  ts?: string;
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

export interface PluginEngines {
  node?: string;
}

export type PluginManifest = PluginManifestV2;