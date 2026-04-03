// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createHmac } from "node:crypto";
import { getDb } from "./db";
import { getAppEnv } from "./env";
import { sql } from "kysely";

export type PasswordResetThrottleKey = {
  scope: "email_ip" | "ip";
  raw: string;
  hash: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeIp(value: string | null): string {
  if (!value) {
    return "unknown";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "unknown";
}

function hashThrottleKey(raw: string): string {
  const env = getAppEnv();
  return createHmac("sha256", env.auth.accessTokenSecret).update(raw).digest("hex");
}

export function buildPasswordResetThrottleKeys(params: {
  email: string;
  ipAddress: string | null;
}): PasswordResetThrottleKey[] {
  const email = normalizeEmail(params.email);
  const ip = normalizeIp(params.ipAddress);

  const emailIpRaw = `password-reset:${email}:${ip}`;
  const ipRaw = `password-reset-ip:${ip}`;

  return [
    { scope: "email_ip", raw: emailIpRaw, hash: hashThrottleKey(emailIpRaw) },
    { scope: "ip", raw: ipRaw, hash: hashThrottleKey(ipRaw) }
  ];
}

/**
 * Check if password reset request is allowed.
 * Returns true if allowed, false if rate limit exceeded.
 * 
 * Limits:
 * - EMAIL_IP scope: 5 requests per hour per email+IP combination
 * - IP scope: 10 requests per hour per IP
 */
export async function checkPasswordResetAllowed(
  keys: PasswordResetThrottleKey[]
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  if (keys.length === 0) {
    return { allowed: true };
  }

  const db = getDb();
  const windowStartThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

  const rows = await db
    .selectFrom("auth_throttles")
    .where("key_hash", "in", keys.map((key) => key.hash))
    .where("throttle_type", "=", "password_reset")
    .select(["key_hash", "request_count", "last_failed_at"])
    .execute();

  const limits = {
    email_ip: 5,
    ip: 10
  };

  for (const row of rows) {
    const key = keys.find((k) => k.hash === row.key_hash);
    if (!key) continue;

    const windowStart = row.last_failed_at ? new Date(row.last_failed_at) : null;
    
    // If no last_failed_at or window is expired, allow (will be reset on record)
    if (!windowStart || windowStart < windowStartThreshold) {
      continue;
    }

    const limit = limits[key.scope];
    if ((row.request_count ?? 0) >= limit) {
      const retryAfterMs = windowStart.getTime() + 60 * 60 * 1000 - Date.now();
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      
      return { allowed: false, retryAfterSeconds: Math.max(0, retryAfterSeconds) };
    }
  }

  return { allowed: true };
}

export async function recordPasswordResetAttempt(params: {
  keys: PasswordResetThrottleKey[];
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  if (params.keys.length === 0) {
    return;
  }

  const db = getDb();
  const ipAddress = params.ipAddress?.trim() || null;
  const userAgent = params.userAgent?.trim() || null;

  // Atomically insert or update throttle records
  // If window has expired (> 1 hour old), reset count to 1 and start new window
  // Otherwise, increment count
  for (const key of params.keys) {
    await sql`
      INSERT INTO auth_throttles (
        key_hash,
        throttle_type,
        request_count,
        last_failed_at,
        last_ip,
        last_user_agent
      ) VALUES (${key.hash}, 'password_reset', 1, NOW(), ${ipAddress}, ${userAgent})
      ON DUPLICATE KEY UPDATE
        request_count = IF(
          last_failed_at < DATE_SUB(NOW(), INTERVAL 1 HOUR),
          1,
          request_count + 1
        ),
        last_failed_at = IF(
          last_failed_at < DATE_SUB(NOW(), INTERVAL 1 HOUR),
          NOW(),
          last_failed_at
        ),
        last_ip = VALUES(last_ip),
        last_user_agent = VALUES(last_user_agent)
    `.execute(db);
  }
}
