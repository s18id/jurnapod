// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * GET /api/sync/pull/table-state
 * 
 * Thin wrapper route for pulling table state and incremental events.
 * All business logic is delegated to table-sync.ts service.
 * 
 * Story 12.6 - POS Sync for Table Operations (Scope G)
 */

import { z } from "zod";
import { ZodError } from "zod";
import { withAuth, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getRequestCorrelationId } from "@/lib/correlation-id";
import { getDbPool } from "@/lib/db";
import { pullTableState } from "@/lib/table-sync";
import {
  TableSyncPullResponseSchema,
  type TableSyncPullResponse,
} from "@jurnapod/shared";
import { SyncAuditService, type AuditDbClient } from "@jurnapod/modules-platform/sync";
import type { AuthContext } from "@/lib/auth-guard";

// ============================================================================
// QUERY VALIDATION SCHEMA
// ============================================================================

const QuerySchema = z.object({
  outlet_id: z.coerce.number().int().positive(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

// ============================================================================
// AUDIT SERVICE HELPER
// ============================================================================

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

// ============================================================================
// OUTLET ID RESOLVER FOR ACCESS CONTROL
// ============================================================================

function parseOutletIdFromQuery(request: Request): number {
  const url = new URL(request.url);
  const outletIdRaw = url.searchParams.get("outlet_id");
  if (!outletIdRaw) {
    return 0;
  }
  const outletId = Number(outletIdRaw);
  if (!Number.isSafeInteger(outletId) || outletId <= 0) {
    return 0;
  }
  return outletId;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export const GET = withAuth(
  async (request: Request, auth: AuthContext) => {
    const correlationId = getRequestCorrelationId(request);
    const startTime = Date.now();
    let eventId: bigint | undefined;
    let auditService: SyncAuditService | undefined;

    try {
      // Parse and validate query parameters
      const url = new URL(request.url);
      const query = QuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id"),
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
      });

      const dbPool = getDbPool();
      auditService = createSyncAuditService(dbPool);

      // Start audit event (fail-open)
      try {
        eventId = await auditService.startEvent({
          companyId: auth.companyId,
          outletId: query.outlet_id,
          operationType: "PULL",
          tierName: "default",
          status: "IN_PROGRESS",
          startedAt: new Date(),
        });
      } catch (auditError) {
        console.warn("GET /sync/pull/table-state audit start failed", {
          correlation_id: correlationId,
          error: auditError,
        });
        eventId = undefined;
      }

      // Call table-sync service to pull state
      const result = await pullTableState({
        companyId: auth.companyId,
        outletId: query.outlet_id,
        cursor: query.cursor,
        limit: query.limit,
      });

      // Transform service result to API response format
      const response: TableSyncPullResponse = {
        tables: result.tables.map((t) => ({
          table_id: t.tableId,
          table_number: t.tableNumber,
          status: t.status,
          current_session_id: t.currentSessionId,
          version: t.version,
          staleness_ms: t.stalenessMs,
        })),
        events: result.events.map((e) => ({
          id: e.id,
          table_id: e.tableId,
          event_type: e.eventType,
          payload: e.payload as Record<string, unknown>,
          recorded_at: e.recordedAt,
        })),
        next_cursor: result.nextCursor,
        has_more: result.hasMore,
        sync_timestamp: result.syncTimestamp,
      };

      // Validate response against schema before returning
      const validatedResponse = TableSyncPullResponseSchema.parse(response);

      // Complete audit event on success (fail-open)
      if (eventId !== undefined) {
        try {
          await auditService.completeEvent(eventId, {
            status: "SUCCESS",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            itemsCount: validatedResponse.tables.length + validatedResponse.events.length,
          });
        } catch (auditError) {
          console.warn("GET /sync/pull/table-state audit completion failed", {
            correlation_id: correlationId,
            error: auditError,
          });
        }
      }

      return successResponse(validatedResponse);
    } catch (error) {
      // Complete audit event on failure
      if (eventId !== undefined && auditService !== undefined) {
        try {
          const rawErrorMessage = error instanceof Error ? error.message : "Unknown error";
          const safeErrorMessage = rawErrorMessage.length > 240
            ? `${rawErrorMessage.slice(0, 237)}...`
            : rawErrorMessage;

          await auditService.completeEvent(eventId, {
            status: "FAILED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            errorCode: error instanceof Error ? error.name : "UNKNOWN",
            errorMessage: safeErrorMessage,
          });
        } catch (auditError) {
          console.warn("GET /sync/pull/table-state audit failure logging failed", {
            correlation_id: correlationId,
            error: auditError,
          });
        }
      }

      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("GET /sync/pull/table-state failed", {
        correlation_id: correlationId,
        error,
      });

      return errorResponse(
        "INTERNAL_SERVER_ERROR",
        error instanceof Error ? error.message : "Pull table state failed",
        500
      );
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request: Request) => parseOutletIdFromQuery(request),
    }),
  ]
);
