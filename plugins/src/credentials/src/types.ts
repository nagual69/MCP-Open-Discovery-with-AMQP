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

export const ReadOnlyAnnotations: ToolAnnotationHints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const WriteAnnotations: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const RemoveAnnotations: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

export const CredentialTypeSchema = z.enum(['password', 'apiKey', 'sshKey', 'oauth', 'certificate', 'custom']);

export const AddCredentialInputShape = {
  id: z.string().min(1).describe('Unique identifier for this credential'),
  type: CredentialTypeSchema.describe('Credential type'),
  username: z.string().optional().describe('Username or account name'),
  password: z.string().optional().describe('Password or secret value to encrypt'),
  url: z.string().optional().describe('Service URL (https://hostname:port)'),
  notes: z.string().optional().describe('Free-form notes'),
} satisfies z.ZodRawShape;

export const GetCredentialInputShape = {
  id: z.string().min(1).describe('Credential identifier to retrieve'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const ListCredentialsInputShape = {
  type: CredentialTypeSchema.optional().describe('Filter by credential type'),
  response_format: ResponseFormatSchema,
} satisfies z.ZodRawShape;

export const RemoveCredentialInputShape = {
  id: z.string().min(1).describe('Credential identifier to remove'),
} satisfies z.ZodRawShape;

export const RotateKeyInputShape = {} satisfies z.ZodRawShape;

export const AddCredentialInputSchema = z.object(AddCredentialInputShape);
export const GetCredentialInputSchema = z.object(GetCredentialInputShape);
export const ListCredentialsInputSchema = z.object(ListCredentialsInputShape);
export const RemoveCredentialInputSchema = z.object(RemoveCredentialInputShape);
export const RotateKeyInputSchema = z.object(RotateKeyInputShape);

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