// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Base database client interface for Jurnapod.
 * 
 * All service-specific DbClient interfaces should extend this interface.
 * The DbConn class implements this interface.
 * 
 * @example
 * ```typescript
 * import { DbConn } from '@jurnapod/db';
 * import { getDbPool } from '@/lib/db';
 * 
 * const pool = getDbPool();
 * const db = new DbConn(pool);
 * 
 * // Raw SQL queries
 * const rows = await db.query('SELECT * FROM accounts WHERE company_id = ?', [companyId]);
 * const result = await db.execute('INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)', [companyId, code, name]);
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
 * 
 * // Single query transaction
 * const rows = await db.withTransaction('SELECT * FROM accounts WHERE id = ?', [id]);
 * ```
 */

import type { Kysely, ControlledTransactionBuilder } from 'kysely';
import type { DB } from './kysely/schema';

/**
 * Result of executing a raw SQL statement that modifies data
 */
export interface SqlExecuteResult {
  affectedRows: number;
  insertId?: number;
}

/**
 * Base database client interface.
 * 
 * All DbClient interfaces in modules should extend this.
 */
export interface JurnapodDbClient {
  /**
   * Execute a raw SQL query and return results.
   * 
   * @param sql - Parameterized SQL query (SELECT)
   * @param params - Query parameters
   * @returns Array of result rows
   * 
   * @example
   * ```typescript
   * const rows = await db.query<RowDataPacket>(
   *   'SELECT * FROM accounts WHERE company_id = ?',
   *   [companyId]
   * );
   * ```
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  
  /**
   * Execute a raw SQL statement that modifies data.
   * 
   * @param sql - Parameterized SQL statement (INSERT/UPDATE/DELETE)
   * @param params - Statement parameters
   * @returns Result with affectedRows and optional insertId
   * 
   * @example
   * ```typescript
   * const result = await db.execute(
   *   'INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)',
   *   [companyId, code, name]
   * );
   * console.log(result.insertId);
   * ```
   */
  execute(sql: string, params?: any[]): Promise<SqlExecuteResult>;
  
  /**
   * Begin a transaction.
   * 
   * @example
   * ```typescript
   * await db.begin();
   * try {
   *   await db.execute('INSERT INTO ...', [...]);
   *   await db.commit();
   * } catch (error) {
   *   await db.rollback();
   * }
   * ```
   */
  begin(): Promise<void>;
  
  /**
   * Commit the current transaction.
   */
  commit(): Promise<void>;
  
  /**
   * Rollback the current transaction.
   */
  rollback(): Promise<void>;
  
  /**
   * Type-safe query builder for Kysely.
   * 
   * @example
   * ```typescript
   * const accounts = await db.kysely
   *   .selectFrom('accounts')
   *   .where('company_id', '=', companyId)
   *   .selectAll()
   *   .execute();
   * ```
   */
  readonly kysely: Kysely<DB>;

  /**
   * Get a raw connection from the pool for advanced use cases.
   * 
   * Note: If you use this connection for transactions, you must
   * manually manage begin/commit/rollback and release the connection.
   */
  getConnection(): Promise<any>;

  /**
   * Start a transaction and return a Kysely transaction for type-safe queries within it.
   * 
   * @example
   * ```typescript
   * const trx = await db.startTransaction().execute();
   * try {
   *   await trx.insertInto('accounts').values({ ... }).execute();
   *   await trx.commit().execute();
   * } catch (error) {
   *   await trx.rollback().execute();
   * }
   * ```
   */
  startTransaction(): ControlledTransactionBuilder<DB>;

  /**
   * Execute a single query within a transaction.
   * Automatically begins transaction, executes the query, and commits.
   * Rolls back on error.
   * 
   * @param sql - Parameterized SQL query
   * @param params - Query parameters
   * @returns Result rows
   * 
   * @example
   * ```typescript
   * const rows = await db.withTransaction(
   *   'SELECT * FROM accounts WHERE id = ? FOR UPDATE',
   *   [id]
   * );
   * ```
   */
  withTransaction<T>(sql: string, params?: any[]): Promise<T>;
}
