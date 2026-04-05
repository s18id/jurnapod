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
 */

import { Hono } from "hono";
import { z } from "zod";
import { CompanyService } from "@jurnapod/modules-platform";
import { listUserOutletIds, userHasOutletAccess, checkUserAccess, type RoleCode } from "@/lib/auth";
import { requireAccess } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";
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
  withQueryTimeout,
  QueryTimeoutError,
  getDatasetSizeBucket,
  classifyReportError,
  emitReportMetrics,
  QUERY_TIMEOUT_MS,
  type ReportType,
} from "@/lib/report-telemetry";
import { resolveDefaultFiscalYearDateRange, FiscalYearSelectionError } from "@/lib/fiscal-years";
import { authenticateRequest } from "@/lib/auth-guard";
import type { AuthContext } from "@/lib/auth-guard";

const reportRoutes = new Hono();

// Auth middleware
reportRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Company service for fetching company details (e.g., timezone)
const companyService = new CompanyService(getDb());

// ============================================================================
// Shared Query Schema and Helpers
// ============================================================================

const querySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const paginationSchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * Check if user is exclusively a Cashier (has no elevated roles).
 * Cashiers should only see their own transactions in POS reports.
 */
const elevatedRoles = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"] as const;

async function isCashierOnly(auth: { userId: number; companyId: number }): Promise<boolean> {
  const elevatedAccess = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    allowedRoles: elevatedRoles as readonly RoleCode[]
  });
  if (elevatedAccess?.hasRole) {
    return false;
  }

  const cashierAccess = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    allowedRoles: ["CASHIER"] as const
  });
  return cashierAccess?.hasRole ?? false;
}

function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - 30);
  const from = fromDate.toISOString().slice(0, 10);
  return { dateFrom: from, dateTo: to };
}

async function resolveDateRange(
  companyId: number,
  parsed: { date_from?: string; date_to?: string }
): Promise<{ dateFrom: string; dateTo: string }> {
  if (parsed.date_from || parsed.date_to) {
    const defaults = getDefaultDateRange();
    return {
      dateFrom: parsed.date_from ?? defaults.dateFrom,
      dateTo: parsed.date_to ?? defaults.dateTo
    };
  }
  return resolveDefaultFiscalYearDateRange(companyId);
}

function handleReportError(error: unknown, startTime: number, companyId: number, reportType: string) {
  const errorClass = classifyReportError(error);
  const latencyMs = Date.now() - startTime;

  const bucket = getDatasetSizeBucket(0);
  emitReportMetrics(null, {
    reportType: reportType as ReportType,
    companyId,
    datasetSizeBucket: bucket,
    latencyMs,
    errorClass,
  });

  if (error instanceof QueryTimeoutError) {
    return errorResponse(
      "TIMEOUT",
      "Report generation timed out. Please try a smaller date range.",
      504
    );
  }

  if (error instanceof z.ZodError) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid request parameters: " + error.errors.map(e => e.message).join(", "),
      400
    );
  }

  if (error instanceof FiscalYearSelectionError) {
    return errorResponse("FISCAL_YEAR_REQUIRED", error.message, 400);
  }

  if (error instanceof Error && error.message === "Forbidden") {
    return errorResponse("FORBIDDEN", "Forbidden", 403);
  }

  console.error(`GET /reports/${reportType} failed:`, error);
  return errorResponse("INTERNAL_SERVER_ERROR", `${reportType} report failed`, 500);
}

// ============================================================================
// GET /reports/trial-balance - Trial balance report
// ============================================================================

