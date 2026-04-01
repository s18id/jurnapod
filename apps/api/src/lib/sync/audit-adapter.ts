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
import { sql } from "kysely";
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
    const kyselyDb = db as KyselySchema;

    const toRawQuery = (sqlText: string, params: unknown[] = []) => {
      if (params.length === 0) {
        return sql.raw(sqlText);
      }

      let built = sql``;
      let cursor = 0;

      for (let i = 0; i < params.length; i += 1) {
        const qIndex = sqlText.indexOf("?", cursor);
        if (qIndex === -1) {
          break;
        }
        const segment = sqlText.slice(cursor, qIndex);
        built = sql`${built}${sql.raw(segment)}${params[i]}`;
        cursor = qIndex + 1;
      }

      const tail = sqlText.slice(cursor);
      built = sql`${built}${sql.raw(tail)}`;
      return built;
    };

    const client: AuditDbClient = {
      query: async <T = unknown>(queryText: string, params?: unknown[]): Promise<T[]> => {
        const result = await toRawQuery(queryText, params ?? []).execute(kyselyDb);
        return result.rows as T[];
      },
      execute: async (
        queryText: string,
        params?: unknown[]
      ): Promise<{ affectedRows: number; insertId?: number }> => {
        const result = await toRawQuery(queryText, params ?? []).execute(kyselyDb) as {
          numAffectedRows?: bigint | number;
          insertId?: bigint | number;
        };

        const affectedRows = Number(result.numAffectedRows ?? 0);
        const insertId =
          result.insertId == null ? undefined : Number(result.insertId);

        return { affectedRows, insertId };
      },
    };

    return new SyncAuditService(client);
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
