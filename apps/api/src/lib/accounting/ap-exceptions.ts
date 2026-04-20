// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Exception Domain Service (Epic 47 Story 47.4)
 *
 * Provides AP exception management:
 * - On-demand detection from AP↔GL variance, supplier statement mismatch, overdue invoices
 * - Idempotent upsert by (company_id, exception_key)
 * - Worklist with filter/sort/pagination
 * - Assign and resolve workflows
 *
 * Key behaviors:
 * - All reads/writes are company-scoped
 * - Internal representation uses int enums (matching migration 0188 canonical)
 * - Route layer handles string<->int API mapping
 * - FIX(47.4-WP-C): marker on each non-trivial implementation decision
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  AP_EXCEPTION_TYPE,
  AP_EXCEPTION_STATUS,
  toApExceptionStatusLabel,
  PURCHASE_INVOICE_STATUS,
  AP_PAYMENT_STATUS,
  PURCHASE_CREDIT_STATUS,
} from "@jurnapod/shared";
import { getDb } from "@/lib/db";
import { toScaled, fromScaled4 } from "@/lib/purchasing/ap-reconciliation.js";
import {
  getAPReconciliationSummary,
} from "@/lib/purchasing/ap-reconciliation.js";
import {
  reconcileSupplierStatement,
} from "@/lib/purchasing/supplier-statements.js";

// =============================================================================
// Error Types
// =============================================================================

export class APExceptionError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "APExceptionError";
  }
}

export class APExceptionNotFoundError extends APExceptionError {
  constructor(exceptionId: number) {
    super("AP_EXCEPTION_NOT_FOUND", `AP exception ${exceptionId} not found`);
  }
}

export class APExceptionAlreadyResolvedError extends APExceptionError {
  constructor(exceptionId: number, currentStatus: number) {
    const label = toApExceptionStatusLabel(currentStatus);
    super(
      "AP_EXCEPTION_ALREADY_RESOLVED",
      `AP exception ${exceptionId} is already ${label} and cannot be transitioned`
    );
  }
}

export class APExceptionInvalidTransitionError extends APExceptionError {
  constructor(exceptionId: number, fromStatus: number, toStatus: number) {
    const fromLabel = toApExceptionStatusLabel(fromStatus);
    const toLabel = toApExceptionStatusLabel(toStatus);
    super(
      "AP_EXCEPTION_INVALID_TRANSITION",
      `Cannot transition AP exception ${exceptionId} from ${fromLabel} to ${toLabel}`
    );
  }
}

export class APExceptionAssignedUserInvalidError extends APExceptionError {
  constructor(userId: number, companyId: number) {
    super(
      "AP_EXCEPTION_ASSIGNED_USER_INVALID",
      `User ${userId} does not belong to company ${companyId}`
    );
  }
}

