// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Accounting Inventory Reconciliation Routes (Story 51.4)
 *
 * - PUT  /accounting/reports/inventory-reconciliation/settings  - Save inventory reconciliation account settings
 * - GET  /accounting/reports/inventory-reconciliation/settings  - Get current inventory reconciliation account settings
 * - GET  /accounting/reports/inventory-reconciliation/summary   - Get inventory vs GL reconciliation summary
 * - GET  /accounting/reports/inventory-reconciliation/drilldown - Get inventory reconciliation drilldown
 *
 * Required ACL:
 * - Settings endpoints: accounting module, accounts resource, MANAGE permission
 * - Summary/Drilldown endpoints: accounting module, reports resource, ANALYZE permission
 */

import { Hono } from "hono";
import {
  InventoryReconciliationSettingsUpdateSchema,
  InventoryReconciliationSummaryQuerySchema,
  InventoryReconciliationDrilldownQuerySchema,
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext,
} from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { recordMasterDataAuditLogDefaultDb } from "@/lib/shared/master-data-utils";
import {
  getInventoryReconciliationSettings,
  saveInventoryReconciliationSettings,
  getInventoryReconciliationSummary,
  getInventoryReconciliationDrilldown,
  InventoryReconciliationSettingsRequiredError,
  InventoryReconciliationTimezoneRequiredError,
  InventoryReconciliationError,
} from "@/lib/accounting/inventory-reconciliation";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const inventoryReconciliationRoutes = new Hono();

// =============================================================================
// Settings Endpoints
// PUT /accounting/reports/inventory-reconciliation/settings
// GET /accounting/reports/inventory-reconciliation/settings
// =============================================================================

inventoryReconciliationRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" },
    });
  }
  c.set("auth", authResult.auth);
  await next();
});

inventoryReconciliationRoutes.put("/settings", async (c) => {
  try {
    const auth = c.get("auth");

    // ACL: module='accounting', resource='accounts', permission='manage'
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "manage",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const body = await c.req.json().catch(() => null);
    const parsed = InventoryReconciliationSettingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid request body: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    await saveInventoryReconciliationSettings(auth.companyId, parsed.data.account_ids);

    await recordMasterDataAuditLogDefaultDb({
      companyId: auth.companyId,
      outletId: null,
      actor: { userId: auth.userId },
      action: "SETTINGS_UPDATE",
      payload: {
        module: "accounting",
        resource: "accounts",
        key: "accounting.inventory_reconciliation.account_ids",
        account_ids: parsed.data.account_ids,
      },
    });

    // Fetch and return updated settings
    const settings = await getInventoryReconciliationSettings(auth.companyId);

    return successResponse({
      account_ids: settings.accountIds,
      source: settings.source,
    });
  } catch (error) {
    if (error instanceof InventoryReconciliationError) {
      if (error.code === "INVENTORY_RECONCILIATION_CROSS_TENANT_ACCOUNT") {
        return errorResponse(error.code, error.message, 403);
      }
      if (error.code === "INVENTORY_RECONCILIATION_INVALID_ACCOUNT") {
        return errorResponse(error.code, error.message, 400);
      }
    }
    console.error("PUT /accounting/reports/inventory-reconciliation/settings failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to save inventory reconciliation settings", 500);
  }
});

inventoryReconciliationRoutes.get("/settings", async (c) => {
  try {
    const auth = c.get("auth");

    // ACL: module='accounting', resource='accounts', permission='manage'
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "manage",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const settings = await getInventoryReconciliationSettings(auth.companyId);

    return successResponse({
      account_ids: settings.accountIds,
      source: settings.source,
    });
  } catch (error) {
    console.error("GET /accounting/reports/inventory-reconciliation/settings failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch inventory reconciliation settings", 500);
  }
});

// =============================================================================
// Summary Endpoint
// GET /accounting/reports/inventory-reconciliation/summary
// =============================================================================

inventoryReconciliationRoutes.get("/summary", async (c) => {
  try {
    const auth = c.get("auth");

    // ACL: module='accounting', resource='reports', permission='analyze'
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "reports",
      permission: "analyze",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const parsed = InventoryReconciliationSummaryQuerySchema.safeParse(c.req.query());

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid query parameters: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    const summary = await getInventoryReconciliationSummary(auth.companyId, parsed.data.as_of_date);

    return successResponse({
      as_of_date: summary.asOfDate,
      inventory_subledger_balance: summary.inventorySubledgerBalance,
      gl_control_balance: summary.glControlBalance,
      variance: summary.variance,
      configured_account_ids: summary.configuredAccountIds,
      account_source: summary.accountSource,
      currency: summary.currency,
    });
  } catch (error) {
    if (error instanceof InventoryReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof InventoryReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof InventoryReconciliationError) {
      return errorResponse(error.code, error.message, 400);
    }
    console.error("GET /accounting/reports/inventory-reconciliation/summary failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch inventory reconciliation summary", 500);
  }
});

// =============================================================================
// Drilldown Endpoint
// GET /accounting/reports/inventory-reconciliation/drilldown
// =============================================================================

inventoryReconciliationRoutes.get("/drilldown", async (c) => {
  try {
    const auth = c.get("auth");

    // ACL: module='accounting', resource='reports', permission='analyze'
    const accessResult = await requireAccess({
      module: "accounting",
      resource: "reports",
      permission: "analyze",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const parsed = InventoryReconciliationDrilldownQuerySchema.safeParse({
      as_of_date: c.req.query("as_of_date"),
      movement_type: c.req.query("movement_type"),
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
    });

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid query parameters: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    const drilldown = await getInventoryReconciliationDrilldown(
      auth.companyId,
      parsed.data.as_of_date,
      {
        movementType: parsed.data.movement_type,
        cursor: parsed.data.cursor,
        limit: parsed.data.limit,
      }
    );

    return successResponse({
      as_of_date: drilldown.asOfDate,
      categories: drilldown.categories,
      lines: drilldown.lines,
      total_variance: drilldown.totalVariance,
      has_more: drilldown.hasMore,
      next_cursor: drilldown.nextCursor,
    });
  } catch (error) {
    if (error instanceof InventoryReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof InventoryReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof InventoryReconciliationError) {
      return errorResponse(error.code, error.message, 400);
    }
    console.error("GET /accounting/reports/inventory-reconciliation/drilldown failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch inventory reconciliation drilldown", 500);
  }
});

export default inventoryReconciliationRoutes;