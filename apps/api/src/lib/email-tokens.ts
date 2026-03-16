// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createHash, randomBytes } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";

export type EmailTokenType = "PASSWORD_RESET" | "INVITE" | "VERIFY_EMAIL";

export class EmailTokenNotFoundError extends Error {}
export class EmailTokenExpiredError extends Error {}
export class EmailTokenUsedError extends Error {}
export class EmailTokenInvalidError extends Error {}

type EmailTokenRow = RowDataPacket & {
  id: number;
  company_id: number;
  user_id: number;
  email: string;
  token_hash: string;
  type: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  created_by: number | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function getTokenTtlMinutes(type: EmailTokenType): number {
  const env = getAppEnv();
  switch (type) {
    case "PASSWORD_RESET":
      return env.email.tokenTtl.passwordResetMinutes;
    case "INVITE":
      return env.email.tokenTtl.inviteMinutes;
    case "VERIFY_EMAIL":
      return env.email.tokenTtl.verifyEmailMinutes;
    default:
      return 60;
  }
}

export async function createEmailToken(params: {
  companyId: number;
  userId: number;
  email: string;
  type: EmailTokenType;
  createdBy: number;
}): Promise<{ token: string; expiresAt: string }> {
  const pool = getDbPool();
  const ttlMinutes = getTokenTtlMinutes(params.type);
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await pool.execute(
    `INSERT INTO email_tokens (company_id, user_id, email, token_hash, type, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.companyId,
      params.userId,
      params.email,
      tokenHash,
      params.type,
      expiresAt,
      params.createdBy
    ]
  );

  return { token, expiresAt };
}

export async function validateEmailToken(
  token: string,
  type: EmailTokenType
): Promise<{ userId: number; companyId: number; email: string }> {
  const pool = getDbPool();
  const tokenHash = hashToken(token);

  const [rows] = await pool.execute<EmailTokenRow[]>(
    `SELECT id, company_id, user_id, email, token_hash, type, expires_at, used_at
     FROM email_tokens
     WHERE token_hash = ? AND type = ?
     LIMIT 1`,
    [tokenHash, type]
  );

  if (rows.length === 0) {
    throw new EmailTokenInvalidError("Invalid token");
  }

  const row = rows[0];

  if (row.used_at) {
    throw new EmailTokenUsedError("Token has already been used");
  }

  if (new Date(row.expires_at) < new Date()) {
    throw new EmailTokenExpiredError("Token has expired");
  }

  return {
    userId: row.user_id,
    companyId: row.company_id,
    email: row.email
  };
}

export async function invalidateEmailToken(token: string, type: EmailTokenType): Promise<void> {
  const pool = getDbPool();
  const tokenHash = hashToken(token);

  await pool.execute(
    `UPDATE email_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND type = ?`,
    [tokenHash, type]
  );
}

/**
 * Atomically validate and consume a token within a transaction.
 * This prevents race conditions where the same token could be used multiple times.
 * 
 * Uses a single UPDATE with WHERE conditions to ensure atomicity:
 * - Only updates if token is unused (used_at IS NULL)
 * - Only updates if token is not expired (expires_at > NOW())
 * - Checks affected rows to detect already-used or expired tokens
 * 
 * Usage: Call this within a transaction context (BEGIN/COMMIT wrapper).
 */
export async function validateAndConsumeToken(
  connection: PoolConnection,
  token: string,
  type: EmailTokenType
): Promise<{ userId: number; companyId: number; email: string }> {
  const tokenHash = hashToken(token);

  // Atomically mark token as used ONLY if it's valid, unused, and not expired
  const [updateResult] = await connection.execute<ResultSetHeader>(
    `UPDATE email_tokens 
     SET used_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? 
       AND type = ?
       AND used_at IS NULL
       AND expires_at > NOW()`,
    [tokenHash, type]
  );

  // If no rows were updated, the token is either invalid, already used, or expired
  if (updateResult.affectedRows === 0) {
    // Fetch token to determine specific error
    const [rows] = await connection.execute<EmailTokenRow[]>(
      `SELECT id, company_id, user_id, email, expires_at, used_at
       FROM email_tokens
       WHERE token_hash = ? AND type = ?
       LIMIT 1`,
      [tokenHash, type]
    );

    if (rows.length === 0) {
      throw new EmailTokenInvalidError("Invalid token");
    }

    const row = rows[0];

    if (row.used_at) {
      throw new EmailTokenUsedError("Token has already been used");
    }

    if (new Date(row.expires_at) < new Date()) {
      throw new EmailTokenExpiredError("Token has expired");
    }

    // Should not reach here, but throw generic error
    throw new EmailTokenInvalidError("Token validation failed");
  }

  // Token was successfully consumed, fetch the details
  const [rows] = await connection.execute<EmailTokenRow[]>(
    `SELECT company_id, user_id, email
     FROM email_tokens
     WHERE token_hash = ? AND type = ?
     LIMIT 1`,
    [tokenHash, type]
  );

  const row = rows[0];

  return {
    userId: row.user_id,
    companyId: row.company_id,
    email: row.email
  };
}

export async function getEmailTokenInfo(
  token: string,
  type: EmailTokenType
): Promise<{ userId: number; companyId: number; email: string; expiresAt: string } | null> {
  const pool = getDbPool();
  const tokenHash = hashToken(token);

  const [rows] = await pool.execute<EmailTokenRow[]>(
    `SELECT company_id, user_id, email, expires_at
     FROM email_tokens
     WHERE token_hash = ? AND type = ?
     LIMIT 1`,
    [tokenHash, type]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  return {
    userId: row.user_id,
    companyId: row.company_id,
    email: row.email,
    expiresAt: row.expires_at
  };
}
