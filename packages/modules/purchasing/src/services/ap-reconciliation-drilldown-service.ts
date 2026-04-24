// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation Drilldown Service for purchasing module.
 *
 * Provides detailed drill-down into AP vs GL reconciliation variances.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  AP_PAYMENT_STATUS,
  PURCHASE_CREDIT_STATUS,
  PURCHASE_INVOICE_STATUS,
  normalizePurchasingDocType,
  normalizeDate,
  type DrilldownCategory,
} from "@jurnapod/shared";
import {
  ApReconciliationService,
  toScaled,
  fromScaled4,
  computeBaseAmount,
  APReconciliationSettingsRequiredError,
} from "./ap-reconciliation-service.js";
import type {
  GLDetailLine,
  APDetailLine,
  DrilldownLineItem,
  DrilldownCategorySummary,
  GLDetailResult,
  APDetailResult,
  DrilldownResult,
  GetGLDetailParams,
  GetAPDetailParams,
  GetAPReconciliationDrilldownParams,
} from "../types/ap-reconciliation-drilldown.js";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ROUNDING_TOLERANCE = 100n; // 0.0100 in scale-4 = 100n

// =============================================================================
// GL Detail Query
// =============================================================================

/**
 * Get GL journal lines for AP control accounts within cutoff period.
 */
async function getGLDetail(
  db: KyselySchema,
  params: GetGLDetailParams
): Promise<GLDetailResult> {
  const { companyId, accountIds, asOfDate, timezone, cursor, limit = 100 } = params;

  if (accountIds.length === 0) {
    return { lines: [], nextCursor: null, hasMore: false, totalCount: 0 };
  }

  const asOfDateUtcEnd = normalizeDate(asOfDate, timezone, "end");

  // Cursor format: journal_line_id (for stable pagination)
  const cursorId = cursor ? Number(cursor) : null;
  const cursorSql = Number.isSafeInteger(cursorId) && (cursorId as number) > 0
    ? sql`AND jl.id > ${cursorId as number}`
    : sql``;

  const limitPlusOne = limit + 1;

  // Get total count first
  const countResult = await sql`
    SELECT COUNT(*) as cnt
    FROM journal_lines jl
    INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
    WHERE jl.company_id = ${companyId}
      AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
      AND jb.posted_at <= ${asOfDateUtcEnd}
  `.execute(db);

  const totalCount = Number((countResult.rows[0] as { cnt: string }).cnt);

  // Get paginated lines
  const rows = await sql`
    SELECT
      jl.id as journal_line_id,
      jl.journal_batch_id,
      CAST(jb.id AS CHAR) as journal_number,
      DATE(jb.posted_at) as effective_date,
      jl.description,
      jl.account_id,
      a.code as account_code,
      a.name as account_name,
      jl.debit,
      jl.credit,
      jb.doc_type as source_type,
      jb.doc_id as source_id,
      jb.posted_at
    FROM journal_lines jl
    INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
    INNER JOIN accounts a ON a.id = jl.account_id
    WHERE jl.company_id = ${companyId}
      AND jb.company_id = ${companyId}
      AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
      AND jb.posted_at <= ${asOfDateUtcEnd}
      ${cursorSql}
    ORDER BY jl.id ASC
    LIMIT ${limitPlusOne}
  `.execute(db);

  const hasMore = rows.rows.length > limit;
  const dataRows = hasMore ? rows.rows.slice(0, limit) : rows.rows;

  const lines: GLDetailLine[] = dataRows.map((row) => {
    const r = row as {
      journal_line_id: number;
      journal_batch_id: number;
      journal_number: string;
      effective_date: string;
      description: string;
      account_id: number;
      account_code: string;
      account_name: string;
      debit: string | null;
      credit: string | null;
      source_type: string | null;
      source_id: number | null;
      posted_at: string;
    };
    return {
      journalLineId: r.journal_line_id,
      journalBatchId: r.journal_batch_id,
      journalNumber: r.journal_number,
      effectiveDate: r.effective_date,
      description: r.description,
      accountId: r.account_id,
      accountCode: r.account_code,
      accountName: r.account_name,
      debit: r.debit,
      credit: r.credit,
      sourceType: normalizePurchasingDocType(r.source_type),
      sourceId: r.source_id,
      postedAt: r.posted_at,
    };
  });

  const nextCursor = hasMore && lines.length > 0 ? String(lines[lines.length - 1].journalLineId) : null;

  return { lines, nextCursor, hasMore, totalCount };
}

