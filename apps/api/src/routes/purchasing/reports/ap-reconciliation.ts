// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing AP Reconciliation Routes (Epic 47 Wave 0 + Story 47.2 B2A)
 *
 * - PUT  /purchasing/reports/ap-reconciliation/settings  - Save AP reconciliation account settings
 * - GET  /purchasing/reports/ap-reconciliation/settings  - Get current AP reconciliation account settings
 * - GET  /purchasing/reports/ap-reconciliation/summary   - Get AP vs GL reconciliation summary
 * - GET  /purchasing/reports/ap-reconciliation/drilldown - Get variance attribution drilldown (47.2)
 * - GET  /purchasing/reports/ap-reconciliation/gl-detail - Get GL journal lines detail (47.2)
 * - GET  /purchasing/reports/ap-reconciliation/ap-detail - Get AP subledger detail (47.2)
 * - GET  /purchasing/reports/ap-reconciliation/export    - Export drilldown as CSV (47.2)
 *
 * Required ACL:
 * - Settings endpoints: accounting module, accounts resource, MANAGE permission
 * - Summary endpoint: purchasing module, reports resource, ANALYZE permission
 * - Drilldown/GL-detail/AP-detail/Export: purchasing module, reports resource, ANALYZE permission
 */

import { Hono } from "hono";
import {
  APReconciliationSettingsUpdateSchema,
  APReconciliationSummaryQuerySchema,
  APReconciliationDrilldownQuerySchema,
  APReconciliationExportQuerySchema,
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
  APReconciliationSettingsRequiredError,
  APReconciliationTimezoneRequiredError,
  APReconciliationError,
  resolveCompanyTimezone,
} from "@/lib/purchasing/ap-reconciliation";

import {
  getGLDetail,
  getAPDetail,
  getAPReconciliationDrilldown,
  generateDrilldownCSV,
  type DrilldownResult,
} from "@/lib/purchasing/ap-reconciliation-drilldown";

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

    await recordMasterDataAuditLogDefaultDb({
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

// =============================================================================
// Drilldown Endpoint
// GET /purchasing/reports/ap-reconciliation/drilldown
// =============================================================================

apReconciliationRoutes.get("/drilldown", async (c) => {
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
    const parsed = APReconciliationDrilldownQuerySchema.safeParse({
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
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
      parsed.data.cursor,
      parsed.data.limit
    );

    return successResponse({
      as_of_date: drilldown.asOfDate,
      configured_account_ids: drilldown.configuredAccountIds,
      currency: drilldown.currency,
      ap_subledger_balance: drilldown.apSubledgerBalance,
      gl_control_balance: drilldown.glControlBalance,
      variance: drilldown.variance,
      categories: drilldown.categories.map((cat) => ({
        category: cat.category,
        total_difference: cat.totalDifference,
        item_count: cat.itemCount,
        items: cat.items.map((item) => ({
          id: item.id,
          category: item.category,
          ap_transaction_id: item.apTransactionId,
          ap_transaction_type: item.apTransactionType,
          ap_transaction_ref: item.apTransactionRef,
          ap_date: item.apDate,
          ap_amount_original: item.apAmountOriginal,
          ap_amount_base: item.apAmountBase,
          ap_currency: item.apCurrency,
          gl_journal_line_id: item.glJournalLineId,
          gl_journal_number: item.glJournalNumber,
          gl_effective_date: item.glEffectiveDate,
          gl_description: item.glDescription,
          gl_amount: item.glAmount,
          gl_debit_credit: item.glDebitCredit,
          matched: item.matched,
          match_id: item.matchId,
          difference: item.difference,
          suggested_action: item.suggestedAction,
        })),
      })),
      next_cursor: drilldown.nextCursor,
      has_more: drilldown.hasMore,
    });
  } catch (error) {
    if (error instanceof APReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 409);
    }
    if (error instanceof APReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 500);
    }
    console.error("GET /purchasing/reports/ap-reconciliation/drilldown failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP reconciliation drilldown", 500);
  }
});

// =============================================================================
// GL Detail Endpoint
// GET /purchasing/reports/ap-reconciliation/gl-detail
// =============================================================================

