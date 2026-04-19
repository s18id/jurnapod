// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Invoice Domain Service
 *
 * Library-first business logic for purchase invoice management.
 * Handles draft creation, listing, retrieval, posting, and voiding.
 */

import { getDb } from "../db.js";
import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import {
  PURCHASE_INVOICE_STATUS,
  type PurchaseInvoiceLineResponse,
} from "@jurnapod/shared";
import { getExchangeRate } from "./exchange-rate.js";
import { listCompanyModulesExtended } from "../settings-modules.js";

// =============================================================================
// Error Types
// =============================================================================

export class PIError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PIError";
  }
}

export class PINotFoundError extends PIError {
  constructor(piId: number) {
    super("PI_NOT_FOUND", `Purchase invoice ${piId} not found`);
  }
}

export class PIInvalidStatusTransitionError extends PIError {
  constructor(fromStatus: number, toStatus: number) {
    super(
      "INVALID_STATUS_TRANSITION",
      `Cannot transition PI from status ${fromStatus} to ${toStatus}`
    );
  }
}

export class PIExchangeRateMissingError extends PIError {
  constructor(currencyCode: string, invoiceDate: Date) {
    super(
      "EXCHANGE_RATE_MISSING",
      `Exchange rate not found for currency ${currencyCode} on date ${invoiceDate.toISOString().split("T")[0]}`
    );
  }
}

export class PIAccountMissingError extends PIError {
  constructor(accountType: string) {
    super(
      "ACCOUNT_MISSING",
      `${accountType} account not configured in purchasing settings`
    );
  }
}

export class PICreditLimitExceededError extends PIError {
  constructor(
    public readonly utilizationPercent: number,
    public readonly creditLimit: string
  ) {
    super(
      "CREDIT_LIMIT_EXCEEDED",
      `Credit limit exceeded: ${utilizationPercent.toFixed(1)}% of limit ${creditLimit}`
    );
  }
}

export class PITaxAccountMissingError extends PIError {
  constructor(taxRateId: number) {
    super(
      "TAX_ACCOUNT_MISSING",
      `Tax account not configured for tax_rate_id ${taxRateId}`
    );
  }
}

// =============================================================================
// Types
// =============================================================================

export interface PICreateInput {
  supplierId: number;
  invoiceNo: string;
  invoiceDate: Date;
  dueDate?: Date | null;
  referenceNumber?: string | null;
  currencyCode: string;
  exchangeRate?: string;
  notes?: string | null;
  lines: Array<{
    itemId?: number | null;
    description: string;
    qty: string;
    unitPrice: string;
    taxRateId?: number | null;
    lineType?: "ITEM" | "SERVICE" | "FREIGHT" | "TAX" | "DISCOUNT";
  }>;
}

export interface PIListParams {
  companyId: number;
  supplierId?: number;
  status?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
  offset: number;
}

