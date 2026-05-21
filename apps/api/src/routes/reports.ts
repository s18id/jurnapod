// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reports Routes
 *
 * Routes for report generation:
 * GET /reports/trial-balance - Trial balance report
 * GET /reports/trial-balance/export - Trial balance CSV export
 * GET /reports/profit-loss - Profit & Loss report
 * GET /reports/pos-transactions - POS transaction history
 * GET /reports/journals - Journal entries
 * GET /reports/daily-sales - Daily sales summary
 * GET /reports/pos-payments - POS payments summary
 * GET /reports/general-ledger - General ledger detail
 * GET /reports/general-ledger/export - General ledger CSV export
 * GET /reports/worksheet - Trial balance worksheet
 * GET /reports/receivables-ageing - Receivables ageing report
 * GET /reports/receivables-ageing/export - Receivables ageing CSV export
 *
 * Route handlers are thin HTTP adapters that:
 * - Parse request parameters
 * - Build report context (auth, date range, outlets, timezone)
 * - Call report service
 * - Map response
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { authenticateRequest } from "@/lib/auth-guard";
import { successResponse } from "@jurnapod/shared";
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
} from "@jurnapod/modules-reporting";
import {
  reportQuerySchema,
  reportPaginationSchema,
  buildReportContext,
  parseReportQuery,
} from "@/lib/reports/context";
import {
  executeReport,
  emitReportSuccess,
  handleReportError,
} from "@/lib/reports/error-handler";
import { getCompanyService } from "@/lib/companies";
import type { AuthContext } from "@/lib/auth-guard";
import type { ReportType } from "@/lib/reports/telemetry";
import { customerExistsInCompany } from "@/lib/customers";
import { UtcIsoSchema, nowUTC, fromUtcIso } from "@/lib/date-helpers";
import {
  buildReportCsvFilename,
  generalLedgerToCsv,
  receivablesAgeingToCsv,
  trialBalanceToCsv,
} from "@/lib/reports/csv-export";


const reportRoutes = new Hono();

const csvFormatSchema = z.object({
  format: z.literal("csv").optional(),
});

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

