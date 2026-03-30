/**
 * Kysely Adapter
 * 
 * Provides a simple raw SQL interface on top of Kysely with MySQL-style
 * ? placeholder support. Useful for:
 * - Ad-hoc queries without query builder overhead
 * - Porting legacy code that uses raw SQL
 * - Complex queries that are clearer as raw SQL
 * 
 * @example
 * ```typescript
 * import { createKysely, KyselyAdapter } from '@jurnapod/db';
 * 
 * const db = createKysely({ uri: 'mysql://...' });
 * const adapter = new KyselyAdapter(db);
 * 
 * // Simple query
 * const users = await adapter.queryAll<User>(
 *   'SELECT * FROM users WHERE company_id = ? AND is_active = ?',
 *   [companyId, true]
 * );
 * 
 * // Insert
 * const result = await adapter.execute(
 *   'INSERT INTO users (company_id, email, name) VALUES (?, ?, ?)',
 *   [companyId, 'test@example.com', 'Test User']
 * );
 * console.log('Insert ID:', result.insertId);
 * 
 * // Transaction
 * await adapter.transaction(async (tx) => {
 *   await tx.execute('INSERT INTO orders (...) VALUES (...)', [...]);
 *   await tx.execute('UPDATE inventory SET ...', [...]);
 * });
 * 
 * await db.destroy();
 * ```
 */

import { Kysely } from 'kysely';
import type { DB as DatabaseSchema } from '../kysely/schema.js';
import { buildQuery } from '../sql-helpers.js';

/**
 * Result of an INSERT/UPDATE/DELETE query
 */
export interface ExecuteResult {
  insertId?: number;
  affectedRows?: number;
}

/**
 * Transaction adapter passed to transaction callbacks
 */
export interface TransactionAdapter {
  queryAll<T>(sql: string, params: unknown[]): Promise<T[]>;
  execute(sql: string, params: unknown[]): Promise<ExecuteResult>;
}

/**
 * Kysely-backed adapter providing simple raw SQL interface.
 */
export class KyselyAdapter {
  /** Underlying Kysely instance for query builder operations */
  readonly db: Kysely<DatabaseSchema>;

  constructor(db: Kysely<DatabaseSchema>) {
    this.db = db;
  }

  /**
   * Execute a SELECT query and return all rows.
   */
  async queryAll<T>(sql: string, params: unknown[]): Promise<T[]> {
    const query = buildQuery(sql, params);
    const result = await query.execute(this.db);
    return result.rows as T[];
  }

  /**
   * Execute an INSERT/UPDATE/DELETE query.
   */
  async execute(sql: string, params: unknown[]): Promise<ExecuteResult> {
    const query = buildQuery(sql, params);
    const result = await query.execute(this.db);
    return {
      insertId: result.insertId !== undefined ? Number(result.insertId) : undefined,
      affectedRows: result.numAffectedRows !== undefined ? Number(result.numAffectedRows) : undefined
    };
  }

  /**
   * Execute a function within a database transaction.
   * The function receives a transaction-scoped adapter.
   * Automatically commits on success, rolls back on error.
   */
  async transaction<T>(fn: (adapter: TransactionAdapter) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (trx) => {
      const txAdapter: TransactionAdapter = {
        async queryAll<T>(sql: string, params: unknown[]): Promise<T[]> {
          const query = buildQuery(sql, params);
          const result = await query.execute(trx);
          return result.rows as T[];
        },

        async execute(sql: string, params: unknown[]): Promise<ExecuteResult> {
          const query = buildQuery(sql, params);
          const result = await query.execute(trx);
          return {
            insertId: result.insertId !== undefined ? Number(result.insertId) : undefined,
            affectedRows: result.numAffectedRows !== undefined ? Number(result.numAffectedRows) : undefined
          };
        }
      };

      return await fn(txAdapter);
    });
  }
}
