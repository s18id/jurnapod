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
import { createSyncAuditService } from "../audit-adapter.js";
import type { SyncAuditService } from "@jurnapod/modules-platform/sync";

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