export interface PIListResult {
  invoices: Array<{
    id: number;
    company_id: number;
    supplier_id: number;
    supplier_name: string | null;
    invoice_no: string;
    invoice_date: string;
    due_date: string | null;
    reference_number: string | null;
    status: string;
    currency_code: string;
    subtotal: string;
    tax_amount: string;
    grand_total: string;
    notes: string | null;
    journal_batch_id: number | null;
    posted_at: string | null;
    voided_at: string | null;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface PIGetResult {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  reference_number: string | null;
  status: string;
  currency_code: string;
  exchange_rate: string;
  subtotal: string;
  tax_amount: string;
  grand_total: string;
  notes: string | null;
  journal_batch_id: number | null;
  posted_at: string | null;
  posted_by_user_id: number | null;
  voided_at: string | null;
  voided_by_user_id: number | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: PurchaseInvoiceLineResponse[];
}

export interface PIPostResult {
  id: number;
  journal_batch_id: number;
  warnings: string[];
}

// =============================================================================
// BigInt Scaled Decimal Helpers
// =============================================================================

function toScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const re = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const [integer, fraction = ""] = trimmed.split(".");
  const scaleFactor = 10n ** BigInt(scale);
  const fracScaled = (fraction + "0".repeat(scale)).slice(0, scale);
  return BigInt(integer) * scaleFactor + BigInt(fracScaled);
}

function toScaled4(value: string): bigint {
  return toScaled(value, 4);
}

function toScaled8(value: string): bigint {
  return toScaled(value, 8);
}

function fromScaled4(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / 10000n;
  const fracPart = (abs % 10000n).toString().padStart(4, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

function scale4Mul(a: bigint, b: bigint): bigint {
  return (a * b) / 10000n;
}

// =============================================================================
// Credit Limit Enforcement
// =============================================================================

interface CreditUtilization {
  currentOustanding: bigint;
  creditLimit: bigint;
  utilizationPercent: number;
  newOutstanding: bigint;
  newUtilizationPercent: number;
}

async function computeCreditUtilization(
  db: KyselySchema,
  companyId: number,
  supplierId: number,
  invoiceGrandTotal: bigint,
  _currencyCode: string
): Promise<CreditUtilization | null> {
  // Get supplier credit limit
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", supplierId)
    .where("company_id", "=", companyId)
    .select(["credit_limit", "currency"])
    .executeTakeFirst();

  if (!supplier) {
    return null;
  }

  const creditLimit = toScaled4(String(supplier.credit_limit));
  if (creditLimit === 0n) {
    // No credit limit set, skip check
    return null;
  }

  // Get current outstanding AP from posted, non-voided purchase invoices
  // Sum of grand_total for the same supplier
  const outstandingResult = await sql<{ total: string }>`
    SELECT COALESCE(SUM(pi.grand_total), 0) as total
    FROM purchase_invoices pi
    WHERE pi.company_id = ${companyId}
      AND pi.supplier_id = ${supplierId}
      AND pi.status = ${PURCHASE_INVOICE_STATUS.POSTED}
  `.execute(db);

  const currentOutstanding = toScaled4(String(outstandingResult.rows[0]?.total ?? "0"));

  const newOutstanding = currentOutstanding + invoiceGrandTotal;
  const currentUtilization = creditLimit > 0n ? Number((currentOutstanding * 100n) / creditLimit) : 0;
  const newUtilizationPercent = creditLimit > 0n ? Number((newOutstanding * 100n) / creditLimit) : 0;

  return {
    currentOustanding: currentOutstanding,
    creditLimit,
    utilizationPercent: currentUtilization,
    newOutstanding,
    newUtilizationPercent,
  };
}

// =============================================================================
// Create Draft PI
// =============================================================================

export async function createDraftPI(
  companyId: number,
  userId: number,
  input: PICreateInput
): Promise<PIGetResult> {
  const db = getDb() as KyselySchema;

  // Validate supplier ownership (tenant isolation)
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", input.supplierId)
    .where("company_id", "=", companyId)
    .select(["id", "name"])
    .executeTakeFirst();

  if (!supplier) {
    throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
  }

  const result = await db.transaction().execute(async (trx) => {
    // Insert PI header
    const headerResult = await trx
      .insertInto("purchase_invoices")
      .values({
        company_id: companyId,
        supplier_id: input.supplierId,
        invoice_no: input.invoiceNo,
        invoice_date: input.invoiceDate,
        due_date: input.dueDate ?? null,
        reference_number: input.referenceNumber ?? null,
        status: PURCHASE_INVOICE_STATUS.DRAFT,
        currency_code: input.currencyCode,
        exchange_rate: input.exchangeRate ?? "1.00000000",
        subtotal: "0",
        tax_amount: "0",
        grand_total: "0",
        notes: input.notes ?? null,
        created_by_user_id: userId,
      })
      .executeTakeFirst();

    const piId = Number(headerResult.insertId);
    if (!piId) throw new Error("Failed to create purchase invoice");

    // Compute and insert lines with computed totals
    let subtotal = 0n;
    let taxTotal = 0n;

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const qty = toScaled4(line.qty);
      const unitPrice = toScaled4(line.unitPrice);
      const lineTotal = scale4Mul(qty, unitPrice);

      // Get tax rate percent if specified
      let taxAmount = 0n;
      if (line.taxRateId) {
        const taxRate = await trx
          .selectFrom("tax_rates")
          .where("id", "=", line.taxRateId)
          .where("company_id", "=", companyId)
          .select(["rate_percent"])
          .executeTakeFirst();

        if (taxRate) {
          const taxRatePercent = toScaled4(String(taxRate.rate_percent));
          taxAmount = scale4Mul(lineTotal, taxRatePercent);
        }
      }

      await trx
        .insertInto("purchase_invoice_lines")
        .values({
          company_id: companyId,
          invoice_id: piId,
          line_no: i + 1,
          item_id: line.itemId ?? null,
          description: line.description,
          qty: line.qty,
          unit_price: line.unitPrice,
          line_total: fromScaled4(lineTotal),
          tax_rate_id: line.taxRateId ?? null,
          tax_amount: fromScaled4(taxAmount),
          line_type: line.lineType ?? "ITEM",
        })
        .executeTakeFirst();

      subtotal += lineTotal;
      taxTotal += taxAmount;
    }

    const grandTotal = subtotal + taxTotal;

    // Update header with computed totals
    await trx
      .updateTable("purchase_invoices")
      .set({
        subtotal: fromScaled4(subtotal),
        tax_amount: fromScaled4(taxTotal),
        grand_total: fromScaled4(grandTotal),
      })
      .where("id", "=", piId)
      .executeTakeFirst();

    return { piId };
  });

  const pi = await getPIById(companyId, result.piId);
  if (!pi) throw new Error("Failed to fetch created purchase invoice");
  return pi;
}

// =============================================================================
// List PIs
// =============================================================================

export async function listPIs(params: PIListParams): Promise<PIListResult> {
  const db = getDb() as KyselySchema;

  // Build where conditions
  const conditions = [sql`pi.company_id = ${params.companyId}`];

  if (params.supplierId !== undefined) {
    conditions.push(sql`pi.supplier_id = ${params.supplierId}`);
  }
  if (params.status !== undefined) {
    conditions.push(sql`pi.status = ${params.status}`);
  }
  if (params.dateFrom !== undefined) {
    conditions.push(sql`pi.invoice_date >= ${params.dateFrom}`);
  }
  if (params.dateTo !== undefined) {
    conditions.push(sql`pi.invoice_date <= ${params.dateTo}`);
  }

  const whereClause = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  // Count total
  const countResult = await sql<{ count: string }>`
    SELECT COUNT(*) as count
    FROM purchase_invoices pi
    ${whereClause}
  `.execute(db);

  const total = Number(countResult.rows[0]?.count ?? 0);

  // Fetch invoices with supplier name
  const rows = await sql<{
    id: number;
    company_id: number;
    supplier_id: number;
    supplier_name: string | null;
    invoice_no: string;
    invoice_date: Date;
    due_date: Date | null;
    reference_number: string | null;
    status: number;
    currency_code: string;
    subtotal: string;
    tax_amount: string;
    grand_total: string;
    notes: string | null;
    journal_batch_id: number | null;
    posted_at: Date | null;
    voided_at: Date | null;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: Date;
    updated_at: Date;
  }>`
    SELECT
      pi.id, pi.company_id, pi.supplier_id, s.name as supplier_name,
      pi.invoice_no, pi.invoice_date, pi.due_date, pi.reference_number,
      pi.status, pi.currency_code, pi.subtotal, pi.tax_amount, pi.grand_total,
      pi.notes, pi.journal_batch_id, pi.posted_at, pi.voided_at,
      pi.created_by_user_id, pi.updated_by_user_id, pi.created_at, pi.updated_at
    FROM purchase_invoices pi
    LEFT JOIN suppliers s ON s.id = pi.supplier_id AND s.company_id = pi.company_id
    ${whereClause}
    ORDER BY pi.created_at DESC
    LIMIT ${params.limit}
    OFFSET ${params.offset}
  `.execute(db);

  const statusLabels: Record<number, string> = {
    [PURCHASE_INVOICE_STATUS.DRAFT]: "DRAFT",
    [PURCHASE_INVOICE_STATUS.POSTED]: "POSTED",
    [PURCHASE_INVOICE_STATUS.VOID]: "VOID",
  };

  return {
    invoices: rows.rows.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      invoice_no: r.invoice_no,
      invoice_date: new Date(r.invoice_date).toISOString(),
      due_date: r.due_date ? new Date(r.due_date).toISOString() : null,
      reference_number: r.reference_number,
      status: statusLabels[r.status] ?? String(r.status),
      currency_code: r.currency_code,
      subtotal: r.subtotal,
      tax_amount: r.tax_amount,
      grand_total: r.grand_total,
      notes: r.notes,
      journal_batch_id: r.journal_batch_id,
      posted_at: r.posted_at ? new Date(r.posted_at).toISOString() : null,
      voided_at: r.voided_at ? new Date(r.voided_at).toISOString() : null,
      created_by_user_id: r.created_by_user_id,
      updated_by_user_id: r.updated_by_user_id,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    })),
    total,
    limit: params.limit,
    offset: params.offset,
  };
}

