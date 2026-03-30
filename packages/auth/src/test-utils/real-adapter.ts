/**
 * Real database adapter for integration tests.
 * 
 * Provides an AuthDbAdapter implementation using Kysely
 * for real database integration testing.
 */

import { getKysely, type KyselySchema } from '@jurnapod/db';
import type { Kysely } from 'kysely';

import { dbConfig } from './db-config.js';
import type { AuthDbAdapter } from '../types.js';

// ---------------------------------------------------------------------------
// Singleton Kysely Instance
// ---------------------------------------------------------------------------

let db: KyselySchema | null = null;

export function getTestDb(): KyselySchema {
  if (!db) {
    db = getKysely({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      connectionLimit: dbConfig.connectionLimit,
    });
  }
  return db;
}

// ---------------------------------------------------------------------------
// Cleanup Function
// ---------------------------------------------------------------------------

export async function closeTestDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}

// Alias for compatibility with existing integration tests
export { closeTestDb as closeTestPool };

// ---------------------------------------------------------------------------
// Main Adapter Factory
// ---------------------------------------------------------------------------

export function createRealDbAdapter(): AuthDbAdapter {
  const testDb = getTestDb();

  return {
    db: testDb,

    async transaction<T>(fn: (adapter: AuthDbAdapter) => Promise<T>): Promise<T> {
      return await testDb.transaction().execute(async (trx) => {
        const txAdapter: AuthDbAdapter = {
          db: trx as Kysely<any>,
          transaction: async (innerFn) => innerFn(txAdapter),
        };
        return await fn(txAdapter);
      });
    },
  };
}
