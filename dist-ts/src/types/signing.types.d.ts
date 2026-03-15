import type { SigningAlgorithm, TrustedKeyType } from './lifecycle.types';
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
//# sourceMappingURL=signing.types.d.ts.map