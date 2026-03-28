// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * API-specific database pool singleton.
 * 
 * This module provides the database pool for the API application.
 * Pool creation logic lives in packages/db/pool.ts.
 */

import type { Pool, PoolConnection } from "mysql2/promise";
import { createDbPool, newKyselyConnection } from "@jurnapod/db";
import type { Kysely, DB } from "@jurnapod/db";
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

/**
 * Wraps a database callback with automatic connection management.
 * 
 * If a connection is provided, uses it directly without releasing it
 * (caller is responsible for connection lifecycle).
 * 
 * If no connection is provided, acquires one from the pool and
 * automatically releases it after the callback completes.
 * 
 * @param callback - Function receiving a Kysely instance
 * @param connection - Optional existing connection to use
 * @returns Result of the callback
 */
export async function withKysely<T>(
  callback: (db: Kysely<DB>) => Promise<T>,
  connection?: PoolConnection
): Promise<T> {
  let needsRelease = false;

  if (connection) {
    const db = newKyselyConnection(connection);
    return callback(db);
  }

  const conn = await getDbPool().getConnection();
  needsRelease = true;
  const db = newKyselyConnection(conn);

  try {
    return await callback(db);
  } finally {
    if (needsRelease) {
      await db.destroy();
    }
  }
}