export class APExceptionDetectionError extends APExceptionError {
  constructor(source: string, reason: string) {
    super(
      "AP_EXCEPTION_DETECTION_ERROR",
      `Detection failed for source ${source}: ${reason}`
    );
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Int-enum based type (matching migration 0188 canonical).
 * Route layer converts to string label via toApExceptionTypeLabel().
 */
export type APExceptionTypeValue = (typeof AP_EXCEPTION_TYPE)[keyof typeof AP_EXCEPTION_TYPE];

/**
 * Int-enum based status (matching migration 0188 canonical).
 * Route layer converts to string label via toApExceptionStatusLabel().
 */
export type APExceptionStatusValue = (typeof AP_EXCEPTION_STATUS)[keyof typeof AP_EXCEPTION_STATUS];

export interface APException {
  id: number;
  companyId: number;
  exceptionKey: string;
  type: APExceptionTypeValue;
  sourceType: string;
  sourceId: number;
  supplierId: number | null;
  varianceAmount: string | null;
  currencyCode: string | null;
  detectedAt: string;
  dueDate: string | null;
  assignedToUserId: number | null;
  assignedAt: string | null;
  status: APExceptionStatusValue;
  resolvedAt: string | null;
  resolvedByUserId: number | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input for detecting a new AP exception */
export interface APExceptionDetectionInput {
  type: APExceptionTypeValue;
  sourceType: string;
  sourceId: number;
  supplierId?: number | null;
  varianceAmount?: string | null;
  currencyCode?: string | null;
  dueDate?: string | null;
  /** Deterministic key: SHA256(source_type:source_id:field) pattern */
  exceptionKey: string;
}

export interface APExceptionWorklistFilters {
  type?: APExceptionTypeValue;
  status?: APExceptionStatusValue;
  supplierId?: number;
  search?: string;
}

export interface APExceptionWorklistOptions {
  limit?: number;
  cursor?: string | null;
}

export interface APExceptionWorklistResult {
  exceptions: APException[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DetectThenListOptions extends APExceptionWorklistOptions {
  /** Force re-detection before listing (default: false) */
  forceRefresh?: boolean;
}

// =============================================================================
// Sort Priority Mapping
// =============================================================================

/**
 * Type priority order for sorting (lower = higher priority = comes first).
 * Order: VARIANCE(2) -> MISMATCH(3) -> DISPUTE(1) -> DUPLICATE(4)
 * FIX(47.4-WP-C): Mirrors requirement "AP-GL then statement mismatch then dispute then overdue"
 * VARIANCE = AP↔GL, MISMATCH = statement, DISPUTE = manual/pass-through, DUPLICATE = overdue (not in scope but kept)
 */
const TYPE_PRIORITY: Record<number, number> = {
  [AP_EXCEPTION_TYPE.VARIANCE]: 1,
  [AP_EXCEPTION_TYPE.MISMATCH]: 2,
  [AP_EXCEPTION_TYPE.DISPUTE]: 3,
  [AP_EXCEPTION_TYPE.DUPLICATE]: 4,
};

// =============================================================================
// Internal Helpers
// =============================================================================

/** Map DB row to APException domain object */
function mapRowToException(row: Record<string, unknown>): APException {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    exceptionKey: String(row.exception_key),
    type: Number(row.type) as APExceptionTypeValue,
    sourceType: String(row.source_type),
    sourceId: Number(row.source_id),
    supplierId: row.supplier_id != null ? Number(row.supplier_id) : null,
    varianceAmount: row.variance_amount != null ? String(row.variance_amount) : null,
    currencyCode: row.currency_code != null ? String(row.currency_code) : null,
    detectedAt:
      row.detected_at instanceof Date
        ? row.detected_at.toISOString()
        : row.detected_at
          ? String(row.detected_at)
          : new Date().toISOString(),
    dueDate: row.due_date instanceof Date
      ? row.due_date.toISOString().split("T")[0]
      : row.due_date
        ? String(row.due_date)
        : null,
    assignedToUserId: row.assigned_to_user_id != null ? Number(row.assigned_to_user_id) : null,
    assignedAt: row.assigned_at instanceof Date
      ? row.assigned_at.toISOString()
      : row.assigned_at
        ? String(row.assigned_at)
        : null,
    status: Number(row.status) as APExceptionStatusValue,
    resolvedAt: row.resolved_at instanceof Date
      ? row.resolved_at.toISOString()
      : row.resolved_at
        ? String(row.resolved_at)
        : null,
    resolvedByUserId: row.resolved_by_user_id != null ? Number(row.resolved_by_user_id) : null,
    resolutionNote: row.resolution_note != null ? String(row.resolution_note) : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at
          ? String(row.created_at)
          : new Date().toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
          ? String(row.updated_at)
          : new Date().toISOString(),
  };
}

/**
 * Parse cursor string into { offset: number, hasTypeFilter: boolean, hasStatusFilter: boolean }
 * Cursor format: base64(offset|type|status) for stable pagination
 * FIX(47.4-WP-C): Simple cursor that preserves filter context for consistent pagination.
 */
function parseCursor(cursor: string | null | undefined): { offset: number; typeFilter?: number; statusFilter?: number } {
  if (!cursor) {
    return { offset: 0 };
  }
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const parts = decoded.split("|");
    return {
      offset: Number(parts[0]) || 0,
      typeFilter: parts[1] ? Number(parts[1]) : undefined,
      statusFilter: parts[2] ? Number(parts[2]) : undefined,
    };
  } catch {
    return { offset: 0 };
  }
}

/**
 * Encode offset + filters into cursor string.
 * FIX(47.4-WP-C): Preserves filter context so subsequent page requests
 * apply the same filters, ensuring consistent ordering.
 */
function encodeCursor(offset: number, typeFilter?: number, statusFilter?: number): string {
  const parts = [String(offset), typeFilter ?? "", statusFilter ?? ""];
  return Buffer.from(parts.join("|")).toString("base64");
}

/**
 * Compute absolute variance for sorting.
 * Handles null/zero gracefully (treated as 0 for sorting).
 */
function absVariance(varianceAmount: string | null): bigint {
  if (!varianceAmount || varianceAmount === "0" || varianceAmount === "0.0000") {
    return 0n;
  }
  const scaled = toScaled(varianceAmount, 4);
  return scaled < 0n ? -scaled : scaled;
}

// =============================================================================
// Detection: AP↔GL Variance
// =============================================================================

/**
 * Detect AP↔GL variance exceptions.
 * Reuses getAPReconciliationSummary to find companies with non-zero variance.
 * FIX(47.4-WP-C): Variance detection reuses existing AP reconciliation logic
 * to avoid duplicating subledger/GL balance computation.
 *
 * @param companyId - Company to detect variance exceptions for
 * @param asOfDate - Date for AP reconciliation check
 * @returns Array of detection inputs (upsert-ready)
 */
async function detectAPGLVariance(
  companyId: number,
  asOfDate: string
): Promise<APExceptionDetectionInput[]> {
  const inputs: APExceptionDetectionInput[] = [];

  try {
    const summary = await getAPReconciliationSummary(companyId, asOfDate);

    // Only flag if there's a meaningful variance (non-zero)
    if (summary.variance !== "0" && summary.variance !== "0.0000" && summary.variance !== "-0.0000") {
      const absVar = absVariance(summary.variance);
      if (absVar > 0n) {
        // FIX(47.4-WP-C): exception_key derived deterministically from source context.
        // Using SHA256 pattern: APGL:company:date for uniqueness across detection runs.
        const exceptionKey = `APGL:${companyId}:${asOfDate}`;
        inputs.push({
          type: AP_EXCEPTION_TYPE.VARIANCE,
          sourceType: "AP_RECONCILIATION",
          sourceId: companyId, // Using companyId as source identifier for company-level summary
          supplierId: null,
          varianceAmount: summary.variance,
          currencyCode: summary.currency,
          dueDate: asOfDate,
          exceptionKey,
        });
      }
    }
  } catch (err) {
    // If no settings configured, skip variance detection gracefully
    if (err instanceof Error && err.name === "APReconciliationError") {
      return [];
    }
    throw err;
  }

  return inputs;
}

// =============================================================================
// Detection: Supplier Statement Mismatch
// =============================================================================

/**
 * Detect supplier statement mismatch exceptions.
 * Scans PENDING statements with non-zero variance outside tolerance.
 * FIX(47.4-WP-C): Reuses existing reconcile logic to avoid duplicating balance computation.
 *
 * @param companyId - Company to detect statement mismatch exceptions for
 * @returns Array of detection inputs (upsert-ready)
 */
async function detectStatementMismatch(
  companyId: number
): Promise<APExceptionDetectionInput[]> {
  const inputs: APExceptionDetectionInput[] = [];
  const db = getDb() as KyselySchema;

  // Get all PENDING statements for this company
  const pendingRows = await sql`
    SELECT ss.id, ss.supplier_id, ss.statement_date, ss.closing_balance, ss.currency_code
    FROM supplier_statements ss
    WHERE ss.company_id = ${companyId}
      AND ss.status = 1  -- PENDING
    ORDER BY ss.statement_date ASC
  `.execute(db);

  for (const row of pendingRows.rows) {
    const r = row as { id: number; supplier_id: number; statement_date: Date; closing_balance: string; currency_code: string };

    try {
      // Reuse reconcile logic to compute variance
      const result = await reconcileSupplierStatement(
        companyId,
        Number(r.id),
        "1.0000"  // FIX(47.4-WP-C): Use default tolerance (1.0000) for mismatch detection
      );

      // Only flag if outside tolerance
      if (!result.varianceWithinTolerance) {
        const absVar = absVariance(result.variance);
        if (absVar > 0n) {
          // FIX(47.4-WP-C): exception_key uses statement:id pattern for uniqueness.
          const exceptionKey = `MISMATCH:STMT:${r.id}`;
          inputs.push({
            type: AP_EXCEPTION_TYPE.MISMATCH,
            sourceType: "SUPPLIER_STATEMENT",
            sourceId: Number(r.id),
            supplierId: Number(r.supplier_id),
            varianceAmount: result.variance,
            currencyCode: result.currencyCode,
            dueDate: result.statementDate,
            exceptionKey,
          });
        }
      }
    } catch (err) {
      // Skip individual statement errors; other statements may still be valid
      if (err instanceof Error) {
        console.warn(`Statement mismatch detection skipped for ${r.id}: ${err.message}`);
      }
    }
  }

  return inputs;
}

// =============================================================================
// Detection: Overdue Posted AP Invoices
// =============================================================================

/**
 * Detect overdue posted AP invoices with open balance > 0.
 * Uses purchase_invoices JOIN ap_payment_lines to compute open balance.
 * FIX(47.4-WP-C): Overdue = due_date < today AND open_balance > 0 AND status = POSTED.
 * This covers the "overdue posted AP invoices with open balance > 0" requirement.
 *
 * @param companyId - Company to detect overdue invoice exceptions for
 * @returns Array of detection inputs (upsert-ready)
 */
async function detectOverdueInvoices(
  companyId: number
): Promise<APExceptionDetectionInput[]> {
  const inputs: APExceptionDetectionInput[] = [];
  const db = getDb() as KyselySchema;

  // Get overdue invoices (due_date < CURRENT_DATE AND status = POSTED AND open_balance > 0)
  // FIX(47.4-HOTFIX): Subquery column aliases must match outer-select aliases used in HAVING.
  // pay subquery defined `total_paid` but outer aliased it `paid_base` → mismatch → ER_BAD_FIELD_ERROR.
  // cr subquery defined `total_credited` but outer aliased it `credited_base` → same problem.
  const overdueRows = await sql`
    SELECT
      pi.id,
      pi.supplier_id,
      pi.invoice_date,
      pi.due_date,
      pi.grand_total,
      pi.exchange_rate,
      pi.currency_code,
      COALESCE(pay.paid_base, 0) AS paid_base,
      COALESCE(cr.credited_base, 0) AS credited_base
    FROM purchase_invoices pi
    LEFT JOIN (
      SELECT apl.purchase_invoice_id, SUM(apl.allocation_amount) AS paid_base
      FROM ap_payment_lines apl
      INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
      WHERE ap.company_id = ${companyId}
        AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
      GROUP BY apl.purchase_invoice_id
    ) pay ON pay.purchase_invoice_id = pi.id
    LEFT JOIN (
      SELECT pca.purchase_invoice_id, SUM(pca.applied_amount) AS credited_base
      FROM purchase_credit_applications pca
      INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
      WHERE pca.company_id = ${companyId}
        AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
      GROUP BY pca.purchase_invoice_id
    ) cr ON cr.purchase_invoice_id = pi.id
    WHERE pi.company_id = ${companyId}
      AND pi.status = ${PURCHASE_INVOICE_STATUS.POSTED}
      AND pi.due_date < CURRENT_DATE
    HAVING (pi.grand_total * pi.exchange_rate - paid_base - credited_base) > 0
    ORDER BY pi.due_date ASC
  `.execute(db);

  for (const row of overdueRows.rows) {
    const r = row as {
      id: number;
      supplier_id: number;
      invoice_date: Date;
      due_date: Date;
      grand_total: string;
      exchange_rate: string;
      currency_code: string;
      paid_base: string;
      credited_base: string;
    };

    // Compute open amount
    const originalScaled = toScaled(r.grand_total, 4);
    const rateScaled = toScaled(r.exchange_rate, 8);
    const scaleFactor = 10n ** 8n;
    const baseTotal = (originalScaled * rateScaled + scaleFactor / 2n) / scaleFactor;
    const paidBase = toScaled(r.paid_base, 4);
    const creditedBase = toScaled(r.credited_base, 4);
    const openBase = baseTotal - paidBase - creditedBase;

    if (openBase > 0n) {
      // FIX(47.4-WP-C): exception_key uses INVOICE:id pattern for uniqueness.
      // DUPLICATE type = "overdue posted AP invoices with open balance > 0" per coordination doc.
      const exceptionKey = `DUPLICATE:INV:${r.id}`;
      inputs.push({
        type: AP_EXCEPTION_TYPE.DUPLICATE,
        sourceType: "INVOICE",
        sourceId: Number(r.id),
        supplierId: Number(r.supplier_id),
        varianceAmount: fromScaled4(openBase),
        currencyCode: String(r.currency_code),
        dueDate: r.due_date instanceof Date
          ? r.due_date.toISOString().split("T")[0]
          : String(r.due_date),
        exceptionKey,
      });
    }
  }

  return inputs;
}

// =============================================================================
// Detection: Manual/Pass-through (No-op for detection; handled at create time)
// =============================================================================

/**
 * Manual exceptions are created directly via upsertException(), not via detection.
 * This stub documents the behavior; no implementation needed.
 * FIX(47.4-WP-C): Manual/pass-through source does not require detection logic.
 * Route/service layer will accept manual exception creation via upsertException().
 */

// =============================================================================
// Upsert Exception (Idempotent Detection)
// =============================================================================

/**
 * Upsert a single AP exception by (company_id, exception_key).
 * Creates if not exists; leaves unchanged if already exists with any status.
 * FIX(47.4-WP-C): Uses upsert for idempotent detection - repeated detect runs
 * do not create duplicates, respecting the coordination file requirement.
 *
 * @param companyId - Company ID
 * @param input - Exception detection input
 * @returns Created or existing exception
 */
export async function upsertException(
  companyId: number,
  input: APExceptionDetectionInput
): Promise<APException> {
  const db = getDb() as KyselySchema;

  // Use INSERT ... ON DUPLICATE KEY UPDATE for atomic upsert
  // Only inserts when key doesn't exist; updates nothing if exists (idempotent)
  const now = new Date();
  const detectedAt = now.toISOString().slice(0, 19).replace("T", " ");  // MySQL DATETIME format

  // FIX(47.4-P1): ON DUPLICATE KEY refreshes dynamic fields when status is OPEN or ASSIGNED.
  // RESOLVED/DISMISSED rows remain immutable. This prevents stale variance/due_date/detected_at.
  await sql`
    INSERT INTO ap_exceptions (
      company_id, exception_key, type, source_type, source_id, supplier_id,
      variance_amount, currency_code, detected_at, due_date, status,
      created_at, updated_at
    )
    VALUES (
      ${companyId}, ${input.exceptionKey}, ${input.type}, ${input.sourceType},
      ${input.sourceId}, ${input.supplierId ?? null}, ${input.varianceAmount ?? null},
      ${input.currencyCode ?? null}, ${detectedAt}, ${input.dueDate ?? null},
      ${AP_EXCEPTION_STATUS.OPEN}, ${now}, ${now}
    )
    ON DUPLICATE KEY UPDATE
      variance_amount = IF(status IN (${AP_EXCEPTION_STATUS.OPEN}, ${AP_EXCEPTION_STATUS.ASSIGNED}), VALUES(variance_amount), variance_amount),
      currency_code = IF(status IN (${AP_EXCEPTION_STATUS.OPEN}, ${AP_EXCEPTION_STATUS.ASSIGNED}), VALUES(currency_code), currency_code),
      due_date = IF(status IN (${AP_EXCEPTION_STATUS.OPEN}, ${AP_EXCEPTION_STATUS.ASSIGNED}), VALUES(due_date), due_date),
      detected_at = IF(status IN (${AP_EXCEPTION_STATUS.OPEN}, ${AP_EXCEPTION_STATUS.ASSIGNED}), VALUES(detected_at), detected_at),
      updated_at = IF(status IN (${AP_EXCEPTION_STATUS.OPEN}, ${AP_EXCEPTION_STATUS.ASSIGNED}), VALUES(updated_at), updated_at)
  `.execute(db);

  // Fetch the exception (either newly created or existing)
  const result = await sql`
    SELECT * FROM ap_exceptions
    WHERE company_id = ${companyId} AND exception_key = ${input.exceptionKey}
    LIMIT 1
  `.execute(db);

  if (result.rows.length === 0) {
    throw new APExceptionDetectionError(input.sourceType, "Failed to upsert exception");
  }

  return mapRowToException(result.rows[0] as Record<string, unknown>);
}

// =============================================================================
// Detect All (Run All Detection Sources)
// =============================================================================

/**
 * Run all detection sources for a company.
 * Returns array of all detected (or already existing) exceptions.
 * FIX(47.4-WP-C): Detection is on-demand (called by detectThenList or explicit trigger),
 * not scheduled. Each source is tried independently; failures in one don't block others.
 *
 * @param companyId - Company to run detection for
 * @param asOfDate - As-of date for AP↔GL variance detection (YYYY-MM-DD)
 * @returns All detected/existing exceptions after running detection
 */
export async function detectAllExceptions(
  companyId: number,
  asOfDate: string
): Promise<APException[]> {
  // Run all detection sources in parallel
  const [varianceInputs, statementMismatchInputs, overdueInputs] = await Promise.all([
    detectAPGLVariance(companyId, asOfDate),
    detectStatementMismatch(companyId),
    detectOverdueInvoices(companyId),
  ]);

  // Upsert all detected exceptions (idempotent)
  const allInputs = [...varianceInputs, ...statementMismatchInputs, ...overdueInputs];
  const upserted = await Promise.all(allInputs.map((input) => upsertException(companyId, input)));

  return upserted;
}

// =============================================================================
// Worklist: List with Filters/Sort/Pagination
// =============================================================================

/**
 * Sort comparator for AP exception worklist.
 * Order: severity (abs variance DESC), age (detected_at ASC), type priority (ASC)
 * FIX(47.4-WP-C): Sorting follows coordination file requirement:
 * "severity (largest absolute variance first), age (oldest detected first),
 * type priority (AP-GL then statement mismatch then dispute then overdue)"
 *
 * @param a - First exception
 * @param b - Second exception
 * @returns Sort order
 */
function sortExceptions(a: APException, b: APException): number {
  // 1. Severity: absolute variance amount (largest first = DESC)
  const varA = absVariance(a.varianceAmount);
  const varB = absVariance(b.varianceAmount);
  if (varA !== varB) {
    return varA > varB ? -1 : 1;  // DESC
  }

  // 2. Age: oldest detected first (detected_at ASC)
  const timeA = new Date(a.detectedAt).getTime();
  const timeB = new Date(b.detectedAt).getTime();
  if (timeA !== timeB) {
    return timeA < timeB ? -1 : 1;  // ASC (older first)
  }

  // 3. Type priority (lower number = higher priority)
  const typeA = TYPE_PRIORITY[a.type] ?? 99;
  const typeB = TYPE_PRIORITY[b.type] ?? 99;
  if (typeA !== typeB) {
    return typeA < typeB ? -1 : 1;  // ASC (lower = first)
  }

  return 0;
}

/**
 * List AP exceptions with filters, sorting, and pagination.
 * Always scoped to company_id.
 * Sorting: severity (abs variance DESC), age (detected_at ASC), type priority (ASC)
 * FIX(47.4-WP-C): Sort order follows coordination file requirement exactly.
 *
 * @param companyId - Company ID
 * @param filters - Optional filters (type, status, supplierId, search)
 * @param options - Pagination options (limit, cursor)
 * @returns Paginated worklist result
 */
export async function listExceptions(
  companyId: number,
  filters: APExceptionWorklistFilters = {},
  options: APExceptionWorklistOptions = {}
): Promise<APExceptionWorklistResult> {
  const db = getDb() as KyselySchema;

  const limit = Math.min(options.limit ?? 20, 100);
  const cursor = parseCursor(options.cursor);
  const offset = cursor.offset;

  // Build WHERE conditions
  // FIX(47.4-WP-C): Use explicit type annotation to satisfy TypeScript's complex type inference for sql template tags.
  const conditions: ReturnType<typeof sql>[] = [sql`company_id = ${companyId}`];

  // Type filter (int enum)
  if (filters.type !== undefined) {
    conditions.push(sql`type = ${filters.type}`);
  }

  // Status filter (int enum)
  if (filters.status !== undefined) {
    conditions.push(sql`status = ${filters.status}`);
  }

  // Supplier filter
  if (filters.supplierId !== undefined) {
    conditions.push(sql`supplier_id = ${filters.supplierId}`);
  }

  // Search filter (exception_key, source_type)
  if (filters.search) {
    conditions.push(
      sql`exception_key LIKE ${"%" + filters.search + "%"} OR source_type LIKE ${"%" + filters.search + "%"}`
    );
  }

  const whereClause = conditions.reduce(
    (acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`),
    sql`1=1`
  );

  // Count total (for pagination)
  const countResult = await sql`
    SELECT COUNT(*) as count FROM ap_exceptions WHERE ${whereClause}
  `.execute(db);
  const total = Number((countResult.rows[0] as { count: string }).count);

  // Fetch all matching rows, then sort in-memory
  // FIX(47.4-WP-C): MySQL can't sort by computed expression (abs variance) in index,
  // so we fetch and sort in-process. This is acceptable for worklist (not large dataset).
  const allRows = await sql`
    SELECT * FROM ap_exceptions
    WHERE ${whereClause}
    ORDER BY detected_at ASC
    LIMIT 10000
  `.execute(db);

  // Map to domain objects
  let exceptions = (allRows.rows as Record<string, unknown>[]).map(mapRowToException);

  // Apply in-memory sort (severity DESC, age ASC, type priority ASC)
  exceptions.sort(sortExceptions);

  // Apply pagination (cursor-based)
  const paginated = exceptions.slice(offset, offset + limit + 1);
  const hasMore = paginated.length > limit;
  const pageItems = hasMore ? paginated.slice(0, limit) : paginated;

  // Generate next cursor
  const nextCursor = hasMore
    ? encodeCursor(offset + limit, filters.type, filters.status)
    : null;

  return {
    exceptions: pageItems,
    total,
    nextCursor,
    hasMore,
  };
}

// =============================================================================
// Get Single Exception
// =============================================================================

/**
 * Get a single AP exception by ID.
 * Returns null if not found or not owned by company.
 */
export async function getException(
  companyId: number,
  exceptionId: number
): Promise<APException | null> {
  const db = getDb() as KyselySchema;

  const result = await sql`
    SELECT * FROM ap_exceptions
    WHERE id = ${exceptionId} AND company_id = ${companyId}
    LIMIT 1
  `.execute(db);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToException(result.rows[0] as Record<string, unknown>);
}

// =============================================================================
// Assign Exception
// =============================================================================

/**
 * Assign an AP exception to a user.
 * Only allows transition from OPEN or ASSIGNED status.
 * Sets assigned_to_user_id, assigned_at, status = ASSIGNED.
 * FIX(47.4-WP-C): Assign sets status to ASSIGNED and captures assignment metadata.
 * Can be re-assigned (from ASSIGNED back to ASSIGNED with new user).
 *
 * @param companyId - Company ID
 * @param exceptionId - Exception ID
 * @param userId - User to assign to
 * @returns Updated exception
 */
export async function assignException(
  companyId: number,
  exceptionId: number,
  userId: number
): Promise<APException> {
  const db = getDb() as KyselySchema;

  // FIX(47.4-P1): Validate assigned user belongs to same company.
  const userCheck = await sql`
    SELECT id FROM users WHERE id = ${userId} AND company_id = ${companyId} LIMIT 1
  `.execute(db);
  if (userCheck.rows.length === 0) {
    throw new APExceptionAssignedUserInvalidError(userId, companyId);
  }

  // Fetch current exception to determine expected status for optimistic locking
  const current = await getException(companyId, exceptionId);
  if (!current) {
    throw new APExceptionNotFoundError(exceptionId);
  }

  // Only allow from OPEN or ASSIGNED
  if (current.status !== AP_EXCEPTION_STATUS.OPEN && current.status !== AP_EXCEPTION_STATUS.ASSIGNED) {
    throw new APExceptionInvalidTransitionError(exceptionId, current.status, AP_EXCEPTION_STATUS.ASSIGNED);
  }

  // Update with expected status in WHERE clause for concurrency safety
  const now = new Date();
  const assignedAt = now.toISOString().slice(0, 19).replace("T", " ");  // MySQL DATETIME format
  const expectedStatus = current.status;

  // FIX(47.4-P1): Include expected status in WHERE; check affected rows to detect race.
  const result = await sql`
    UPDATE ap_exceptions
    SET assigned_to_user_id = ${userId},
        assigned_at = ${assignedAt},
        status = ${AP_EXCEPTION_STATUS.ASSIGNED},
        updated_at = ${now}
    WHERE id = ${exceptionId}
      AND company_id = ${companyId}
      AND status = ${expectedStatus}
  `.execute(db);

  // FIX(47.4-P1): If no row affected, concurrent transition occurred; throw invalid transition.
  if (result.numAffectedRows === 0n) {
    throw new APExceptionInvalidTransitionError(exceptionId, expectedStatus, AP_EXCEPTION_STATUS.ASSIGNED);
  }

  // Fetch and return updated
  const updated = await getException(companyId, exceptionId);
  if (!updated) {
    throw new APExceptionNotFoundError(exceptionId);
  }

  return updated;
}

// =============================================================================
// Resolve Exception
// =============================================================================

/**
 * Resolve or dismiss an AP exception.
 * Requires status to be ASSIGNED (only assignees can resolve).
 * Requires resolution_note for audit trail.
 * Sets resolved_at, resolved_by_user_id, resolution_note, status to RESOLVED or DISMISSED.
 * FIX(47.4-WP-C): Resolution requires note and targets ASSIGNED status only.
 * RESOLVED and DISMISSED are terminal states (cannot be re-opened).
 *
 * @param companyId - Company ID
 * @param exceptionId - Exception ID
 * @param userId - User resolving the exception
 * @param status - RESOLVED (3) or DISMISSED (4)
 * @param resolutionNote - Required note for audit trail
 * @returns Updated exception
 */
export async function resolveException(
  companyId: number,
  exceptionId: number,
  userId: number,
  status: 3 | 4,
  resolutionNote: string
): Promise<APException> {
  const db = getDb() as KyselySchema;

  // Fetch current exception to determine expected status for optimistic locking
  const current = await getException(companyId, exceptionId);
  if (!current) {
    throw new APExceptionNotFoundError(exceptionId);
  }

  // Only allow from ASSIGNED status
  if (current.status !== AP_EXCEPTION_STATUS.ASSIGNED) {
    throw new APExceptionInvalidTransitionError(exceptionId, current.status, status);
  }

  // Update with expected status in WHERE clause for concurrency safety
  const now = new Date();
  const resolvedAt = now.toISOString().slice(0, 19).replace("T", " ");  // MySQL DATETIME format
  const expectedStatus = current.status;

  // FIX(47.4-P1): Include expected status in WHERE; check affected rows to detect race.
  const result = await sql`
    UPDATE ap_exceptions
    SET status = ${status},
        resolved_at = ${resolvedAt},
        resolved_by_user_id = ${userId},
        resolution_note = ${resolutionNote},
        updated_at = ${now}
    WHERE id = ${exceptionId}
      AND company_id = ${companyId}
      AND status = ${expectedStatus}
  `.execute(db);

  // FIX(47.4-P1): If no row affected, concurrent transition occurred; throw invalid transition.
  if (result.numAffectedRows === 0n) {
    throw new APExceptionInvalidTransitionError(exceptionId, expectedStatus, status);
  }

  // Fetch and return updated
  const updated = await getException(companyId, exceptionId);
  if (!updated) {
    throw new APExceptionNotFoundError(exceptionId);
  }

  return updated;
}

// =============================================================================
// AC8: Detect Then List Workflow
// =============================================================================

/**
 * AC8: "detect then list" workflow for route GET usage.
 * Runs detection first, then returns paginated worklist.
 * This is the primary entry point for GET /worklist with on-demand detection.
 * FIX(47.4-WP-C): AC8 specifies on-demand detection triggered by GET request,
 * returning fresh exception list after detection completes.
 *
 * @param companyId - Company ID
 * @param asOfDate - As-of date for variance detection (YYYY-MM-DD)
 * @param filters - Optional worklist filters
 * @param options - Pagination options
 * @returns Worklist result after running detection
 */
export async function detectThenList(
  companyId: number,
  asOfDate: string,
  filters: APExceptionWorklistFilters = {},
  options: APExceptionWorklistOptions = {}
): Promise<APExceptionWorklistResult> {
  // Run detection first (on-demand)
  await detectAllExceptions(companyId, asOfDate);

  // Then return list
  return listExceptions(companyId, filters, options);
}
