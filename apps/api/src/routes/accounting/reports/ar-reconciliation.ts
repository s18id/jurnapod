// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Accounting AR Reconciliation Routes (Story 51.2)
 *
 * - PUT  /accounting/reports/ar-reconciliation/settings  - Save AR reconciliation account settings
 * - GET  /accounting/reports/ar-reconciliation/settings  - Get current AR reconciliation account settings
 * - GET  /accounting/reports/ar-reconciliation/summary   - Get AR vs GL reconciliation summary
 *
 * Required ACL:
 * - Settings endpoints: accounting module, accounts resource, MANAGE permission
 * - Summary endpoint: accounting module, reports resource, ANALYZE permission
 */

import { Hono } from "hono";
import {
  ARReconciliationSettingsUpdateSchema,
  ARReconciliationSummaryQuerySchema,
  ARReconciliationDrilldownQuerySchema,
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext,
} from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { recordMasterDataAuditLogDefaultDb } from "@/lib/shared/master-data-utils";
import {
  getARReconciliationSettings,
  saveARReconciliationSettings,
  getARReconciliationSummary,
  getARReconciliationDrilldown,
  ARReconciliationSettingsRequiredError,
  ARReconciliationTimezoneRequiredError,
  ARReconciliationError,
} from "@/lib/accounting/ar-reconciliation";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const arReconciliationRoutes = new Hono();

// =============================================================================
// Settings Endpoints
// PUT /accounting/reports/ar-reconciliation/settings
// GET /accounting/reports/ar-reconciliation/settings
// =============================================================================

arReconciliationRoutes.use("/*", async (c, next) => {
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

arReconciliationRoutes.put("/settings", async (c) => {
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
    const parsed = ARReconciliationSettingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid request body: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    await saveARReconciliationSettings(auth.companyId, parsed.data.account_ids);

    await recordMasterDataAuditLogDefaultDb({
      companyId: auth.companyId,
      outletId: null,
      actor: { userId: auth.userId },
      action: "SETTINGS_UPDATE",
      payload: {
        module: "accounting",
        resource: "accounts",
        key: "accounting.ar_reconciliation.account_ids",
        account_ids: parsed.data.account_ids,
      },
    });

    // Fetch and return updated settings
    const settings = await getARReconciliationSettings(auth.companyId);

    return successResponse({
      account_ids: settings.accountIds,
      source: settings.source,
    });
  } catch (error) {
    if (error instanceof ARReconciliationError) {
      if (error.code === "AR_RECONCILIATION_CROSS_TENANT_ACCOUNT") {
        return errorResponse(error.code, error.message, 403);
      }
      if (error.code === "AR_RECONCILIATION_INVALID_ACCOUNT") {
        return errorResponse(error.code, error.message, 400);
      }
    }
    console.error("PUT /accounting/reports/ar-reconciliation/settings failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to save AR reconciliation settings", 500);
  }
});

arReconciliationRoutes.get("/settings", async (c) => {
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

    const settings = await getARReconciliationSettings(auth.companyId);

    return successResponse({
      account_ids: settings.accountIds,
      source: settings.source,
    });
  } catch (error) {
    console.error("GET /accounting/reports/ar-reconciliation/settings failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AR reconciliation settings", 500);
  }
});

// =============================================================================
// Summary Endpoint
// GET /accounting/reports/ar-reconciliation/summary
// =============================================================================

arReconciliationRoutes.get("/summary", async (c) => {
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

    const parsed = ARReconciliationSummaryQuerySchema.safeParse(c.req.query());

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid query parameters: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    const summary = await getARReconciliationSummary(auth.companyId, parsed.data.as_of_date);

    return successResponse({
      as_of_date: summary.asOfDate,
      ar_subledger_balance: summary.arSubledgerBalance,
      gl_control_balance: summary.glControlBalance,
      variance: summary.variance,
      configured_account_ids: summary.configuredAccountIds,
      account_source: summary.accountSource,
      currency: summary.currency,
    });
  } catch (error) {
    if (error instanceof ARReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof ARReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof ARReconciliationError) {
      return errorResponse(error.code, error.message, 400);
    }
    console.error("GET /accounting/reports/ar-reconciliation/summary failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AR reconciliation summary", 500);
  }
});

// =============================================================================
// Drilldown Endpoint
// GET /accounting/reports/ar-reconciliation/drilldown
// =============================================================================

arReconciliationRoutes.get("/drilldown", async (c) => {
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

    const parsed = ARReconciliationDrilldownQuerySchema.safeParse({
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

    const drilldown = await getARReconciliationDrilldown(
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
    if (error instanceof ARReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof ARReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 400);
    }
    if (error instanceof ARReconciliationError) {
      return errorResponse(error.code, error.message, 400);
    }
    console.error("GET /accounting/reports/ar-reconciliation/drilldown failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AR reconciliation drilldown", 500);
  }
});

export default arReconciliationRoutes;