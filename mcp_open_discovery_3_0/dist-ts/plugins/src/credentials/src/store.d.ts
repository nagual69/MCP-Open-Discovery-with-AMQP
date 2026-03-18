import type { AddCredentialInput, AddCredentialResult, CredentialType, ListCredentialsResult, RemoveCredentialResult, RetrievedCredential, RotateKeyResult } from './types';
export declare function addCredential(input: AddCredentialInput): AddCredentialResult;
export declare function getCredential(id: string): RetrievedCredential;
export declare function listCredentials(type?: CredentialType): ListCredentialsResult;
export declare function removeCredential(id: string): RemoveCredentialResult;
export declare function rotateKey(): RotateKeyResult;
//# sourceMappingURL=store.d.ts.map