const DateOnlyQuerySchema = zodOpenApi.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CsvExportQuerySchema = zodOpenApi.object({
  format: zodOpenApi.literal("csv").optional().openapi({ description: "Export format; only csv is supported" }),
});
const CsvExportResponse = {
  description: "CSV attachment",
  content: {
    "text/csv": {
      schema: zodOpenApi.string().openapi({ description: "CSV file content" }),
    },
  },
};
const ReportErrorResponseSchema = zodOpenApi.object({
  success: zodOpenApi.literal(false),
  error: zodOpenApi.object({
    code: zodOpenApi.string(),
    message: zodOpenApi.string(),
  }),
});
const ReportExportErrorResponses = {
  400: { description: "Invalid request", content: { "application/json": { schema: ReportErrorResponseSchema } } },
  401: { description: "Unauthorized", content: { "application/json": { schema: ReportErrorResponseSchema } } },
  403: { description: "Forbidden", content: { "application/json": { schema: ReportErrorResponseSchema } } },
  500: { description: "Internal server error", content: { "application/json": { schema: ReportErrorResponseSchema } } },
};
const TrialBalanceRowSchema = zodOpenApi.object({
  account_id: zodOpenApi.number(),
  account_code: zodOpenApi.string(),
  account_name: zodOpenApi.string(),
  total_debit: zodOpenApi.number(),
  total_credit: zodOpenApi.number(),
  balance: zodOpenApi.number(),
});
const GeneralLedgerLineSchema = zodOpenApi.object({
  line_id: zodOpenApi.number(),
  line_date: zodOpenApi.string(),
  description: zodOpenApi.string(),
  debit: zodOpenApi.number(),
  credit: zodOpenApi.number(),
  balance: zodOpenApi.number(),
  outlet_id: zodOpenApi.number().nullable(),
  outlet_name: zodOpenApi.string().nullable(),
  journal_batch_id: zodOpenApi.number(),
  doc_type: zodOpenApi.string(),
  doc_id: zodOpenApi.number(),
  posted_at: zodOpenApi.string(),
});
const GeneralLedgerAccountSchema = zodOpenApi.object({
  account_id: zodOpenApi.number(),
  account_code: zodOpenApi.string(),
  account_name: zodOpenApi.string(),
  report_group: zodOpenApi.string().nullable(),
  normal_balance: zodOpenApi.string().nullable(),
  opening_debit: zodOpenApi.number(),
  opening_credit: zodOpenApi.number(),
  period_debit: zodOpenApi.number(),
  period_credit: zodOpenApi.number(),
  opening_balance: zodOpenApi.number(),
  ending_balance: zodOpenApi.number(),
  lines: zodOpenApi.array(GeneralLedgerLineSchema),
});
const ReceivablesAgeingBucketsSchema = zodOpenApi.object({
  current: zodOpenApi.number(),
  "1_30_days": zodOpenApi.number(),
  "31_60_days": zodOpenApi.number(),
  "61_90_days": zodOpenApi.number(),
  over_90_days: zodOpenApi.number(),
});
const ReceivablesAgeingInvoiceSchema = zodOpenApi.object({
  invoice_id: zodOpenApi.number(),
  invoice_no: zodOpenApi.string(),
  outlet_id: zodOpenApi.number(),
  outlet_name: zodOpenApi.string().nullable(),
  invoice_date: zodOpenApi.string(),
  due_date: zodOpenApi.string().nullable(),
  days_overdue: zodOpenApi.number(),
  outstanding_amount: zodOpenApi.number(),
  age_bucket: zodOpenApi.string(),
  customer_id: zodOpenApi.number().nullable(),
  customer_code: zodOpenApi.string().nullable(),
  customer_type: zodOpenApi.number().nullable(),
  customer_display_name: zodOpenApi.string().nullable(),
  overdue: zodOpenApi.boolean(),
});

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
      as_of: UtcIsoSchema.optional()
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
// GET /reports/trial-balance/export - Trial balance CSV export
// ============================================================================

reportRoutes.get("/trial-balance/export", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "trial_balance";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = reportQuerySchema.extend({
      as_of: UtcIsoSchema.optional(),
      format: csvFormatSchema.shape.format,
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      as_of: url.searchParams.get("as_of") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
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
        timezone: context.timezone,
      }),
      { startTime }
    );

    const totals = rows.reduce(
      (acc, row) => ({
        total_debit: acc.total_debit + row.total_debit,
        total_credit: acc.total_credit + row.total_credit,
        balance: acc.balance + row.balance,
      }),
      { total_debit: 0, total_credit: 0, balance: 0 }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, rows.length);

    const filenameDate = parsed.as_of ? fromUtcIso.dateOnly(parsed.as_of) : context.dateTo;
    return csvResponse(
      trialBalanceToCsv(rows, totals),
      buildReportCsvFilename("trial-balance", filenameDate)
    );
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
      as_of: UtcIsoSchema.optional(),
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
// GET /reports/general-ledger/export - General ledger CSV export
// ============================================================================