// =============================================================================
// AP Detail Query
// =============================================================================

async function getAPDetailTotalOpenBase(
  db: KyselySchema,
  companyId: number,
  asOfDate: string
): Promise<bigint> {
  const invoiceRowsResult = await sql`
      SELECT
        pi.grand_total,
        pi.exchange_rate,
        COALESCE(pay.total_paid, 0) AS paid_base,
        COALESCE(cr.total_credited, 0) AS credited_base
      FROM purchase_invoices pi
      LEFT JOIN (
        SELECT apl.purchase_invoice_id, SUM(apl.allocation_amount) AS total_paid
        FROM ap_payment_lines apl
        INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
        WHERE ap.company_id = ${companyId}
          AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
        GROUP BY apl.purchase_invoice_id
      ) pay ON pay.purchase_invoice_id = pi.id
      LEFT JOIN (
        SELECT pca.purchase_invoice_id, SUM(pca.applied_amount) AS total_credited
        FROM purchase_credit_applications pca
        INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
        WHERE pca.company_id = ${companyId}
          AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
        GROUP BY pca.purchase_invoice_id
      ) cr ON cr.purchase_invoice_id = pi.id
      WHERE pi.company_id = ${companyId}
        AND pi.status = ${PURCHASE_INVOICE_STATUS.POSTED}
        AND pi.invoice_date <= ${asOfDate}
    `.execute(db);

  let totalInvoiceOpen = 0n;
  for (const row of invoiceRowsResult.rows as Array<{
    grand_total: string;
    exchange_rate: string;
    paid_base: string;
    credited_base: string;
  }>) {
    const baseTotal = computeBaseAmount(row.grand_total, row.exchange_rate);
    const paidBase = toScaled(row.paid_base, 4);
    const creditedBase = toScaled(row.credited_base, 4);
    const openBase = baseTotal - paidBase - creditedBase;
    if (openBase > 0n) {
      totalInvoiceOpen += openBase;
    }
  }

  return totalInvoiceOpen;
}

/**
 * Get AP subledger transactions (posted invoices, applied credits, posted payments).
 */
