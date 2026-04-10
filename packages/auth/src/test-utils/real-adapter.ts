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
      // Caller already owns a transaction scope.
      if (testDb.isTransaction) {
        const txAdapter: AuthDbAdapter = {
          db: testDb as Kysely<any>,
          transaction: async (innerFn) => innerFn(txAdapter),
        };
        return fn(txAdapter);
      }

      const maxAttempts = 5;
      const initialDelayMs = 100;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await testDb.transaction().execute(async (trx) => {
            const txAdapter: AuthDbAdapter = {
              db: trx as Kysely<any>,
              transaction: async (innerFn) => innerFn(txAdapter),
            };
            return await fn(txAdapter);
          });
        } catch (error) {
          if (attempt < maxAttempts - 1 && isDeadlockError(error)) {
            const delayMs = initialDelayMs * (2 ** attempt);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          throw error;
        }
      }

      // Unreachable in practice (loop either returns or throws), keeps TS happy.
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

const MYSQL_DEADLOCK_CODE = 'ER_LOCK_DEADLOCK';
const MYSQL_DEADLOCK_ERRNO = 1213;

function isDeadlockError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);

    const err = current as {
      code?: unknown;
      errno?: unknown;
      message?: unknown;
      cause?: unknown;
      originalError?: unknown;
    };

    if (typeof err.code === 'string' && err.code === MYSQL_DEADLOCK_CODE) return true;
    if (typeof err.errno === 'number' && err.errno === MYSQL_DEADLOCK_ERRNO) return true;
    if (typeof err.message === 'string' && err.message.toLowerCase().includes('deadlock found')) return true;

    if (err.cause !== undefined) {
      current = err.cause;
      continue;
    }
    if (err.originalError !== undefined) {
      current = err.originalError;
      continue;
    }

    break;
  }

  return false;
}
