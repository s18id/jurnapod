// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * API-specific database connection singleton.
 * 
 * This module provides the database connection for the API application.
 * Uses Kysely from @jurnapod/db for type-safe queries.
 */

import { createKysely, getKysely, type KyselySchema } from '@jurnapod/db';

export type { KyselySchema };
import { getAppEnv } from './env';

const globalForDb = globalThis as typeof globalThis & {
  __jurnapodApiDbInstance?: KyselySchema;
};

/**
 * Get or create the singleton Kysely instance.
 * Uses getKysely() which returns a cached instance.
 */
export function getDb(): KyselySchema {
  if (globalForDb.__jurnapodApiDbInstance) {
    return globalForDb.__jurnapodApiDbInstance;
  }

  const env = getAppEnv();
  const db = createKysely({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    charset: env.db.collation ?? undefined,
    connectionLimit: env.db.connectionLimit ?? 10,
  });

  globalForDb.__jurnapodApiDbInstance = db;
  return db;
}

/**
 * @deprecated Use getDb() instead.
 * This function is kept for backward compatibility.
 */
export function getDbPool() {
  return getDb();
}

/**
 * Close the database connection pool.
 */
export async function closeDbPool(): Promise<void> {
  if (globalForDb.__jurnapodApiDbInstance) {
    await globalForDb.__jurnapodApiDbInstance.destroy();
    globalForDb.__jurnapodApiDbInstance = undefined;
  }
}
