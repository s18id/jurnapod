// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * API-specific database pool singleton.
 * 
 * This module provides the database pool for the API application.
 * Pool creation logic lives in packages/db/pool.ts.
 */

import type { Pool } from "mysql2/promise";
import { createDbPool } from "@jurnapod/db";
import { getAppEnv } from "./env";

const globalForDb = globalThis as typeof globalThis & {
  __jurnapodApiDbPool?: Pool;
};

export function getDbPool(): Pool {
  if (globalForDb.__jurnapodApiDbPool) {
    return globalForDb.__jurnapodApiDbPool;
  }

  const env = getAppEnv();
  const pool = createDbPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    charset: env.db.collation ?? undefined,
    connectionLimit: env.db.connectionLimit,
    dateStrings: true
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
