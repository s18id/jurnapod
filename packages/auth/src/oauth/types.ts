/**
 * OAuth-specific type definitions
 */

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}

export interface OAuthTokenResult {
  idToken: string;
  accessToken: string | null;
  expiresInSeconds: number | null;
}

export interface OAuthUserLookup {
  userId: number;
  companyId: number;
  email: string;
}
