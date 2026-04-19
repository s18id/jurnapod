// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing AP Reconciliation Routes (Epic 47 Wave 0)
 *
 * - PUT  /purchasing/reports/ap-reconciliation/settings  - Save AP reconciliation account settings
 * - GET  /purchasing/reports/ap-reconciliation/settings  - Get current AP reconciliation account settings
 * - GET  /purchasing/reports/ap-reconciliation/summary   - Get AP vs GL reconciliation summary
 *
 * Required ACL:
 * - Settings endpoints: accounting module, accounts resource, MANAGE permission
 * - Summary endpoint: accounting module, journals resource, ANALYZE permission
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  APReconciliationSettingsUpdateSchema,
  APReconciliationSummaryQuerySchema,
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext,
} from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getDb } from "@/lib/db";
import { recordMasterDataAuditLog } from "@/lib/shared/master-data-utils";
import {
  getAPReconciliationSettings,
  saveAPReconciliationSettings,
  getAPReconciliationSummary,
  APReconciliationSettingsRequiredError,
  APReconciliationTimezoneRequiredError,
  APReconciliationError,
} from "@/lib/purchasing/ap-reconciliation";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const apReconciliationRoutes = new Hono();

// =============================================================================
// Settings Endpoints
// PUT /purchasing/reports/ap-reconciliation/settings
// GET /purchasing/reports/ap-reconciliation/settings
// =============================================================================

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

const settingsQuerySchema = z.object({});

apReconciliationRoutes.put("/settings", async (c) => {
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
    const parsed = APReconciliationSettingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid request body: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    await saveAPReconciliationSettings(auth.companyId, parsed.data.account_ids);

    await recordMasterDataAuditLog(getDb(), {
      companyId: auth.companyId,
      outletId: null,
      actor: { userId: auth.userId },
      action: "SETTINGS_UPDATE",
      payload: {
        module: "accounting",
        resource: "accounts",
        key: "purchasing.ap_reconciliation.account_ids",
        account_ids: parsed.data.account_ids,
      },
    });

    // Fetch and return updated settings
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
    console.error("PUT /purchasing/reports/ap-reconciliation/settings failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to save AP reconciliation settings", 500);
  }
});

apReconciliationRoutes.get("/settings", async (c) => {
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

    const settings = await getAPReconciliationSettings(auth.companyId);

    return successResponse({
      account_ids: settings.accountIds,
      source: settings.source,
    });
  } catch (error) {
    console.error("GET /purchasing/reports/ap-reconciliation/settings failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP reconciliation settings", 500);
  }
});

// =============================================================================
// Summary Endpoint
// GET /purchasing/reports/ap-reconciliation/summary
// =============================================================================

apReconciliationRoutes.get("/summary", async (c) => {
  try {
    const auth = c.get("auth");

    // ACL: module='purchasing', resource='reports', permission='analyze'
    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "reports",
      permission: "analyze",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = APReconciliationSummaryQuerySchema.safeParse({
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
    });

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
      return errorResponse(
        error.code,
        error.message,
        409
      );
    }
    if (error instanceof APReconciliationTimezoneRequiredError) {
      return errorResponse(
        error.code,
        error.message,
        500
      );
    }
    console.error("GET /purchasing/reports/ap-reconciliation/summary failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP reconciliation summary", 500);
  }
});

export { apReconciliationRoutes };
