// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reports Routes
 *
 * Routes for report generation:
 * GET /reports/trial-balance - Trial balance report
 * GET /reports/profit-loss - Profit & Loss report
 * GET /reports/pos-transactions - POS transaction history
 * GET /reports/journals - Journal entries
 * GET /reports/daily-sales - Daily sales summary
 * GET /reports/pos-payments - POS payments summary
 * GET /reports/general-ledger - General ledger detail
 * GET /reports/worksheet - Trial balance worksheet
 * GET /reports/receivables-ageing - Receivables ageing report
 *
 * Route handlers are thin HTTP adapters that:
 * - Parse request parameters
 * - Build report context (auth, date range, outlets, timezone)
 * - Call report service
 * - Map response
 */

import { Hono } from "hono";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth-guard";
import { successResponse } from "@/lib/response";
import {
  getTrialBalance,
  getProfitLoss,
  listPosTransactions,
  listDailySalesSummary,
  listPosPaymentsSummary,
  listJournalBatches,
  getGeneralLedgerDetail,
  getReceivablesAgeingReport,
  getTrialBalanceWorksheet,
} from "@/lib/reports";
import {
  reportQuerySchema,
  reportPaginationSchema,
  buildReportContext,
  parseReportQuery,
} from "@/lib/report-context";
import {
  executeReport,
  emitReportSuccess,
  handleReportError,
} from "@/lib/report-error-handler";
import type { AuthContext } from "@/lib/auth-guard";
import type { ReportType } from "@/lib/report-telemetry";

const reportRoutes = new Hono();

// ============================================================================
// Auth middleware
// ============================================================================

reportRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// ============================================================================
// GET /reports/trial-balance - Trial balance report
// ============================================================================

