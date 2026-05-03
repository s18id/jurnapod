// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Reconciliation Service for accounting module.
 *
 * Provides AP vs GL reconciliation functionality with tenant isolation.
 * Mirrors the AR reconciliation pattern but for purchase invoices/payments/credits.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  toUtcIso,
  isValidTimeZone,
  AP_RECONCILIATION_ACCOUNT_IDS_KEY,
  AP_CONTROL_ACCOUNT_TYPE_NAMES,
  PURCHASE_INVOICE_STATUS,
  AP_PAYMENT_STATUS,
  PURCHASE_CREDIT_STATUS,
} from "@jurnapod/shared";
import type {
  APReconciliationSettings,
  APReconciliationSummaryResult,
  APDrilldownResult,
  APDrilldownCategory,
  APDrilldownLineItem,
  GetAPReconciliationSettingsParams,
  ValidateAPReconciliationAccountIdsParams,
  SaveAPReconciliationSettingsParams,
  GetAPReconciliationSummaryParams,
  GetAPReconciliationDrilldownParams,
  APDocumentType,
} from "./ap-reconciliation-types.js";
import {
  APReconciliationError,
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
} from "./ap-reconciliation-types.js";

// =============================================================================
// BigInt Scaled Decimal Helpers (same as AR reconciliation)
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

/**
 * Compute base amount from original amount and exchange rate.
 * Formula: base = original * exchange_rate, rounded half-up to scale 4.
 */
function computeBaseAmount(originalAmount: string, exchangeRate: string): bigint {
  const originalScaled = toScaled(originalAmount, 4);
  const rateScaled = toScaled(exchangeRate, 8);
  const scaleFactor = 10n ** 8n;
  return (originalScaled * rateScaled + scaleFactor / 2n) / scaleFactor;
}

// =============================================================================
// Service
// =============================================================================

export class APReconciliationService {
  constructor(private readonly db: KyselySchema) {}

  /**
   * Resolve the canonical IANA timezone for AP reconciliation.
   * Resolution order: outlet.timezone → company.timezone → error (no UTC fallback).
   */
  async resolveCompanyTimezone(params: { companyId: number }): Promise<string> {
    const { companyId } = params;

    const outletRow = await this.db
      .selectFrom("outlets")
      .where("company_id", "=", companyId)
      .where("code", "=", "MAIN")
      .select(["timezone"])
      .executeTakeFirst();

    if (outletRow?.timezone && isValidTimeZone(outletRow.timezone)) {
      return outletRow.timezone;
    }

    const companyRow = await this.db
      .selectFrom("companies")
      .where("id", "=", companyId)
      .select(["timezone"])
      .executeTakeFirst();

    if (companyRow?.timezone && isValidTimeZone(companyRow.timezone)) {
      return companyRow.timezone;
    }

    throw new APReconciliationTimezoneRequiredError(
      companyId,
      outletRow?.timezone ?? null,
      companyRow?.timezone ?? null
    );
  }

  private async isAPControlAccount(companyId: number, accountId: number): Promise<boolean> {
    const result = await sql`
      SELECT 1 FROM accounts
      WHERE id = ${accountId}
        AND company_id = ${companyId}
        AND is_active = 1
        AND (
          is_payable = 1
          OR type_name IN (${sql.join(AP_CONTROL_ACCOUNT_TYPE_NAMES.map(t => sql`${t}`), sql`, `)})
        )
      LIMIT 1
    `.execute(this.db);

    return result.rows.length > 0;
  }

