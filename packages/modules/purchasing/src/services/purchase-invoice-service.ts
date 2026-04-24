// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Invoice Service for purchasing module.
 *
 * Business logic for purchase invoice management.
 * Handles draft creation, listing, retrieval, posting, and voiding.
 */

import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import {
  PURCHASE_INVOICE_STATUS,
  type PurchaseInvoiceLineResponse,
} from "@jurnapod/shared";
import type {
  PICreateInput,
  PIListParams,
  PIListResult,
  PIGetResult,
  PIPostResult,
  PIVoidResult,
  PIPostParams,
  PIVoidParams,
} from "../types/purchase-invoice.js";
import type { GuardrailDecision } from "../types/guardrail.js";
import {
  PIError,
  PINotFoundError,
  PIInvalidStatusTransitionError,
  PIExchangeRateMissingError,
  PIAccountMissingError,
  PICreditLimitExceededError,
  PITaxAccountMissingError,
} from "../types/purchase-invoice.js";
import { ExchangeRateService } from "./exchange-rate-service.js";

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
    return null;
  }

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
// Insert Period Close Override (inline for package use)
// =============================================================================

async function insertPeriodCloseOverride(
  db: KyselySchema,
  params: {
    companyId: number;
    userId: number;
    transactionType: string;
    transactionId: number;
    periodId: number;
    reason: string;
    overriddenAt: Date;
  }
): Promise<void> {
  await db
    .insertInto("period_close_overrides")
    .values({
      company_id: params.companyId,
      user_id: params.userId,
      transaction_type: params.transactionType,
      transaction_id: params.transactionId,
      period_id: params.periodId,
      reason: params.reason,
      overridden_at: params.overriddenAt,
    })
    .execute();
}

// =============================================================================
// Service
// =============================================================================

export class PurchaseInvoiceService {
  constructor(private readonly db: KyselySchema) {}

  // ---------------------------------------------------------------------------
  // Create Draft PI
  // ---------------------------------------------------------------------------

