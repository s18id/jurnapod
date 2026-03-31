// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Audit Adapter
 *
 * Bridges mysql2 Pool interface to AuditDbClient interface required by
 * @jurnapod/modules-platform/sync SyncAuditService.
 *
 * This eliminates code duplication between routes/sync/pull.ts and
 * lib/sync/pull/index.ts.
 */

import type { Pool } from "mysql2/promise";
import { SyncAuditService, type AuditDbClient } from "@jurnapod/modules-platform/sync";
import type { KyselySchema } from "@/lib/db";

/**
 * Create a SyncAuditService instance from a mysql2 Pool or KyselySchema.
 *
 * The adapter wraps mysql2's query/execute methods to match the
 * AuditDbClient interface expected by SyncAuditService when passed a Pool.
 * If passed a KyselySchema directly, it is used as-is since AuditDbClient
 * extends KyselySchema.
 *
 * @param db - mysql2 connection pool or KyselySchema instance
 * @returns Configured SyncAuditService instance
 */
export function createSyncAuditService(db: Pool | KyselySchema): SyncAuditService {
  // Check if it's a KyselySchema (has selectFrom method)
  if (typeof (db as KyselySchema).selectFrom === "function") {
    return new SyncAuditService(db as unknown as AuditDbClient);
  }

  // Otherwise wrap mysql2 Pool
  const dbPool = db as Pool;
  const client: AuditDbClient = {
    query: async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
      const [rows] = await dbPool.query(sql, params as (string | number | Date | null)[]);
      return rows as T[];
    },
    execute: async (sql: string, params?: unknown[]) => {
      const [result] = await dbPool.execute(sql, params as (string | number | Date | null)[]);
      return {
        affectedRows: (result as { affectedRows: number }).affectedRows,
        insertId: (result as { insertId?: number }).insertId,
      };
    },
    getConnection: async () => {
      const conn = await dbPool.getConnection();
      return {
        beginTransaction: () => conn.beginTransaction(),
        commit: () => conn.commit(),
        rollback: () => conn.rollback(),
        execute: async (sql: string, params?: unknown[]) => {
          const [result] = await conn.execute(sql, params as (string | number | Date | null)[]);
          return {
            affectedRows: (result as { affectedRows: number }).affectedRows,
            insertId: (result as { insertId?: number }).insertId,
          };
        },
        release: () => conn.release(),
      };
    },
  };
  return new SyncAuditService(client);
}