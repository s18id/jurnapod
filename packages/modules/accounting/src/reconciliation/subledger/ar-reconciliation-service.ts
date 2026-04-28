// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AR Reconciliation Service for accounting module.
 *
 * Provides AR vs GL reconciliation functionality with tenant isolation.
 * Mirrors the AP reconciliation pattern but for sales invoices/payments/credit notes.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  normalizeDate,
  isValidTimeZone,
} from "@jurnapod/shared";
import type {
  ARReconciliationSettings,
  ARReconciliationSummaryResult,
  ARDrilldownResult,
  ARDrilldownCategory,
  ARDrilldownLineItem,
  GetARReconciliationSettingsParams,
  ValidateARReconciliationAccountIdsParams,
  SaveARReconciliationSettingsParams,
  GetARReconciliationSummaryParams,
  GetARReconciliationDrilldownParams,
  ARDocumentType,
} from "./ar-reconciliation-types.js";
import {
  ARReconciliationError,
  ARReconciliationSettingsRequiredError,
  ARReconciliationInvalidAccountError,
  ARReconciliationCrossTenantAccountError,
  ARReconciliationTimezoneRequiredError,
} from "./ar-reconciliation-types.js";

// =============================================================================
// BigInt Scaled Decimal Helpers (same as AP reconciliation)
// =============================================================================

export function toScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const re = new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const sign = trimmed.startsWith("-") ? -1n : 1n;
  const unsigned = sign < 0n ? trimmed.slice(1) : trimmed;
  const [integer, fraction = ""] = unsigned.split(".");
  const scaleFactor = 10n ** BigInt(scale);
  const fracScaled = (fraction + "0".repeat(scale)).slice(0, scale);
  const magnitude = BigInt(integer) * scaleFactor + BigInt(fracScaled);
  return sign * magnitude;
}

