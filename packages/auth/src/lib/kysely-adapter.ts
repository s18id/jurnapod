import { Kysely, sql } from 'kysely';
import type { DB } from './db-types.js';
import type { AuthDbAdapter } from '../types.js';

/**
 * Kysely adapter wrapper implementing AuthDbAdapter for production use.
 * 
 * This adapter provides backward compatibility with SQL-based code by
 * executing raw SQL via Kysely's execute method. Modules should migrate
 * to use `this.adapter.db.selectFrom()` directly for type-safe queries.
 */
export class KyselyAdapter implements AuthDbAdapter {
  db: Kysely<DB>;

  constructor(db: Kysely<DB>) {
    this.db = db;
  }

  /**
   * Execute a SELECT query and return all rows.
   */
  async queryAll<T>(sqlStr: string, params: unknown[]): Promise<T[]> {
    // Use Kysely's execute with raw SQL
    // Build parameterized query using sql template tag
    const queryParts: (string | number | boolean | null)[] = [];
    let paramIndex = 0;
    
    const processedSql = sqlStr.replace(/\?/g, () => {
      const param = params[paramIndex++];
      if (param === null) return 'NULL';
      if (typeof param === 'number') return param.toString();
      if (typeof param === 'boolean') return param ? '1' : '0';
      return `'${String(param).replace(/'/g, "''")}'`;
    });
    
    const result = await sql`${processedSql}`.execute(this.db);
    return result.rows as T[];
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE statement.
   */
  async execute(sqlStr: string, params: unknown[]): Promise<{
    insertId?: number | bigint;
    affectedRows?: number;
  }> {
    // Process SQL with parameters
    let paramIndex = 0;
    const processedSql = sqlStr.replace(/\?/g, () => {
      const param = params[paramIndex++];
      if (param === null) return 'NULL';
      if (typeof param === 'number') return param.toString();
      if (typeof param === 'boolean') return param ? '1' : '0';
      return `'${String(param).replace(/'/g, "''")}'`;
    });
    
    const result = await sql`${processedSql}`.execute(this.db);
    
    // Extract insertId if available
    // MySQL returns insertId in the result
    const numAffectedRows = Array.isArray(result) 
      ? result.reduce((sum, r) => sum + (r.numAffectedRows || 0), 0)
      : (result.numAffectedRows || 0);
    
    // For INSERT, we need to get insertId - MySQL specific
    let insertId: number | bigint | undefined;
    if (Array.isArray(result) && result.length > 0) {
      insertId = (result[0] as any).insertId;
    } else if ('insertId' in result) {
      insertId = (result as any).insertId;
    }
    
    return {
      insertId,
      affectedRows: numAffectedRows
    };
  }

  /**
   * Execute a function within a database transaction.
   */
  async transaction<T>(fn: (adapter: AuthDbAdapter) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (trx) => {
      const txAdapter = new KyselyAdapter(trx as Kysely<DB>);
      return await fn(txAdapter);
    });
  }
}
