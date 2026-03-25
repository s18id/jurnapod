// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unified MySQL database client for Jurnapod.
 * 
 * This class implements JurnapodDbClient and provides:
 * - Raw SQL queries via mysql2 (backward compatibility)
 * - Type-safe Kysely queries (new)
 * - Transaction management
 * 
 * Use this single class for all database operations across all services.
 * 
 * @example
 * ```typescript
 * import { JurnapodMySQLDb } from '@jurnapod/db';
 * import { getDbPool } from '@/lib/db';
 * 
 * const pool = getDbPool();
 * const db = new JurnapodMySQLDb(pool);
 * 
 * // Raw SQL (backward compatible)
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

import type { Pool, PoolConnection } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Kysely } from 'kysely';
import { Kysely as KyselyClass, MysqlDialect } from 'kysely';
import type { DB } from './kysely/schema';
import type { JurnapodDbClient, SqlExecuteResult } from './jurnapod-client';

export class DbConn implements JurnapodDbClient {
  private connection: PoolConnection | null = null;
  private _kysely: Kysely<DB> | null = null;

  constructor(private readonly pool: Pool) {}

  /**
   * Returns a Kysely instance for type-safe queries.
   * 
   * Note: For Kysely-specific transactions, use `db.kysely.startTransaction()` pattern.
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
   * Execute a raw SQL query and return results.
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const executor = this.connection || this.pool;
    const [rows] = await executor.execute<RowDataPacket[]>(sql, params || []);
    return rows as T[];
  }

  /**
   * Execute a raw SQL statement that modifies data.
   */
  async execute(sql: string, params?: any[]): Promise<SqlExecuteResult> {
    const executor = this.connection || this.pool;
    const [result] = await executor.execute<ResultSetHeader>(sql, params || []);
    return {
      affectedRows: result.affectedRows,
      insertId: result.insertId
    };
  }

  /**
   * Begin a transaction.
   */
  async begin(): Promise<void> {
    if (this.connection) {
      throw new Error('Transaction already in progress');
    }
    this.connection = await this.pool.getConnection();
    await this.connection.beginTransaction();
  }

  /**
   * Commit the current transaction.
   */
  async commit(): Promise<void> {
    if (!this.connection) {
      throw new Error('No transaction in progress');
    }
    try {
      await this.connection.commit();
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
      await this.connection.rollback();
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }
}