export function fromScaled(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / (10n ** BigInt(scale));
  const fracPart = (abs % (10n ** BigInt(scale))).toString().padStart(scale, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

export function fromScaled4(value: bigint): string {
  return fromScaled(value, 4);
}

// =============================================================================
// Service
// =============================================================================

const AR_CONTROL_ACCOUNT_TYPE_NAMES = ["AR", "RECEIVABLE", "ACCOUNTS_RECEIVABLE"] as const;
const AR_RECONCILIATION_ACCOUNT_IDS_KEY = "ar_reconciliation_account_ids" as const;

export class ARReconciliationService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * Resolve the canonical IANA timezone for AR reconciliation.
   * Resolution order:
   * 1. outlet.timezone (if present and valid IANA identifier)
   * 2. company.timezone (if present and valid IANA identifier)
   * 3. NO UTC fallback - throw error if neither is available
   */
  async resolveCompanyTimezone(params: { companyId: number }): Promise<string> {
    const { companyId } = params;

    // Try outlet timezone first (default outlet for company)
    const outletRow = await this.db
      .selectFrom("outlets")
      .where("company_id", "=", companyId)
      .where("code", "=", "MAIN")
      .select(["timezone"])
      .executeTakeFirst();

    if (outletRow?.timezone && isValidTimeZone(outletRow.timezone)) {
      return outletRow.timezone;
    }

    // Fall back to company timezone
    const companyRow = await this.db
      .selectFrom("companies")
      .where("id", "=", companyId)
      .select(["timezone"])
      .executeTakeFirst();

    if (companyRow?.timezone && isValidTimeZone(companyRow.timezone)) {
      return companyRow.timezone;
    }

    // NO UTC fallback - fail closed per project invariants
    throw new ARReconciliationTimezoneRequiredError(
      companyId,
      outletRow?.timezone ?? null,
      companyRow?.timezone ?? null
    );
  }

  /**
   * Validate that an account is AR-control compatible.
   */
  private async isARControlAccount(companyId: number, accountId: number): Promise<boolean> {
    const result = await sql`
      SELECT 1 FROM accounts
      WHERE id = ${accountId}
        AND company_id = ${companyId}
        AND is_active = 1
        AND (
          is_receivable = 1
          OR type_name IN (${sql.join(AR_CONTROL_ACCOUNT_TYPE_NAMES.map(t => sql`${t}`), sql`, `)})
        )
      LIMIT 1
    `.execute(this.db);

    return result.rows.length > 0;
  }

  /**
   * Get AR reconciliation account IDs from settings.
   */
  async getARReconciliationAccountIds(companyId: number): Promise<number[] | null> {
    const result = await sql`
      SELECT setting_value FROM settings_strings
      WHERE company_id = ${companyId}
        AND outlet_id IS NULL
        AND setting_key = ${AR_RECONCILIATION_ACCOUNT_IDS_KEY}
      LIMIT 1
    `.execute(this.db);

    if (result.rows.length === 0) {
      return null;
    }

    const settingValue = (result.rows[0] as { setting_value: string }).setting_value;
    try {
      const parsed = JSON.parse(settingValue);
      if (!Array.isArray(parsed)) {
        return null;
      }
      return parsed.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
    } catch {
      return null;
    }
  }

  /**
   * Get AR reconciliation account IDs with fallback to company_modules default.
   */
  async getARReconciliationSettings(params: GetARReconciliationSettingsParams): Promise<ARReconciliationSettings> {
    const { companyId } = params;

    // First try settings_strings
    const settingAccountIds = await this.getARReconciliationAccountIds(companyId);

    if (settingAccountIds !== null && settingAccountIds.length > 0) {
      // Validate all accounts exist and are AR-control compatible
      const validAccounts: number[] = [];

      for (const accountId of settingAccountIds) {
        const isValid = await this.isARControlAccount(companyId, accountId);
        if (isValid) {
          validAccounts.push(accountId);
        }
      }

      if (validAccounts.length > 0) {
        return {
          accountIds: validAccounts,
          source: "settings",
        };
      }
    }

    // Final fallback: find any AR-type account for this company
    const arAccountResult = await sql`
      SELECT id FROM accounts
      WHERE company_id = ${companyId}
        AND is_active = 1
        AND (is_receivable = 1 OR type_name IN (${sql.join(AR_CONTROL_ACCOUNT_TYPE_NAMES.map(t => sql`${t}`), sql`, `)}))
      LIMIT 1
    `.execute(this.db);

    if (arAccountResult.rows.length > 0) {
      const arAccountId = Number((arAccountResult.rows[0] as { id: number }).id);
      return {
        accountIds: [arAccountId],
        source: "fallback_company_default",
      };
    }

    return {
      accountIds: [],
      source: "none",
    };
  }

  /**
   * Validate account IDs for AR reconciliation settings.
   */
  async validateARReconciliationAccountIds(params: ValidateARReconciliationAccountIdsParams): Promise<void> {
    const { companyId, accountIds } = params;

    if (accountIds.length === 0) {
      throw new ARReconciliationInvalidAccountError(0, "No account IDs provided");
    }

    // Fetch all accounts in one query
    const accountsResult = await sql`
      SELECT id, company_id, is_active, is_receivable, type_name
      FROM accounts
      WHERE id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
    `.execute(this.db);

    const accountMap = new Map<number, { company_id: number; is_active: number; is_receivable: number; type_name: string | null }>();
    for (const row of accountsResult.rows) {
      const r = row as { id: number; company_id: number; is_active: number; is_receivable: number; type_name: string | null };
      accountMap.set(r.id, r);
    }

    for (const accountId of accountIds) {
      const account = accountMap.get(accountId);

      if (!account) {
        throw new ARReconciliationInvalidAccountError(accountId, "Account not found or inactive");
      }

      if (account.company_id !== companyId) {
        throw new ARReconciliationCrossTenantAccountError(accountId);
      }

      if (account.is_active !== 1) {
        throw new ARReconciliationInvalidAccountError(accountId, "Account is inactive");
      }

      const isReceivable = account.is_receivable === 1;
      const typeName = (account.type_name ?? "").toUpperCase();
      const isArType = AR_CONTROL_ACCOUNT_TYPE_NAMES.includes(
        typeName as typeof AR_CONTROL_ACCOUNT_TYPE_NAMES[number]
      );

      if (!isReceivable && !isArType) {
        throw new ARReconciliationInvalidAccountError(
          accountId,
          `Account type '${account.type_name ?? "NULL"}' is not AR-control compatible. Set is_receivable=1 or use a receivable account type.`
        );
      }
    }
  }

  /**
   * Save AR reconciliation account IDs to settings.
   */
  async saveARReconciliationSettings(params: SaveARReconciliationSettingsParams): Promise<void> {
    const { companyId, accountIds } = params;

    // Validate first
    await this.validateARReconciliationAccountIds({ companyId, accountIds });

    const settingValue = JSON.stringify(accountIds);

    await sql`
      INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
      VALUES (${companyId}, NULL, ${AR_RECONCILIATION_ACCOUNT_IDS_KEY}, ${settingValue}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE setting_value = ${settingValue}, updated_at = NOW()
    `.execute(this.db);
  }

  /**
   * Normalize date to UTC end-of-day in the given timezone.
   * Uses normalizeDate from @jurnapod/shared (no native Date in business logic).
   */
  private normalizeDate(dateStr: string, timezone: string, endOfDay: boolean): string {
    return normalizeDate(dateStr, timezone, endOfDay ? "end" : "start");
  }

  /**
   * Get AR subledger balance (open posted sales invoices base amounts).
   *
   * Uses SEPARATE aggregate queries to prevent row multiplication that would
   * occur with JOINs when multiple payments or credit notes exist per invoice.
   *
   * AR subledger = SUM(grand_total for posted invoices)
   *              - SUM(amount for posted credit notes)
   *              - SUM(amount for posted payments)
   */
  private async getARSubledgerBalance(companyId: number, asOfDate: string, paymentCutoff: string): Promise<bigint> {
    // Use raw invoice grand_totals, NOT grand_total - paid_total.
    // paid_total is a denormalized field updated by both payments and credit notes,
    // so using it would cause double-counting when we also subtract payment/credit note totals.
    // Correct formula: AR = SUM(invoice amounts) - SUM(payments) - SUM(credit notes)
    // This matches the GL: invoice posting debits AR, payments/credit notes credit AR.
    //
    // paymentCutoff is the timezone-normalised UTC end-of-day for payment_at (a datetime column),
    // matching the same boundary used for the GL posted_at query. asOfDate (date string) is used
    // for invoice_date and credit_note_date which are plain DATE columns.

    // 1. Sum grand_total for posted sales invoices (deterministic, no joins)
    const invoiceRows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN si.status = 'POSTED' AND si.invoice_date <= ${asOfDate}
        THEN si.grand_total
        ELSE 0 END
      ), 0) AS invoice_total
      FROM sales_invoices si
      WHERE si.company_id = ${companyId}
        AND si.status = 'POSTED'
        AND si.invoice_date <= ${asOfDate}
    `.execute(this.db);

    // 2. Sum posted credit note amounts (deterministic, no joins)
    const creditNoteRows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN scn.status = 'POSTED' AND scn.credit_note_date <= ${asOfDate}
        THEN scn.amount
        ELSE 0 END
      ), 0) AS credit_note_total
      FROM sales_credit_notes scn
      WHERE scn.company_id = ${companyId}
        AND scn.status = 'POSTED'
        AND scn.credit_note_date <= ${asOfDate}
    `.execute(this.db);

    // 3. Sum posted payment amounts — use paymentCutoff (UTC end-of-day) for the datetime
    //    column so the boundary matches the GL posted_at query exactly.
    const paymentRows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN sp.status = 'POSTED' AND sp.payment_at <= ${paymentCutoff}
        THEN sp.amount
        ELSE 0 END
      ), 0) AS payment_total
      FROM sales_payments sp
      WHERE sp.company_id = ${companyId}
        AND sp.status = 'POSTED'
        AND sp.payment_at <= ${paymentCutoff}
    `.execute(this.db);

    if (invoiceRows.rows.length === 0) {
      return 0n;
    }

    const invoiceTotal = toScaled((invoiceRows.rows[0] as { invoice_total: string }).invoice_total || "0", 4);
    const creditNoteTotal = toScaled((creditNoteRows.rows[0] as { credit_note_total: string }).credit_note_total || "0", 4);
    const paymentTotal = toScaled((paymentRows.rows[0] as { payment_total: string }).payment_total || "0", 4);

    // AR subledger = invoices - payments - credit notes
    return invoiceTotal - creditNoteTotal - paymentTotal;
  }

  /**
   * Get GL control balance (sum of debit - credit for configured AR accounts).
   */
  private async getGLControlBalance(companyId: number, accountIds: number[], asOfDateUtcEnd: string): Promise<bigint> {
    if (accountIds.length === 0) {
      return 0n;
    }

    const rows = await sql`
      SELECT
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE jl.company_id = ${companyId}
        AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
        AND jb.posted_at <= ${asOfDateUtcEnd}
    `.execute(this.db);

    if (rows.rows.length === 0) {
      return 0n;
    }

    const r = rows.rows[0] as { total_debit: string | null; total_credit: string | null };
    const totalDebit = toScaled(r.total_debit ?? "0", 4);
    const totalCredit = toScaled(r.total_credit ?? "0", 4);

    // GL control balance for AR should be debit - credit (debit-positive for receivables)
    return totalDebit - totalCredit;
  }

  /**
   * Get AR Reconciliation Summary.
   */
  async getARReconciliationSummary(params: GetARReconciliationSummaryParams): Promise<ARReconciliationSummaryResult> {
    const { companyId, asOfDate } = params;

    const settings = await this.getARReconciliationSettings({ companyId });

    if (settings.accountIds.length === 0) {
      throw new ARReconciliationSettingsRequiredError();
    }

    // Resolve tenant-local timezone (canonical: outlet -> company, no UTC fallback)
    const timezone = await this.resolveCompanyTimezone({ companyId });

    // Convert YYYY-MM-DD as_of_date to UTC boundaries in the tenant's timezone.
    const asOfDateUtcEnd = this.normalizeDate(asOfDate, timezone, true);

    const [arBalance, glBalance] = await Promise.all([
      this.getARSubledgerBalance(companyId, asOfDate, asOfDateUtcEnd),
      this.getGLControlBalance(companyId, settings.accountIds, asOfDateUtcEnd),
    ]);

    const variance = arBalance - glBalance;

    return {
      asOfDate,
      arSubledgerBalance: fromScaled4(arBalance),
      glControlBalance: fromScaled4(glBalance),
      variance: fromScaled4(variance),
      configuredAccountIds: settings.accountIds,
      accountSource: settings.source,
      currency: "BASE",
    };
  }

  /**
   * Get AR Reconciliation Drilldown.
   *
   * Provides variance breakdown by document type (invoice, payment, credit note).
   * Each line item includes source identifiers (sourceId, sourceType) for traceability.
   */
  async getARReconciliationDrilldown(
    params: GetARReconciliationDrilldownParams
  ): Promise<ARDrilldownResult> {
    const { companyId, asOfDate, documentType, cursor, limit = 100 } = params;

    const settings = await this.getARReconciliationSettings({ companyId });
    if (settings.accountIds.length === 0) {
      throw new ARReconciliationSettingsRequiredError();
    }

    const accountIds = settings.accountIds;
    const timezone = await this.resolveCompanyTimezone({ companyId });
    const asOfDateUtcEnd = this.normalizeDate(asOfDate, timezone, true);

    const limitPlusOne = limit + 1;

    // Parse cursor into type and id so it can be pushed down to DB queries.
    // Cursor format: "sales_invoice|42" — type|id.
    // Types sort as: sales_credit_note < sales_invoice < sales_payment
    let cursorType: string | null = null;
    let cursorId: number | null = null;
    if (cursor) {
      const parts = cursor.split("|");
      if (parts.length === 2 && Number.isSafeInteger(Number(parts[1]))) {
        [cursorType] = parts;
        cursorId = Number(parts[1]);
      }
    }

    // Per-type cursor SQL: push cursor position into each DB query so we never
    // fetch records from fully-consumed types (avoids O(n) silent truncation).
    const invoiceCursorSql = !cursorType ? sql`1=1`
      : cursorType === "sales_invoice" ? sql`si.id > ${cursorId!}`
      : cursorType < "sales_invoice" ? sql`1=1`
      : sql`1=0`;
    const creditNoteCursorSql = !cursorType ? sql`1=1`
      : cursorType === "sales_credit_note" ? sql`scn.id > ${cursorId!}`
      : cursorType < "sales_credit_note" ? sql`1=1`
      : sql`1=0`;
    const paymentCursorSql = !cursorType ? sql`1=1`
      : cursorType === "sales_payment" ? sql`sp.id > ${cursorId!}`
      : cursorType < "sales_payment" ? sql`1=1`
      : sql`1=0`;

    // Build type-specific date filters for each query
    const invoiceFilter = (!documentType || documentType === "sales_invoice")
      ? sql`si.status = 'POSTED' AND si.invoice_date <= ${asOfDate}`
      : sql`1=0`;
    const creditNoteFilter = (!documentType || documentType === "sales_credit_note")
      ? sql`scn.status = 'POSTED' AND scn.credit_note_date <= ${asOfDate}`
      : sql`1=0`;
    // payment_at is a datetime column — use the timezone-normalised UTC end-of-day
    // boundary (asOfDateUtcEnd) to match the GL posted_at cutoff exactly.
    const paymentFilter = (!documentType || documentType === "sales_payment")
      ? sql`sp.status = 'POSTED' AND sp.payment_at <= ${asOfDateUtcEnd}`
      : sql`1=0`;

    // Fetch invoice drilldown lines.
    // open_amount = grand_total (gross): the GL records the full grand_total as an AR
    // debit when the invoice is posted. Using paid_total here would make open_amount
    // disagree with the GL amount, causing total_variance to differ from the summary.
    const invoiceRows = !documentType || documentType === "sales_invoice" ? await sql`
      SELECT
        si.id,
        si.invoice_no AS reference,
        si.invoice_date AS date,
        si.grand_total AS open_amount,
        si.status,
        'sales_invoice' AS doc_type,
        si.id AS source_id
      FROM sales_invoices si
      WHERE si.company_id = ${companyId}
        AND ${invoiceFilter}
        AND ${invoiceCursorSql}
      ORDER BY si.id ASC
      LIMIT ${limitPlusOne}
    `.execute(this.db) : { rows: [] as Array<Record<string, unknown>> };

    // Fetch credit note drilldown lines
    const creditNoteRows = (!documentType || documentType === "sales_credit_note") ? await sql`
      SELECT
        scn.id,
        scn.credit_note_no AS reference,
        scn.credit_note_date AS date,
        scn.amount AS open_amount,
        scn.status,
        'sales_credit_note' AS doc_type,
        scn.id AS source_id
      FROM sales_credit_notes scn
      WHERE scn.company_id = ${companyId}
        AND ${creditNoteFilter}
        AND ${creditNoteCursorSql}
      ORDER BY scn.id ASC
      LIMIT ${limitPlusOne}
    `.execute(this.db) : { rows: [] as Array<Record<string, unknown>> };

    // Fetch payment drilldown lines
    const paymentRows = (!documentType || documentType === "sales_payment") ? await sql`
      SELECT
        sp.id,
        sp.payment_no AS reference,
        sp.payment_at AS date,
        sp.amount AS open_amount,
        sp.status,
        'sales_payment' AS doc_type,
        sp.id AS source_id
      FROM sales_payments sp
      WHERE sp.company_id = ${companyId}
        AND ${paymentFilter}
        AND ${paymentCursorSql}
      ORDER BY sp.id ASC
      LIMIT ${limitPlusOne}
    `.execute(this.db) : { rows: [] as Array<Record<string, unknown>> };

    // All three queries now SELECT their amount column as `open_amount` for uniform handling.
    type RawLine = { id: number; reference: string; date: string; open_amount: string; status: string; doc_type: string; source_id: number };
    const invoiceLines: RawLine[] = invoiceRows.rows as RawLine[];
    const creditNoteLines: RawLine[] = creditNoteRows.rows as RawLine[];
    const paymentLines: RawLine[] = paymentRows.rows as RawLine[];

    // Collect source IDs for GL lookup
    const invoiceIds = invoiceLines.map(r => r.id);
    const creditNoteIds = creditNoteLines.map(r => r.id);
    const paymentIds = paymentLines.map(r => r.id);

    // Fetch GL amounts from journal_lines linked to AR accounts
    // doc_type -> doc_id -> total debit (for invoices) or total credit (for payments/credit notes) on AR accounts
    const glAmountsByDoc = new Map<string, bigint>();

    if (accountIds.length > 0 && (invoiceIds.length > 0 || creditNoteIds.length > 0 || paymentIds.length > 0)) {
      // Use 1=0 for empty arrays to avoid IN () SQL syntax errors when documentType filter
      // excludes some document types (e.g. documentType='sales_invoice' leaves paymentIds=[]).
      const invoiceDocFilter = invoiceIds.length > 0
        ? sql`(jb.doc_type = 'SALES_INVOICE' AND jb.doc_id IN (${sql.join(invoiceIds.map(id => sql`${id}`), sql`, `)}))`
        : sql`1=0`;
      const paymentDocFilter = paymentIds.length > 0
        ? sql`(jb.doc_type = 'SALES_PAYMENT_IN' AND jb.doc_id IN (${sql.join(paymentIds.map(id => sql`${id}`), sql`, `)}))`
        : sql`1=0`;
      const creditNoteDocFilter = creditNoteIds.length > 0
        ? sql`(jb.doc_type = 'SALES_CREDIT_NOTE' AND jb.doc_id IN (${sql.join(creditNoteIds.map(id => sql`${id}`), sql`, `)}))`
        : sql`1=0`;

      const glLookupRows = await sql`
        SELECT
          jb.doc_type,
          jb.doc_id,
          SUM(jl.debit) AS total_debit,
          SUM(jl.credit) AS total_credit
        FROM journal_lines jl
        INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
        WHERE jl.company_id = ${companyId}
          AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
          AND jb.posted_at <= ${asOfDateUtcEnd}
          AND (${invoiceDocFilter} OR ${paymentDocFilter} OR ${creditNoteDocFilter})
        GROUP BY jb.doc_type, jb.doc_id
      `.execute(this.db);

      for (const row of glLookupRows.rows) {
        const r = row as { doc_type: string; doc_id: number; total_debit: string | null; total_credit: string | null };
        const key = `${r.doc_type}|${r.doc_id}`;
        // For invoices: GL amount = total_debit on AR account (AR is debited when invoice is created)
        // For payments/credit notes: GL amount = total_credit on AR account (AR is credited when payment/credit note applied)
        const glAmount = r.doc_type === 'SALES_INVOICE'
          ? toScaled(r.total_debit ?? "0", 4)
          : toScaled(r.total_credit ?? "0", 4);
        glAmountsByDoc.set(key, glAmount);
      }
    }

    const allLines: ARDrilldownLineItem[] = [];

    for (const row of invoiceLines) {
      const glKey = `SALES_INVOICE|${row.id}`;
      const glAmt = glAmountsByDoc.get(glKey) ?? 0n;
      const openAmt = toScaled(row.open_amount || "0", 4);
      allLines.push({
        id: row.id,
        type: "sales_invoice",
        reference: row.reference,
        date: row.date,
        openAmount: fromScaled4(openAmt),
        glAmount: fromScaled4(glAmt),
        variance: fromScaled4(openAmt - glAmt),
        sourceId: row.source_id,
        sourceType: "sales_invoice",
      });
    }

    for (const row of creditNoteLines) {
      const glKey = `SALES_CREDIT_NOTE|${row.id}`;
      const glAmt = glAmountsByDoc.get(glKey) ?? 0n;
      const openAmt = toScaled(row.open_amount || "0", 4);
      allLines.push({
        id: row.id,
        type: "sales_credit_note",
        reference: row.reference,
        date: row.date,
        openAmount: fromScaled4(openAmt),
        glAmount: fromScaled4(glAmt),
        variance: fromScaled4(openAmt - glAmt),
        sourceId: row.source_id,
        sourceType: "sales_credit_note",
      });
    }

    for (const row of paymentLines) {
      const glKey = `SALES_PAYMENT_IN|${row.id}`;
      const glAmt = glAmountsByDoc.get(glKey) ?? 0n;
      const openAmt = toScaled(row.open_amount || "0", 4);
      allLines.push({
        id: row.id,
        type: "sales_payment",
        reference: row.reference,
        date: row.date,
        openAmount: fromScaled4(openAmt),
        glAmount: fromScaled4(glAmt),
        variance: fromScaled4(openAmt - glAmt),
        sourceId: row.source_id,
        sourceType: "sales_payment",
      });
    }

    // Sort all lines by type then id for deterministic ordering.
    // Cursor filtering was pushed to each DB query (invoiceCursorSql etc.) so all
    // rows here are already beyond the cursor position.
    allLines.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.id - b.id;
    });

    const hasMore = allLines.length > limit;
    const pagedLines = hasMore ? allLines.slice(0, limit) : allLines;
    const nextCursor = hasMore && pagedLines.length > 0
      ? `${pagedLines[pagedLines.length - 1].type}|${pagedLines[pagedLines.length - 1].id}`
      : null;

    // Build category summaries
    const categoryMap = new Map<ARDocumentType, { open: bigint; gl: bigint; variance: bigint; count: number }>();

    for (const line of pagedLines) {
      const cat = categoryMap.get(line.type) ?? { open: 0n, gl: 0n, variance: 0n, count: 0 };
      cat.open += toScaled(line.openAmount, 4);
      cat.gl += toScaled(line.glAmount, 4);
      cat.variance += toScaled(line.variance, 4);
      cat.count++;
      categoryMap.set(line.type, cat);
    }

    const categories: ARDrilldownCategory[] = [];
    for (const [type, data] of categoryMap.entries()) {
      categories.push({
        type,
        label: type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        openBalance: fromScaled4(data.open),
        glBalance: fromScaled4(data.gl),
        variance: fromScaled4(data.variance),
        transactionCount: data.count,
      });
    }

    // Sort categories by type name
    categories.sort((a, b) => a.type.localeCompare(b.type));

    // Total variance
    const totalVar = Array.from(categoryMap.values()).reduce((sum, c) => sum + c.variance, 0n);

    return {
      asOfDate,
      categories,
      lines: pagedLines,
      totalVariance: fromScaled4(totalVar),
      hasMore,
      nextCursor,
    };
  }
}

// Export error classes for use in other services
export {
  ARReconciliationSettingsRequiredError,
  ARReconciliationInvalidAccountError,
  ARReconciliationCrossTenantAccountError,
  ARReconciliationTimezoneRequiredError,
};