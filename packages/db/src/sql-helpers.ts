/**
 * SQL Helper Utilities
 * 
 * Provides utilities for working with SQL queries and Kysely.
 */

import { sql as kyselySql, type Sql } from 'kysely';

/**
 * Build a raw SQL query with parameter interpolation.
 * Translates MySQL-style ? placeholders to ${} for Kysely's sql template.
 * 
 * @param sqlStr - SQL string with ? placeholders
 * @param params - Array of parameter values
 * @returns Kysely Sql fragment
 * 
 * @example
 * ```typescript
 * const query = buildQuery(
 *   'SELECT * FROM users WHERE company_id = ? AND email = ?',
 *   [1, 'test@example.com']
 * );
 * const result = await query.execute(db);
 * ```
 */
export function buildQuery(sqlStr: string, params: unknown[]): ReturnType<typeof kyselySql> {
  const parts: (string | number | bigint | boolean | Date | Buffer | null)[] = [];
  let paramIndex = 0;
  let lastIndex = 0;
  
  for (let i = 0; i < sqlStr.length; i++) {
    if (sqlStr[i] === '?') {
      parts.push(sqlStr.slice(lastIndex, i));
      if (paramIndex < params.length) {
        parts.push(params[paramIndex] as string | number | bigint | boolean | Date | Buffer | null);
        paramIndex++;
      }
      lastIndex = i + 1;
    }
  }
  parts.push(sqlStr.slice(lastIndex));
  
  return kyselySql.join(parts as any);
}
