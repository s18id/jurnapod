// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Report Context Builder
 *
 * Extracts shared orchestration patterns from route handlers:
 * - Date range resolution (with fiscal year defaults)
 * - Outlet scope resolution (with access validation)
 * - Timezone resolution
 * - Cashier-only detection
 * - Permission checks
 *
 * This allows route handlers to focus on thin HTTP concerns:
 * validation, calling report service, mapping response.
 */

import { z } from "zod";
import { listUserOutletIds, userHasOutletAccess, checkUserAccess, type RoleCode } from "@/lib/auth";
import { requireAccess } from "@/lib/auth-guard";
import { CompanyService } from "@jurnapod/modules-platform";
import { getDb } from "@/lib/db";
import { resolveDefaultFiscalYearDateRange } from "@/lib/fiscal-years";
import { nowUTC, toUtcIso, fromUtcIso } from "@/lib/date-helpers";
import type { AuthContext } from "@/lib/auth-guard";

// Company service singleton for timezone resolution
const companyService = new CompanyService(getDb());

// ============================================================================
// Shared Query Schemas
// ============================================================================

/**
 * Base query schema used by most report endpoints.
 */
export const reportQuerySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Pagination query schema for list endpoints.
 */
export const reportPaginationSchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// Elevated Roles for Cashier Detection
// ============================================================================

const elevatedRoles = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"] as const;

/**
 * Check if user is exclusively a Cashier (has no elevated roles).
 * Cashiers should only see their own transactions in POS reports.
 */
export async function isCashierOnly(auth: { userId: number; companyId: number }): Promise<boolean> {
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

// ============================================================================
// Date Range Resolution
// ============================================================================

function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const now = nowUTC();
  const to = fromUtcIso.dateOnly(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 30);
  const from = fromUtcIso.dateOnly(toUtcIso.dateLike(fromDate) as string);
  return { dateFrom: from, dateTo: to };
}

/**
 * Resolve date range from query params or fiscal year defaults.
 */
export async function resolveDateRange(
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

// ============================================================================
// Report Context Types
// ============================================================================

export interface ReportContext {
  /** Authenticated user context */
  auth: AuthContext;
  /** Resolved date range */
  dateFrom: string;
  dateTo: string;
  /** Outlet IDs in scope for this report */
  outletIds: number[];
  /** Company timezone */
  timezone: string;
  /** Whether the user is cashier-only (sees only own transactions) */
  cashierOnly: boolean;
  /** Original outlet_id param if provided */
  outletId?: number;
}

export interface ReportContextOptions {
  /** Whether this report supports cashier-only filtering */
  supportsCashierOnly?: boolean;
}

// ============================================================================
// Report Context Builder
// ============================================================================

/**
 * Build a shared report context from request parameters.
 *
 * This extracts common orchestration:
 * - Permission check
 * - Date range resolution
 * - Outlet scope resolution with access validation
 * - Timezone resolution
 * - Cashier-only detection
 */
export async function buildReportContext(
  c: {
    get(key: "auth"): AuthContext;
    req: { raw: Request };
  },
  module: "accounting" | "pos",
  parsedQuery: { outlet_id?: number; date_from?: string; date_to?: string },
  options: ReportContextOptions = {}
): Promise<{ error: Response | null; context: ReportContext | null }> {
  const auth = c.get("auth");

  // Map module to resource for Epic 39 ACL format
  // accounting reports use "accounting.reports", pos reports use "pos.transactions"
  const resource = module === "accounting" ? "reports" : "transactions";

  // Check module permission - get guard function and call it
  const accessGuard = requireAccess({
    module,
    resource,
    permission: "analyze"
  });
  const accessResult = await accessGuard(c.req.raw, auth);

  if (accessResult !== null) {
    return { error: accessResult, context: null };
  }

  const { dateFrom, dateTo } = await resolveDateRange(auth.companyId, parsedQuery);

  // Resolve outlet scope
  let outletIds: number[];
  if (parsedQuery.outlet_id) {
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsedQuery.outlet_id);
    if (!hasAccess) {
      return {
        error: Response.json({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 }),
        context: null
      };
    }
    outletIds = [parsedQuery.outlet_id];
  } else {
    outletIds = await listUserOutletIds(auth.userId, auth.companyId);
  }

  // Resolve timezone
  const company = await companyService.getCompany({ companyId: auth.companyId });
  const timezone = company.timezone ?? 'UTC';

  // Check cashier-only for POS reports
  let cashierOnly = false;
  if (options.supportsCashierOnly) {
    cashierOnly = await isCashierOnly(auth);
  }

  return {
    error: null,
    context: {
      auth,
      dateFrom,
      dateTo,
      outletIds,
      timezone,
      cashierOnly,
      outletId: parsedQuery.outlet_id
    }
  };
}

// ============================================================================
// URL Query Parsing Helper
// ============================================================================

type ZodSchema = z.ZodObject<Record<string, z.ZodType>>;

/**
 * Parse URL search params into a query object.
 */
export function parseReportQuery<S extends ZodSchema>(
  schema: S,
  url: URL
): z.infer<S> {
  return schema.parse({
    outlet_id: url.searchParams.get("outlet_id") ?? undefined,
    date_from: url.searchParams.get("date_from") ?? undefined,
    date_to: url.searchParams.get("date_to") ?? undefined,
  });
}

/**
 * Parse URL search params with pagination support.
 */
export function parseReportPaginationQuery<S extends ZodSchema>(
  baseSchema: S,
  url: URL,
  extraFields: Record<string, z.ZodType>
): z.infer<S> {
  const extended = baseSchema.extend(extraFields);
  return extended.parse({
    outlet_id: url.searchParams.get("outlet_id") ?? undefined,
    date_from: url.searchParams.get("date_from") ?? undefined,
    date_to: url.searchParams.get("date_to") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}
