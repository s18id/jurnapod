/**
 * Real database adapter for integration tests.
 * 
 * Provides an AuthDbAdapter implementation using @jurnapod/db (DbConn)
 * for real database integration testing.
 */

import { createDbPool, DbConn } from '@jurnapod/db';
import type { Pool } from 'mysql2';

import { dbConfig } from './db-config.js';
import type { AuthDbAdapter } from '../types.js';

// ---------------------------------------------------------------------------
// Singleton Pool Pattern
// ---------------------------------------------------------------------------

let pool: Pool | null = null;

export function getTestPool(): Pool {
  if (!pool) {
    pool = createDbPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      connectionLimit: dbConfig.connectionLimit,
      dateStrings: true,
    });
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Singleton DbConn
// ---------------------------------------------------------------------------

let connection: DbConn | null = null;

export function getTestDb(): DbConn {
  if (!connection) {
    connection = new DbConn(getTestPool());
  }
  return connection;
}

// ---------------------------------------------------------------------------
// Cleanup Function
// ---------------------------------------------------------------------------

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await new Promise<void>((resolve, reject) => {
      pool!.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    pool = null;
    connection = null;
  }
}

// ---------------------------------------------------------------------------
// Main Adapter Factory
// ---------------------------------------------------------------------------

export function createRealDbAdapter(): AuthDbAdapter {
  const db = getTestDb();

  return {
    async query<T>(sql: string, params: unknown[]): Promise<T[]> {
      return db.query<T>(sql, params);
    },

    async execute(sql: string, params: unknown[]) {
      const result = await db.execute(sql, params);
      return {
        insertId: result.insertId,
        affectedRows: result.affectedRows,
      };
    },

    async transaction<T>(fn: (adapter: AuthDbAdapter) => Promise<T>): Promise<T> {
      await db.begin();

      const txAdapter: AuthDbAdapter = {
        query: async (sql, params) => db.query(sql, params),
        execute: async (sql, params) => {
          const result = await db.execute(sql, params);
          return { insertId: result.insertId, affectedRows: result.affectedRows };
        },
        transaction: async (innerFn) => innerFn(txAdapter),
      };

      try {
        const result = await fn(txAdapter);
        await db.commit();
        return result;
      } catch (error) {
        await db.rollback();
        throw error;
      }
    },
  };
}