// =============================================================================
// Get PI by ID
// =============================================================================

export async function getPIById(
  companyId: number,
  piId: number
): Promise<PIGetResult | null> {
  const db = getDb() as KyselySchema;

  const header = await sql<{
    id: number;
    company_id: number;
    supplier_id: number;
    supplier_name: string | null;
    invoice_no: string;
    invoice_date: Date;
    due_date: Date | null;
    reference_number: string | null;
    status: number;
    currency_code: string;
    exchange_rate: string;
    subtotal: string;
    tax_amount: string;
    grand_total: string;
    notes: string | null;
    journal_batch_id: number | null;
    posted_at: Date | null;
    posted_by_user_id: number | null;
    voided_at: Date | null;
    voided_by_user_id: number | null;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: Date;
    updated_at: Date;
  }>`
    SELECT
      pi.id, pi.company_id, pi.supplier_id, s.name as supplier_name,
      pi.invoice_no, pi.invoice_date, pi.due_date, pi.reference_number,
      pi.status, pi.currency_code, pi.exchange_rate, pi.subtotal, pi.tax_amount,
      pi.grand_total, pi.notes, pi.journal_batch_id, pi.posted_at,
      pi.posted_by_user_id, pi.voided_at, pi.voided_by_user_id,
      pi.created_by_user_id, pi.updated_by_user_id, pi.created_at, pi.updated_at
    FROM purchase_invoices pi
    LEFT JOIN suppliers s ON s.id = pi.supplier_id AND s.company_id = pi.company_id
    WHERE pi.id = ${piId} AND pi.company_id = ${companyId}
  `.execute(db);

  if (header.rows.length === 0) {
    return null;
  }

  const h = header.rows[0];

  // Fetch lines
  const lines = await db
    .selectFrom("purchase_invoice_lines")
    .where("invoice_id", "=", piId)
    .where("company_id", "=", companyId)
    .select([
      "id", "line_no", "line_type", "item_id", "description", "qty",
      "unit_price", "line_total", "tax_rate_id", "tax_amount", "po_line_id",
      "created_at", "updated_at",
    ])
    .orderBy("line_no", "asc")
    .execute();

  const statusLabels: Record<number, string> = {
    [PURCHASE_INVOICE_STATUS.DRAFT]: "DRAFT",
    [PURCHASE_INVOICE_STATUS.POSTED]: "POSTED",
    [PURCHASE_INVOICE_STATUS.VOID]: "VOID",
  };

  return {
    id: h.id,
    company_id: h.company_id,
    supplier_id: h.supplier_id,
    supplier_name: h.supplier_name,
    invoice_no: h.invoice_no,
    invoice_date: new Date(h.invoice_date).toISOString(),
    due_date: h.due_date ? new Date(h.due_date).toISOString() : null,
    reference_number: h.reference_number,
    status: statusLabels[h.status] ?? String(h.status),
    currency_code: h.currency_code,
    exchange_rate: h.exchange_rate,
    subtotal: h.subtotal,
    tax_amount: h.tax_amount,
    grand_total: h.grand_total,
    notes: h.notes,
    journal_batch_id: h.journal_batch_id,
    posted_at: h.posted_at ? new Date(h.posted_at).toISOString() : null,
    posted_by_user_id: h.posted_by_user_id,
    voided_at: h.voided_at ? new Date(h.voided_at).toISOString() : null,
    voided_by_user_id: h.voided_by_user_id,
    created_by_user_id: h.created_by_user_id,
    updated_by_user_id: h.updated_by_user_id,
    created_at: new Date(h.created_at).toISOString(),
    updated_at: new Date(h.updated_at).toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      line_no: l.line_no,
      line_type: l.line_type,
      item_id: l.item_id,
      description: l.description,
      qty: String(l.qty),
      unit_price: String(l.unit_price),
      line_total: String(l.line_total),
      tax_rate_id: l.tax_rate_id,
      tax_amount: String(l.tax_amount),
      po_line_id: l.po_line_id,
      created_at: new Date(l.created_at).toISOString(),
      updated_at: new Date(l.updated_at).toISOString(),
    })),
  };
}

