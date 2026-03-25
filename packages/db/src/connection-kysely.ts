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
 * 
 * IMPORTANT: Kysely's MysqlDriver calls pool.getConnection(callback) with a callback,
 * NOT the Promise form. We must support BOTH:
 *   - pool.getConnection() → Promise<Connection>   (Promise API)
 *   - pool.getConnection((err, conn) => {})      (Callback API)
 * 
 * Our wrapper must invoke the callback if provided, otherwise return a Promise.
 */
function createConnectionPool(connection: PoolConnection) {
  const rawConnection = (connection as PromisePoolConnectionWithRaw).connection;

  if (!rawConnection) {
    throw new Error('mysql2 promise connection missing underlying callback connection');
  }

  return {
    /**
     * Supports both callback and Promise forms of getConnection.
     * Kysely uses the callback form internally.
     */
    getConnection(callback?: ConnectionCallback): Promise<CallbackConnection> | void {
      if (callback) {
        callback(null, rawConnection as unknown as PoolConnection);
        return;
      }

      return Promise.resolve(rawConnection);
    },

    /**
     * Release the connection back to the pool.
     * No-op since lifecycle is managed by caller.
     */
    releaseConnection(_connection: PoolConnection): void {
      // No-op: connection lifecycle is managed by caller
    },

    /**
     * End the pool.
     * No-op: connection lifecycle is managed by caller
     */
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
      pool: poolWrapper as never
    })
  });
}
