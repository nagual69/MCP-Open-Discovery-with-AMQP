import type { RequestHandler } from 'express';
import type { OAuthConfig } from '../config';
export declare function getProtectedResourceMetadata(config: OAuthConfig): Record<string, unknown>;
export declare function createProtectedResourceMetadataHandler(config: OAuthConfig): RequestHandler;
export declare function createOauthMiddlewareFactory(config: OAuthConfig): (options: {
    requiredScope: string;
    skipPaths: string[];
    optional?: boolean;
}) => RequestHandler;
//# sourceMappingURL=oauth.d.ts.map