reportRoutes.get("/general-ledger/export", async (c) => {
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
      format: csvFormatSchema.shape.format,
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      account_id: url.searchParams.get("account_id") ?? undefined,
      line_limit: url.searchParams.get("line_limit") ?? undefined,
      line_offset: url.searchParams.get("line_offset") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
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

    return csvResponse(
      generalLedgerToCsv(rows),
      buildReportCsvFilename("general-ledger", context.dateTo)
    );
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
    const accessGuard = requireAccess({ module: "accounting", permission: "analyze", resource: "reports" });
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
    const companyService = getCompanyService();
    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const asOfDate = parsed.as_of_date ?? fromUtcIso.dateOnly(nowUTC());

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

// ============================================================================
// GET /reports/receivables-ageing/export - Receivables ageing CSV export
// ============================================================================

reportRoutes.get("/receivables-ageing/export", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "receivables_ageing";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = z.object({
      outlet_id: z.coerce.number().int().positive().optional(),
      as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      format: csvFormatSchema.shape.format,
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
    });

    const auth = c.get("auth") as AuthContext;

    const { requireAccess } = await import("@/lib/auth-guard");
    const accessGuard = requireAccess({ module: "accounting", permission: "analyze", resource: "reports" });
    const accessResult = await accessGuard(c.req.raw, auth);
    if (accessResult !== null) return accessResult;

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

    const companyService = getCompanyService();
    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? "UTC";

    const asOfDate = parsed.as_of_date ?? fromUtcIso.dateOnly(nowUTC());

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

    return csvResponse(
      receivablesAgeingToCsv(result),
      buildReportCsvFilename("receivables-ageing", asOfDate)
    );
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

// ============================================================================
// GET /reports/receivables-ageing/customer/:customerId - Customer drill-down
// ============================================================================

reportRoutes.get("/receivables-ageing/customer/:customerId", async (c) => {
  const startTime = Date.now();
  const REPORT_TYPE = "receivables_ageing_customer";

  try {
    const url = new URL(c.req.raw.url);
    const parsed = z.object({
      outlet_id: z.coerce.number().int().positive().optional(),
      as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
    });

    const auth = c.get("auth") as AuthContext;

    // Check module permission
    const { requireAccess } = await import("@/lib/auth-guard");
    const accessGuard = requireAccess({ module: "accounting", permission: "analyze", resource: "reports" });
    const accessResult = await accessGuard(c.req.raw, auth);
    if (accessResult !== null) return accessResult;

    // Parse customer ID from route params
    const customerId = z.coerce.number().int().positive().parse(c.req.param("customerId"));

    // Verify customer belongs to this company
    const customerExists = await customerExistsInCompany(auth.companyId, customerId);
    if (!customerExists) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Customer not found" } },
        { status: 404 }
      );
    }

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
    const companyService = getCompanyService();
    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? "UTC";

    const asOfDate = parsed.as_of_date ?? fromUtcIso.dateOnly(nowUTC());

    const result = await executeReport(
      REPORT_TYPE as ReportType,
      auth.companyId,
      () => getReceivablesAgeingReport({
        companyId: auth.companyId,
        outletIds,
        asOfDate,
        timezone,
        customerId, // filter by customer
      }),
      { startTime, rowCount: (r) => r.invoices.length }
    );

    emitReportSuccess(REPORT_TYPE as ReportType, auth.companyId, startTime, result.invoices.length);

    return successResponse({
      filters: {
        outlet_ids: outletIds,
        as_of_date: asOfDate,
        customer_id: customerId,
      },
      ...result
    });
  } catch (error) {
    const auth = c.get("auth") as AuthContext;
    return handleReportError(error, startTime, auth.companyId, REPORT_TYPE);
  }
});

export { reportRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Registers report routes with an OpenAPIHono instance.
 */
export function registerReportRoutes(app: OpenAPIHono): void {
  // GET /reports/trial-balance - Trial balance report
  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/trial-balance",
      operationId: "getTrialBalanceReport",
      summary: "Trial balance report",
      description: "Generate trial balance report with optional filters.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          date_from: zodOpenApi.string().optional().openapi({ description: "Date from" }),
          date_to: zodOpenApi.string().optional().openapi({ description: "Date to" }),
          as_of: zodOpenApi.string().optional().openapi({ description: "As of date" }),
        }),
      },
      responses: {
        200: {
          description: "Trial balance report",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.object({
                  filters: zodOpenApi.object({
                    outlet_ids: zodOpenApi.array(zodOpenApi.number()),
                    date_from: zodOpenApi.string().nullable(),
                    date_to: zodOpenApi.string().nullable(),
                    as_of: zodOpenApi.string().nullable(),
                  }),
                  totals: zodOpenApi.object({
                    total_debit: zodOpenApi.number(),
                    total_credit: zodOpenApi.number(),
                    balance: zodOpenApi.number(),
                  }),
                  rows: zodOpenApi.array(TrialBalanceRowSchema),
                }).openapi("TrialBalanceReportResponse"),
              }),
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const startTime = Date.now();
      const REPORT_TYPE = "trial_balance";

      try {
        const url = new URL(c.req.raw.url);
        const parsed = reportQuerySchema.extend({
          as_of: UtcIsoSchema.optional()
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
          (acc: any, row: any) => ({
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
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/trial-balance/export",
      operationId: "exportTrialBalanceCsv",
      summary: "Export trial balance as CSV",
      description: "Export trial balance report using accounting.reports ANALYZE permission.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          date_from: DateOnlyQuerySchema.optional().openapi({ description: "Date from" }),
          date_to: DateOnlyQuerySchema.optional().openapi({ description: "Date to" }),
          as_of: zodOpenApi.string().optional().openapi({ description: "As-of UTC instant" }),
          format: CsvExportQuerySchema.shape.format,
        }),
      },
      responses: {
        200: CsvExportResponse,
        ...ReportExportErrorResponses,
      },
    }),
    async (): Promise<never> => {
      throw new Error("OpenAPI placeholder route");
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/general-ledger",
      operationId: "getGeneralLedgerReport",
      summary: "General ledger report",
      description: "Generate general ledger detail with optional account and line pagination filters.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          date_from: DateOnlyQuerySchema.optional().openapi({ description: "Date from" }),
          date_to: DateOnlyQuerySchema.optional().openapi({ description: "Date to" }),
          account_id: zodOpenApi.string().optional().openapi({ description: "Account ID" }),
          line_limit: zodOpenApi.string().optional().openapi({ description: "Line limit" }),
          line_offset: zodOpenApi.string().optional().openapi({ description: "Line offset" }),
        }),
      },
      responses: {
        200: {
          description: "General ledger report",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.object({
                  filters: zodOpenApi.object({
                    outlet_ids: zodOpenApi.array(zodOpenApi.number()),
                    account_id: zodOpenApi.number().nullable(),
                    date_from: zodOpenApi.string(),
                    date_to: zodOpenApi.string(),
                    line_limit: zodOpenApi.number().nullable(),
                    line_offset: zodOpenApi.number().nullable(),
                  }),
                  rows: zodOpenApi.array(GeneralLedgerAccountSchema),
                }).openapi("GeneralLedgerReportResponseData"),
              }).openapi("GeneralLedgerReportResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    async (c) => c.json({ success: true, data: { filters: {}, rows: [] } })
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/general-ledger/export",
      operationId: "exportGeneralLedgerCsv",
      summary: "Export general ledger as CSV",
      description: "Export general ledger report using accounting.reports ANALYZE permission.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          date_from: DateOnlyQuerySchema.optional().openapi({ description: "Date from" }),
          date_to: DateOnlyQuerySchema.optional().openapi({ description: "Date to" }),
          account_id: zodOpenApi.string().optional().openapi({ description: "Account ID" }),
          line_limit: zodOpenApi.string().optional().openapi({ description: "Line limit" }),
          line_offset: zodOpenApi.string().optional().openapi({ description: "Line offset" }),
          format: CsvExportQuerySchema.shape.format,
        }),
      },
      responses: {
        200: CsvExportResponse,
        ...ReportExportErrorResponses,
      },
    }),
    async (): Promise<never> => {
      throw new Error("OpenAPI placeholder route");
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/receivables-ageing",
      operationId: "getReceivablesAgeingReport",
      summary: "Receivables ageing report",
      description: "Generate AR ageing with outlet_id and as_of_date filters. Customer display field is customer_display_name.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          as_of_date: DateOnlyQuerySchema.optional().openapi({ description: "As-of business date" }),
        }),
      },
      responses: {
        200: {
          description: "Receivables ageing report",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.object({
                  filters: zodOpenApi.object({
                    outlet_ids: zodOpenApi.array(zodOpenApi.number()),
                    as_of_date: zodOpenApi.string(),
                  }),
                  buckets: ReceivablesAgeingBucketsSchema,
                  total_outstanding: zodOpenApi.number(),
                  invoices: zodOpenApi.array(ReceivablesAgeingInvoiceSchema),
                }).openapi("ReceivablesAgeingReportResponseData"),
              }).openapi("ReceivablesAgeingReportResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    async (c) => c.json({ success: true, data: { filters: {}, buckets: {}, total_outstanding: 0, invoices: [] } })
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/receivables-ageing/export",
      operationId: "exportReceivablesAgeingCsv",
      summary: "Export receivables ageing as CSV",
      description: "Export AR ageing report using accounting.reports ANALYZE permission.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          as_of_date: DateOnlyQuerySchema.optional().openapi({ description: "As-of business date" }),
          format: CsvExportQuerySchema.shape.format,
        }),
      },
      responses: {
        200: CsvExportResponse,
        ...ReportExportErrorResponses,
      },
    }),
    async (): Promise<never> => {
      throw new Error("OpenAPI placeholder route");
    }
  );

  // GET /reports/profit-loss - Profit & Loss report
  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/profit-loss",
      operationId: "getProfitLossReport",
      summary: "Profit & Loss report",
      description: "Generate profit and loss report with optional filters.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          date_from: zodOpenApi.string().optional().openapi({ description: "Date from" }),
          date_to: zodOpenApi.string().optional().openapi({ description: "Date to" }),
        }),
      },
      responses: {
        200: {
          description: "Profit & Loss report",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.any(),
              }).openapi("ProfitLossReportResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
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
          { startTime, rowCount: (r: any) => r.rows.length }
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
    }
  );

  // GET /reports/pos-transactions - POS transaction history
  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/pos-transactions",
      operationId: "getPosTransactionsReport",
      summary: "POS transactions report",
      description: "Get POS transaction history with optional filters.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          date_from: zodOpenApi.string().optional().openapi({ description: "Date from" }),
          date_to: zodOpenApi.string().optional().openapi({ description: "Date to" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Limit" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset" }),
          status: zodOpenApi.string().optional().openapi({ description: "Status" }),
        }),
      },
      responses: {
        200: {
          description: "POS transactions report",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.any(),
              }).openapi("PosTransactionsReportResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const startTime = Date.now();
      const REPORT_TYPE = "pos_transactions";

      try {
        const url = new URL(c.req.raw.url);
        const parsed = reportPaginationSchema.extend({
          status: z.enum(["COMPLETED", "VOID", "REFUND"]).optional(),
        }).parse({
          outlet_id: url.searchParams.get("outlet_id") ?? undefined,
          date_from: url.searchParams.get("date_from") ?? undefined,
          date_to: url.searchParams.get("date_to") ?? undefined,
          limit: url.searchParams.get("limit") ?? undefined,
          offset: url.searchParams.get("offset") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
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
          }),
          { startTime, rowCount: (r: any) => r.transactions.length }
        );

        emitReportSuccess(REPORT_TYPE as ReportType, context.auth.companyId, startTime, result.transactions.length);
        return successResponse({
          filters: {
            outlet_ids: context.outletIds,
            date_from: context.dateFrom,
            date_to: context.dateTo,
            status: parsed.status ?? null,
            user_id: context.cashierOnly ? context.auth.userId : null,
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
    }
  );

  // GET /reports/daily-sales - Daily sales summary
  app.openapi(
    createRoute({
      method: "get",
      path: "/reports/daily-sales",
      operationId: "getDailySalesReport",
      summary: "Daily sales report",
      description: "Get daily sales summary with optional filters.",
      tags: ["Reports"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          date_from: zodOpenApi.string().optional().openapi({ description: "Date from" }),
          date_to: zodOpenApi.string().optional().openapi({ description: "Date to" }),
          status: zodOpenApi.string().optional().openapi({ description: "Status" }),
        }),
      },
      responses: {
        200: {
          description: "Daily sales report",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.any(),
              }).openapi("DailySalesReportResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
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
    }
  );
}