// =============================================================================
// Post PI
// =============================================================================

export async function postPI(
  companyId: number,
  userId: number,
  piId: number
): Promise<PIPostResult> {
  const db = getDb() as KyselySchema;

  // Fetch PI with lock check
  const pi = await db
    .selectFrom("purchase_invoices")
    .where("id", "=", piId)
    .where("company_id", "=", companyId)
    .select([
      "id", "supplier_id", "invoice_no", "invoice_date", "status",
      "currency_code", "exchange_rate", "subtotal", "tax_amount", "grand_total",
    ])
    .executeTakeFirst();

  if (!pi) {
    throw new PINotFoundError(piId);
  }

  // Validate DRAFT -> POSTED transition
  if (pi.status !== PURCHASE_INVOICE_STATUS.DRAFT) {
    throw new PIInvalidStatusTransitionError(pi.status, PURCHASE_INVOICE_STATUS.POSTED);
  }

  // Get company currency to determine if same-currency invoice
  const company = await db
    .selectFrom("companies")
    .where("id", "=", companyId)
    .select(["currency_code"])
    .executeTakeFirst();

  if (!company) {
    throw { code: "COMPANY_NOT_FOUND", message: "Company not found" };
  }

  const companyCurrency = company.currency_code ?? "IDR";
  const invoiceCurrency = pi.currency_code;

  // Resolve exchange rate
  let exchangeRate: string;
  if (companyCurrency === invoiceCurrency) {
    exchangeRate = "1.00000000";
  } else {
    const rateRecord = await getExchangeRate(companyId, invoiceCurrency, new Date(pi.invoice_date));
    if (!rateRecord) {
      throw new PIExchangeRateMissingError(invoiceCurrency, new Date(pi.invoice_date));
    }
    exchangeRate = rateRecord.rate;
  }

  // Get purchasing settings for AP and expense accounts
  const modules = await listCompanyModulesExtended(companyId);
  const purchasingModule = modules.find((m) => m.code === "purchasing");
  const purchasingSettings = purchasingModule?.purchasing_settings;

  if (!purchasingSettings?.purchasing_default_ap_account_id) {
    throw new PIAccountMissingError("AP");
  }
  if (!purchasingSettings?.purchasing_default_expense_account_id) {
    throw new PIAccountMissingError("Expense");
  }

  const apAccountId = purchasingSettings.purchasing_default_ap_account_id;
  const expenseAccountId = purchasingSettings.purchasing_default_expense_account_id;
  const creditLimitEnabled = purchasingSettings.purchasing_credit_limit_enabled ?? false;

  // Validate configured accounts belong to this company
  const configuredAccounts = await db
    .selectFrom("accounts")
    .where("company_id", "=", companyId)
    .where("id", "in", [apAccountId, expenseAccountId])
    .select(["id"])
    .execute();

  const accountIds = new Set(configuredAccounts.map((a) => Number(a.id)));
  if (!accountIds.has(apAccountId)) {
    throw new PIAccountMissingError("AP");
  }
  if (!accountIds.has(expenseAccountId)) {
    throw new PIAccountMissingError("Expense");
  }

  // Fetch lines with tax info
  const lines = await db
    .selectFrom("purchase_invoice_lines")
    .where("invoice_id", "=", piId)
    .where("company_id", "=", companyId)
    .select([
      "id", "description", "line_type", "qty", "unit_price", "line_total",
      "tax_rate_id", "tax_amount",
    ])
    .orderBy("line_no", "asc")
    .execute();

  // Resolve tax accounts and build journal lines
  const journalLines: Array<{
    account_id: number;
    debit: string;
    credit: string;
    description: string;
  }> = [];

  // Convert invoice totals to company currency using multiplication by rate:
  // base_amount = source_amount * exchange_rate
  const subtotalScaled4 = toScaled4(pi.subtotal);
  const taxAmountScaled4 = toScaled4(pi.tax_amount);
  const rateScaled8 = toScaled8(exchangeRate);

  const subtotalInCompanyCurrency = (subtotalScaled4 * rateScaled8) / 100000000n;
  const taxAmountInCompanyCurrency = (taxAmountScaled4 * rateScaled8) / 100000000n;
  const grandTotalInCompanyCurrency = subtotalInCompanyCurrency + taxAmountInCompanyCurrency;

  // Get supplier name for description
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", pi.supplier_id)
    .where("company_id", "=", companyId)
    .select(["name"])
    .executeTakeFirst();

  const supplierName = supplier?.name ?? `Supplier #${pi.supplier_id}`;
  const invoiceDesc = `PI ${pi.invoice_no} from ${supplierName}`;

  // Credit limit check
  const warnings: string[] = [];
  if (creditLimitEnabled) {
    const creditUtil = await computeCreditUtilization(
      db,
      companyId,
      pi.supplier_id,
      toScaled4(pi.grand_total),
      pi.currency_code
    );

    if (creditUtil && creditUtil.newUtilizationPercent > 100) {
      throw new PICreditLimitExceededError(
        creditUtil.newUtilizationPercent,
        fromScaled4(creditUtil.creditLimit)
      );
    }

    if (creditUtil && creditUtil.newUtilizationPercent > 80) {
      warnings.push(
        `Credit utilization will be ${creditUtil.newUtilizationPercent.toFixed(1)}% of limit ${fromScaled4(creditUtil.creditLimit)}`
      );
    }
  }

  // Build expense lines from PI lines
  // Group by expense account (tax lines go to their tax accounts)
  const linesByExpenseAccount = new Map<number, { base: bigint; tax: bigint; descriptions: string[] }>();

  for (const line of lines) {
    const qty = toScaled4(String(line.qty));
    const unitPrice = toScaled4(String(line.unit_price));
    const lineTotal = scale4Mul(qty, unitPrice);
    const lineTotalInCompanyCurrency = (lineTotal * rateScaled8) / 100000000n;

    const taxAmount = toScaled4(String(line.tax_amount));
    const taxAmountInCompanyCurrency = (taxAmount * rateScaled8) / 100000000n;

    // Determine account assignments based on line type
    let lineExpenseAccountId: number | null = null;
    let lineTaxAccountId: number | null = null;

    if (line.line_type === "ITEM" || line.line_type === "SERVICE" || line.line_type === "FREIGHT") {
      // Regular lines: base to expense, tax to tax account (if configured)
      lineExpenseAccountId = expenseAccountId;
      if (line.tax_rate_id) {
        const taxRate = await db
          .selectFrom("tax_rates")
          .where("id", "=", line.tax_rate_id)
          .where("company_id", "=", companyId)
          .select(["account_id"])
          .executeTakeFirst();
        if (taxRate?.account_id) {
          lineTaxAccountId = taxRate.account_id;
        } else {
          throw new PITaxAccountMissingError(line.tax_rate_id);
        }
      }
    } else if (line.line_type === "TAX") {
      // Tax lines: entire line amount goes to tax account
      if (line.tax_rate_id) {
        const taxRate = await db
          .selectFrom("tax_rates")
          .where("id", "=", line.tax_rate_id)
          .where("company_id", "=", companyId)
          .select(["account_id"])
          .executeTakeFirst();
        if (!taxRate?.account_id) {
          throw new PITaxAccountMissingError(line.tax_rate_id);
        }
        lineTaxAccountId = taxRate.account_id;
      } else {
        lineExpenseAccountId = expenseAccountId;
      }
    } else {
      // DISCOUNT or unknown - use expense account
      lineExpenseAccountId = expenseAccountId;
    }

    // Accumulate expense portion
    if (lineExpenseAccountId !== null) {
      const existing = linesByExpenseAccount.get(lineExpenseAccountId) ?? {
        base: 0n,
        tax: 0n,
        descriptions: [],
      };
      existing.base += lineTotalInCompanyCurrency;
      // If no separate tax account, tax is included in expense
      if (lineTaxAccountId === null) {
        existing.tax += taxAmountInCompanyCurrency;
      }
      if (!existing.descriptions.includes(line.description)) {
        existing.descriptions.push(line.description);
      }
      linesByExpenseAccount.set(lineExpenseAccountId, existing);
    }

    // Accumulate tax portion to separate tax account
    if (lineTaxAccountId !== null) {
      const taxExisting = linesByExpenseAccount.get(lineTaxAccountId) ?? {
        base: 0n,
        tax: 0n,
        descriptions: [],
      };
      // For ITEM lines: taxAmount goes to tax account
      // For TAX lines: lineTotal (the full tax) goes to tax account
      if (line.line_type === "TAX") {
        taxExisting.base += lineTotalInCompanyCurrency;
      } else {
        taxExisting.base += taxAmountInCompanyCurrency;
      }
      if (!taxExisting.descriptions.includes(`Tax: ${line.description}`)) {
        taxExisting.descriptions.push(`Tax: ${line.description}`);
      }
      linesByExpenseAccount.set(lineTaxAccountId, taxExisting);
    }
  }

  // Add expense lines (debits)
  for (const [accountId, data] of linesByExpenseAccount) {
    journalLines.push({
      account_id: accountId,
      debit: fromScaled4(data.base + data.tax),
      credit: "0.0000",
      description: data.descriptions.slice(0, 2).join("; "),
    });
  }

  // Add AP line (credit)
  journalLines.push({
    account_id: apAccountId,
    debit: "0.0000",
    credit: fromScaled4(grandTotalInCompanyCurrency),
    description: invoiceDesc,
  });

  // Verify journal is balanced
  let totalDebits = 0n;
  let totalCredits = 0n;
  for (const line of journalLines) {
    totalDebits += toScaled4(line.debit);
    totalCredits += toScaled4(line.credit);
  }

  if (totalDebits !== totalCredits) {
    throw new PIError(
      "JOURNAL_NOT_BALANCED",
      `Journal not balanced: debits=${fromScaled4(totalDebits)}, credits=${fromScaled4(totalCredits)}`
    );
  }

  // Create journal batch and lines in transaction
  const result = await db.transaction().execute(async (trx) => {
    // Create journal batch
    const batchResult = await sql`
      INSERT INTO journal_batches (
        company_id, outlet_id, doc_type, doc_id, posted_at
      ) VALUES (
        ${companyId}, NULL, 'PURCHASE_INVOICE', ${piId}, NOW()
      )
    `.execute(trx);

    const batchId = Number(batchResult.insertId);

    // Insert journal lines
    for (const line of journalLines) {
      await sql`
        INSERT INTO journal_lines (
          journal_batch_id, company_id, outlet_id, account_id,
          line_date, debit, credit, description
        ) VALUES (
          ${batchId}, ${companyId}, NULL,
          ${line.account_id}, ${new Date(pi.invoice_date)}, ${line.debit}, ${line.credit}, ${line.description}
        )
      `.execute(trx);
    }

    // Update PI status to POSTED
    await trx
      .updateTable("purchase_invoices")
      .set({
        status: PURCHASE_INVOICE_STATUS.POSTED,
        exchange_rate: exchangeRate,
        journal_batch_id: batchId,
        posted_at: new Date(),
        posted_by_user_id: userId,
      })
      .where("id", "=", piId)
      .executeTakeFirst();

    return { batchId };
  });

  return {
    id: piId,
    journal_batch_id: result.batchId,
    warnings,
  };
}