  async createDraftPI(input: PICreateInput): Promise<PIGetResult> {
    // Validate supplier ownership (tenant isolation)
    const supplier = await this.db
      .selectFrom("suppliers")
      .where("id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .select(["id", "name"])
      .executeTakeFirst();

    if (!supplier) {
      throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
    }

    const result = await this.db.transaction().execute(async (trx) => {
      const headerResult = await trx
        .insertInto("purchase_invoices")
        .values({
          company_id: input.companyId,
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
          created_by_user_id: input.userId,
        })
        .executeTakeFirst();

      const piId = Number(headerResult.insertId);
      if (!piId) throw new Error("Failed to create purchase invoice");

      let subtotal = 0n;
      let taxTotal = 0n;

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const qty = toScaled4(line.qty);
        const unitPrice = toScaled4(line.unitPrice);
        const lineTotal = scale4Mul(qty, unitPrice);

        let taxAmount = 0n;
        if (line.taxRateId) {
          const taxRate = await trx
            .selectFrom("tax_rates")
            .where("id", "=", line.taxRateId)
            .where("company_id", "=", input.companyId)
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
            company_id: input.companyId,
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

    const pi = await this.getPIById(input.companyId, result.piId);
    if (!pi) throw new Error("Failed to fetch created purchase invoice");
    return pi;
  }

  // ---------------------------------------------------------------------------
  // List PIs
  // ---------------------------------------------------------------------------

  async listPIs(params: PIListParams): Promise<PIListResult> {
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

    const countResult = await sql<{ count: string }>`
      SELECT COUNT(*) as count
      FROM purchase_invoices pi
      ${whereClause}
    `.execute(this.db);

    const total = Number(countResult.rows[0]?.count ?? 0);

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
    `.execute(this.db);

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

  // ---------------------------------------------------------------------------
  // Get PI by ID
  // ---------------------------------------------------------------------------

  async getPIById(companyId: number, piId: number): Promise<PIGetResult | null> {
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
    `.execute(this.db);

    if (header.rows.length === 0) {
      return null;
    }

    const h = header.rows[0];

    const lines = await this.db
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

  // ---------------------------------------------------------------------------
  // Post PI
  // ---------------------------------------------------------------------------

  async postPI(params: PIPostParams): Promise<PIPostResult> {
    const { companyId, userId, piId, guardrailDecision, validOverrideReason } = params;

    const pi = await this.db
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

    if (pi.status !== PURCHASE_INVOICE_STATUS.DRAFT) {
      throw new PIInvalidStatusTransitionError(pi.status, PURCHASE_INVOICE_STATUS.POSTED);
    }

    const company = await this.db
      .selectFrom("companies")
      .where("id", "=", companyId)
      .select(["currency_code"])
      .executeTakeFirst();

    if (!company) {
      throw { code: "COMPANY_NOT_FOUND", message: "Company not found" };
    }

    const companyCurrency = company.currency_code ?? "IDR";
    const invoiceCurrency = pi.currency_code;

    let exchangeRate: string;
    if (companyCurrency === invoiceCurrency) {
      exchangeRate = "1.00000000";
    } else {
      const exchangeRateService = new ExchangeRateService(this.db);
      const rateRecord = await exchangeRateService.getRate({
        companyId,
        currencyCode: invoiceCurrency,
        date: new Date(pi.invoice_date),
      });
      if (!rateRecord) {
        throw new PIExchangeRateMissingError(invoiceCurrency, new Date(pi.invoice_date));
      }
      exchangeRate = rateRecord.rate;
    }

    // Query purchasing settings directly from company_modules
    const settingsResult = await sql<{
      purchasing_default_ap_account_id: number | null;
      purchasing_default_expense_account_id: number | null;
      purchasing_credit_limit_enabled: number | null;
    }>`
      SELECT
        cm.purchasing_default_ap_account_id,
        cm.purchasing_default_expense_account_id,
        cm.purchasing_credit_limit_enabled
      FROM company_modules cm
      INNER JOIN modules m ON m.id = cm.module_id
      WHERE cm.company_id = ${companyId}
        AND m.code = 'purchasing'
      LIMIT 1
    `.execute(this.db);

    const purchasingSettings = settingsResult.rows[0] ?? null;

    if (!purchasingSettings?.purchasing_default_ap_account_id) {
      throw new PIAccountMissingError("AP");
    }
    if (!purchasingSettings?.purchasing_default_expense_account_id) {
      throw new PIAccountMissingError("Expense");
    }

    const apAccountId = purchasingSettings.purchasing_default_ap_account_id;
    const expenseAccountId = purchasingSettings.purchasing_default_expense_account_id;
    const creditLimitEnabled = Boolean(purchasingSettings.purchasing_credit_limit_enabled);

    const configuredAccounts = await this.db
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

    const lines = await this.db
      .selectFrom("purchase_invoice_lines")
      .where("invoice_id", "=", piId)
      .where("company_id", "=", companyId)
      .select([
        "id", "description", "line_type", "qty", "unit_price", "line_total",
        "tax_rate_id", "tax_amount",
      ])
      .orderBy("line_no", "asc")
      .execute();

    const journalLines: Array<{
      account_id: number;
      debit: string;
      credit: string;
      description: string;
    }> = [];

    const subtotalScaled4 = toScaled4(pi.subtotal);
    const taxAmountScaled4 = toScaled4(pi.tax_amount);
    const rateScaled8 = toScaled8(exchangeRate);

    const subtotalInCompanyCurrency = (subtotalScaled4 * rateScaled8) / 100000000n;
    const taxAmountInCompanyCurrency = (taxAmountScaled4 * rateScaled8) / 100000000n;
    const grandTotalInCompanyCurrency = subtotalInCompanyCurrency + taxAmountInCompanyCurrency;

    const supplier = await this.db
      .selectFrom("suppliers")
      .where("id", "=", pi.supplier_id)
      .where("company_id", "=", companyId)
      .select(["name"])
      .executeTakeFirst();

    const supplierName = supplier?.name ?? `Supplier #${pi.supplier_id}`;
    const invoiceDesc = `PI ${pi.invoice_no} from ${supplierName}`;

    const warnings: string[] = [];
    if (creditLimitEnabled) {
      const creditUtil = await computeCreditUtilization(
        this.db,
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

    const linesByExpenseAccount = new Map<number, { base: bigint; tax: bigint; descriptions: string[] }>();

    for (const line of lines) {
      const qty = toScaled4(String(line.qty));
      const unitPrice = toScaled4(String(line.unit_price));
      const lineTotal = scale4Mul(qty, unitPrice);
      const lineTotalInCompanyCurrency = (lineTotal * rateScaled8) / 100000000n;

      const taxAmount = toScaled4(String(line.tax_amount));
      const taxAmountInCompanyCurrency = (taxAmount * rateScaled8) / 100000000n;

      let lineExpenseAccountId: number | null = null;
      let lineTaxAccountId: number | null = null;

      if (line.line_type === "ITEM" || line.line_type === "SERVICE" || line.line_type === "FREIGHT") {
        lineExpenseAccountId = expenseAccountId;
        if (line.tax_rate_id) {
          const taxRate = await this.db
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
        if (line.tax_rate_id) {
          const taxRate = await this.db
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
        lineExpenseAccountId = expenseAccountId;
      }

      if (lineExpenseAccountId !== null) {
        const existing = linesByExpenseAccount.get(lineExpenseAccountId) ?? {
          base: 0n,
          tax: 0n,
          descriptions: [],
        };
        existing.base += lineTotalInCompanyCurrency;
        if (lineTaxAccountId === null) {
          existing.tax += taxAmountInCompanyCurrency;
        }
        if (!existing.descriptions.includes(line.description)) {
          existing.descriptions.push(line.description);
        }
        linesByExpenseAccount.set(lineExpenseAccountId, existing);
      }

      if (lineTaxAccountId !== null) {
        const taxExisting = linesByExpenseAccount.get(lineTaxAccountId) ?? {
          base: 0n,
          tax: 0n,
          descriptions: [],
        };
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

    for (const [accountId, data] of linesByExpenseAccount) {
      journalLines.push({
        account_id: accountId,
        debit: fromScaled4(data.base + data.tax),
        credit: "0.0000",
        description: data.descriptions.slice(0, 2).join("; "),
      });
    }

    journalLines.push({
      account_id: apAccountId,
      debit: "0.0000",
      credit: fromScaled4(grandTotalInCompanyCurrency),
      description: invoiceDesc,
    });

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

    const result = await this.db.transaction().execute(async (trx) => {
      const batchResult = await sql`
        INSERT INTO journal_batches (
          company_id, outlet_id, doc_type, doc_id, posted_at
        ) VALUES (
          ${companyId}, NULL, 'PURCHASE_INVOICE', ${piId}, NOW()
        )
      `.execute(trx);

      const batchId = Number(batchResult.insertId);

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

      if (guardrailDecision?.overrideRequired && validOverrideReason !== null && guardrailDecision.periodId) {
        await insertPeriodCloseOverride(trx, {
          companyId,
          userId,
          transactionType: "PURCHASE_INVOICE",
          transactionId: piId,
          periodId: guardrailDecision.periodId,
          reason: validOverrideReason,
          overriddenAt: new Date(),
        });
      }

      return { batchId };
    });

    return {
      id: piId,
      journal_batch_id: result.batchId,
      warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // Void PI
  // ---------------------------------------------------------------------------

  async voidPI(params: PIVoidParams): Promise<PIVoidResult> {
    const { companyId, userId, piId, guardrailDecision, validOverrideReason } = params;

    const pi = await this.db
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

    if (pi.status !== PURCHASE_INVOICE_STATUS.POSTED) {
      throw new PIInvalidStatusTransitionError(pi.status, PURCHASE_INVOICE_STATUS.VOID);
    }

    if (!pi.journal_batch_id) {
      throw new PIError("MISSING_JOURNAL_BATCH", "Posted PI has no journal batch");
    }

    const originalLines = await this.db
      .selectFrom("journal_lines")
      .where("journal_batch_id", "=", pi.journal_batch_id)
      .where("company_id", "=", companyId)
      .select(["account_id", "debit", "credit", "description"])
      .execute();

    const result = await this.db.transaction().execute(async (trx) => {
      const batchResult = await sql`
        INSERT INTO journal_batches (
          company_id, outlet_id, doc_type, doc_id, posted_at
        ) VALUES (
          ${companyId}, NULL, 'PURCHASE_INVOICE_VOID', ${piId}, NOW()
        )
      `.execute(trx);

      const reversalBatchId = Number(batchResult.insertId);

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

      await trx
        .updateTable("purchase_invoices")
        .set({
          status: PURCHASE_INVOICE_STATUS.VOID,
          voided_at: new Date(),
          voided_by_user_id: userId,
        })
        .where("id", "=", piId)
        .executeTakeFirst();

      if (guardrailDecision?.overrideRequired && validOverrideReason !== null && guardrailDecision.periodId) {
        await insertPeriodCloseOverride(trx, {
          companyId,
          userId,
          transactionType: "PURCHASE_INVOICE_VOID",
          transactionId: piId,
          periodId: guardrailDecision.periodId,
          reason: validOverrideReason,
          overriddenAt: new Date(),
        });
      }

      return { reversalBatchId };
    });

    return {
      id: piId,
      reversal_batch_id: result.reversalBatchId,
    };
  }
}
