// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Route
 *
 * Thin HTTP layer for POST /sync/push.
 * Phase 1 + Phase 2 (persistence, stock deduction, COGS posting):
 *   handled by PosSyncModule.handlePushSync() — phase2 is now inline in pos-sync
 */

import { Hono } from "hono";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { SyncPushRequestSchema } from "@jurnapod/shared";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { SyncIdempotencyMetricsCollector, syncIdempotencyMetricsCollector } from "@jurnapod/sync-core";
import { getSyncPushDbPool } from "../../lib/sync/push/db.js";
import type { SyncPushTransactionPayload } from "../../lib/sync/push/types.js";
import { getPosSyncModuleAsync } from "../../lib/sync-modules.js";
import { toTransactionPush, toActiveOrderPush } from "../../lib/sync/push/adapters.js";
import type {
  OrderUpdatePush,
  ItemCancellationPush,
  VariantSalePush,
  VariantStockAdjustmentPush
} from "@jurnapod/pos-sync";
import { outboxMetrics, syncMetrics, type OutboxFailureReason } from "../../lib/metrics/index.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const syncPushRoutes = new Hono();

syncPushRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }

  c.set("auth", authResult.auth);
  await next();
});

syncPushRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const correlationId = getRequestCorrelationId(c.req.raw);
  const dbPool = getSyncPushDbPool();
  const metricsCollector = new SyncIdempotencyMetricsCollector();
  const pushStartTime = Date.now();
  let outlet_id: number = 0;

  console.info("POST /sync/push started", {
    correlation_id: correlationId,
    company_id: auth.companyId,
    user_id: auth.userId
  });

  try {
    const body = await c.req.json();
    const validationResult = SyncPushRequestSchema.safeParse(body);

    if (!validationResult.success) {
      console.warn("POST /sync/push validation failed", {
        correlation_id: correlationId,
        company_id: auth.companyId,
        errors: validationResult.error.errors
      });
      return errorResponse("VALIDATION_ERROR", "Invalid request payload", 400);
    }

    const { outlet_id, transactions, active_orders, order_updates, item_cancellations, variant_sales, variant_stock_adjustments } = validationResult.data;

    const outletAccessGuard = requireAccess({
      roles: ["OWNER", "ADMIN", "CASHIER"],
      module: "pos",
      resource: "transactions",
      permission: "create",
      outletId: outlet_id
    });

    const outletAccessResult = await outletAccessGuard(c.req.raw, auth);
    if (outletAccessResult) {
      return outletAccessResult;
    }

    const hasActiveOrders = Boolean(active_orders && active_orders.length > 0);
    const hasOrderUpdates = Boolean(order_updates && order_updates.length > 0);
    const hasItemCancellations = Boolean(item_cancellations && item_cancellations.length > 0);
    const hasVariantSales = Boolean(variant_sales && variant_sales.length > 0);
    const hasVariantStockAdjustments = Boolean(variant_stock_adjustments && variant_stock_adjustments.length > 0);

    if (transactions.length === 0 && !hasActiveOrders && !hasOrderUpdates && !hasItemCancellations && !hasVariantSales && !hasVariantStockAdjustments) {
      return successResponse({ results: [] });
    }

    const db = dbPool;

    // Phase 1 + Phase 2: Use PosSyncModule — phase2 is now handled inline in pos-sync
    const module = await getPosSyncModuleAsync();

    const phase1Results = await module.handlePushSync({
      db: db,
      companyId: auth.companyId,
      outletId: outlet_id,
      transactions: (transactions as SyncPushTransactionPayload[]).map(toTransactionPush),
      activeOrders: (active_orders ?? []).map(toActiveOrderPush),
      orderUpdates: (order_updates ?? []) as OrderUpdatePush[],
      itemCancellations: (item_cancellations ?? []) as ItemCancellationPush[],
      variantSales: (variant_sales ?? []) as VariantSalePush[],
      variantStockAdjustments: (variant_stock_adjustments ?? []) as VariantStockAdjustmentPush[],
      correlationId,
      metricsCollector
    });

    const responsePayload = {
      results: phase1Results.results,
      ...(phase1Results.orderUpdateResults.length > 0 && { order_update_results: phase1Results.orderUpdateResults }),
      ...(phase1Results.itemCancellationResults.length > 0 && { item_cancellation_results: phase1Results.itemCancellationResults }),
      ...(phase1Results.variantSaleResults && phase1Results.variantSaleResults.length > 0 && { variant_sale_results: phase1Results.variantSaleResults }),
      ...(phase1Results.variantStockAdjustmentResults && phase1Results.variantStockAdjustmentResults.length > 0 && { variant_stock_adjustment_results: phase1Results.variantStockAdjustmentResults })
    };

    // Record outbox health metrics (Story 30.2 & 30.7 - tenant-isolated)
    const duplicateCount = phase1Results.results.filter((r) => r.result === "DUPLICATE").length;
    const errorResults = phase1Results.results.filter((r) => r.result === "ERROR");
    
    // Record duplicates with company_id for tenant isolation (Story 30.7)
    if (duplicateCount > 0) {
      outboxMetrics.recordDuplicate(auth.companyId, outlet_id);
    }
    
    // Record failures with reason classification - tenant-isolated (Story 30.7)
    for (const errorResult of errorResults) {
      const reason = classifySyncErrorReason(errorResult.message);
      outboxMetrics.recordFailure(auth.companyId, outlet_id, reason);
    }

    // Record sync outcome metrics (Story 52-9) — tenant-isolated
    const pushElapsed = Date.now() - pushStartTime;
    const aggregate = recordPushMetrics(phase1Results, auth.companyId, outlet_id, pushElapsed);

    console.info("POST /sync/push completed", {
      correlation_id: correlationId,
      company_id: auth.companyId,
      outlet_id,
      total_items: aggregate.totalItems,
      ok_count: aggregate.okCount,
      duplicate_count: aggregate.duplicateCount,
      error_count: aggregate.errorCount,
      push_latency_ms: pushElapsed,
      total_transactions: transactions.length,
      order_update_results_count: phase1Results.orderUpdateResults.length,
      item_cancellation_results_count: phase1Results.itemCancellationResults.length,
      variant_sale_results_count: phase1Results.variantSaleResults?.length ?? 0,
      variant_stock_adjustment_results_count: phase1Results.variantStockAdjustmentResults?.length ?? 0,
    });

    return successResponse(responsePayload);
  } catch (error) {
    // Record error metrics even on failure (Story 52-9 — P1 alerting blind spot fix)
    // Guard: only record metrics if outlet_id was successfully parsed (avoids outlet_id=0 phantom metrics)
    const pushElapsed = Date.now() - pushStartTime;
    if (outlet_id > 0) {
      syncMetrics.recordPushResult(auth.companyId, outlet_id, "ERROR", pushElapsed, correlationId);
      syncIdempotencyMetricsCollector.recordResults(auth.companyId, [{
        client_tx_id: correlationId ?? "no-correlation-id",
        result: "ERROR",
        latency_ms: pushElapsed,
      }]);
    }

    console.error("POST /sync/push failed", {
      correlation_id: correlationId,
      company_id: auth.companyId,
      outlet_id: outlet_id > 0 ? outlet_id : "(not yet parsed)",
      push_latency_ms: pushElapsed,
      error
    });

    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      error instanceof Error ? error.message : "Sync push failed",
      500
    );
  }
});

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Sync push error response schema
 */
const SyncPushErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi
      .object({
        code: zodOpenApi.string().openapi({ description: "Error code" }),
        message: zodOpenApi.string().openapi({ description: "Error message" }),
      })
      .openapi("SyncPushErrorDetail"),
  })
  .openapi("SyncPushErrorResponse");

/**
 * Registers sync push routes with an OpenAPIHono instance.
 */
export function registerSyncPushRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  const pushRoute = createRoute({
    path: "/sync/push",
    method: "post",
    tags: ["Sync"],
    summary: "Push sync data",
    description: "Push transactions, active orders, and updates to server",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: SyncPushRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Sync push completed",
      },
      400: {
        content: { "application/json": { schema: SyncPushErrorResponseSchema } },
        description: "Validation error",
      },
      401: {
        content: { "application/json": { schema: SyncPushErrorResponseSchema } },
        description: "Unauthorized",
      },
      500: {
        content: { "application/json": { schema: SyncPushErrorResponseSchema } },
        description: "Internal server error",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(pushRoute, (async (c: any) => {
    const auth = c.get("auth");
    const correlationId = getRequestCorrelationId(c.req.raw);
    const dbPool = getSyncPushDbPool();
    const pushStartTime = Date.now();
    let outlet_id: number = 0;

    try {
      const body = await c.req.json();
      const validationResult = SyncPushRequestSchema.safeParse(body);

      if (!validationResult.success) {
        return errorResponse("VALIDATION_ERROR", "Invalid request payload", 400);
      }

      const { outlet_id, transactions, active_orders, order_updates, item_cancellations, variant_sales, variant_stock_adjustments } = validationResult.data;

      const outletAccessGuard = requireAccess({
        roles: ["OWNER", "ADMIN", "CASHIER"],
        module: "pos",
        resource: "transactions",
        permission: "create",
        outletId: outlet_id
      });

      const outletAccessResult = await outletAccessGuard(c.req.raw, auth);
      if (outletAccessResult) {
        return outletAccessResult;
      }

      const hasActiveOrders = Boolean(active_orders && active_orders.length > 0);
      const hasOrderUpdates = Boolean(order_updates && order_updates.length > 0);
      const hasItemCancellations = Boolean(item_cancellations && item_cancellations.length > 0);
      const hasVariantSales = Boolean(variant_sales && variant_sales.length > 0);
      const hasVariantStockAdjustments = Boolean(variant_stock_adjustments && variant_stock_adjustments.length > 0);

      if (transactions.length === 0 && !hasActiveOrders && !hasOrderUpdates && !hasItemCancellations && !hasVariantSales && !hasVariantStockAdjustments) {
        return successResponse({ results: [] });
      }

      const db = dbPool;

      const module = await getPosSyncModuleAsync();

      const phase1Results = await module.handlePushSync({
        db: db,
        companyId: auth.companyId,
        outletId: outlet_id,
        transactions: (transactions as SyncPushTransactionPayload[]).map(toTransactionPush),
        activeOrders: (active_orders ?? []).map(toActiveOrderPush),
        orderUpdates: (order_updates ?? []) as OrderUpdatePush[],
        itemCancellations: (item_cancellations ?? []) as ItemCancellationPush[],
        variantSales: (variant_sales ?? []) as VariantSalePush[],
        variantStockAdjustments: (variant_stock_adjustments ?? []) as VariantStockAdjustmentPush[],
        correlationId,
      });

      const responsePayload = {
        results: phase1Results.results,
        ...(phase1Results.orderUpdateResults.length > 0 && { order_update_results: phase1Results.orderUpdateResults }),
        ...(phase1Results.itemCancellationResults.length > 0 && { item_cancellation_results: phase1Results.itemCancellationResults }),
        ...(phase1Results.variantSaleResults && phase1Results.variantSaleResults.length > 0 && { variant_sale_results: phase1Results.variantSaleResults }),
        ...(phase1Results.variantStockAdjustmentResults && phase1Results.variantStockAdjustmentResults.length > 0 && { variant_stock_adjustment_results: phase1Results.variantStockAdjustmentResults })
      };

      const duplicateCount = phase1Results.results.filter((r) => r.result === "DUPLICATE").length;
      const errorResults = phase1Results.results.filter((r) => r.result === "ERROR");

      if (duplicateCount > 0) {
        outboxMetrics.recordDuplicate(auth.companyId, outlet_id);
      }

      for (const errorResult of errorResults) {
        const reason = classifySyncErrorReason(errorResult.message);
        outboxMetrics.recordFailure(auth.companyId, outlet_id, reason);
      }

      // Record sync outcome metrics (Story 52-9) — tenant-isolated
      const pushElapsed = Date.now() - pushStartTime;
      const aggregate = recordPushMetrics(phase1Results, auth.companyId, outlet_id, pushElapsed);

      console.info("POST /sync/push completed", {
        correlation_id: correlationId,
        company_id: auth.companyId,
        outlet_id,
        total_items: aggregate.totalItems,
        ok_count: aggregate.okCount,
        duplicate_count: aggregate.duplicateCount,
        error_count: aggregate.errorCount,
        push_latency_ms: pushElapsed,
      });

      return successResponse(responsePayload);
    } catch (error) {
      // Record error metrics even on failure (Story 52-9 — P1 alerting blind spot fix)
      // Guard: only record metrics if outlet_id was successfully parsed (avoids outlet_id=0 phantom metrics)
      const pushElapsed = Date.now() - pushStartTime;
      if (outlet_id > 0) {
        syncMetrics.recordPushResult(auth.companyId, outlet_id, "ERROR", pushElapsed, correlationId);
        syncIdempotencyMetricsCollector.recordResults(auth.companyId, [{
          client_tx_id: correlationId ?? "no-correlation-id",
          result: "ERROR",
          latency_ms: pushElapsed,
        }]);
      }

      console.error("POST /sync/push failed", {
        correlation_id: correlationId,
        company_id: auth.companyId,
        outlet_id: outlet_id > 0 ? outlet_id : "(not yet parsed)",
        push_latency_ms: pushElapsed,
        error
      });

      return errorResponse(
        "INTERNAL_SERVER_ERROR",
        error instanceof Error ? error.message : "Sync push failed",
        500
      );
    }
  }) as any);
}

/**
 * Record sync push metrics for a batch of results.
 * Extracts flat result items, records Prometheus and operational metrics,
 * and returns aggregate counts for structured logging.
 * 
 * DRY helper — used by both basic and OpenAPI push handlers.
 */
function recordPushMetrics(
  phase1Results: {
    results: Array<{ client_tx_id: string; result: string; message?: string }>;
    orderUpdateResults: Array<{ update_id: string; result: string; message?: string }>;
    itemCancellationResults: Array<{ cancellation_id: string; result: string; message?: string }>;
    variantSaleResults?: Array<{ client_tx_id: string; result: string; message?: string }>;
    variantStockAdjustmentResults?: Array<{ client_tx_id: string; result: string; message?: string }>;
  },
  companyId: number,
  outletId: number,
  pushElapsed: number,
): { totalItems: number; okCount: number; duplicateCount: number; errorCount: number } {
  const allItems = [
    ...phase1Results.results,
    ...phase1Results.orderUpdateResults.map((r) => ({ client_tx_id: r.update_id, result: r.result, message: r.message })),
    ...phase1Results.itemCancellationResults.map((r) => ({ client_tx_id: r.cancellation_id, result: r.result, message: r.message })),
    ...(phase1Results.variantSaleResults?.filter(r => r.client_tx_id).map((r) => ({ client_tx_id: r.client_tx_id, result: r.result, message: r.message })) ?? []),
    ...(phase1Results.variantStockAdjustmentResults?.filter(r => r.client_tx_id).map((r) => ({ client_tx_id: r.client_tx_id, result: r.result, message: r.message })) ?? []),
  ];

  // Record Prometheus metrics
  for (const item of allItems) {
    const safeResult = normalizeSyncResult(item.result);
    syncMetrics.recordPushResult(companyId, outletId, safeResult, pushElapsed, item.client_tx_id);
  }

  // Record sync-core operational metrics
  syncIdempotencyMetricsCollector.recordResults(companyId, allItems.map((r) => ({
    client_tx_id: r.client_tx_id,
    result: normalizeSyncResult(r.result),
    latency_ms: pushElapsed,
  })));

  return {
    totalItems: allItems.length,
    okCount: allItems.filter((r) => normalizeSyncResult(r.result) === "OK").length,
    duplicateCount: allItems.filter((r) => normalizeSyncResult(r.result) === "DUPLICATE").length,
    errorCount: allItems.filter((r) => normalizeSyncResult(r.result) === "ERROR").length,
  };
}

/**
 * Normalize a sync result string to a valid SyncPushResultType.
 * Uses runtime validation instead of unsafe type casts.
 * Unknown/missing results are mapped to "ERROR" to prevent silent data loss.
 */
function normalizeSyncResult(result: string | undefined): "OK" | "DUPLICATE" | "ERROR" {
  if (result === "OK") return "OK";
  if (result === "DUPLICATE") return "DUPLICATE";
  return "ERROR"; // Maps CONFLICT and any unexpected values to ERROR
}

/**
 * Classify sync error message into outbox failure reason
 */
function classifySyncErrorReason(errorMessage: string | undefined): OutboxFailureReason {
  if (!errorMessage) {
    return "internal_error";
  }
  
  const upperMessage = errorMessage.toUpperCase();
  
  if (upperMessage.includes("TIMEOUT") || upperMessage.includes("ECONNRESET") || upperMessage.includes("ETIMEDOUT")) {
    return "timeout";
  }
  
  if (upperMessage.includes("VALIDATION") || upperMessage.includes("INVALID") || upperMessage.includes("MISMATCH") || upperMessage.includes("REQUIRED")) {
    return "validation_error";
  }
  
  if (upperMessage.includes("CONFLICT") || upperMessage.includes("IDEMPOTENCY_CONFLICT")) {
    return "conflict";
  }
  
  if (upperMessage.includes("NETWORK") || upperMessage.includes("ECONNREFUSED") || upperMessage.includes("ENOTFOUND")) {
    return "network_error";
  }
  
  return "internal_error";
}

export { syncPushRoutes };