async function getAPDetail(
  db: KyselySchema,
  params: GetAPDetailParams
): Promise<APDetailResult> {
  const { companyId, asOfDate, cursor, limit = 100 } = params;

  // Parse cursor: format "type|id" with deterministic type order
  const TYPE_ORDER: Record<string, number> = {
    ap_payment: 1,
    purchase_credit: 2,
    purchase_invoice: 3,
  };
  let cursorOrder = 0;
  let cursorId = 0;
  if (cursor) {
    const [t, id] = cursor.split("|");
    cursorOrder = TYPE_ORDER[t] ?? 0;
    cursorId = Number(id);
    if (!Number.isSafeInteger(cursorId) || cursorId < 0) {
      cursorId = 0;
    }
  }

  const limitPlusOne = limit + 1;
  const totalOpenBasePromise = getAPDetailTotalOpenBase(db, companyId, asOfDate);

  // Total count (for pagination metadata)
  const totalCountResult = await sql`
    SELECT
      (
        SELECT COUNT(*)
        FROM purchase_invoices pi
        WHERE pi.company_id = ${companyId}
          AND pi.status = ${PURCHASE_INVOICE_STATUS.POSTED}
          AND pi.invoice_date <= ${asOfDate}
      )
      +
      (
        SELECT COUNT(*)
        FROM purchase_credits pc
        WHERE pc.company_id = ${companyId}
          AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
          AND pc.credit_date <= ${asOfDate}
      )
      +
      (
        SELECT COUNT(*)
        FROM ap_payments ap
        WHERE ap.company_id = ${companyId}
          AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
          AND ap.payment_date <= ${asOfDate}
      ) AS total_count
  `.execute(db);

  const totalCount = Number((totalCountResult.rows[0] as { total_count: string }).total_count);

  // Fetch a single paginated window via UNION ALL
  const unionRows = await sql`
    SELECT *
    FROM (
      SELECT
        1 AS type_order,
        'ap_payment' AS ap_type,
        ap.id,
        ap.payment_no as reference,
        ap.payment_date as date,
        NULL as due_date,
        ap.supplier_id,
        s.name as supplier_name,
        'IDR' as currency_code,
        COALESCE(alloc.total_allocated, 0) as original_amount,
        '1.00000000' as exchange_rate,
        ap.status,
        0 as paid_base,
        0 as credited_base,
        ap.journal_batch_id
      FROM ap_payments ap
      LEFT JOIN suppliers s ON s.id = ap.supplier_id AND s.company_id = ${companyId}
      LEFT JOIN (
        SELECT apl.ap_payment_id, SUM(apl.allocation_amount) AS total_allocated
        FROM ap_payment_lines apl
        INNER JOIN ap_payments ap2 ON ap2.id = apl.ap_payment_id
        WHERE ap2.company_id = ${companyId}
        GROUP BY apl.ap_payment_id
      ) alloc ON alloc.ap_payment_id = ap.id
      WHERE ap.company_id = ${companyId}
        AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
        AND ap.payment_date <= ${asOfDate}

      UNION ALL

      SELECT
        2 AS type_order,
        'purchase_credit' AS ap_type,
        pc.id,
        pc.credit_no as reference,
        pc.credit_date as date,
        NULL as due_date,
        pc.supplier_id,
        s.name as supplier_name,
        'IDR' as currency_code,
        pc.total_credit_amount as original_amount,
        '1.00000000' as exchange_rate,
        pc.status,
        0 as paid_base,
        COALESCE(pc_apply.total_applied, 0) as credited_base,
        pc.journal_batch_id
      FROM purchase_credits pc
      LEFT JOIN suppliers s ON s.id = pc.supplier_id AND s.company_id = ${companyId}
      LEFT JOIN (
        SELECT pca.purchase_credit_id, SUM(pca.applied_amount) AS total_applied
        FROM purchase_credit_applications pca
        WHERE pca.company_id = ${companyId}
        GROUP BY pca.purchase_credit_id
      ) pc_apply ON pc_apply.purchase_credit_id = pc.id
      WHERE pc.company_id = ${companyId}
        AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
        AND pc.credit_date <= ${asOfDate}

      UNION ALL

      SELECT
        3 AS type_order,
        'purchase_invoice' AS ap_type,
        pi.id,
        pi.invoice_no as reference,
        pi.invoice_date as date,
        pi.due_date,
        pi.supplier_id,
        s.name as supplier_name,
        pi.currency_code,
        pi.grand_total as original_amount,
        pi.exchange_rate,
        pi.status,
        COALESCE(pay.total_paid, 0) as paid_base,
        COALESCE(cr.total_credited, 0) as credited_base,
        pi.journal_batch_id
      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON s.id = pi.supplier_id AND s.company_id = ${companyId}
      LEFT JOIN (
        SELECT apl.purchase_invoice_id, SUM(apl.allocation_amount) AS total_paid
        FROM ap_payment_lines apl
        INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
        WHERE ap.company_id = ${companyId}
          AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
        GROUP BY apl.purchase_invoice_id
      ) pay ON pay.purchase_invoice_id = pi.id
      LEFT JOIN (
        SELECT pca.purchase_invoice_id, SUM(pca.applied_amount) AS total_credited
        FROM purchase_credit_applications pca
        INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
        WHERE pca.company_id = ${companyId}
          AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
        GROUP BY pca.purchase_invoice_id
      ) cr ON cr.purchase_invoice_id = pi.id
      WHERE pi.company_id = ${companyId}
        AND pi.status = ${PURCHASE_INVOICE_STATUS.POSTED}
        AND pi.invoice_date <= ${asOfDate}
    ) ap_union
    WHERE (${cursorOrder} = 0)
       OR (ap_union.type_order > ${cursorOrder})
       OR (ap_union.type_order = ${cursorOrder} AND ap_union.id > ${cursorId})
    ORDER BY ap_union.type_order ASC, ap_union.id ASC
    LIMIT ${limitPlusOne}
  `.execute(db);

  // Combine and tag with type
  interface RawAPItem {
    id: number;
    reference: string;
    date: string;
    due_date: string | null;
    supplier_id: number | null;
    supplier_name: string | null;
    currency_code: string;
    original_amount: string;
    exchange_rate: string;
    status: number;
    paid_base: string;
    credited_base: string;
    journal_batch_id: number | null;
  }

  const allItems: (RawAPItem & { apType: "purchase_invoice" | "purchase_credit" | "ap_payment" })[] =
    unionRows.rows.map((r: any) => ({ ...r, apType: r.ap_type }));

  const hasMore = allItems.length > limit;
  const dataItems = hasMore ? allItems.slice(0, limit) : allItems;

  const lines: APDetailLine[] = dataItems.map((r) => {
    const rawBaseAmount = computeBaseAmount(
      String(r.original_amount || "0"),
      String(r.exchange_rate || "1.00000000")
    );
    const paidBase = toScaled(String(r.paid_base || "0"), 4);
    const creditedBase = toScaled(String(r.credited_base || "0"), 4);
    const isReducingType = r.apType === "ap_payment" || r.apType === "purchase_credit";

    const baseAmount = isReducingType ? -rawBaseAmount : rawBaseAmount;

    let openBase: bigint;
    if (r.apType === "purchase_invoice") {
      openBase = rawBaseAmount - paidBase - creditedBase;
    } else if (r.apType === "purchase_credit") {
      // Credit reduces AP; open credit remains as negative amount.
      openBase = -(rawBaseAmount - creditedBase);
    } else {
      // Payment rows are represented by allocated amounts; no separate open balance.
      openBase = 0n;
    }

    const matched = r.journal_batch_id != null;

    return {
      id: Number(r.id),
      type: r.apType,
      reference: r.reference,
      date: r.date,
      dueDate: r.due_date,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      currencyCode: r.currency_code,
      originalAmount: r.original_amount,
      baseAmount: fromScaled4(baseAmount),
      openAmount: fromScaled4(openBase),
      status: String(r.status),
      matched,
      glJournalLineId: null,
    };
  });

  const nextCursor =
    hasMore && lines.length > 0
      ? `${lines[lines.length - 1].type}|${lines[lines.length - 1].id}`
      : null;
  const totalOpenBase = await totalOpenBasePromise;

  return {
    lines,
    nextCursor,
    hasMore,
    totalCount,
    totalOpenBase: fromScaled4(totalOpenBase),
  };
}

