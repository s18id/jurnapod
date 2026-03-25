// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Base database client interface for Jurnapod.
 * 
 * All service-specific DbClient interfaces (AccountsDbClient, JournalsDbClient, etc.)
 * should extend this interface.
 * 
 * This provides a unified contract for:
 * - Raw SQL queries (backward compatibility)
 * - Type-safe Kysely queries (new)
 * - Optional transaction management
 */

import type { Kysely } from 'kysely';
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
 * The JurnapodMySQLDb class implements this interface.
 */
export interface JurnapodDbClient {
  /**
   * Execute a raw SQL query and return results.
   * 
   * @param sql - Parameterized SQL query
   * @param params - Query parameters
   * @returns Array of result rows
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  
  /**
   * Execute a raw SQL statement that modifies data.
   * 
   * @param sql - Parameterized SQL statement
   * @param params - Statement parameters
   * @returns Result with affectedRows and optional insertId
   */
  execute(sql: string, params?: any[]): Promise<SqlExecuteResult>;
  
  /**
   * Begin a transaction.
   * 
   * Note: Transaction support is optional - check availability
   * before using.
   */
  begin?(): Promise<void>;
  
  /**
   * Commit the current transaction.
   */
  commit?(): Promise<void>;
  
  /**
   * Rollback the current transaction.
   */
  rollback?(): Promise<void>;
  
  /**
   * Type-safe query builder for Kysely.
   * 
   * Note: For Kysely-specific transactions, prefer using
   * `db.kysely.startTransaction()` pattern for proper
   * transaction context.
   */
  readonly kysely: Kysely<DB>;
}
