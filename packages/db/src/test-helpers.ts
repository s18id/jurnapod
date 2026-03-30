// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test helpers for @jurnapod/db package.
 * 
 * Provides utilities for creating test database connections
 * using environment variables from the repo root .env file.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKysely, KyselySchema } from './kysely/index.js';
import type { Kysely } from 'kysely';
import type { DB } from './kysely/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

/**
 * Load environment variables from repo root .env file.
 */
export async function loadTestEnv(): Promise<void> {
  // Use dynamic import for ESM compatibility
  const envPath = path.join(repoRoot, '.env');
  const { config } = await import('dotenv');
  config({ path: envPath });
}

/**
 * Get test database configuration from environment variables.
 */
function getTestDbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jurnapod'
  };
}

/**
 * Create a Kysely instance for testing.
 * Uses DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME from .env.
 */
export function getTestKysely(): KyselySchema {
  const config = getTestDbConfig();
  return createKysely({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 5
  });
}

/**
 * Close a test Kysely instance (and its internal pool).
 */
export async function closeTestKysely(db: KyselySchema): Promise<void> {
  await db.destroy();
}

/**
 * Execute a callback within a test transaction.
 * Automatically rolls back after the callback completes.
 * 
 * @param db - The Kysely instance
 * @param callback - Function to execute within the transaction
 * @returns The result of the callback
 */
export async function withTestTransaction<T>(
  db: KyselySchema,
  callback: (trx: import('kysely').Transaction<DB>) => Promise<T>
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    try {
      return await callback(trx);
    } catch (error) {
      // Transaction automatically rolls back on error
      throw error;
    }
  });
}
