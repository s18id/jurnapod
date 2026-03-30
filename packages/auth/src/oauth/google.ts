/**
 * Google OAuth 2.0 provider implementation
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthDbAdapter, AuthConfig, GoogleOAuthProfile } from "../types.js";
import { OAuthConfigError, OAuthExchangeError, OAuthVerificationError } from "../errors.js";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_PROVIDER = "google";

const tokenResponseSchema = z.object({
  access_token: z.string().optional(),
  id_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  token_type: z.string().optional()
});

const googleClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional()
});

export class GoogleOAuthProvider {
  private jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);

  constructor(
    private adapter: AuthDbAdapter,
    private config: AuthConfig
  ) {
    if (!config.oauth?.google) {
      throw new OAuthConfigError("Google OAuth is not configured");
    }
  }

  private get googleConfig() {
    return this.config.oauth!.google!;
  }

  assertRedirectUriAllowed(redirectUri: string): void {
    if (!this.googleConfig.redirectUris.includes(redirectUri)) {
      throw new OAuthConfigError("Google OAuth redirect_uri is not allowed");
    }
  }

  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<{
    idToken: string;
    accessToken: string | null;
    expiresInSeconds: number | null;
  }> {
    this.assertRedirectUriAllowed(redirectUri);

    const payload = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: this.googleConfig.clientId,
      client_secret: this.googleConfig.clientSecret,
      redirect_uri: redirectUri
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        responseBody && typeof responseBody === "object"
          ? JSON.stringify(responseBody)
          : "unknown error";
      throw new OAuthExchangeError(`Google OAuth token exchange failed: ${errorMessage}`);
    }

    const parsed = tokenResponseSchema.parse(responseBody);
    return {
      idToken: parsed.id_token,
      accessToken: parsed.access_token ?? null,
      expiresInSeconds: parsed.expires_in ?? null
    };
  }

  async verifyIdToken(idToken: string): Promise<GoogleOAuthProfile> {
    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: GOOGLE_ISSUER,
      audience: this.googleConfig.clientId
    });

    const claims = googleClaimsSchema.parse(payload);
    const emailVerified = claims.email_verified ?? false;

    if (!emailVerified) {
      throw new OAuthVerificationError("Google account email is not verified");
    }

    return {
      sub: claims.sub,
      email: claims.email.trim().toLowerCase(),
      emailVerified
    };
  }

  async findUser(
    companyCode: string,
    email: string
  ): Promise<{ userId: number; companyId: number; email: string } | null> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.adapter.db
      .selectFrom('users as u')
      .innerJoin('companies as c', 'c.id', 'u.company_id')
      .where('c.code', '=', companyCode)
      .where('u.email', '=', normalizedEmail)
      .select(['u.id', 'u.company_id', 'u.email', 'u.is_active'])
      .executeTakeFirst();

    if (!user || !user.is_active) {
      return null;
    }

    return {
      userId: user.id,
      companyId: user.company_id,
      email: user.email
    };
  }

  async linkAccount(params: {
    companyId: number;
    userId: number;
    providerUserId: string;
    emailSnapshot: string;
  }): Promise<
    | { success: true; linked: boolean }
    | { success: false; reason: "linked_to_another_user" }
  > {
    const normalizedEmail = params.emailSnapshot.trim().toLowerCase();

    // Check for existing link
    const existing = await this.adapter.db
      .selectFrom('auth_oauth_accounts')
      .where('company_id', '=', params.companyId)
      .where('provider', '=', GOOGLE_PROVIDER)
      .where('provider_user_id', '=', params.providerUserId)
      .select(['id', 'user_id'])
      .executeTakeFirst();

    if (existing) {
      if (existing.user_id !== params.userId) {
        return { success: false, reason: "linked_to_another_user" };
      }
      return { success: true, linked: false };
    }

    // Create new link
    await this.adapter.db
      .insertInto('auth_oauth_accounts')
      .values({
        company_id: params.companyId,
        user_id: params.userId,
        provider: GOOGLE_PROVIDER,
        provider_user_id: params.providerUserId,
        email_snapshot: normalizedEmail
      })
      .execute();

    return { success: true, linked: true };
  }
}
