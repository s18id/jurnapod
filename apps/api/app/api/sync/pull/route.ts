// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  NumericIdSchema,
  SyncPullRequestQuerySchema,
  SyncPullPayloadSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { buildSyncPullPayload } from "../../../../src/lib/master-data";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { getRequestCorrelationId } from "../../../../src/lib/correlation-id";
import { getDbPool } from "../../../../src/lib/db";
import { SyncAuditService, type AuditDbClient } from "@jurnapod/modules-platform/sync";

// Helper to create audit service with proper DB client adapter
function createSyncAuditService(dbPool: ReturnType<typeof getDbPool>): SyncAuditService {
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

function parseOutletIdForGuard(request: Request): number {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  return NumericIdSchema.parse(outletIdRaw);
}

function getTierFromRequest(request: Request): string {
  const tier = request.headers.get("x-sync-tier");
  return tier ?? "default";
}

export const GET = withAuth(
  async (request, auth) => {
    const correlationId = getRequestCorrelationId(request);
    const startTime = Date.now();
    const tier = getTierFromRequest(request);
    let eventId: bigint | undefined;
    let auditService: SyncAuditService | undefined;

    try {
      const url = new URL(request.url);
      const input = SyncPullRequestQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id"),
        since_version: url.searchParams.get("since_version") ?? 0,
        orders_cursor: url.searchParams.get("orders_cursor") ?? undefined
      });

      const dbPool = getDbPool();
      auditService = createSyncAuditService(dbPool);

      // Start audit event
      eventId = await auditService.startEvent({
        companyId: auth.companyId,
        outletId: input.outlet_id,
        operationType: "PULL",
        tierName: tier,
        status: "IN_PROGRESS",
        startedAt: new Date()
      });

      const payload = await buildSyncPullPayload(
        auth.companyId,
        input.outlet_id,
        input.since_version,
        input.orders_cursor ?? 0
      );
      const response = SyncPullPayloadSchema.parse(payload);

      // Calculate items count from response
      const itemsCount =
        (response.items?.length ?? 0) +
        (response.tables?.length ?? 0) +
        (response.reservations?.length ?? 0);

      // Complete audit event on success
      await auditService.completeEvent(eventId, {
        status: "SUCCESS",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        itemsCount
      });

      return successResponse(response);
    } catch (error) {
      // Complete audit event on failure
      if (eventId !== undefined && auditService !== undefined) {
        await auditService.completeEvent(eventId, {
          status: "FAILED",
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorCode: error instanceof Error ? error.name : "UNKNOWN",
          errorMessage: error instanceof Error ? error.message : "Unknown error"
        });
      }

      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sync/pull failed", {
        correlation_id: correlationId,
        error
      });
      return errorResponse("INTERNAL_SERVER_ERROR", "Sync pull failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request) => parseOutletIdForGuard(request)
    })
  ]
);