apReconciliationRoutes.get("/gl-detail", async (c) => {
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
    const parsed = APReconciliationDrilldownQuerySchema.safeParse({
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid query parameters: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    const settings = await getAPReconciliationSettings(auth.companyId);

    if (settings.accountIds.length === 0) {
      throw new APReconciliationSettingsRequiredError();
    }

    // Get timezone
    const timezone = await resolveCompanyTimezone(auth.companyId);

    const glDetail = await getGLDetail(
      auth.companyId,
      settings.accountIds,
      parsed.data.as_of_date,
      timezone,
      parsed.data.cursor,
      parsed.data.limit
    );

    return successResponse({
      as_of_date: parsed.data.as_of_date,
      configured_account_ids: settings.accountIds,
      lines: glDetail.lines.map((line) => ({
        journal_line_id: line.journalLineId,
        journal_batch_id: line.journalBatchId,
        journal_number: line.journalNumber,
        effective_date: line.effectiveDate,
        description: line.description,
        account_id: line.accountId,
        account_code: line.accountCode,
        account_name: line.accountName,
        debit: line.debit,
        credit: line.credit,
        source_type: line.sourceType,
        source_id: line.sourceId,
        posted_at: line.postedAt,
      })),
      next_cursor: glDetail.nextCursor,
      has_more: glDetail.hasMore,
      total_count: glDetail.totalCount,
    });
  } catch (error) {
    if (error instanceof APReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 409);
    }
    if (error instanceof APReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 500);
    }
    console.error("GET /purchasing/reports/ap-reconciliation/gl-detail failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch GL detail", 500);
  }
});

// =============================================================================
// AP Detail Endpoint
// GET /purchasing/reports/ap-reconciliation/ap-detail
// =============================================================================

apReconciliationRoutes.get("/ap-detail", async (c) => {
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
    const parsed = APReconciliationDrilldownQuerySchema.safeParse({
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid query parameters: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    const apDetail = await getAPDetail(
      auth.companyId,
      parsed.data.as_of_date,
      parsed.data.cursor,
      parsed.data.limit
    );

    return successResponse({
      as_of_date: parsed.data.as_of_date,
      lines: apDetail.lines.map((line) => ({
        id: line.id,
        type: line.type,
        reference: line.reference,
        date: line.date,
        due_date: line.dueDate,
        supplier_id: line.supplierId,
        supplier_name: line.supplierName,
        currency_code: line.currencyCode,
        original_amount: line.originalAmount,
        base_amount: line.baseAmount,
        open_amount: line.openAmount,
        status: line.status,
        matched: line.matched,
        gl_journal_line_id: line.glJournalLineId,
      })),
      next_cursor: apDetail.nextCursor,
      has_more: apDetail.hasMore,
      total_count: apDetail.totalCount,
      total_open_base: apDetail.totalOpenBase,
    });
  } catch (error) {
    console.error("GET /purchasing/reports/ap-reconciliation/ap-detail failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP detail", 500);
  }
});

// =============================================================================
// Export Endpoint
// GET /purchasing/reports/ap-reconciliation/export
// =============================================================================

apReconciliationRoutes.get("/export", async (c) => {
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
    const parsed = APReconciliationExportQuerySchema.safeParse({
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
    });

    if (!parsed.success) {
      return errorResponse(
        "INVALID_REQUEST",
        "Invalid query parameters: " + parsed.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    // Generate full drilldown data across pages for export (no truncation)
    const pageLimit = 500;
    let cursor: string | undefined;
    let hasMore = true;
    let firstPage: DrilldownResult | null = null;

    const categoryItems = new Map<string, any[]>();

    while (hasMore) {
      const page = await getAPReconciliationDrilldown(
        auth.companyId,
        parsed.data.as_of_date,
        cursor,
        pageLimit
      );

      if (!firstPage) {
        firstPage = page;
      }

      for (const category of page.categories) {
        const existing = categoryItems.get(category.category) || [];
        existing.push(...category.items);
        categoryItems.set(category.category, existing);
      }

      hasMore = page.hasMore;
      cursor = page.nextCursor || undefined;
    }

    const drilldown: DrilldownResult = {
      asOfDate: firstPage?.asOfDate || parsed.data.as_of_date,
      configuredAccountIds: firstPage?.configuredAccountIds || [],
      currency: firstPage?.currency || "IDR",
      apSubledgerBalance: firstPage?.apSubledgerBalance || "0.0000",
      glControlBalance: firstPage?.glControlBalance || "0.0000",
      variance: firstPage?.variance || "0.0000",
      categories: (firstPage?.categories || []).map((c) => {
        const items = categoryItems.get(c.category) || [];
        return {
          category: c.category,
          totalDifference: c.totalDifference,
          itemCount: items.length,
          items,
        };
      }),
      nextCursor: null,
      hasMore: false,
    };

    // Generate CSV
    const csv = generateDrilldownCSV(drilldown);

    // Return CSV response
    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", `attachment; filename="ap-reconciliation-${parsed.data.as_of_date}.csv"`);
    return c.body(csv);
  } catch (error) {
    if (error instanceof APReconciliationSettingsRequiredError) {
      return errorResponse(error.code, error.message, 409);
    }
    if (error instanceof APReconciliationTimezoneRequiredError) {
      return errorResponse(error.code, error.message, 500);
    }
    console.error("GET /purchasing/reports/ap-reconciliation/export failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to export AP reconciliation", 500);
  }
});

export { apReconciliationRoutes };