reportRoutes.get("/trial-balance", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "trial_balance";

  try {
    // Check module permission for accounting reports
    const accessResult = await requireAccess({
      module: "accounting",
      permission: "report"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = querySchema.extend({
      as_of: z.string().datetime({ offset: true }).optional()
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      as_of: url.searchParams.get("as_of") ?? undefined,
    });

    const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const rows = await withQueryTimeout(
      getTrialBalance({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        asOf: parsed.as_of,
        includeUnassignedOutlet: !parsed.outlet_id,
        timezone
      }),
      QUERY_TIMEOUT_MS
    );

    const totals = rows.reduce(
      (acc, row) => ({
        total_debit: acc.total_debit + row.total_debit,
        total_credit: acc.total_credit + row.total_credit,
        balance: acc.balance + row.balance
      }),
      { total_debit: 0, total_credit: 0, balance: 0 }
    );

    const latencyMs = Date.now() - startTime;
    const bucket = getDatasetSizeBucket(rows.length);
    emitReportMetrics(null, {
      reportType: REPORT_TYPE as ReportType,
      companyId: auth.companyId,
      datasetSizeBucket: bucket,
      latencyMs,
      rowCount: rows.length,
    });

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        date_from: dateFrom,
        date_to: dateTo,
        as_of: parsed.as_of ?? null
      },
      totals,
      rows
    });
  } catch (error) {
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/profit-loss - Profit & Loss report
// ============================================================================

reportRoutes.get("/profit-loss", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "profit_loss";

  try {
    // Check module permission for accounting reports
    const accessResult = await requireAccess({
      module: "accounting",
      permission: "report"
    })(c.req.raw, auth);
    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = querySchema.parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
    });

    const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const result = await withQueryTimeout(
      getProfitLoss({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        timezone
      }),
      QUERY_TIMEOUT_MS
    );

    const latencyMs = Date.now() - startTime;
    const bucket = getDatasetSizeBucket(result.rows.length);
    emitReportMetrics(null, {
      reportType: REPORT_TYPE as ReportType,
      companyId: auth.companyId,
      datasetSizeBucket: bucket,
      latencyMs,
      rowCount: result.rows.length,
    });

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        date_from: dateFrom,
        date_to: dateTo,
      },
      ...result
    });
  } catch (error) {
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/pos-transactions - POS transaction history
// ============================================================================

reportRoutes.get("/pos-transactions", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "pos_transactions";

  try {
    // Check module permission for POS reports
    const accessResult = await requireAccess({
      module: "pos",
      permission: "report"
    })(c.req.raw, auth);
    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = paginationSchema.extend({
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

    const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    // Cashiers should only see their own transactions
    const cashierOnly = await isCashierOnly(auth);

    const limit = Math.min(parsed.limit ?? 50, 100);
    const offset = parsed.offset ?? 0;

    const result = await withQueryTimeout(
      listPosTransactions({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        timezone,
        status: parsed.status,
        userId: cashierOnly ? auth.userId : undefined,
        limit,
        offset,
        asOfId: parsed.as_of_id,
      }),
      QUERY_TIMEOUT_MS
    );

    const latencyMs = Date.now() - startTime;
    const bucket = getDatasetSizeBucket(result.transactions.length);
    emitReportMetrics(null, {
      reportType: REPORT_TYPE as ReportType,
      companyId: auth.companyId,
      datasetSizeBucket: bucket,
      latencyMs,
      rowCount: result.transactions.length,
    });

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        date_from: dateFrom,
        date_to: dateTo,
        status: parsed.status ?? null,
        user_id: cashierOnly ? auth.userId : null,
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
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/journals - Journal batch history
// ============================================================================

reportRoutes.get("/journals", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "journals";

  try {
    // Check module permission for accounting reports
    const accessResult = await requireAccess({
      module: "accounting",
      permission: "report"
    })(c.req.raw, auth);
    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = paginationSchema.extend({
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

    const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const limit = Math.min(parsed.limit ?? 50, 100);
    const offset = parsed.offset ?? 0;

    const result = await withQueryTimeout(
      listJournalBatches({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        timezone,
        limit,
        offset,
        asOf: parsed.as_of,
        asOfId: parsed.as_of_id,
        includeUnassignedOutlet: !parsed.outlet_id,
      }),
      QUERY_TIMEOUT_MS
    );

    const latencyMs = Date.now() - startTime;
    const bucket = getDatasetSizeBucket(result.journals.length);
    emitReportMetrics(null, {
      reportType: REPORT_TYPE as ReportType,
      companyId: auth.companyId,
      datasetSizeBucket: bucket,
      latencyMs,
      rowCount: result.journals.length,
    });

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        date_from: dateFrom,
        date_to: dateTo,
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
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/daily-sales - Daily sales summary
// ============================================================================

reportRoutes.get("/daily-sales", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "daily_sales";

  try {
    // Check module permission for POS reports
    const accessResult = await requireAccess({
      module: "pos",
      permission: "report"
    })(c.req.raw, auth);
    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = querySchema.extend({
      status: z.enum(["COMPLETED", "VOID", "REFUND"]).optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    // Cashiers should only see their own transactions
    const cashierOnly = await isCashierOnly(auth);

    const rows = await withQueryTimeout(
      listDailySalesSummary({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        timezone,
        userId: cashierOnly ? auth.userId : undefined,
        status: parsed.status,
      }),
      QUERY_TIMEOUT_MS
    );

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        date_from: dateFrom,
        date_to: dateTo,
        user_id: cashierOnly ? auth.userId : null,
        status: parsed.status ?? null,
      },
      rows
    });
  } catch (error) {
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/pos-payments - POS payments summary
// ============================================================================

reportRoutes.get("/pos-payments", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "pos_payments";

  try {
    // Check module permission for POS reports
    const accessResult = await requireAccess({
      module: "pos",
      permission: "report"
    })(c.req.raw, auth);
    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = querySchema.extend({
      status: z.enum(["COMPLETED", "VOID", "REFUND"]).optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    // Cashiers should only see their own transactions
    const cashierOnly = await isCashierOnly(auth);

    const rows = await withQueryTimeout(
      listPosPaymentsSummary({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        timezone,
        userId: cashierOnly ? auth.userId : undefined,
        status: parsed.status,
      }),
      QUERY_TIMEOUT_MS
    );

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        date_from: dateFrom,
        date_to: dateTo,
        user_id: cashierOnly ? auth.userId : null,
        status: parsed.status ?? null,
      },
      rows
    });
  } catch (error) {
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/general-ledger - General ledger detail
// ============================================================================

reportRoutes.get("/general-ledger", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "general_ledger";

  try {
    // Check module permission for accounting reports
    const accessResult = await requireAccess({
      module: "accounting",
      permission: "report"
    })(c.req.raw, auth);
    if (accessResult !== null) {
      return accessResult;
    }

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

    const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const rows = await withQueryTimeout(
      getGeneralLedgerDetail({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        accountId: parsed.account_id,
        timezone,
        lineLimit: parsed.line_limit,
        lineOffset: parsed.line_offset,
      }),
      QUERY_TIMEOUT_MS
    );

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        account_id: parsed.account_id ?? null,
        date_from: dateFrom,
        date_to: dateTo,
        line_limit: parsed.line_limit ?? null,
        line_offset: parsed.line_offset ?? null,
      },
      rows
    });
  } catch (error) {
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/worksheet - Trial balance worksheet
// ============================================================================

reportRoutes.get("/worksheet", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "worksheet";

  try {
    // Check module permission for accounting reports
    const accessResult = await requireAccess({
      module: "accounting",
      permission: "report"
    })(c.req.raw, auth);
    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = querySchema.parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
    });

    const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsed);

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const result = await withQueryTimeout(
      getTrialBalanceWorksheet({
        companyId: auth.companyId,
        outletIds,
        dateFrom,
        dateTo,
        timezone,
      }),
      QUERY_TIMEOUT_MS
    );

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        date_from: dateFrom,
        date_to: dateTo,
      },
      ...result
    });
  } catch (error) {
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/receivables-ageing - Receivables ageing report
// ============================================================================

reportRoutes.get("/receivables-ageing", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const startTime = Date.now();
  const REPORT_TYPE = "receivables_ageing";

  try {
    // Check module permission for accounting reports
    const accessResult = await requireAccess({
      module: "accounting",
      permission: "report"
    })(c.req.raw, auth);
    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = z.object({
      outlet_id: z.coerce.number().int().positive().optional(),
      as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
    });

    let outletIds: number[];
    if (parsed.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';
    const asOfDate = parsed.as_of_date ?? new Date().toISOString().slice(0, 10);

    const result = await withQueryTimeout(
      getReceivablesAgeingReport({
        companyId: auth.companyId,
        outletIds,
        asOfDate,
        timezone,
      }),
      QUERY_TIMEOUT_MS
    );

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        as_of_date: asOfDate,
      },
      ...result
    });
  } catch (error) {
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

export { reportRoutes };