// =============================================================================
// Void PI
// =============================================================================

export async function voidPI(
  companyId: number,
  userId: number,
  piId: number
): Promise<{ id: number; reversal_batch_id: number }> {
  const db = getDb() as KyselySchema;

  // Fetch PI
  const pi = await db
    .selectFrom("purchase_invoices")
    .where("id", "=", piId)
    .where("company_id", "=", companyId)
    .select([
      "id", "supplier_id", "invoice_no", "invoice_date", "status",
      "currency_code", "exchange_rate", "grand_total", "journal_batch_id",
    ])
    .executeTakeFirst();

  if (!pi) {
    throw new PINotFoundError(piId);
  }

  // Validate POSTED -> VOID transition
  if (pi.status !== PURCHASE_INVOICE_STATUS.POSTED) {
    throw new PIInvalidStatusTransitionError(pi.status, PURCHASE_INVOICE_STATUS.VOID);
  }

  if (!pi.journal_batch_id) {
    throw new PIError("MISSING_JOURNAL_BATCH", "Posted PI has no journal batch");
  }

  // Get journal batch lines to reverse
  const originalLines = await db
    .selectFrom("journal_lines")
    .where("journal_batch_id", "=", pi.journal_batch_id)
    .where("company_id", "=", companyId)
    .select(["account_id", "debit", "credit", "description"])
    .execute();

  // Create reversal journal batch and lines in transaction
  const result = await db.transaction().execute(async (trx) => {
    // Create reversal journal batch
    const batchResult = await sql`
      INSERT INTO journal_batches (
        company_id, outlet_id, doc_type, doc_id, posted_at
      ) VALUES (
        ${companyId}, NULL, 'PURCHASE_INVOICE_VOID', ${piId}, NOW()
      )
    `.execute(trx);

    const reversalBatchId = Number(batchResult.insertId);

    // Insert reversal lines (swap debit/credit)
    for (const line of originalLines) {
      await sql`
        INSERT INTO journal_lines (
          journal_batch_id, company_id, outlet_id, account_id,
          line_date, debit, credit, description
        ) VALUES (
          ${reversalBatchId}, ${companyId}, NULL,
          ${line.account_id}, ${new Date(pi.invoice_date)},
          ${line.credit}, ${line.debit},
          ${"VOID: " + line.description}
        )
      `.execute(trx);
    }

    // Update PI status to VOID
    await trx
      .updateTable("purchase_invoices")
      .set({
        status: PURCHASE_INVOICE_STATUS.VOID,
        voided_at: new Date(),
        voided_by_user_id: userId,
      })
      .where("id", "=", piId)
      .executeTakeFirst();

    return { reversalBatchId };
  });

  return {
    id: piId,
    reversal_batch_id: result.reversalBatchId,
  };
}
