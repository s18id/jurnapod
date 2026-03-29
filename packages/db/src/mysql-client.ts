// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unified MySQL database client for Jurnapod.
 * 
 * This class provides:
 * - Raw SQL queries via mysql2 (backward compatibility)
 * - Type-safe Kysely queries (new)
 * - Transaction management
 * 
 * @example
 * ```typescript
 * import { DbConn } from '@jurnapod/db';
 * import { getDbPool } from '@/lib/db';
 * 
 * const pool = getDbPool();
 * const db = new DbConn(pool);
 * 
 * // Raw SQL
 * const rows = await db.query('SELECT * FROM accounts WHERE company_id = ?', [companyId]);
 * 
 * // Kysely (type-safe)
 * const accounts = await db.kysely
 *   .selectFrom('accounts')
 *   .where('company_id', '=', companyId)
 *   .select(['id', 'code', 'name'])
 *   .execute();
 * 
 * // Transactions
 * await db.begin();
 * try {
 *   await db.execute('INSERT INTO accounts ...', [...]);
 *   await db.commit();
 * } catch (error) {
 *   await db.rollback();
 * }
 * ```
 */

import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2';
import type { Kysely } from 'kysely';
import { Kysely as KyselyClass, MysqlDialect } from 'kysely';
import type { DB } from './kysely/schema';
import type { JurnapodDbClient, SqlExecuteResult } from './jurnapod-client';

type ConnectionCallback = (err: Error | null, connection: PoolConnection) => void;
type EndCallback = (err?: Error | null) => void;

type CallbackConnection = {
  query: (...args: unknown[]) => unknown;
  execute: (...args: unknown[]) => unknown;
  release: () => void;
};

type PromisePoolConnectionWithRaw = PoolConnection & {
  connection?: CallbackConnection;
};

/**
 * Creates a minimal pool wrapper around a connection for Kysely.
 * This allows Kysely to use an existing transaction connection.
 */
function createConnectionPool(connection: PoolConnection) {
  const rawConnection = (connection as PromisePoolConnectionWithRaw).connection;

  if (!rawConnection) {
    throw new Error('mysql2 promise connection missing underlying callback connection');
  }

  return {
    getConnection(callback?: ConnectionCallback): Promise<CallbackConnection> | void {
      if (callback) {
        callback(null, rawConnection as unknown as PoolConnection);
        return;
      }
      return Promise.resolve(rawConnection);
    },

    releaseConnection(_connection: PoolConnection): void {
      // No-op: connection lifecycle is managed by caller
    },

    end(callback?: EndCallback): Promise<void> | void {
      if (callback) {
        callback(null);
        return;
      }
      return Promise.resolve();
    },

    query(...args: Parameters<PoolConnection['query']>) {
      return rawConnection.query(...args);
    },

    execute(...args: Parameters<PoolConnection['execute']>) {
      return rawConnection.execute(...args);
    },

    release(): void {
      // No-op: connection lifecycle is managed by caller
    }
  };
}

/**
 * Creates a Kysely instance bound to a specific connection.
 * Use this when you have an existing transaction connection.
 */
export function newKyselyConnection(connection: PoolConnection): Kysely<DB> {
  const poolWrapper = createConnectionPool(connection);
  return new KyselyClass<DB>({
    dialect: new MysqlDialect({
      pool: poolWrapper as never
    })
  });
}

export class DbConn implements JurnapodDbClient {
  private connection: PoolConnection | null = null;
  private _kysely: Kysely<DB> | null = null;

  constructor(public readonly pool: Pool) {}

  /**
   * Returns a Kysely instance for type-safe queries.
   */
  get kysely(): Kysely<DB> {
    if (!this._kysely) {
      this._kysely = new KyselyClass<DB>({
        dialect: new MysqlDialect({
          pool: this.pool
        })
      });
    }
    return this._kysely;
  }

  /**
   * Get a raw connection from the pool for advanced use cases.
   */
  async getConnection(): Promise<PoolConnection> {
    return new Promise((resolve, reject) => {
      this.pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn!);
      });
    });
  }

  /**
   * Execute a raw SQL query and return results.
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, rows: RowDataPacket[]) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  /**
   * Execute a raw SQL query and return a single result or null.
   */
  async querySingle<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  /**
   * Execute a raw SQL statement that modifies data.
   */
  async execute(sql: string, params?: any[]): Promise<SqlExecuteResult> {
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, result: ResultSetHeader) => {
        if (err) reject(err);
        else resolve({ affectedRows: result.affectedRows, insertId: result.insertId });
      });
    });
  }

  /**
   * Begin a transaction.
   */
  async begin(): Promise<void> {
    if (this.connection) {
      throw new Error('Transaction already in progress');
    }
    this.connection = await this.getConnection();
    await new Promise<void>((resolve, reject) => {
      this.connection!.beginTransaction((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Commit the current transaction.
   */
  async commit(): Promise<void> {
    if (!this.connection) {
      throw new Error('No transaction in progress');
    }
    try {
      await new Promise<void>((resolve, reject) => {
        this.connection!.commit((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }

  /**
   * Rollback the current transaction.
   */
  async rollback(): Promise<void> {
    if (!this.connection) {
      throw new Error('No transaction in progress');
    }
    try {
      await new Promise<void>((resolve, reject) => {
        this.connection!.rollback((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }

  /**
   * Start a transaction and return a Kysely instance for type-safe queries within it.
   */
  startTransaction() {
    return this.kysely.startTransaction();
  }

  /**
   * Execute a single query within a transaction.
   * Automatically begins transaction, executes the query, and commits.
   * Rolls back on error.
   */
  async withTransaction<T>(sql: string, params?: any[]): Promise<T> {
    const conn = await this.getConnection();
    try {
      await new Promise<void>((resolve, reject) => {
        conn.beginTransaction((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      const result = await new Promise<T>((resolve, reject) => {
        conn.query(sql, params, (err: Error | null, rows: unknown) => {
          if (err) reject(err);
          else resolve(rows as T);
        });
      });
      await new Promise<void>((resolve, reject) => {
        conn.commit((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return result;
    } catch (error) {
      await new Promise<void>((resolve) => {
        conn.rollback(() => resolve());
      });
      throw error;
    } finally {
      conn.release();
    }
  }
}