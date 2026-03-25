// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Helper to create a Kysely instance bound to a specific connection.
 * 
 * This is useful when you have an existing transaction connection
 * and need to provide a Kysely instance for the JurnapodDbClient interface.
 */

import type { PoolConnection } from 'mysql2/promise';
import type { Kysely } from 'kysely';
import { Kysely as KyselyClass, MysqlDialect } from 'kysely';
import type { DB } from './kysely/schema';

/**
 * Creates a minimal pool wrapper around a connection for Kysely.
 * This allows Kysely to use an existing transaction connection.
 */
function createConnectionPool(connection: PoolConnection) {
  return {
    async getConnection() {
      return connection;
    },
    async releaseConnection() {
      // No-op: connection lifecycle is managed by caller
    },
    async end() {
      // No-op: connection lifecycle is managed by caller
    }
  };
}

/**
 * Creates a Kysely instance bound to a specific connection.
 * 
 * @param connection - The mysql2 connection to use
 * @returns A Kysely instance bound to the connection
 * 
 * @example
 * ```typescript
 * const kysely = newKyselyConnection(connection);
 * const accounts = await kysely
 *   .selectFrom('accounts')
 *   .where('company_id', '=', companyId)
 *   .execute();
 * ```
 */
export function newKyselyConnection(connection: PoolConnection): Kysely<DB> {
  const poolWrapper = createConnectionPool(connection);
  return new KyselyClass<DB>({
    dialect: new MysqlDialect({
      pool: poolWrapper as any
    })
  });
}