// =============================================================================
// Drilldown Attribution Logic
// =============================================================================

const CATEGORY_PRECEDENCE: DrilldownCategory[] = [
  "currency_rounding_differences",
  "posting_errors",
  "timing_differences",
  "missing_transactions",
];

const DRILLDOWN_CURSOR_VERSION = "v1";
const CURSOR_DONE = "__done__";

type DrilldownCursorState = {
  gl?: string;
  ap?: string;
};

function encodeDrilldownCursor(state: DrilldownCursorState): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${DRILLDOWN_CURSOR_VERSION}:${payload}`;
}

function decodeDrilldownCursor(cursor?: string): DrilldownCursorState {
  if (!cursor) {
    return {};
  }

  // Backward compatibility with legacy cursor forms:
  // - "ap_type|id" => AP cursor only
  // - "123"        => GL cursor only
  if (!cursor.includes(":")) {
    if (cursor.includes("|")) {
      return { ap: cursor };
    }
    return { gl: cursor };
  }

  const [version, encoded] = cursor.split(":", 2);
  if (version !== DRILLDOWN_CURSOR_VERSION || !encoded) {
    return {};
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      gl?: unknown;
      ap?: unknown;
    };

    const state: DrilldownCursorState = {};
    if (typeof parsed.gl === "string" && parsed.gl.length > 0) {
      state.gl = parsed.gl;
    }
    if (typeof parsed.ap === "string" && parsed.ap.length > 0) {
      state.ap = parsed.ap;
    }
    return state;
  } catch {
    return {};
  }
}

function glNetAmountCreditMinusDebit(gl: { debit: string | null; credit: string | null }): bigint {
  const debit = toScaled(gl.debit ?? "0", 4);
  const credit = toScaled(gl.credit ?? "0", 4);
  return credit - debit;
}

/**
 * Build deterministic drilldown attribution.
 */
export function buildDrilldownAttribution(
  glLines: GLDetailLine[],
  apLines: APDetailLine[],
  tolerance: bigint = DEFAULT_ROUNDING_TOLERANCE
): DrilldownCategorySummary[] {
  const categories: Map<DrilldownCategory, DrilldownLineItem[]> = new Map([
    ["currency_rounding_differences", []],
    ["posting_errors", []],
    ["timing_differences", []],
    ["missing_transactions", []],
  ]);

  // Build GL lookup by source and aggregate net amount per source key.
  const glBySource = new Map<string, { lines: GLDetailLine[]; totalAmount: bigint }>();
  for (const gl of glLines) {
    const normalizedType = normalizePurchasingDocType(gl.sourceType);
    if (normalizedType && gl.sourceId) {
      const key = `${normalizedType}|${gl.sourceId}`;
      const existing = glBySource.get(key);
      if (existing) {
        existing.lines.push(gl);
        existing.totalAmount += glNetAmountCreditMinusDebit(gl);
      } else {
        glBySource.set(key, {
          lines: [gl],
          totalAmount: glNetAmountCreditMinusDebit(gl),
        });
      }
    }
  }

  // Build AP lookup by source (for invoices, payments, credits)
  const apBySource = new Map<string, APDetailLine[]>();
  for (const ap of apLines) {
    const sourceType = normalizePurchasingDocType(ap.type);
    if (!sourceType) continue;
    const key = `${sourceType}|${ap.id}`;
    const existing = apBySource.get(key) || [];
    existing.push(ap);
    apBySource.set(key, existing);
  }

  const usedAPKeys = new Set<string>();
  const usedTimingKeys = new Set<string>();

  // Step 1: Match GL to AP by aggregated source_id/source_type.
  for (const [glKey, glGroup] of glBySource.entries()) {
    const apEntries = apBySource.get(glKey);

    if (!apEntries || apEntries.length === 0) {
      // GL has no AP match - missing_transactions
      for (const gl of glGroup.lines) {
        const item = createGLOnlyLineItem(gl, "missing_transactions");
        categories.get("missing_transactions")!.push(item);
      }
      continue;
    }

    // Find best matching AP entry
    const ap = apEntries.find((a) => {
      const sourceType = normalizePurchasingDocType(a.type);
      if (!sourceType) return false;
      return !usedAPKeys.has(`${sourceType}|${a.id}`);
    }) || apEntries[0];

    const apSourceType = normalizePurchasingDocType(ap.type);
    if (!apSourceType) continue;
    const apKey = `${apSourceType}|${ap.id}`;

    // Match on aggregated GL amount so multiple GL lines with same source key
    // are treated as one AP posting group.
    const glAmount = glGroup.totalAmount;
    const apBase = toScaled(ap.baseAmount, 4);
    const difference = glAmount - apBase;

    const absDiff = difference < 0n ? -difference : difference;
    const category: DrilldownCategory =
      absDiff <= tolerance ? "currency_rounding_differences" : "posting_errors";

    // Emit one matched line item per GL line for UI traceability, but allocate
    // aggregate difference once so totals remain correct.
    glGroup.lines.forEach((gl, index) => {
      const allocatedDifference = index === 0 ? difference : 0n;
      const item = createMatchedLineItem(ap, gl, allocatedDifference, category);
      categories.get(category)!.push(item);
    });
    usedAPKeys.add(apKey);
  }

  // Step 2: GL items without usable purchasing source (missing transactions)
  for (const gl of glLines) {
    const normalizedType = normalizePurchasingDocType(gl.sourceType);
    const hasUsableSource = normalizedType && gl.sourceId;
    if (!hasUsableSource) {
      const key = `${gl.sourceType || "null"}|${gl.sourceId || "null"}|${gl.journalLineId}`;
      if (!usedTimingKeys.has(key)) {
        const item = createGLOnlyLineItem(gl, "missing_transactions");
        categories.get("missing_transactions")!.push(item);
        usedTimingKeys.add(key);
      }
    }
  }

  // Step 3: AP items without GL match (missing_transactions)
  for (const ap of apLines) {
    const sourceType = normalizePurchasingDocType(ap.type);
    if (!sourceType) continue;
    const key = `${sourceType}|${ap.id}`;
    if (!usedAPKeys.has(key)) {
      const item = createAPOnlyLineItem(ap, "missing_transactions");
      categories.get("missing_transactions")!.push(item);
      usedAPKeys.add(key);
    }
  }

  // Build category summaries in deterministic precedence order
  const summaries: DrilldownCategorySummary[] = [];

  for (const category of CATEGORY_PRECEDENCE) {
    const items = categories.get(category)!;

    // Sort items deterministically: by id within category
    items.sort((a, b) => a.id.localeCompare(b.id));

    let totalDiff = 0n;
    for (const item of items) {
      totalDiff += toScaled(item.difference, 4);
    }

    summaries.push({
      category,
      totalDifference: fromScaled4(totalDiff),
      itemCount: items.length,
      items,
    });
  }

  return summaries;
}

function createMatchedLineItem(
  ap: APDetailLine,
  gl: GLDetailLine,
  difference: bigint,
  category: DrilldownCategory
): DrilldownLineItem {
  const glAmount = gl.debit ? gl.debit : gl.credit || "0";
  const glDebitCredit = gl.debit ? "debit" : "credit";

  const suggestedAction =
    category === "currency_rounding_differences"
      ? "Review and confirm rounding is acceptable"
      : category === "posting_errors"
        ? "Correct journal entry amount or re-link to correct invoice"
        : category === "timing_differences"
          ? "Post missing journal entry or verify posting date"
          : "Investigate and post missing entry";

  return {
    id: `match|${gl.journalLineId}|${ap.id}`,
    category,
    apTransactionId: ap.id,
    apTransactionType: ap.type,
    apTransactionRef: ap.reference,
    apDate: ap.date,
    apAmountOriginal: ap.originalAmount,
    apAmountBase: ap.baseAmount,
    apCurrency: ap.currencyCode,
    glJournalLineId: gl.journalLineId,
    glJournalNumber: gl.journalNumber,
    glEffectiveDate: gl.effectiveDate,
    glDescription: gl.description,
    glAmount: glAmount,
    glDebitCredit,
    matched: true,
    matchId: `match|${gl.journalLineId}|${ap.id}`,
    difference: fromScaled4(difference < 0n ? -difference : difference),
    suggestedAction,
  };
}

function createGLOnlyLineItem(gl: GLDetailLine, category: DrilldownCategory): DrilldownLineItem {
  const glAmount = gl.debit ? gl.debit : gl.credit || "0";
  const glDebitCredit = gl.debit ? "debit" : "credit";

  return {
    id: `gl|${gl.journalLineId}`,
    category,
    apTransactionId: null,
    apTransactionType: null,
    apTransactionRef: null,
    apDate: null,
    apAmountOriginal: null,
    apAmountBase: null,
    apCurrency: null,
    glJournalLineId: gl.journalLineId,
    glJournalNumber: gl.journalNumber,
    glEffectiveDate: gl.effectiveDate,
    glDescription: gl.description,
    glAmount: glAmount,
    glDebitCredit,
    matched: false,
    matchId: null,
    difference: fromScaled4(toScaled(glAmount, 4)),
    suggestedAction:
      category === "missing_transactions"
        ? "Post corresponding AP transaction or remove GL entry"
        : "Investigate GL-only journal entry",
  };
}

function createAPOnlyLineItem(ap: APDetailLine, category: DrilldownCategory): DrilldownLineItem {
  return {
    id: `ap|${ap.type}|${ap.id}`,
    category,
    apTransactionId: ap.id,
    apTransactionType: ap.type,
    apTransactionRef: ap.reference,
    apDate: ap.date,
    apAmountOriginal: ap.originalAmount,
    apAmountBase: ap.baseAmount,
    apCurrency: ap.currencyCode,
    glJournalLineId: null,
    glJournalNumber: null,
    glEffectiveDate: null,
    glDescription: null,
    glAmount: null,
    glDebitCredit: null,
    matched: false,
    matchId: null,
    difference: ap.baseAmount,
    suggestedAction: "Post corresponding GL entry for AP transaction",
  };
}

// =============================================================================
// CSV Export
// =============================================================================

/**
 * Generate CSV content from drilldown data.
 */
export function generateDrilldownCSV(drilldown: DrilldownResult): string {
  const headers = [
    "category",
    "id",
    "ap_transaction_type",
    "ap_transaction_ref",
    "ap_date",
    "ap_amount_original",
    "ap_amount_base",
    "ap_currency",
    "gl_journal_line_id",
    "gl_journal_number",
    "gl_effective_date",
    "gl_description",
    "gl_amount",
    "gl_debit_credit",
    "matched",
    "difference",
    "suggested_action",
  ];

  const rows: string[] = [headers.join(",")];

  for (const category of drilldown.categories) {
    for (const item of category.items) {
      const row = [
        item.category,
        item.id,
        item.apTransactionType ?? "",
        item.apTransactionRef ?? "",
        item.apDate ?? "",
        item.apAmountOriginal ?? "",
        item.apAmountBase ?? "",
        item.apCurrency ?? "",
        item.glJournalLineId?.toString() ?? "",
        item.glJournalNumber ?? "",
        item.glEffectiveDate ?? "",
        escapeCSV(item.glDescription ?? ""),
        item.glAmount ?? "",
        item.glDebitCredit ?? "",
        item.matched.toString(),
        item.difference,
        escapeCSV(item.suggestedAction ?? ""),
      ];
      rows.push(row.join(","));
    }
  }

  return rows.join("\n");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// =============================================================================
// Service
// =============================================================================

export class ApReconciliationDrilldownService {
  constructor(private readonly db: KyselySchema) {}

  async getGLDetail(params: GetGLDetailParams): Promise<GLDetailResult> {
    return getGLDetail(this.db, params);
  }

  async getAPDetail(params: GetAPDetailParams): Promise<APDetailResult> {
    return getAPDetail(this.db, params);
  }

  async getAPReconciliationDrilldown(params: GetAPReconciliationDrilldownParams): Promise<DrilldownResult> {
    const { companyId, asOfDate, cursor, limit = 100 } = params;

    const reconService = new ApReconciliationService(this.db);
    const settings = await reconService.getAPReconciliationSettings({ companyId });

    if (settings.accountIds.length === 0) {
      throw new APReconciliationSettingsRequiredError();
    }

    const timezone = await reconService.resolveCompanyTimezone({ companyId });

    const cursorState = decodeDrilldownCursor(cursor);
    const glDone = cursorState.gl === CURSOR_DONE;
    const apDone = cursorState.ap === CURSOR_DONE;

    // Get GL and AP details with independent cursors.
    const [glResult, apResult] = await Promise.all([
      glDone
        ? Promise.resolve<GLDetailResult>({ lines: [], nextCursor: null, hasMore: false, totalCount: 0 })
        : getGLDetail(this.db, {
            companyId,
            accountIds: settings.accountIds,
            asOfDate,
            timezone,
            cursor: cursorState.gl,
            limit,
          }),
      apDone
        ? Promise.resolve<APDetailResult>({
            lines: [],
            nextCursor: null,
            hasMore: false,
            totalCount: 0,
            totalOpenBase: "0.0000",
          })
        : getAPDetail(this.db, { companyId, asOfDate, cursor: cursorState.ap, limit }),
    ]);

    // Build attribution
    const categories = buildDrilldownAttribution(glResult.lines, apResult.lines);

    // Compute totals from canonical summary aggregation (full dataset).
    const summary = await reconService.getAPReconciliationSummary({ companyId, asOfDate });

    const hasMore = apResult.hasMore || glResult.hasMore;
    const nextCursor = hasMore
      ? encodeDrilldownCursor({
          gl: glResult.hasMore ? (glResult.nextCursor ?? CURSOR_DONE) : CURSOR_DONE,
          ap: apResult.hasMore ? (apResult.nextCursor ?? CURSOR_DONE) : CURSOR_DONE,
        })
      : null;

    return {
      asOfDate,
      configuredAccountIds: settings.accountIds,
      currency: "BASE",
      apSubledgerBalance: summary.apSubledgerBalance,
      glControlBalance: summary.glControlBalance,
      variance: summary.variance,
      categories,
      nextCursor,
      hasMore,
    };
  }
}
