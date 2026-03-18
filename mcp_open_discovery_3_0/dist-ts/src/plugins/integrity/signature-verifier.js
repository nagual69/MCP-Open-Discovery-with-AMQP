"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySignature = verifySignature;
exports.verifySignatures = verifySignatures;
const crypto_1 = __importDefault(require("crypto"));
const plugin_db_1 = require("../db/plugin-db");
function verifySignature(distHash, signature, publicKeyPem, algorithm) {
    const payload = Buffer.from(distHash, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'base64');
    if (algorithm === 'Ed25519') {
        return crypto_1.default.verify(null, payload, publicKeyPem, signatureBuffer);
    }
    const verifier = crypto_1.default.createVerify('RSA-SHA256');
    verifier.update(payload);
    verifier.end();
    return verifier.verify(publicKeyPem, signatureBuffer);
}
function verifySignatures(manifest) {
    const distHash = manifest.dist?.hash;
    if (!distHash) {
        return { verified: false, keyId: null, keyType: null, error: 'No dist.hash to verify against' };
    }
    for (const signature of manifest.signatures ?? []) {
        if (!signature.keyId) {
            continue;
        }
        const key = (0, plugin_db_1.getTrustedSigningKey)(signature.keyId);
        if (!key || !key.is_active) {
            continue;
        }
        try {
            if (verifySignature(distHash, signature.signature, key.public_key_pem, key.algorithm)) {
                return { verified: true, keyId: key.id, keyType: key.key_type };
            }
        }
        catch (error) {
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
//# sourceMappingURL=signature-verifier.js.map