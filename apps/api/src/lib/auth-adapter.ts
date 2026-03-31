// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AuthDbAdapter implementation for the API.
 * 
 * Wraps the shared Kysely instance to satisfy AuthDbAdapter interface.
 */

import { getDb } from './db.js';
import type { AuthDbAdapter } from '@jurnapod/auth';
import type { Kysely } from 'kysely';

/**
 * Creates an AuthDbAdapter for use with @jurnapod/auth package.
 */
export function createAuthAdapter(): AuthDbAdapter {
  const db = getDb();

  return {
    db: db as Kysely<any>,

    async transaction<T>(fn: (trx: AuthDbAdapter) => Promise<T>): Promise<T> {
      return await db.transaction().execute(async (trx) => {
        const txAdapter: AuthDbAdapter = {
          db: trx as Kysely<any>,
          transaction: async (innerFn) => innerFn(txAdapter),
        };
        return await fn(txAdapter);
      });
    },
  };
}
