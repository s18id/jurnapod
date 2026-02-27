import { createRemoteJWKSet, jwtVerify } from "jose";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { z } from "zod";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";

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

type UserLookupRow = RowDataPacket & {
  id: number;
  company_id: number;
  email: string;
  is_active: number;
};

type OAuthAccountRow = RowDataPacket & {
  id: number;
  user_id: number;
};

export type GoogleOAuthProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
};

export type GoogleOAuthTokenResult = {
  idToken: string;
  accessToken: string | null;
  expiresInSeconds: number | null;
};

export type GoogleUserLookupResult = {
  userId: number;
  companyId: number;
  email: string;
};

export type GoogleOAuthLinkResult =
  | { ok: true; linked: boolean }
  | { ok: false; reason: "linked_to_another_user" };

function requireGoogleOAuthConfig() {
  const env = getAppEnv();
  const { clientId, clientSecret, redirectUris } = env.googleOAuth;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }

  return { clientId, clientSecret, redirectUris };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertGoogleRedirectUriAllowed(redirectUri: string): void {
  const { redirectUris } = requireGoogleOAuthConfig();
  if (!redirectUris.includes(redirectUri)) {
    throw new Error("Google OAuth redirect_uri is not allowed");
  }
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<GoogleOAuthTokenResult> {
  const { clientId, clientSecret, redirectUris } = requireGoogleOAuthConfig();
  if (!redirectUris.includes(redirectUri)) {
    throw new Error("Google OAuth redirect_uri is not allowed");
  }

  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage =
      responseBody && typeof responseBody === "object"
        ? JSON.stringify(responseBody)
        : "unknown error";
    throw new Error(`Google OAuth token exchange failed: ${errorMessage}`);
  }

  const parsed = tokenResponseSchema.parse(responseBody);
  return {
    idToken: parsed.id_token,
    accessToken: parsed.access_token ?? null,
    expiresInSeconds: parsed.expires_in ?? null
  };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleOAuthProfile> {
  const { clientId } = requireGoogleOAuthConfig();
  const jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: GOOGLE_ISSUER,
    audience: clientId
  });

  const claims = googleClaimsSchema.parse(payload);
  const emailVerified = claims.email_verified ?? false;
  if (!emailVerified) {
    throw new Error("Google account email is not verified");
  }

  return {
    sub: claims.sub,
    email: normalizeEmail(claims.email),
    emailVerified
  };
}

export async function findGoogleLoginUser(
  companyCode: string,
  email: string
): Promise<GoogleUserLookupResult | null> {
  const normalizedEmail = normalizeEmail(email);
  const pool = getDbPool();
  const [rows] = await pool.execute<UserLookupRow[]>(
    `SELECT u.id, u.company_id, u.email, u.is_active
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     WHERE c.code = ? AND u.email = ?
     LIMIT 1`,
    [companyCode, normalizedEmail]
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    return null;
  }

  return {
    userId: user.id,
    companyId: user.company_id,
    email: user.email
  };
}

export async function linkGoogleAccount(params: {
  companyId: number;
  userId: number;
  providerUserId: string;
  emailSnapshot: string;
}): Promise<GoogleOAuthLinkResult> {
  const pool = getDbPool();
  const normalizedEmail = normalizeEmail(params.emailSnapshot);

  const [existingRows] = await pool.execute<OAuthAccountRow[]>(
    `SELECT id, user_id
     FROM auth_oauth_accounts
     WHERE company_id = ? AND provider = ? AND provider_user_id = ?
     LIMIT 1`,
    [params.companyId, GOOGLE_PROVIDER, params.providerUserId]
  );

  const existing = existingRows[0];
  if (existing) {
    if (existing.user_id !== params.userId) {
      return { ok: false, reason: "linked_to_another_user" };
    }

    return { ok: true, linked: false };
  }

  await pool.execute<ResultSetHeader>(
    `INSERT INTO auth_oauth_accounts (
      company_id,
      user_id,
      provider,
      provider_user_id,
      email_snapshot
    ) VALUES (?, ?, ?, ?, ?)`,
    [params.companyId, params.userId, GOOGLE_PROVIDER, params.providerUserId, normalizedEmail]
  );

  return { ok: true, linked: true };
}
