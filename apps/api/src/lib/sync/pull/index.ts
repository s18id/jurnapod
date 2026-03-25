// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Pull Orchestrator
 * 
 * Coordinates sync pull business logic modules.
 * This module has zero HTTP knowledge - it accepts plain params and returns typed results.
 */

import type { PoolConnection } from "mysql2/promise";
import type {
  OrchestrateSyncPullParams,
  OrchestrateSyncPullResult
} from "./types.js";
import { buildSyncPullPayload } from "../master-data.js";
import type { SyncAuditService, AuditDbClient } from "@jurnapod/modules-platform/sync";

// Re-export types
export type { OrchestrateSyncPullParams, OrchestrateSyncPullResult } from "./types.js";

/**
 * Orchestrate sync pull processing
 * 
 * This function coordinates the building of sync pull payloads.
 * 
 * @param params - Orchestration parameters including company, outlet, and version info
 * @param dbPool - Database connection pool for audit service
 * @param auditService - Optional audit service for event tracking
 * @returns Combined results including payload and metadata
 */
export async function orchestrateSyncPull(
  params: OrchestrateSyncPullParams,
  dbPool: PoolConnection,
  auditService?: SyncAuditService
): Promise<OrchestrateSyncPullResult> {
  const { companyId, outletId, sinceVersion, ordersCursor, tier } = params;
  const startTime = Date.now();

  let auditEventId: bigint | undefined;

  try {
    // Start audit event if service provided
    if (auditService) {
      auditEventId = await auditService.startEvent({
        companyId,
        outletId,
        operationType: "PULL",
        tierName: tier ?? "default",
        status: "IN_PROGRESS",
        startedAt: new Date()
      });
    }

    // Build sync payload via master-data lib
    const payload = await buildSyncPullPayload(
      companyId,
      outletId,
      sinceVersion,
      ordersCursor
    );

    // Calculate items count
    const itemsCount =
      (payload.items?.length ?? 0) +
      (payload.tables?.length ?? 0) +
      (payload.reservations?.length ?? 0);

    // Complete audit event on success
    if (auditService && auditEventId !== undefined) {
      await auditService.completeEvent(auditEventId, {
        status: "SUCCESS",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        itemsCount
      });
    }

    return {
      payload,
      itemsCount
    };
  } catch (error) {
    // Complete audit event on failure
    if (auditService && auditEventId !== undefined) {
      await auditService.completeEvent(auditEventId, {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorCode: error instanceof Error ? error.name : "UNKNOWN",
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
    }

    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbPool = any;

/**
 * Create audit service for sync pull operations
 */
export function createSyncAuditService(dbPool: DbPool): SyncAuditService {
  const { SyncAuditService } = require("@jurnapod/modules-platform/sync");
  
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
