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
// AuthDbConnection wrapper for DbConn
// ---------------------------------------------------------------------------

import type { AuthDbConnection } from '../types.js';

/**
 * Creates an AuthDbConnection wrapper around a DbConn instance.
 * This maps beginTransaction() → begin() since DbConn uses begin().
 */
export function createAuthDbConnection(db: DbConn): AuthDbConnection {
  return {
    queryAll<T>(sql: string, params: unknown[]): Promise<T[]> {
      return db.queryAll<T>(sql, params);
    },
    execute(sql: string, params: unknown[]) {
      return db.execute(sql, params);
    },
    async beginTransaction(): Promise<void> {
      await db.beginTransaction();
    },
    async commit(): Promise<void> {
      await db.commit();
    },
    async rollback(): Promise<void> {
      await db.rollback();
    },
    async release(): Promise<void> {
      // DbConn manages its own connection pool, release is no-op for transaction connections
      // The connection is released in commit()/rollback()
    },
  };
}

// ---------------------------------------------------------------------------
// Main Adapter Factory
// ---------------------------------------------------------------------------

export function createRealDbAdapter(): AuthDbAdapter {
  const db = getTestDb();

  return {
    async queryAll<T>(sql: string, params: unknown[]): Promise<T[]> {
      return db.queryAll<T>(sql, params);
    },

    async execute(sql: string, params: unknown[]) {
      const result = await db.execute(sql, params);
      return {
        insertId: result.insertId,
        affectedRows: result.affectedRows,
      };
    },

    async transaction<T>(fn: (adapter: AuthDbAdapter) => Promise<T>): Promise<T> {
      await db.beginTransaction();

      const txAdapter: AuthDbAdapter = {
        queryAll: async (sql: string, params: unknown[]) => db.queryAll(sql, params),
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
