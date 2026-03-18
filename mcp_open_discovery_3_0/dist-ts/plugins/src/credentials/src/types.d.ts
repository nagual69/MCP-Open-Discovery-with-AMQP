import { z } from 'zod';
import { ResponseFormatSchema, type ResponseFormat, type ToolResponse } from './shared';
export { ResponseFormatSchema };
export type { ResponseFormat, ToolResponse };
export interface ToolAnnotationHints {
    [key: string]: unknown;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
}
export declare const ReadOnlyAnnotations: ToolAnnotationHints;
export declare const WriteAnnotations: ToolAnnotationHints;
export declare const RemoveAnnotations: ToolAnnotationHints;
export declare const CredentialTypeSchema: z.ZodEnum<["password", "apiKey", "sshKey", "oauth", "certificate", "custom"]>;
export declare const AddCredentialInputShape: {
    id: z.ZodString;
    type: z.ZodEnum<["password", "apiKey", "sshKey", "oauth", "certificate", "custom"]>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
};
export declare const GetCredentialInputShape: {
    id: z.ZodString;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const ListCredentialsInputShape: {
    type: z.ZodOptional<z.ZodEnum<["password", "apiKey", "sshKey", "oauth", "certificate", "custom"]>>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
};
export declare const RemoveCredentialInputShape: {
    id: z.ZodString;
};
export declare const RotateKeyInputShape: {};
export declare const AddCredentialInputSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["password", "apiKey", "sshKey", "oauth", "certificate", "custom"]>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    url?: string;
    type?: "oauth" | "password" | "apiKey" | "sshKey" | "certificate" | "custom";
    id?: string;
    password?: string;
    username?: string;
    notes?: string;
}, {
    url?: string;
    type?: "oauth" | "password" | "apiKey" | "sshKey" | "certificate" | "custom";
    id?: string;
    password?: string;
    username?: string;
    notes?: string;
}>;
export declare const GetCredentialInputSchema: z.ZodObject<{
    id: z.ZodString;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    id?: string;
    response_format?: "json" | "markdown";
}, {
    id?: string;
    response_format?: "json" | "markdown";
}>;
export declare const ListCredentialsInputSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodEnum<["password", "apiKey", "sshKey", "oauth", "certificate", "custom"]>>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
}, "strip", z.ZodTypeAny, {
    type?: "oauth" | "password" | "apiKey" | "sshKey" | "certificate" | "custom";
    response_format?: "json" | "markdown";
}, {
    type?: "oauth" | "password" | "apiKey" | "sshKey" | "certificate" | "custom";
    response_format?: "json" | "markdown";
}>;
export declare const RemoveCredentialInputSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: string;
}, {
    id?: string;
}>;
export declare const RotateKeyInputSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export type CredentialType = z.infer<typeof CredentialTypeSchema>;
export type AddCredentialInput = z.infer<typeof AddCredentialInputSchema>;
export type GetCredentialInput = z.infer<typeof GetCredentialInputSchema>;
export type ListCredentialsInput = z.infer<typeof ListCredentialsInputSchema>;
export type RemoveCredentialInput = z.infer<typeof RemoveCredentialInputSchema>;
export interface StoredCredentialEntry {
    id: string;
    type: CredentialType;
    username?: string;
    url?: string;
    notes?: string;
    createdAt: string;
    password?: string;
    apiKey?: string;
    sshKey?: string;
    oauthToken?: string;
    certificate?: string;
}
export type CredentialStore = Record<string, StoredCredentialEntry>;
export interface AddCredentialResult {
    success: true;
    message: string;
    id: string;
    type: CredentialType;
}
export interface ListedCredential {
    id: string;
    type: CredentialType;
    username?: string;
    url?: string;
    createdAt: string;
}
export interface ListCredentialsResult {
    credentials: ListedCredential[];
}
export interface RemoveCredentialResult {
    success: true;
    message: string;
}
export interface RotateKeyResult {
    success: true;
    message: string;
}
export interface RetrievedCredential {
    id: string;
    type: CredentialType;
    username?: string;
    url?: string;
    notes?: string;
    createdAt: string;
    password?: string;
    apiKey?: string;
    sshKey?: string;
    oauthToken?: string;
    certificate?: string;
}
//# sourceMappingURL=types.d.ts.map