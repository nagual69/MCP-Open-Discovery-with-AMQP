import type { PluginManifestV2, SignatureVerificationResult, SigningAlgorithm } from '../../types';
export declare function verifySignature(distHash: string, signature: string, publicKeyPem: string, algorithm: SigningAlgorithm): boolean;
export declare function verifySignatures(manifest: PluginManifestV2): SignatureVerificationResult;
//# sourceMappingURL=signature-verifier.d.ts.map