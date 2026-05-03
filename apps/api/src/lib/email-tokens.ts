// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createHash, randomBytes } from "crypto";
import { getDb } from "./db";
import { getAppEnv } from "./env";
import { toUtcIso } from "./date-helpers";
import type { Transaction } from "@jurnapod/db";

export type EmailTokenType = "PASSWORD_RESET" | "INVITE" | "VERIFY_EMAIL";

export class EmailTokenNotFoundError extends Error {}
export class EmailTokenExpiredError extends Error {}
export class EmailTokenUsedError extends Error {}
export class EmailTokenInvalidError extends Error {}

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
  const db = getDb();
  const ttlMinutes = getTokenTtlMinutes(params.type);
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await db
    .insertInto("email_tokens")
    .values({
      company_id: params.companyId,
      user_id: params.userId,
      email: params.email,
      token_hash: tokenHash,
      type: params.type,
      expires_at: expiresAt,
      created_by: params.createdBy,
    })
    .execute();

  return { token, expiresAt: toUtcIso.dateLike(expiresAt) as string };
}

export async function validateEmailToken(
  token: string,
  type: EmailTokenType
): Promise<{ userId: number; companyId: number; email: string }> {
  const db = getDb();
  const tokenHash = hashToken(token);

  const row = await db
    .selectFrom("email_tokens")
    .where("token_hash", "=", tokenHash)
    .where("type", "=", type)
    .limit(1)
    .select(["id", "company_id", "user_id", "email", "token_hash", "type", "expires_at", "used_at"])
    .executeTakeFirst();

  if (!row) {
    throw new EmailTokenInvalidError("Invalid token");
  }

  if (row.used_at) {
    throw new EmailTokenUsedError("Token has already been used");
  }

  if (new Date(row.expires_at) < new Date()) {
    throw new EmailTokenExpiredError("Token has expired");
  }

  return {
    userId: row.user_id,
    companyId: row.company_id,
    email: row.email,
  };
}

export async function invalidateEmailToken(token: string, type: EmailTokenType): Promise<void> {
  const db = getDb();
  const tokenHash = hashToken(token);

  await db
    .updateTable("email_tokens")
    .set({ used_at: new Date() })
    .where("token_hash", "=", tokenHash)
    .where("type", "=", type)
    .execute();
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
  connection: Transaction,
  token: string,
  type: EmailTokenType
): Promise<{ userId: number; companyId: number; email: string }> {
  const tokenHash = hashToken(token);

  // Atomically mark token as used ONLY if it's valid, unused, and not expired
  const updateResult = await connection
    .updateTable("email_tokens")
    .set({ used_at: new Date() })
    .where("token_hash", "=", tokenHash)
    .where("type", "=", type)
    .where("used_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();

  // If no rows were updated, the token is either invalid, already used, or expired
  if (!updateResult || updateResult.numUpdatedRows === BigInt(0)) {
    // Fetch token to determine specific error
    const row = await connection
      .selectFrom("email_tokens")
      .where("token_hash", "=", tokenHash)
      .where("type", "=", type)
      .limit(1)
      .select(["id", "company_id", "user_id", "email", "expires_at", "used_at"])
      .executeTakeFirst();

    if (!row) {
      throw new EmailTokenInvalidError("Invalid token");
    }

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
  const tokenRow = await connection
    .selectFrom("email_tokens")
    .where("token_hash", "=", tokenHash)
    .where("type", "=", type)
    .limit(1)
    .select(["company_id", "user_id", "email"])
    .executeTakeFirst();

  if (!tokenRow) {
    throw new EmailTokenInvalidError("Invalid token");
  }

  return {
    userId: tokenRow.user_id,
    companyId: tokenRow.company_id,
    email: tokenRow.email,
  };
}

export async function getEmailTokenInfo(
  token: string,
  type: EmailTokenType
): Promise<{ userId: number; companyId: number; email: string; expiresAt: string } | null> {
  const db = getDb();
  const tokenHash = hashToken(token);

  const row = await db
    .selectFrom("email_tokens")
    .where("token_hash", "=", tokenHash)
    .where("type", "=", type)
    .limit(1)
    .select(["company_id", "user_id", "email", "expires_at"])
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    companyId: row.company_id,
    email: row.email,
    expiresAt: String(row.expires_at),
  };
}
