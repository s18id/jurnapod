import { createHmac, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";

export const REFRESH_TOKEN_COOKIE_NAME = "jp_refresh_token";
const COOKIE_PATH = "/";
const COOKIE_USER_AGENT_MAX_LENGTH = 255;

type RefreshTokenRow = RowDataPacket & {
  id: number;
  user_id: number;
  company_id: number;
  expires_at: Date;
  revoked_at: Date | null;
};

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
      ok: true;
      token: string;
      expiresAt: Date;
      tokenId: number;
      userId: number;
      companyId: number;
      rotatedFromId: number;
    }
  | {
      ok: false;
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

function normalizeUserAgent(userAgent: string | null): string | null {
  if (!userAgent) {
    return null;
  }

  const trimmed = userAgent.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length > COOKIE_USER_AGENT_MAX_LENGTH
    ? trimmed.slice(0, COOKIE_USER_AGENT_MAX_LENGTH)
    : trimmed;
}

function normalizeIpAddress(ipAddress: string | null): string | null {
  if (!ipAddress) {
    return null;
  }

  const trimmed = ipAddress.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

function hashRefreshToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
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
  const env = getAppEnv();
  const token = generateRefreshToken();
  const tokenHash = hashRefreshToken(token, env.auth.refreshTokenSecret);
  const expiresAt = new Date(Date.now() + env.auth.refreshTokenTtlSeconds * 1000);
  const pool = getDbPool();
  const ipAddress = normalizeIpAddress(context.ipAddress);
  const userAgent = normalizeUserAgent(context.userAgent);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO auth_refresh_tokens (
      company_id,
      user_id,
      token_hash,
      expires_at,
      ip_address,
      user_agent
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [context.companyId, context.userId, tokenHash, expiresAt, ipAddress, userAgent]
  );

  return {
    token,
    expiresAt,
    tokenId: Number(result.insertId)
  };
}

export async function rotateRefreshToken(
  refreshToken: string,
  meta: {
    ipAddress: string | null;
    userAgent: string | null;
  }
): Promise<RefreshTokenRotateResult> {
  const env = getAppEnv();
  const tokenHash = hashRefreshToken(refreshToken, env.auth.refreshTokenSecret);
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RefreshTokenRow[]>(
      `SELECT id, user_id, company_id, expires_at, revoked_at
       FROM auth_refresh_tokens
       WHERE token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    const current = rows[0];
    if (!current) {
      await connection.rollback();
      return { ok: false, reason: "not_found" };
    }

    if (current.revoked_at) {
      await connection.rollback();
      return { ok: false, reason: "revoked" };
    }

    if (current.expires_at.getTime() <= Date.now()) {
      await connection.rollback();
      return { ok: false, reason: "expired" };
    }

    const revokeResult = await connection.execute<ResultSetHeader>(
      `UPDATE auth_refresh_tokens
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE id = ? AND revoked_at IS NULL`,
      [current.id]
    );

    const updateResult = revokeResult[0];
    if (updateResult.affectedRows !== 1) {
      await connection.rollback();
      return { ok: false, reason: "revoked" };
    }

    const nextToken = generateRefreshToken();
    const nextTokenHash = hashRefreshToken(nextToken, env.auth.refreshTokenSecret);
    const expiresAt = new Date(Date.now() + env.auth.refreshTokenTtlSeconds * 1000);
    const ipAddress = normalizeIpAddress(meta.ipAddress);
    const userAgent = normalizeUserAgent(meta.userAgent);

    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO auth_refresh_tokens (
        company_id,
        user_id,
        token_hash,
        expires_at,
        rotated_from_id,
        ip_address,
        user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [current.company_id, current.user_id, nextTokenHash, expiresAt, current.id, ipAddress, userAgent]
    );

    await connection.commit();

    return {
      ok: true,
      token: nextToken,
      expiresAt,
      tokenId: Number(insertResult.insertId),
      userId: current.user_id,
      companyId: current.company_id,
      rotatedFromId: current.id
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  const env = getAppEnv();
  const tokenHash = hashRefreshToken(refreshToken, env.auth.refreshTokenSecret);
  const pool = getDbPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE auth_refresh_tokens
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [tokenHash]
  );

  return result.affectedRows > 0;
}
