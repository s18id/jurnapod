// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Accounting AP Reconciliation Routes (Story 51.3)
 *
 * - PUT  /accounting/reports/ap-reconciliation/settings  - Save AP reconciliation account settings
 * - GET  /accounting/reports/ap-reconciliation/settings  - Get current AP reconciliation account settings
 * - GET  /accounting/reports/ap-reconciliation/summary   - Get AP vs GL reconciliation summary
 * - GET  /accounting/reports/ap-reconciliation/drilldown - Get AP vs GL reconciliation drilldown
 *
 * Required ACL:
 * - Settings endpoints: accounting module, accounts resource, MANAGE permission
 * - Summary/drilldown endpoints: accounting module, reports resource, ANALYZE permission
 */

import { Hono } from "hono";
import {
  APReconciliationSettingsUpdateSchema,
  APReconciliationSummaryQuerySchema,
  AccountingAPReconciliationDrilldownQuerySchema,
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext,
} from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { recordMasterDataAuditLogDefaultDb } from "@/lib/shared/master-data-utils";
import {
  getAPReconciliationSettings,
  saveAPReconciliationSettings,
  getAPReconciliationSummary,
  getAPReconciliationDrilldown,
  APReconciliationSettingsRequiredError,
  APReconciliationTimezoneRequiredError,
  APReconciliationError,
} from "@/lib/accounting/ap-reconciliation";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const apReconciliationRoutes = new Hono();

apReconciliationRoutes.use("/*", async (c, next) => {
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

// =============================================================================
// Settings Endpoints
// =============================================================================

apReconciliationRoutes.put("/settings", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "manage",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const body = await c.req.json().catch(() => null);
    const parsed = APReconciliationSettingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid request body: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    await saveAPReconciliationSettings(auth.companyId, parsed.data.account_ids);

    await recordMasterDataAuditLogDefaultDb({
      companyId: auth.companyId,
      outletId: null,
      actor: { userId: auth.userId },
      action: "SETTINGS_UPDATE",
      payload: {
        module: "accounting",
        resource: "accounts",
        key: "accounting.ap_reconciliation.account_ids",
        account_ids: parsed.data.account_ids,
      },
    });

    const settings = await getAPReconciliationSettings(auth.companyId);

    return successResponse({
      account_ids: settings.accountIds,
      source: settings.source,
    });
  } catch (error) {
    if (error instanceof APReconciliationError) {
      if (error.code === "AP_RECONCILIATION_CROSS_TENANT_ACCOUNT") {
        return errorResponse(error.code, error.message, 403);
      }
      if (error.code === "AP_RECONCILIATION_INVALID_ACCOUNT") {
        return errorResponse(error.code, error.message, 400);
      }
    }
    console.error("PUT /accounting/reports/ap-reconciliation/settings failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to save AP reconciliation settings", 500);
  }
});

apReconciliationRoutes.get("/settings", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "accounts",
      permission: "manage",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const settings = await getAPReconciliationSettings(auth.companyId);

    return successResponse({
      account_ids: settings.accountIds,
      source: settings.source,
    });
  } catch (error) {
    console.error("GET /accounting/reports/ap-reconciliation/settings failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP reconciliation settings", 500);
  }
});

// =============================================================================
// Summary Endpoint
// =============================================================================

apReconciliationRoutes.get("/summary", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "reports",
      permission: "analyze",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const parsed = APReconciliationSummaryQuerySchema.safeParse(c.req.query());

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid query parameters: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    const summary = await getAPReconciliationSummary(auth.companyId, parsed.data.as_of_date);

    return successResponse({
      as_of_date: summary.asOfDate,
      ap_subledger_balance: summary.apSubledgerBalance,
      gl_control_balance: summary.glControlBalance,
      variance: summary.variance,
      configured_account_ids: summary.configuredAccountIds,
      account_source: summary.accountSource,
      currency: summary.currency,
    });
  } catch (error) {
    if (error instanceof APReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof APReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof APReconciliationError) {
      return errorResponse(error.code, error.message, 400);
    }
    console.error("GET /accounting/reports/ap-reconciliation/summary failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP reconciliation summary", 500);
  }
});

// =============================================================================
// Drilldown Endpoint
// =============================================================================

apReconciliationRoutes.get("/drilldown", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "accounting",
      resource: "reports",
      permission: "analyze",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const parsed = AccountingAPReconciliationDrilldownQuerySchema.safeParse({
      as_of_date: c.req.query("as_of_date"),
      document_type: c.req.query("document_type"),
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

    const drilldown = await getAPReconciliationDrilldown(
      auth.companyId,
      parsed.data.as_of_date,
      {
        documentType: parsed.data.document_type,
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
    if (error instanceof APReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof APReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof APReconciliationError) {
      return errorResponse(error.code, error.message, 400);
    }
    console.error("GET /accounting/reports/ap-reconciliation/drilldown failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP reconciliation drilldown", 500);
  }
});

export default apReconciliationRoutes;