reportRoutes.get("/trial-balance", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "trial_balance";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = reportQuerySchema.extend({
      as_of: z.string().datetime({ offset: true }).optional()
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      as_of: url.searchParams.get("as_of") ?? undefined,
    });

    const { error, context } = await buildReportContext(c, "accounting", parsed);
    if (error) return error;
    if (!context) throw new Error("Context not built");

    const rows = await executeReport(
      REPORT_TYPE as ReportType,
      context.auth.companyId,
      () => getTrialBalance({
        companyId: context.auth.companyId,
        outletIds: context.outletIds,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        asOf: parsed.as_of,
        includeUnassignedOutlet: !parsed.outlet_id,
        timezone: context.timezone
      }),
      { startTime }
    );

    const totals = rows.reduce(
      (acc, row) => ({
        total_debit: acc.total_debit + row.total_debit,
        total_credit: acc.total_credit + row.total_credit,
        balance: acc.balance + row.balance
      }),
      { total_debit: 0, total_credit: 0, balance: 0 }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, rows.length);

    return successResponse({
      filters: {
        outlet_ids: context.outletIds,
        date_from: context.dateFrom,
        date_to: context.dateTo,
        as_of: parsed.as_of ?? null
      },
      totals,
      rows
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/profit-loss - Profit & Loss report
// ============================================================================

reportRoutes.get("/profit-loss", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "profit_loss";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = parseReportQuery(reportQuerySchema, url);

    const { error, context } = await buildReportContext(c, "accounting", parsed);
    if (error) return error;
    if (!context) throw new Error("Context not built");

    const result = await executeReport(
      REPORT_TYPE as ReportType,
      context.auth.companyId,
      () => getProfitLoss({
        companyId: context.auth.companyId,
        outletIds: context.outletIds,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        timezone: context.timezone
      }),
      { startTime, rowCount: (r) => r.rows.length }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, result.rows.length);

    return successResponse({
      filters: {
        outlet_ids: context.outletIds,
        date_from: context.dateFrom,
        date_to: context.dateTo,
      },
      ...result
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/pos-transactions - POS transaction history
// ============================================================================

reportRoutes.get("/pos-transactions", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "pos_transactions";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = reportPaginationSchema.extend({
      status: z.enum(["COMPLETED", "VOID", "REFUND"]).optional(),
      as_of_id: z.coerce.number().int().positive().optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      as_of_id: url.searchParams.get("as_of_id") ?? undefined,
    });

    const { error, context } = await buildReportContext(c, "pos", parsed, { supportsCashierOnly: true });
    if (error) return error;
    if (!context) throw new Error("Context not built");

    const limit = Math.min(parsed.limit ?? 50, 100);
    const offset = parsed.offset ?? 0;

    const result = await executeReport(
      REPORT_TYPE as ReportType,
      context.auth.companyId,
      () => listPosTransactions({
        companyId: context.auth.companyId,
        outletIds: context.outletIds,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        timezone: context.timezone,
        status: parsed.status,
        userId: context.cashierOnly ? context.auth.userId : undefined,
        limit,
        offset,
        asOfId: parsed.as_of_id,
      }),
      { startTime, rowCount: (r) => r.transactions.length }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, result.transactions.length);

    return successResponse({
      filters: {
        outlet_ids: context.outletIds,
        date_from: context.dateFrom,
        date_to: context.dateTo,
        status: parsed.status ?? null,
        user_id: context.cashierOnly ? context.auth.userId : null,
        as_of: result.as_of,
        as_of_id: result.as_of_id,
      },
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: result.total > offset + result.transactions.length,
      },
      transactions: result.transactions
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/journals - Journal batch history
// ============================================================================

reportRoutes.get("/journals", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "journals";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = reportPaginationSchema.extend({
      as_of: z.string().datetime({ offset: true }).optional(),
      as_of_id: z.coerce.number().int().positive().optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      as_of: url.searchParams.get("as_of") ?? undefined,
      as_of_id: url.searchParams.get("as_of_id") ?? undefined,
    });

    const { error, context } = await buildReportContext(c, "accounting", parsed);
    if (error) return error;
    if (!context) throw new Error("Context not built");

    const limit = Math.min(parsed.limit ?? 50, 100);
    const offset = parsed.offset ?? 0;

    const result = await executeReport(
      REPORT_TYPE as ReportType,
      context.auth.companyId,
      () => listJournalBatches({
        companyId: context.auth.companyId,
        outletIds: context.outletIds,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        timezone: context.timezone,
        limit,
        offset,
        asOf: parsed.as_of,
        asOfId: parsed.as_of_id,
        includeUnassignedOutlet: !parsed.outlet_id,
      }),
      { startTime, rowCount: (r) => r.journals.length }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, result.journals.length);

    return successResponse({
      filters: {
        outlet_ids: context.outletIds,
        date_from: context.dateFrom,
        date_to: context.dateTo,
        as_of: result.as_of,
        as_of_id: result.as_of_id,
      },
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: result.total > offset + result.journals.length,
      },
      journals: result.journals
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/daily-sales - Daily sales summary
// ============================================================================

reportRoutes.get("/daily-sales", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "daily_sales";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = reportQuerySchema.extend({
      status: z.enum(["COMPLETED", "VOID", "REFUND"]).optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    const { error, context } = await buildReportContext(c, "pos", parsed, { supportsCashierOnly: true });
    if (error) return error;
    if (!context) throw new Error("Context not built");

    const rows = await executeReport(
      REPORT_TYPE as ReportType,
      context.auth.companyId,
      () => listDailySalesSummary({
        companyId: context.auth.companyId,
        outletIds: context.outletIds,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        timezone: context.timezone,
        userId: context.cashierOnly ? context.auth.userId : undefined,
        status: parsed.status,
      }),
      { startTime }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, rows.length);

    return successResponse({
      filters: {
        outlet_ids: context.outletIds,
        date_from: context.dateFrom,
        date_to: context.dateTo,
        user_id: context.cashierOnly ? context.auth.userId : null,
        status: parsed.status ?? null,
      },
      rows
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/pos-payments - POS payments summary
// ============================================================================

reportRoutes.get("/pos-payments", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "pos_payments";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = reportQuerySchema.extend({
      status: z.enum(["COMPLETED", "VOID", "REFUND"]).optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    const { error, context } = await buildReportContext(c, "pos", parsed, { supportsCashierOnly: true });
    if (error) return error;
    if (!context) throw new Error("Context not built");

    const rows = await executeReport(
      REPORT_TYPE as ReportType,
      context.auth.companyId,
      () => listPosPaymentsSummary({
        companyId: context.auth.companyId,
        outletIds: context.outletIds,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        timezone: context.timezone,
        userId: context.cashierOnly ? context.auth.userId : undefined,
        status: parsed.status,
      }),
      { startTime }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, rows.length);

    return successResponse({
      filters: {
        outlet_ids: context.outletIds,
        date_from: context.dateFrom,
        date_to: context.dateTo,
        user_id: context.cashierOnly ? context.auth.userId : null,
        status: parsed.status ?? null,
      },
      rows
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/general-ledger - General ledger detail
// ============================================================================

reportRoutes.get("/general-ledger", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "general_ledger";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = z.object({
      outlet_id: z.coerce.number().int().positive().optional(),
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      account_id: z.coerce.number().int().positive().optional(),
      line_limit: z.coerce.number().int().positive().max(1000).optional(),
      line_offset: z.coerce.number().int().min(0).optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      account_id: url.searchParams.get("account_id") ?? undefined,
      line_limit: url.searchParams.get("line_limit") ?? undefined,
      line_offset: url.searchParams.get("line_offset") ?? undefined,
    });

    const { error, context } = await buildReportContext(c, "accounting", parsed);
    if (error) return error;
    if (!context) throw new Error("Context not built");

    const rows = await executeReport(
      REPORT_TYPE as ReportType,
      context.auth.companyId,
      () => getGeneralLedgerDetail({
        companyId: context.auth.companyId,
        outletIds: context.outletIds,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        accountId: parsed.account_id,
        timezone: context.timezone,
        lineLimit: parsed.line_limit,
        lineOffset: parsed.line_offset,
      }),
      { startTime }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, rows.length);

    return successResponse({
      filters: {
        outlet_ids: context.outletIds,
        account_id: parsed.account_id ?? null,
        date_from: context.dateFrom,
        date_to: context.dateTo,
        line_limit: parsed.line_limit ?? null,
        line_offset: parsed.line_offset ?? null,
      },
      rows
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/worksheet - Trial balance worksheet
// ============================================================================

reportRoutes.get("/worksheet", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "worksheet";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = parseReportQuery(reportQuerySchema, url);

    const { error, context } = await buildReportContext(c, "accounting", parsed);
    if (error) return error;
    if (!context) throw new Error("Context not built");

    const result = await executeReport(
      REPORT_TYPE as ReportType,
      context.auth.companyId,
      () => getTrialBalanceWorksheet({
        companyId: context.auth.companyId,
        outletIds: context.outletIds,
        dateFrom: context.dateFrom,
        dateTo: context.dateTo,
        timezone: context.timezone,
      }),
      { startTime, rowCount: (r) => r.length }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, result.length);

    return successResponse({
      filters: {
        outlet_ids: context.outletIds,
        date_from: context.dateFrom,
        date_to: context.dateTo,
      },
      ...result
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/receivables-ageing - Receivables ageing report
// ============================================================================

reportRoutes.get("/receivables-ageing", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "receivables_ageing";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = z.object({
      outlet_id: z.coerce.number().int().positive().optional(),
      as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
    });

    // For receivables ageing, we need special handling since it doesn't use date_from/date_to
    const auth = c.get("auth") as AuthContext;

    // Check module permission
    const { requireAccess } = await import("@/lib/auth-guard");
    const accessGuard = requireAccess({ module: "accounting", permission: "report" });
    const accessResult = await accessGuard(c.req.raw, auth);
    if (accessResult !== null) return accessResult;

    // Outlet scope resolution
    let outletIds: number[];
    if (parsed.outlet_id) {
      const { userHasOutletAccess } = await import("@/lib/auth");
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return Response.json({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
      }
      outletIds = [parsed.outlet_id];
    } else {
      const { listUserOutletIds } = await import("@/lib/auth");
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    // Timezone resolution
    const { CompanyService } = await import("@jurnapod/modules-platform");
    const { getDb } = await import("@/lib/db");
    const companyService = new CompanyService(getDb());
    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const asOfDate = parsed.as_of_date ?? new Date().toISOString().slice(0, 10);

    const result = await executeReport(
      REPORT_TYPE as ReportType,
      auth.companyId,
      () => getReceivablesAgeingReport({
        companyId: auth.companyId,
        outletIds,
        asOfDate,
        timezone,
      }),
      { startTime, rowCount: (r) => r.invoices.length }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, auth.companyId, startTime, result.invoices.length);

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        as_of_date: asOfDate,
      },
      ...result
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

export { reportRoutes };
