// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createHmac } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";

type ThrottleRow = RowDataPacket & {
  key_hash: string;
  request_count: number;
  window_started_at: Date;
};

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

  const pool = getDbPool();
  const windowStartThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

  const placeholders = keys.map(() => "?").join(", ");
  const [rows] = await pool.execute<ThrottleRow[]>(
    `SELECT key_hash, request_count, window_started_at
     FROM auth_password_reset_throttles
     WHERE key_hash IN (${placeholders})`,
    keys.map((key) => key.hash)
  );

  const limits = {
    email_ip: 5,
    ip: 10
  };

  for (const row of rows) {
    const key = keys.find((k) => k.hash === row.key_hash);
    if (!key) continue;

    const windowStart = new Date(row.window_started_at);
    
    // If window is expired, allow (will be reset on record)
    if (windowStart < windowStartThreshold) {
      continue;
    }

    const limit = limits[key.scope];
    if (row.request_count >= limit) {
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

  const pool = getDbPool();
  const ipAddress = params.ipAddress?.trim() || null;
  const userAgent = params.userAgent?.trim() || null;

  // Atomically insert or update throttle records
  // If window has expired (> 1 hour old), reset count to 1 and start new window
  // Otherwise, increment count
  for (const key of params.keys) {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO auth_password_reset_throttles (
        key_hash,
        request_count,
        window_started_at,
        last_ip,
        last_user_agent
      ) VALUES (?, 1, NOW(), ?, ?)
      ON DUPLICATE KEY UPDATE
        request_count = IF(
          window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR),
          1,
          request_count + 1
        ),
        window_started_at = IF(
          window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR),
          NOW(),
          window_started_at
        ),
        last_ip = VALUES(last_ip),
        last_user_agent = VALUES(last_user_agent)`,
      [key.hash, ipAddress, userAgent]
    );
  }
}
