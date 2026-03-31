// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { authClient } from "./auth-client.js";
import { getAppEnv } from "./env";

export const REFRESH_TOKEN_COOKIE_NAME = "jp_refresh_token";
const COOKIE_PATH = "/";
const COOKIE_USER_AGENT_MAX_LENGTH = 255;

export type RefreshTokenIssueContext = {
  userId: number;
  companyId: number;
  ipAddress: string | null;
  userAgent: string | null;
};

export type RefreshTokenIssueResult = {
  token: string;
  expiresAt: Date;
  tokenId: number;
};

export type RefreshTokenRotateResult =
  | {
      success: true;
      token: string;
      expiresAt: Date;
      tokenId: number;
      userId: number;
      companyId: number;
      rotatedFromId: number;
    }
  | {
      success: false;
      reason: "not_found" | "revoked" | "expired";
    };

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getRefreshCookieSettings(): { sameSite: string; secure: boolean } {
  const env = getAppEnv();
  if (env.auth.refreshCookieCrossSite) {
    return { sameSite: "None", secure: true };
  }

  return { sameSite: "Lax", secure: isProduction() };
}

function toCookieExpiry(maxAgeSeconds: number): string {
  const expiry = new Date(Date.now() + maxAgeSeconds * 1000);
  return expiry.toUTCString();
}

export function createRefreshTokenCookie(token: string, maxAgeSeconds: number): string {
  const cookieSettings = getRefreshCookieSettings();
  const attributes = [
    `${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    `SameSite=${cookieSettings.sameSite}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    `Expires=${toCookieExpiry(maxAgeSeconds)}`
  ];

  if (cookieSettings.secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function createRefreshTokenClearCookie(): string {
  const cookieSettings = getRefreshCookieSettings();
  const attributes = [
    `${REFRESH_TOKEN_COOKIE_NAME}=`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    `SameSite=${cookieSettings.sameSite}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ];

  if (cookieSettings.secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function readRefreshTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawName, ...rest] = pair.split("=");
    if (!rawName) {
      continue;
    }

    const name = rawName.trim();
    if (name !== REFRESH_TOKEN_COOKIE_NAME) {
      continue;
    }

    const rawValue = rest.join("=").trim();
    if (!rawValue) {
      return "";
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export async function issueRefreshToken(
  context: RefreshTokenIssueContext
): Promise<RefreshTokenIssueResult> {
  return authClient.tokens.issueRefreshToken(context);
}

export async function rotateRefreshToken(
  refreshToken: string,
  meta: {
    ipAddress: string | null;
    userAgent: string | null;
  }
): Promise<RefreshTokenRotateResult> {
  return authClient.tokens.rotateRefreshToken(refreshToken, meta);
}

export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  return authClient.tokens.revokeRefreshToken(refreshToken);
}