  async getAPReconciliationAccountIds(companyId: number): Promise<number[] | null> {
    const result = await sql`
      SELECT setting_value FROM settings_strings
      WHERE company_id = ${companyId}
        AND outlet_id IS NULL
        AND setting_key = ${AP_RECONCILIATION_ACCOUNT_IDS_KEY}
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

  async getAPReconciliationSettings(params: GetAPReconciliationSettingsParams): Promise<APReconciliationSettings> {
    const { companyId } = params;

    const settingAccountIds = await this.getAPReconciliationAccountIds(companyId);

    if (settingAccountIds !== null && settingAccountIds.length > 0) {
      const validAccounts: number[] = [];
      for (const accountId of settingAccountIds) {
        const isValid = await this.isAPControlAccount(companyId, accountId);
        if (isValid) {
          validAccounts.push(accountId);
        }
      }
      if (validAccounts.length > 0) {
        return { accountIds: validAccounts, source: "settings" };
      }
    }

    // Fallback: find any AP-type account
    const apAccountResult = await sql`
      SELECT id FROM accounts
      WHERE company_id = ${companyId}
        AND is_active = 1
        AND (is_payable = 1 OR type_name IN (${sql.join(AP_CONTROL_ACCOUNT_TYPE_NAMES.map(t => sql`${t}`), sql`, `)}))
      LIMIT 1
    `.execute(this.db);

    if (apAccountResult.rows.length > 0) {
      const apAccountId = Number((apAccountResult.rows[0] as { id: number }).id);
      return { accountIds: [apAccountId], source: "fallback_company_default" };
    }

    return { accountIds: [], source: "none" };
  }

  async validateAPReconciliationAccountIds(params: ValidateAPReconciliationAccountIdsParams): Promise<void> {
    const { companyId, accountIds } = params;

    if (accountIds.length === 0) {
      throw new APReconciliationInvalidAccountError(0, "No account IDs provided");
    }

    const accountsResult = await sql`
      SELECT id, company_id, is_active, is_payable, type_name
      FROM accounts
      WHERE id IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})
    `.execute(this.db);

    const accountMap = new Map<number, { company_id: number; is_active: number; is_payable: number; type_name: string | null }>();
    for (const row of accountsResult.rows) {
      const r = row as { id: number; company_id: number; is_active: number; is_payable: number; type_name: string | null };
      accountMap.set(r.id, r);
    }

    for (const accountId of accountIds) {
      const account = accountMap.get(accountId);

      if (!account) {
        throw new APReconciliationInvalidAccountError(accountId, "Account not found or inactive");
      }
      if (account.company_id !== companyId) {
        throw new APReconciliationCrossTenantAccountError(accountId);
      }
      if (account.is_active !== 1) {
        throw new APReconciliationInvalidAccountError(accountId, "Account is inactive");
      }

      const isPayable = account.is_payable === 1;
      const typeName = (account.type_name ?? "").toUpperCase();
      const isApType = AP_CONTROL_ACCOUNT_TYPE_NAMES.includes(
        typeName as typeof AP_CONTROL_ACCOUNT_TYPE_NAMES[number]
      );

      if (!isPayable && !isApType) {
        throw new APReconciliationInvalidAccountError(
          accountId,
          `Account type '${account.type_name ?? "NULL"}' is not AP-control compatible. Set is_payable=1 or use a payable account type.`
        );
      }
    }
  }

  async saveAPReconciliationSettings(params: SaveAPReconciliationSettingsParams): Promise<void> {
    const { companyId, accountIds } = params;
    await this.validateAPReconciliationAccountIds({ companyId, accountIds });
    const settingValue = JSON.stringify(accountIds);
    await sql`
      INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
      VALUES (${companyId}, NULL, ${AP_RECONCILIATION_ACCOUNT_IDS_KEY}, ${settingValue}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE setting_value = ${settingValue}, updated_at = NOW()
    `.execute(this.db);
  }

  private normalizeDate(dateStr: string, timezone: string, endOfDay: boolean): string {
    return toUtcIso.businessDate(dateStr, timezone, endOfDay ? "end" : "start");
  }

  /**
   * Get AP subledger balance using SEPARATE aggregate queries to prevent row multiplication.
   *
   * AP subledger = SUM(invoice.grand_total * exchange_rate) for POSTED invoices ≤ asOfDate
   *             - SUM(payment_line.allocation_amount) for POSTED payments ≤ asOfDate
   *             - SUM(credit_app.applied_amount) for POSTED credits ≤ asOfDate
   */
  private async getAPSubledgerBalance(companyId: number, asOfDate: string): Promise<bigint> {
    const POSTED_INVOICE = PURCHASE_INVOICE_STATUS.POSTED;
    const POSTED_PAYMENT = AP_PAYMENT_STATUS.POSTED;
    const CREDIT_PARTIAL = PURCHASE_CREDIT_STATUS.PARTIAL;
    const CREDIT_APPLIED = PURCHASE_CREDIT_STATUS.APPLIED;

    // 1. Invoice total in base currency (grand_total * exchange_rate)
    // CAST to DECIMAL(19,4): DECIMAL(19,4) * DECIMAL(18,8) produces DECIMAL(38,12)
    // which toScaled(..., 4) would reject. This keeps precision at 4 decimal places.
    const invoiceRows = await sql`
      SELECT COALESCE(CAST(SUM(grand_total * exchange_rate) AS DECIMAL(19,4)), 0) AS invoice_base_total
      FROM purchase_invoices
      WHERE company_id = ${companyId}
        AND status = ${POSTED_INVOICE}
        AND invoice_date <= ${asOfDate}
    `.execute(this.db);

    // 2. Payment total (allocation amounts are in base currency)
    const paymentRows = await sql`
      SELECT COALESCE(SUM(apl.allocation_amount), 0) AS payment_total
      FROM ap_payment_lines apl
      INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
      WHERE ap.company_id = ${companyId}
        AND ap.status = ${POSTED_PAYMENT}
        AND ap.payment_date <= ${asOfDate}
    `.execute(this.db);

    // 3. Credit total (applied amounts are in base currency)
    const creditRows = await sql`
      SELECT COALESCE(SUM(pca.applied_amount), 0) AS credit_total
      FROM purchase_credit_applications pca
      INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
      WHERE pca.company_id = ${companyId}
        AND pc.status IN (${CREDIT_PARTIAL}, ${CREDIT_APPLIED})
        AND pc.credit_date <= ${asOfDate}
    `.execute(this.db);

    const invoiceTotal = toScaled((invoiceRows.rows[0] as { invoice_base_total: string }).invoice_base_total || "0", 4);
    const paymentTotal = toScaled((paymentRows.rows[0] as { payment_total: string }).payment_total || "0", 4);
    const creditTotal = toScaled((creditRows.rows[0] as { credit_total: string }).credit_total || "0", 4);

    // AP subledger = invoices - payments - credits (positive = net payable)
    return invoiceTotal - paymentTotal - creditTotal;
  }

  /**
   * Get GL control balance: credit - debit for AP accounts (liability accounts are credit-positive).
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

    // AP is a liability: credit - debit gives positive payable balance
    return totalCredit - totalDebit;
  }

  async getAPReconciliationSummary(params: GetAPReconciliationSummaryParams): Promise<APReconciliationSummaryResult> {
    const { companyId, asOfDate } = params;

    const settings = await this.getAPReconciliationSettings({ companyId });
    if (settings.accountIds.length === 0) {
      throw new APReconciliationSettingsRequiredError();
    }

    const timezone = await this.resolveCompanyTimezone({ companyId });
    const asOfDateUtcEnd = this.normalizeDate(asOfDate, timezone, true);

    const [apBalance, glBalance] = await Promise.all([
      this.getAPSubledgerBalance(companyId, asOfDate),
      this.getGLControlBalance(companyId, settings.accountIds, asOfDateUtcEnd),
    ]);

    const variance = apBalance - glBalance;

    return {
      asOfDate,
      apSubledgerBalance: fromScaled4(apBalance),
      glControlBalance: fromScaled4(glBalance),
      variance: fromScaled4(variance),
      configuredAccountIds: settings.accountIds,
      accountSource: settings.source,
      currency: "BASE",
    };
  }

  async getAPReconciliationDrilldown(params: GetAPReconciliationDrilldownParams): Promise<APDrilldownResult> {
    const { companyId, asOfDate, documentType, cursor, limit = 100 } = params;

    const settings = await this.getAPReconciliationSettings({ companyId });
    if (settings.accountIds.length === 0) {
      throw new APReconciliationSettingsRequiredError();
    }

    const accountIds = settings.accountIds;
    const timezone = await this.resolveCompanyTimezone({ companyId });
    const asOfDateUtcEnd = this.normalizeDate(asOfDate, timezone, true);
    const limitPlusOne = limit + 1;

    const POSTED_INVOICE = PURCHASE_INVOICE_STATUS.POSTED;
    const POSTED_PAYMENT = AP_PAYMENT_STATUS.POSTED;
    const CREDIT_PARTIAL = PURCHASE_CREDIT_STATUS.PARTIAL;
    const CREDIT_APPLIED = PURCHASE_CREDIT_STATUS.APPLIED;

    // Cursor: "purchase_invoice|42"
    // Types sort alphabetically: ap_payment < purchase_credit < purchase_invoice
    let cursorType: string | null = null;
    let cursorId: number | null = null;
    if (cursor) {
      const parts = cursor.split("|");
      if (parts.length === 2 && Number.isSafeInteger(Number(parts[1]))) {
        [cursorType] = parts;
        cursorId = Number(parts[1]);
      }
    }

    const invoiceCursorSql = !cursorType ? sql`1=1`
      : cursorType === "purchase_invoice" ? sql`pi.id > ${cursorId!}`
      : cursorType < "purchase_invoice" ? sql`1=1`
      : sql`1=0`;

    const paymentCursorSql = !cursorType ? sql`1=1`
      : cursorType === "ap_payment" ? sql`ap.id > ${cursorId!}`
      : cursorType < "ap_payment" ? sql`1=1`
      : sql`1=0`;

    const creditCursorSql = !cursorType ? sql`1=1`
      : cursorType === "purchase_credit" ? sql`pc.id > ${cursorId!}`
      : cursorType < "purchase_credit" ? sql`1=1`
      : sql`1=0`;

    // Fetch invoice drilldown lines (open_amount = grand_total * exchange_rate)
    const invoiceRows = (!documentType || documentType === "purchase_invoice") ? await sql`
      SELECT
        pi.id,
        pi.invoice_no AS reference,
        pi.invoice_date AS date,
        -- CAST: same rationale as summary query — prevent DECIMAL overflow in toScaled(...,4)
        CAST(pi.grand_total * pi.exchange_rate AS DECIMAL(19,4)) AS open_amount,
        pi.status,
        'purchase_invoice' AS doc_type,
        pi.id AS source_id
      FROM purchase_invoices pi
      WHERE pi.company_id = ${companyId}
        AND pi.status = ${POSTED_INVOICE}
        AND pi.invoice_date <= ${asOfDate}
        AND ${invoiceCursorSql}
      ORDER BY pi.id ASC
      LIMIT ${limitPlusOne}
    `.execute(this.db) : { rows: [] as Array<Record<string, unknown>> };

    // Fetch payment drilldown lines (open_amount = SUM(allocation_amount) per payment)
    const paymentRows = (!documentType || documentType === "ap_payment") ? await sql`
      SELECT
        ap.id,
        ap.payment_no AS reference,
        ap.payment_date AS date,
        COALESCE(SUM(apl.allocation_amount), 0) AS open_amount,
        ap.status,
        'ap_payment' AS doc_type,
        ap.id AS source_id
      FROM ap_payments ap
      LEFT JOIN ap_payment_lines apl ON apl.ap_payment_id = ap.id
      WHERE ap.company_id = ${companyId}
        AND ap.status = ${POSTED_PAYMENT}
        AND ap.payment_date <= ${asOfDate}
        AND ${paymentCursorSql}
      GROUP BY ap.id, ap.payment_no, ap.payment_date, ap.status
      ORDER BY ap.id ASC
      LIMIT ${limitPlusOne}
    `.execute(this.db) : { rows: [] as Array<Record<string, unknown>> };

    // Fetch credit drilldown lines (open_amount = SUM(applied_amount) per credit)
    const creditRows = (!documentType || documentType === "purchase_credit") ? await sql`
      SELECT
        pc.id,
        pc.credit_no AS reference,
        pc.credit_date AS date,
        COALESCE(SUM(pca.applied_amount), 0) AS open_amount,
        pc.status,
        'purchase_credit' AS doc_type,
        pc.id AS source_id
      FROM purchase_credits pc
      LEFT JOIN purchase_credit_applications pca ON pca.purchase_credit_id = pc.id AND pca.company_id = ${companyId}
      WHERE pc.company_id = ${companyId}
        AND pc.status IN (${CREDIT_PARTIAL}, ${CREDIT_APPLIED})
        AND pc.credit_date <= ${asOfDate}
        AND ${creditCursorSql}
      GROUP BY pc.id, pc.credit_no, pc.credit_date, pc.status
      ORDER BY pc.id ASC
      LIMIT ${limitPlusOne}
    `.execute(this.db) : { rows: [] as Array<Record<string, unknown>> };

    type RawLine = { id: number; reference: string; date: string; open_amount: string; status: number; doc_type: string; source_id: number };
    const invoiceLines = invoiceRows.rows as RawLine[];
    const paymentLines = paymentRows.rows as RawLine[];
    const creditLines = creditRows.rows as RawLine[];

    const invoiceIds = invoiceLines.map(r => r.id);
    const paymentIds = paymentLines.map(r => r.id);
    const creditIds = creditLines.map(r => r.id);

    // GL amount lookup per document
    const glAmountsByDoc = new Map<string, bigint>();

    if (accountIds.length > 0 && (invoiceIds.length > 0 || paymentIds.length > 0 || creditIds.length > 0)) {
      const invoiceDocFilter = invoiceIds.length > 0
        ? sql`(jb.doc_type = 'PURCHASE_INVOICE' AND jb.doc_id IN (${sql.join(invoiceIds.map(id => sql`${id}`), sql`, `)}))`
        : sql`1=0`;
      const paymentDocFilter = paymentIds.length > 0
        ? sql`(jb.doc_type = 'AP_PAYMENT' AND jb.doc_id IN (${sql.join(paymentIds.map(id => sql`${id}`), sql`, `)}))`
        : sql`1=0`;
      const creditDocFilter = creditIds.length > 0
        ? sql`(jb.doc_type = 'PURCHASE_CREDIT' AND jb.doc_id IN (${sql.join(creditIds.map(id => sql`${id}`), sql`, `)}))`
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
          AND (${invoiceDocFilter} OR ${paymentDocFilter} OR ${creditDocFilter})
        GROUP BY jb.doc_type, jb.doc_id
      `.execute(this.db);

      for (const row of glLookupRows.rows) {
        const r = row as { doc_type: string; doc_id: number; total_debit: string | null; total_credit: string | null };
        const key = `${r.doc_type}|${r.doc_id}`;
        // Invoice: GL amount = total_credit on AP (invoice posting credits AP)
        // Payment: GL amount = total_debit on AP (payment debits AP)
        // Credit:  GL amount = total_debit on AP (credit note debits AP)
        const glAmount = r.doc_type === 'PURCHASE_INVOICE'
          ? toScaled(r.total_credit ?? "0", 4)
          : toScaled(r.total_debit ?? "0", 4);
        glAmountsByDoc.set(key, glAmount);
      }
    }

    const allLines: APDrilldownLineItem[] = [];

    for (const row of invoiceLines) {
      const glKey = `PURCHASE_INVOICE|${row.id}`;
      const glAmt = glAmountsByDoc.get(glKey) ?? 0n;
      const openAmt = toScaled(row.open_amount || "0", 4);
      allLines.push({
        id: row.id,
        type: "purchase_invoice",
        reference: row.reference,
        date: typeof row.date === 'object' ? (row.date as Date).toISOString().slice(0, 10) : String(row.date),
        openAmount: fromScaled4(openAmt),
        glAmount: fromScaled4(glAmt),
        variance: fromScaled4(openAmt - glAmt),
        sourceId: row.source_id,
        sourceType: "purchase_invoice",
      });
    }

    for (const row of paymentLines) {
      const glKey = `AP_PAYMENT|${row.id}`;
      const glAmt = glAmountsByDoc.get(glKey) ?? 0n;
      const openAmt = toScaled(row.open_amount || "0", 4);
      allLines.push({
        id: row.id,
        type: "ap_payment",
        reference: row.reference,
        date: typeof row.date === 'object' ? (row.date as Date).toISOString().slice(0, 10) : String(row.date),
        openAmount: fromScaled4(openAmt),
        glAmount: fromScaled4(glAmt),
        variance: fromScaled4(openAmt - glAmt),
        sourceId: row.source_id,
        sourceType: "ap_payment",
      });
    }

    for (const row of creditLines) {
      const glKey = `PURCHASE_CREDIT|${row.id}`;
      const glAmt = glAmountsByDoc.get(glKey) ?? 0n;
      const openAmt = toScaled(row.open_amount || "0", 4);
      allLines.push({
        id: row.id,
        type: "purchase_credit",
        reference: row.reference,
        date: typeof row.date === 'object' ? (row.date as Date).toISOString().slice(0, 10) : String(row.date),
        openAmount: fromScaled4(openAmt),
        glAmount: fromScaled4(glAmt),
        variance: fromScaled4(openAmt - glAmt),
        sourceId: row.source_id,
        sourceType: "purchase_credit",
      });
    }

    // Sort by type then id (deterministic ordering)
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
    const categoryMap = new Map<APDocumentType, { open: bigint; gl: bigint; variance: bigint; count: number }>();
    for (const line of pagedLines) {
      const cat = categoryMap.get(line.type) ?? { open: 0n, gl: 0n, variance: 0n, count: 0 };
      cat.open += toScaled(line.openAmount, 4);
      cat.gl += toScaled(line.glAmount, 4);
      cat.variance += toScaled(line.variance, 4);
      cat.count++;
      categoryMap.set(line.type, cat);
    }

    const categories: APDrilldownCategory[] = [];
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
    categories.sort((a, b) => a.type.localeCompare(b.type));

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

export {
  APReconciliationSettingsRequiredError,
  APReconciliationInvalidAccountError,
  APReconciliationCrossTenantAccountError,
  APReconciliationTimezoneRequiredError,
};
