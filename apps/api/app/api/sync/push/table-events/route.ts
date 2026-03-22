// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import {
  TableSyncPushRequestSchema,
  type TableSyncPushResponse,
  type TableSyncPushResult,
} from "@jurnapod/shared";
import { withAuth, requireAccess, type AuthContext } from "@/lib/auth-guard";
import { getRequestCorrelationId } from "@/lib/correlation-id";
import { successResponse, errorResponse } from "@/lib/response";
import { pushTableEvents } from "@/lib/table-sync";
import { getDbPool } from "@/lib/db";

/**
 * Parse outlet_id from request body for access guard
 * Note: This runs before the main handler to check outlet access
 */
async function parseOutletIdFromBody(request: Request): Promise<number> {
  try {
    const body = await request.clone().json();
    // outlet_id in the schema is coerced from string/number, while access guard needs a numeric ID
    // Parse here for outlet access check; full schema validation happens in the main handler
    const outletId = body?.outlet_id;
    if (typeof outletId === "string") {
      // Try to parse as number first
      const numericId = Number(outletId);
      if (Number.isSafeInteger(numericId) && numericId > 0) {
        return numericId;
      }
    }
    if (typeof outletId === "number") {
      return outletId;
    }
    throw new Error("Invalid outlet_id");
  } catch {
    return 0; // Return invalid ID which will cause access check to fail
  }
}

/**
 * Schema for validating the request body
 * Extends the shared schema with additional refinements if needed
 */
const TableSyncPushRequestBodySchema = TableSyncPushRequestSchema;

/**
 * Audit sync operation for observability
 * Logs to audit_logs table following the existing pattern
 */
async function auditTableSyncOperation(params: {
  correlationId: string;
  operation: string;
  companyId: string | number;
  outletId: string | number;
  actorId: string | number;
  payload: Record<string, unknown>;
  success?: boolean;
  error?: string;
  result?: Record<string, unknown>;
}): Promise<void> {
  const pool = getDbPool();
  
  try {
    const auditPayload = {
      correlation_id: params.correlationId,
      operation: params.operation,
      outlet_id: params.outletId,
      actor_id: params.actorId,
      payload: params.payload,
      success: params.success,
      error: params.error,
      result: params.result,
    };

    await pool.execute(
      `INSERT INTO audit_logs (
        company_id,
        outlet_id,
        user_id,
        action,
        result,
        success,
        ip_address,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        params.companyId,
        params.outletId,
        params.actorId,
        params.operation,
        params.success ? "SUCCESS" : params.error ? "FAIL" : "PENDING",
        params.success ? 1 : 0,
        JSON.stringify(auditPayload),
      ]
    );
  } catch (auditError) {
    // Fail silently - don't let audit failures break the sync
    console.error("Failed to audit table sync operation:", auditError);
  }
}

/**
 * POST handler for /api/sync/push/table-events
 * 
 * Thin wrapper around pushTableEvents service.
 * All business logic is in apps/api/src/lib/table-sync.ts
 * 
 * Request Body (TableSyncPushRequestSchema):
 *   - outlet_id: number (coerced from string/number input)
 *   - events: Array of push events with client_tx_id, table_id, expected_table_version, etc.
 * 
 * Response (TableSyncPushResponseSchema):
 *   - results: Array of per-event results (OK, DUPLICATE, ERROR, CONFLICT)
 *   - sync_timestamp: ISO string
 */
export const POST = withAuth(
  async (request: Request, auth: AuthContext) => {
    const correlationId = getRequestCorrelationId(request);
    const startTime = Date.now();

    try {
      // 1. Parse and validate request body
      const body = await request.json();
      const validatedBody = TableSyncPushRequestBodySchema.parse(body);

      // 2. Audit start
      await auditTableSyncOperation({
        correlationId,
        operation: "PUSH_TABLE_EVENTS",
        companyId: auth.companyId,
        outletId: validatedBody.outlet_id,
        actorId: auth.userId,
        payload: { eventCount: validatedBody.events.length },
      });

      // 3. Call service layer
      const serviceResult = await pushTableEvents({
        companyId: auth.companyId,
        outletId: validatedBody.outlet_id,
        events: validatedBody.events,
        actorId: auth.userId,
      });

      // 4. Transform service result to response format
      const responseResults: TableSyncPushResult[] = serviceResult.results.map(
        (result) => ({
          client_tx_id: result.clientTxId,
          status: result.status,
          table_version: result.tableVersion ?? null,
          conflict_payload: result.conflictPayload,
          errorMessage: result.errorMessage,
        })
      );

      // Check if any result is CONFLICT
      const hasConflict = responseResults.some(r => r.status === "CONFLICT");

      const response: TableSyncPushResponse = {
        results: responseResults,
        sync_timestamp: serviceResult.syncTimestamp,
      };

      // 5. Audit success
      const latencyMs = Date.now() - startTime;
      await auditTableSyncOperation({
        correlationId,
        operation: "PUSH_TABLE_EVENTS",
        companyId: auth.companyId,
        outletId: validatedBody.outlet_id,
        actorId: auth.userId,
        payload: { eventCount: validatedBody.events.length },
        success: true,
        result: {
          processedCount: responseResults.length,
          latencyMs,
          okCount: responseResults.filter((r) => r.status === "OK").length,
          duplicateCount: responseResults.filter((r) => r.status === "DUPLICATE").length,
          conflictCount: responseResults.filter((r) => r.status === "CONFLICT").length,
          errorCount: responseResults.filter((r) => r.status === "ERROR").length,
        },
      });

      // 6. Return response with appropriate status code
      if (hasConflict) {
        // Return 409 with full per-item results
        return Response.json(
          {
            success: false,
            error: {
              code: "CONFLICT",
              message: "Table state conflict detected",
            },
            details: responseResults,
          },
          {
            status: 409,
            headers: { "x-correlation-id": correlationId },
          }
        );
      }

      return successResponse(response, 200, {
        "x-correlation-id": correlationId,
      });
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        
        console.error("Table sync push validation error:", {
          correlation_id: correlationId,
          errors: error.errors,
        });

        return errorResponse("VALIDATION_ERROR", errorMessage, 400, {
          "x-correlation-id": correlationId,
        });
      }

      // Handle other errors
      const errorMessage = error instanceof Error ? error.message : "Push failed";
      
      console.error("Table sync push error:", {
        correlation_id: correlationId,
        error,
      });

      // Attempt to audit failure if we have enough context
      try {
        const body = await request.clone().json();
        const outletId = body?.outlet_id ?? "unknown";
        
        await auditTableSyncOperation({
          correlationId,
          operation: "PUSH_TABLE_EVENTS",
          companyId: auth.companyId,
          outletId,
          actorId: auth.userId,
          payload: { eventCount: body?.events?.length ?? 0 },
          success: false,
          error: errorMessage,
        });
      } catch {
        // Ignore audit failure in error handler
      }

      return errorResponse("PUSH_FAILED", errorMessage, 500, {
        "x-correlation-id": correlationId,
      });
    }
  },
  [
    // Require appropriate role and outlet access
    requireAccess({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
      outletId: (request) => parseOutletIdFromBody(request)
    }),
  ]
);
