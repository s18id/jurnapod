// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Route
 *
 * Thin HTTP layer for POST /sync/push.
 * Business logic lives in lib/sync/push/.
 */

import { Hono } from "hono";
import { SyncPushRequestSchema } from "@jurnapod/shared";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";
import { getDbPool } from "../../lib/db.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  listCompanyDefaultTaxRates,
  listCompanyTaxRates
} from "../../lib/taxes.js";
import { SyncIdempotencyMetricsCollector } from "@jurnapod/sync-core";
import { orchestrateSyncPush } from "../../lib/sync/push/index.js";
import type {
  ActiveOrder,
  ItemCancellation,
  OrderUpdate,
  SyncPushTaxContext,
  SyncPushTransactionPayload
} from "../../lib/sync/push/types.js";

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

    const { outlet_id, transactions, active_orders, order_updates, item_cancellations } = validationResult.data;

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

    if (transactions.length === 0 && !hasActiveOrders && !hasOrderUpdates && !hasItemCancellations) {
      return successResponse({ results: [] });
    }

    const connection = await dbPool.getConnection();
    let taxContext: SyncPushTaxContext;
    try {
      const [defaultTaxRates, allTaxRates] = await Promise.all([
        listCompanyDefaultTaxRates(connection, auth.companyId),
        listCompanyTaxRates(connection, auth.companyId)
      ]);

      taxContext = {
        defaultTaxRates,
        taxRateById: new Map(allTaxRates.map((rate) => [rate.id, rate]))
      };
    } finally {
      connection.release();
    }

    const { results, orderUpdateResults, itemCancellationResults } = await orchestrateSyncPush({
      dbPool,
      transactions: transactions as SyncPushTransactionPayload[],
      active_orders: active_orders as ActiveOrder[] | undefined,
      order_updates: order_updates as OrderUpdate[] | undefined,
      item_cancellations: item_cancellations as ItemCancellation[] | undefined,
      inputOutletId: outlet_id,
      authCompanyId: auth.companyId,
      authUserId: auth.userId,
      correlationId,
      taxContext,
      injectFailureAfterHeaderInsert: shouldInjectFailureAfterHeaderInsert(c.req.raw),
      forcedRetryableErrno: readForcedRetryableErrno(c.req.raw),
      metricsCollector,
      maxConcurrency: readSyncPushConcurrency()
    });

    const responsePayload = {
      results,
      ...(orderUpdateResults.length > 0 && { order_update_results: orderUpdateResults }),
      ...(itemCancellationResults.length > 0 && { item_cancellation_results: itemCancellationResults })
    };

    console.info("POST /sync/push completed", {
      correlation_id: correlationId,
      company_id: auth.companyId,
      outlet_id,
      total_transactions: transactions.length,
      ok_count: results.filter((r) => r.result === "OK").length,
      duplicate_count: results.filter((r) => r.result === "DUPLICATE").length,
      error_count: results.filter((r) => r.result === "ERROR").length,
      order_update_results_count: orderUpdateResults.length,
      item_cancellation_results_count: itemCancellationResults.length
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
