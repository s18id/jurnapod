// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import mysql, { type Pool } from "mysql2/promise";
import { getAppEnv } from "./env";

const globalForDb = globalThis as typeof globalThis & {
  __jurnapodApiDbPool?: Pool;
};

function normalizeDbCharset(collation: string | null): string | undefined {
  if (!collation) {
    return undefined;
  }

  const trimmed = collation.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const baseCharset = trimmed.split("_")[0];
  return baseCharset.length > 0 ? baseCharset : undefined;
}

export function getDbPool(): Pool {
  if (globalForDb.__jurnapodApiDbPool) {
    return globalForDb.__jurnapodApiDbPool;
  }

  const env = getAppEnv();
  const pool = mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    charset: normalizeDbCharset(env.db.collation),
    waitForConnections: true,
    connectionLimit: env.db.connectionLimit,
    queueLimit: 0
  });

  globalForDb.__jurnapodApiDbPool = pool;
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (globalForDb.__jurnapodApiDbPool) {
    await globalForDb.__jurnapodApiDbPool.end();
    globalForDb.__jurnapodApiDbPool = undefined;
  }
}
