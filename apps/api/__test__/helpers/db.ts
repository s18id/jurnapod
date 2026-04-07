// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test Database Utilities
 * 
 * Provides database access and cleanup utilities for integration tests.
 * Uses the same getDb() from lib/db.ts as the application.
 * 
 * IMPORTANT: All integration tests using DB must call closeDbPool() 
 * in test.after() to prevent connection pool leaks.
 * 
 * Usage:
 * ```typescript
 * import { getTestDb, closeTestDb } from './helpers/db';
 * import { acquireReadLock, releaseReadLock } from './setup';
 * 
 * beforeAll(async () => {
 *   await acquireReadLock();  // Ensures server/DB is ready
 * });
 * 
 * afterAll(async () => {
 *   await closeTestDb();
 *   await releaseReadLock();
 * });
 * 
 * it('queries DB', async () => {
 *   const db = getTestDb();
 *   const result = await db.selectFrom('companies').selectAll().execute();
 *   expect(result.length).toBeGreaterThan(0);
 * });
 * ```
 */

import { getDb, closeDbPool, type KyselySchema } from '../../src/lib/db';
import { sql } from 'kysely';

/**
 * Get the test database instance.
 * The DB connection is managed via getDb() which uses environment variables.
 */
export function getTestDb(): KyselySchema {
  return getDb();
}

/**
 * Close the test database connection pool.
 * MUST be called in test.after() or afterAll() to prevent connection leaks.
 */
export async function closeTestDb(): Promise<void> {
  await closeDbPool();
}

/**
 * Execute a raw SQL query for testing purposes.
 * Helper for quick DB checks without importing Kysely directly.
 */
export async function testQuery<T>(query: ReturnType<typeof sql>, params?: any[]): Promise<T[]> {
  const db = getTestDb();
  const result = await query.execute(db);
  return result.rows as T[];
}
