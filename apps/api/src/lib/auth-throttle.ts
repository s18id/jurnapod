// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createHmac } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";

type ThrottleRow = RowDataPacket & {
  key_hash: string;
  failure_count: number;
  last_failed_at: Date | null;
};

export type LoginThrottleKey = {
  scope: "primary" | "ip";
  raw: string;
  hash: string;
};

function normalizeCompanyCode(value: string): string {
  return value.trim().toUpperCase();
}

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

function computeDelayMs(failureCount: number, baseMs: number, maxMs: number): number {
  if (!Number.isFinite(failureCount) || failureCount <= 1) {
    return 0;
  }

  const delay = baseMs * Math.pow(2, failureCount - 2);
  return Math.min(maxMs, Math.round(delay));
}

export function buildLoginThrottleKeys(params: {
  companyCode: string;
  email: string;
  ipAddress: string | null;
}): LoginThrottleKey[] {
  const companyCode = normalizeCompanyCode(params.companyCode);
  const email = normalizeEmail(params.email);
  const ip = normalizeIp(params.ipAddress);

  const primaryRaw = `login:${companyCode}:${email}:${ip}`;
  const ipRaw = `login-ip:${ip}`;

  return [
    { scope: "primary", raw: primaryRaw, hash: hashThrottleKey(primaryRaw) },
    { scope: "ip", raw: ipRaw, hash: hashThrottleKey(ipRaw) }
  ];
}

export async function getLoginThrottleDelay(keys: LoginThrottleKey[]): Promise<number> {
  if (keys.length === 0) {
    return 0;
  }

  const env = getAppEnv();
  const pool = getDbPool();
  const placeholders = keys.map(() => "?").join(", ");
  const [rows] = await pool.execute<ThrottleRow[]>(
    `SELECT key_hash, failure_count, last_failed_at
     FROM auth_login_throttles
     WHERE key_hash IN (${placeholders})`,
    keys.map((key) => key.hash)
  );

  const failureCounts = new Map<string, number>();
  for (const row of rows) {
    failureCounts.set(row.key_hash, Number(row.failure_count));
  }

  let maxDelay = 0;
  for (const key of keys) {
    const failureCount = failureCounts.get(key.hash) ?? 0;
    const delay = computeDelayMs(
      failureCount,
      env.auth.loginThrottle.baseDelayMs,
      env.auth.loginThrottle.maxDelayMs
    );
    if (delay > maxDelay) {
      maxDelay = delay;
    }
  }

  return maxDelay;
}

export async function recordLoginFailure(params: {
  keys: LoginThrottleKey[];
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  if (params.keys.length === 0) {
    return;
  }

  const pool = getDbPool();
  const ipAddress = params.ipAddress?.trim() || null;
  const userAgent = params.userAgent?.trim() || null;

  const values = params.keys.flatMap((key) => [key.hash, ipAddress, userAgent]);
  const placeholders = params.keys.map(() => "(?, 1, NOW(), ?, ?)").join(", ");

  await pool.execute<ResultSetHeader>(
    `INSERT INTO auth_login_throttles (
      key_hash,
      failure_count,
      last_failed_at,
      last_ip,
      last_user_agent
    ) VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE
      failure_count = failure_count + 1,
      last_failed_at = NOW(),
      last_ip = VALUES(last_ip),
      last_user_agent = VALUES(last_user_agent)`,
    values
  );
}

export async function recordLoginSuccess(keys: LoginThrottleKey[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  const pool = getDbPool();
  const placeholders = keys.map(() => "?").join(", ");
  await pool.execute<ResultSetHeader>(
    `DELETE FROM auth_login_throttles WHERE key_hash IN (${placeholders})`,
    keys.map((key) => key.hash)
  );
}

export function delay(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
