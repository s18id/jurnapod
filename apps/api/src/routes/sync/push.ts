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
import { SyncPushRequestSchema } from "@jurnapod/shared";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { SyncIdempotencyMetricsCollector } from "@jurnapod/sync-core";
import { getSyncPushDbPool } from "../../lib/sync/push/db.js";
import type { SyncPushTransactionPayload } from "../../lib/sync/push/types.js";
import { shouldUseNewPushSync, getPushSyncModeDescription } from "../../lib/feature-flags.js";
import { getPosSyncModule } from "../../lib/sync-modules.js";
import { toTransactionPush, toActiveOrderPush } from "../../lib/sync/push/adapters.js";
import type {
  OrderUpdatePush,
  ItemCancellationPush,
  VariantSalePush,
  VariantStockAdjustmentPush
} from "@jurnapod/pos-sync";

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
    const module = getPosSyncModule();

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

    console.info("POST /sync/push completed", {
      correlation_id: correlationId,
      company_id: auth.companyId,
      outlet_id,
      total_transactions: transactions.length,
      ok_count: phase1Results.results.filter((r) => r.result === "OK").length,
      duplicate_count: phase1Results.results.filter((r) => r.result === "DUPLICATE").length,
      error_count: phase1Results.results.filter((r) => r.result === "ERROR").length,
      order_update_results_count: phase1Results.orderUpdateResults.length,
      item_cancellation_results_count: phase1Results.itemCancellationResults.length,
      variant_sale_results_count: phase1Results.variantSaleResults?.length ?? 0,
      variant_stock_adjustment_results_count: phase1Results.variantStockAdjustmentResults?.length ?? 0
    });

    return successResponse(responsePayload);
  } catch (error) {
    console.error("POST /sync/push failed", {
      correlation_id: correlationId,
      company_id: auth.companyId,
      error
    });

    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      error instanceof Error ? error.message : "Sync push failed",
      500
    );
  }
});

export { syncPushRoutes };
