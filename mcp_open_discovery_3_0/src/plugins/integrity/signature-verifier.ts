import crypto from 'crypto';

import type { PluginManifestV2, SignatureVerificationResult, SigningAlgorithm } from '../../types';
import { getTrustedSigningKey } from '../db/plugin-db';

export function verifySignature(
  distHash: string,
  signature: string,
  publicKeyPem: string,
  algorithm: SigningAlgorithm,
): boolean {
  const payload = Buffer.from(distHash, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'base64');

  if (algorithm === 'Ed25519') {
    return crypto.verify(null, payload, publicKeyPem, signatureBuffer);
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(payload);
  verifier.end();
  return verifier.verify(publicKeyPem, signatureBuffer);
}

export function verifySignatures(manifest: PluginManifestV2): SignatureVerificationResult {
  const distHash = manifest.dist?.hash;
  if (!distHash) {
    return { verified: false, keyId: null, keyType: null, error: 'No dist.hash to verify against' };
  }

  for (const signature of manifest.signatures ?? []) {
    if (!signature.keyId) {
      continue;
    }

    const key = getTrustedSigningKey(signature.keyId);
    if (!key || !key.is_active) {
      continue;
    }

    try {
      if (verifySignature(distHash, signature.signature, key.public_key_pem, key.algorithm)) {
        return { verified: true, keyId: key.id, keyType: key.key_type };
      }
    } catch (error) {
      return {
        verified: false,
        keyId: key.id,
        keyType: key.key_type,
        error: error instanceof Error ? error.message : 'Signature verification failed',
      };
    }
  }

  return { verified: false, keyId: null, keyType: null, error: 'No valid signature found against trusted keys' };
}