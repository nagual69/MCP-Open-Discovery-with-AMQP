# Plugin Signing and Checksums

This document describes checksum requirements and optional digital signatures for remote plugin installs.

## Checksums (Required)

- Every remote ZIP must include a SHA-256 checksum in the manifest under `dist.checksums.sha256`.
- The installer computes the ZIP checksum and compares it before extraction.
- On mismatch: abort install and report error.

## Digital Signatures (Optional, Recommended)

- Ed25519 detached signatures can be provided for the ZIP.
- Manifest includes signature metadata and publisher key reference.
- When `REQUIRE_SIGNATURES=true`, the installer verifies signatures and rejects unsigned/invalid packages.

## Trust Policy

- Maintain an allowlist of trusted publisher keys (rotated periodically).
- Support revocation list ingestion from the Marketplace.
- Log signature verification results for audit.

## Operational Guidance

- Prefer enabling signatures in production once publisher keys are available.
- Store lock files capturing name/version/sourceUrl/sha256/signature.
- Rate-limit remote fetches and retry with backoff.
