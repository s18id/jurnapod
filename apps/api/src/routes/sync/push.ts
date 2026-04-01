// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Route
 *
 * Thin HTTP layer for POST /sync/push.
 * Uses PosSyncModule for Phase 1 (persistence) and iterates Phase 1 results
 * for Phase 2 (COGS posting, stock deduction, table release, reservation update).
 */

import { Hono } from "hono";
import { SyncPushRequestSchema } from "@jurnapod/shared";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";
import { getDbPool } from "../../lib/db.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { SyncIdempotencyMetricsCollector } from "@jurnapod/sync-core";
import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import { processSyncPushTransactionPhase2 } from "../../lib/sync/push/transactions.js";
import type { SyncPushTaxContext, SyncPushTransactionPayload } from "../../lib/sync/push/types.js";
import { shouldUseNewPushSync, getPushSyncModeDescription } from "../../lib/feature-flags.js";
import { getPosSyncModule } from "../../lib/sync-modules.js";
import { toTransactionPush, toActiveOrderPush, buildTxByClientTxIdMap } from "../../lib/sync/push/adapters.js";
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

const TEST_FAIL_AFTER_HEADER_INSERT_HEADER = "x-jp-sync-push-fail-after-header";
const TEST_FORCE_DB_ERRNO_HEADER = "x-jp-sync-push-force-db-errno";
const SYNC_PUSH_TEST_HOOKS_ENV = "JP_SYNC_PUSH_TEST_HOOKS";
const SYNC_PUSH_CONCURRENCY_ENV = "JP_SYNC_PUSH_CONCURRENCY";
const DEFAULT_SYNC_PUSH_CONCURRENCY = 3;
const MAX_SYNC_PUSH_CONCURRENCY = 5;
const MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE = 1205;
const MYSQL_DEADLOCK_ERROR_CODE = 1213;

function isSyncPushTestHookEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env[SYNC_PUSH_TEST_HOOKS_ENV] === "1";
}

function shouldInjectFailureAfterHeaderInsert(request: Request): boolean {
  return isSyncPushTestHookEnabled() && request.headers.get(TEST_FAIL_AFTER_HEADER_INSERT_HEADER) === "1";
}

function readForcedRetryableErrno(request: Request): number | null {
  if (!isSyncPushTestHookEnabled()) {
    return null;
  }

  const headerValue = request.headers.get(TEST_FORCE_DB_ERRNO_HEADER)?.trim();
  if (!headerValue) {
    return null;
  }

  const parsed = Number(headerValue);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  if (parsed !== MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE && parsed !== MYSQL_DEADLOCK_ERROR_CODE) {
    return null;
  }

  return parsed;
}

function readSyncPushConcurrency(): number {
  const raw = process.env[SYNC_PUSH_CONCURRENCY_ENV];
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_SYNC_PUSH_CONCURRENCY;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_SYNC_PUSH_CONCURRENCY;
  }

  return Math.min(MAX_SYNC_PUSH_CONCURRENCY, Math.max(1, parsed));
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
  const dbPool = getDbPool();
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

    // Build tax context using Kysely
    const db = dbPool;
    
    // Get default tax rates for the company
    const defaultTaxRatesResult = await sql`
      SELECT tr.id, tr.company_id, tr.code, tr.name, tr.rate_percent, tr.account_id, 
             tr.is_inclusive, tr.is_active, tr.created_by_user_id, tr.updated_by_user_id,
             tr.created_at, tr.updated_at
      FROM tax_rates tr
      INNER JOIN company_tax_defaults ctd ON ctd.tax_rate_id = tr.id
      WHERE ctd.company_id = ${auth.companyId}
        AND tr.is_active = 1
    `.execute(db);

    // Get all tax rates for the company
    const allTaxRatesResult = await sql`
      SELECT id, company_id, code, name, rate_percent, account_id, 
             is_inclusive, is_active, created_by_user_id, updated_by_user_id,
             created_at, updated_at
      FROM tax_rates
      WHERE company_id = ${auth.companyId}
        AND is_active = 1
    `.execute(db);

    interface TaxRateRow {
      id: number;
      company_id: number;
      code: string;
      name: string;
      rate_percent: number;
      account_id: number | null;
      is_inclusive: number;
      is_active: number;
      created_by_user_id: number | null;
      updated_by_user_id: number | null;
      created_at: string;
      updated_at: string;
    }

    const defaultTaxRates = (defaultTaxRatesResult.rows as TaxRateRow[]).map(row => ({
      id: row.id,
      company_id: row.company_id,
      code: row.code,
      name: row.name,
      rate_percent: Number(row.rate_percent),
      account_id: row.account_id,
      is_inclusive: row.is_inclusive === 1,
      is_active: row.is_active === 1,
      created_by_user_id: row.created_by_user_id,
      updated_by_user_id: row.updated_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    const allTaxRates = (allTaxRatesResult.rows as TaxRateRow[]).map(row => ({
      id: row.id,
      company_id: row.company_id,
      code: row.code,
      name: row.name,
      rate_percent: Number(row.rate_percent),
      account_id: row.account_id,
      is_inclusive: row.is_inclusive === 1,
      is_active: row.is_active === 1,
      created_by_user_id: row.created_by_user_id,
      updated_by_user_id: row.updated_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    const taxContext: SyncPushTaxContext = {
      defaultTaxRates,
      taxRateById: new Map(allTaxRates.map(rate => [rate.id, rate]))
    };

    // Check feature flag to determine which path to use
    const useNewPath = shouldUseNewPushSync(auth.companyId);
    const modeDescription = getPushSyncModeDescription();

    console.info("POST /sync/push feature flag", {
      correlation_id: correlationId,
      company_id: auth.companyId,
      use_new_path: useNewPath,
      mode: modeDescription
    });

    // Build transaction map for Phase 2
    const txByClientTxId = buildTxByClientTxIdMap(transactions as SyncPushTransactionPayload[]);

    // Phase 1: Use PosSyncModule for persistence
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

    // Phase 2: Iterate Phase 1 results and process COGS, stock, etc.
    // Process OK results from Phase 1
    const okResults = phase1Results.results.filter((r) => r.result === "OK" && r.posTransactionId !== undefined);
    
    for (const result of okResults) {
      const originalTx = txByClientTxId.get(result.client_tx_id);
      if (!originalTx) {
        console.warn("Phase 2: Original transaction not found", {
          correlation_id: correlationId,
          client_tx_id: result.client_tx_id
        });
        continue;
      }

      try {
        // Phase 2 uses Kysely for database operations
        await processSyncPushTransactionPhase2({
          db: db,
          tx: originalTx,
          posTransactionId: result.posTransactionId!,
          authUserId: auth.userId,
          correlationId,
          taxContext
        });
      } catch (phase2Error) {
        // Phase 2 failed but Phase 1 data is already committed
        // Log the error but don't fail the entire request
        console.error("Phase 2 processing failed for transaction", {
          correlation_id: correlationId,
          client_tx_id: result.client_tx_id,
          pos_transaction_id: result.posTransactionId,
          error: phase2Error instanceof Error ? phase2Error.message : String(phase2Error)
        });
      }
    }

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
