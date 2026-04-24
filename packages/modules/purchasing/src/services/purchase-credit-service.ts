// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Credit Service for purchasing module.
 *
 * Business logic for supplier credit-note management.
 * Handles draft creation, listing, retrieval, apply/post, and void.
 */

import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import {
  AP_PAYMENT_STATUS,
  PURCHASE_CREDIT_STATUS,
  PURCHASE_INVOICE_STATUS,
  toPurchaseCreditStatusLabel,
  type PurchaseCreditApplicationResponse,
  type PurchaseCreditLineResponse,
} from "@jurnapod/shared";
import type {
  PurchaseCreditCreateInput,
  PurchaseCreditListParams,
  PurchaseCreditListResult,
  PurchaseCreditGetResult,
  PurchaseCreditApplyResult,
  PurchaseCreditVoidResult,
  PurchaseCreditApplyParams,
  PurchaseCreditVoidParams,
} from "../types/purchase-credit.js";
import type { GuardrailDecision } from "../types/guardrail.js";
import {
  PurchaseCreditError,
  PurchaseCreditNotFoundError,
  PurchaseCreditInvalidStatusTransitionError,
  PurchaseCreditSupplierInactiveError,
  PurchaseCreditInvoiceNotFoundError,
  PurchaseCreditInvoiceNotPostedError,
  PurchaseCreditInvoiceSupplierMismatchError,
  PurchaseCreditMissingAPAccountError,
  PurchaseCreditMissingExpenseAccountError,
  PurchaseCreditInvalidAPAccountTypeError,
  PurchaseCreditInvalidExpenseAccountTypeError,
  PurchaseCreditNoApplicableInvoiceError,
  PurchaseCreditJournalNotBalancedError,
} from "../types/purchase-credit.js";

// =============================================================================
// BigInt scaled decimal helpers
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
// Open amount calculation
// =============================================================================

async function computePIOpenAmount(
  db: KyselySchema,
  companyId: number,
  invoiceId: number
): Promise<bigint> {
  const baseTotalResult = await sql<{ base_grand_total: string }>`
    SELECT COALESCE(ROUND(grand_total * exchange_rate, 4), 0) AS base_grand_total
    FROM purchase_invoices
    WHERE id = ${invoiceId}
      AND company_id = ${companyId}
    LIMIT 1
  `.execute(db);

  if (baseTotalResult.rows.length === 0) {
    return 0n;
  }

  const baseGrandTotal = toScaled4(String(baseTotalResult.rows[0]?.base_grand_total ?? "0"));

  const paidResult = await sql<{ total: string }>`
    SELECT COALESCE(SUM(apl.allocation_amount), 0) as total
    FROM ap_payment_lines apl
    INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
    WHERE apl.purchase_invoice_id = ${invoiceId}
      AND ap.company_id = ${companyId}
      AND ap.status = ${AP_PAYMENT_STATUS.POSTED}
  `.execute(db);

  const creditedResult = await sql<{ total: string }>`
    SELECT COALESCE(SUM(pca.applied_amount), 0) as total
    FROM purchase_credit_applications pca
    INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
    WHERE pca.purchase_invoice_id = ${invoiceId}
      AND pca.company_id = ${companyId}
      AND pc.status IN (${PURCHASE_CREDIT_STATUS.PARTIAL}, ${PURCHASE_CREDIT_STATUS.APPLIED})
  `.execute(db);

  const paidAmount = toScaled4(String(paidResult.rows[0]?.total ?? "0"));
  const creditedAmount = toScaled4(String(creditedResult.rows[0]?.total ?? "0"));
  const open = baseGrandTotal - paidAmount - creditedAmount;
  return open > 0n ? open : 0n;
}

async function getPurchasingAccountsForUpdate(
  db: KyselySchema,
  companyId: number
): Promise<{ apAccountId: number; expenseAccountId: number }> {
  const settingsResult = await sql<{
    purchasing_default_ap_account_id: number | null;
    purchasing_default_expense_account_id: number | null;
  }>`
    SELECT
      cm.purchasing_default_ap_account_id,
      cm.purchasing_default_expense_account_id
    FROM company_modules cm
    INNER JOIN modules m ON m.id = cm.module_id
    WHERE cm.company_id = ${companyId}
      AND m.code = 'purchasing'
    LIMIT 1
  `.execute(db);

  const apAccountId = settingsResult.rows[0]?.purchasing_default_ap_account_id ?? null;
  const expenseAccountId = settingsResult.rows[0]?.purchasing_default_expense_account_id ?? null;

  if (!apAccountId) {
    throw new PurchaseCreditMissingAPAccountError();
  }
  if (!expenseAccountId) {
    throw new PurchaseCreditMissingExpenseAccountError();
  }

  const accountRows = await sql<{
    id: number;
    type_name: string | null;
    is_active: number;
  }>`
    SELECT id, type_name, is_active
    FROM accounts
    WHERE company_id = ${companyId}
      AND id IN (${apAccountId}, ${expenseAccountId})
    FOR UPDATE
  `.execute(db);

  const byId = new Map(accountRows.rows.map((row) => [Number(row.id), row]));
  const ap = byId.get(apAccountId);
  const expense = byId.get(expenseAccountId);

  if (!ap || ap.is_active !== 1) {
    throw new PurchaseCreditMissingAPAccountError();
  }
  if (ap.type_name !== "LIABILITY" && ap.type_name !== "CREDITOR") {
    throw new PurchaseCreditInvalidAPAccountTypeError(apAccountId, ap.type_name);
  }

  if (!expense || expense.is_active !== 1) {
    throw new PurchaseCreditMissingExpenseAccountError();
  }
  if (
    expense.type_name !== "EXPENSE" &&
    expense.type_name !== "COGS" &&
    expense.type_name !== "INVENTORY" &&
    expense.type_name !== "ASSET"
  ) {
    throw new PurchaseCreditInvalidExpenseAccountTypeError(expenseAccountId, expense.type_name);
  }

  return { apAccountId, expenseAccountId };
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

export class PurchaseCreditService {
  constructor(private readonly db: KyselySchema) {}

  // ---------------------------------------------------------------------------
  // Create Draft Purchase Credit
  // ---------------------------------------------------------------------------

  async createDraftPurchaseCredit(
    input: PurchaseCreditCreateInput
  ): Promise<PurchaseCreditGetResult> {
    const supplier = await this.db
      .selectFrom("suppliers")
      .where("id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .select(["id", "is_active"])
      .executeTakeFirst();

    if (!supplier) {
      throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
    }
    if (supplier.is_active !== 1) {
      throw new PurchaseCreditSupplierInactiveError(input.supplierId);
    }

    const invoiceIds = Array.from(
      new Set(
        input.lines
          .map((line) => line.purchaseInvoiceId ?? null)
          .filter((id): id is number => id !== null)
      )
    );

    if (invoiceIds.length > 0) {
      const invoices = await this.db
        .selectFrom("purchase_invoices")
        .where("company_id", "=", input.companyId)
        .where("id", "in", invoiceIds)
        .select(["id", "supplier_id"])
        .execute();

      const byId = new Map(invoices.map((row) => [Number(row.id), row]));
      for (const invoiceId of invoiceIds) {
        const invoice = byId.get(invoiceId);
        if (!invoice) {
          throw new PurchaseCreditInvoiceNotFoundError(invoiceId);
        }
        if (invoice.supplier_id !== input.supplierId) {
          throw new PurchaseCreditInvoiceSupplierMismatchError(invoiceId, input.supplierId, invoice.supplier_id);
        }
      }
    }

    const result = await this.db.transaction().execute(async (trx) => {
      let totalCredit = 0n;

      const headerResult = await trx
        .insertInto("purchase_credits")
        .values({
          company_id: input.companyId,
          supplier_id: input.supplierId,
          credit_no: input.creditNo,
          credit_date: input.creditDate,
          description: input.description ?? null,
          status: PURCHASE_CREDIT_STATUS.DRAFT,
          total_credit_amount: "0.0000",
          applied_amount: "0.0000",
          created_by_user_id: input.userId,
        })
        .executeTakeFirst();

      const creditId = Number(headerResult.insertId);
      if (!creditId) {
        throw new Error("Failed to create purchase credit");
      }

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const qty = toScaled4(line.qty);
        const unitPrice = toScaled4(line.unitPrice);
        const lineAmount = scale4Mul(qty, unitPrice);
        totalCredit += lineAmount;

        await trx
          .insertInto("purchase_credit_lines")
          .values({
            purchase_credit_id: creditId,
            line_no: i + 1,
            purchase_invoice_id: line.purchaseInvoiceId ?? null,
            purchase_invoice_line_id: line.purchaseInvoiceLineId ?? null,
            item_id: line.itemId ?? null,
            description: line.description ?? null,
            qty: line.qty,
            unit_price: line.unitPrice,
            line_amount: fromScaled4(lineAmount),
            reason: line.reason ?? null,
          })
          .executeTakeFirst();
      }

      await trx
        .updateTable("purchase_credits")
        .set({ total_credit_amount: fromScaled4(totalCredit) })
        .where("id", "=", creditId)
        .executeTakeFirst();

      return { creditId };
    });

    const credit = await this.getPurchaseCreditById(input.companyId, result.creditId);
    if (!credit) {
      throw new Error("Failed to fetch created purchase credit");
    }
    return credit;
  }

  // ---------------------------------------------------------------------------
  // List Purchase Credits
  // ---------------------------------------------------------------------------

  async listPurchaseCredits(
    params: PurchaseCreditListParams
  ): Promise<PurchaseCreditListResult> {
    const conditions = [sql`pc.company_id = ${params.companyId}`];

    if (params.supplierId !== undefined) {
      conditions.push(sql`pc.supplier_id = ${params.supplierId}`);
    }
    if (params.status !== undefined) {
      conditions.push(sql`pc.status = ${params.status}`);
    }
    if (params.dateFrom !== undefined) {
      conditions.push(sql`pc.credit_date >= ${params.dateFrom}`);
    }
    if (params.dateTo !== undefined) {
      conditions.push(sql`pc.credit_date <= ${params.dateTo}`);
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const countResult = await sql<{ count: string }>`
      SELECT COUNT(*) as count
      FROM purchase_credits pc
      ${whereClause}
    `.execute(this.db);

    const total = Number(countResult.rows[0]?.count ?? 0);

    const rows = await sql<{
      id: number;
      company_id: number;
      supplier_id: number;
      supplier_name: string | null;
      credit_no: string;
      credit_date: Date;
      description: string | null;
      status: number;
      total_credit_amount: string;
      applied_amount: string;
      journal_batch_id: number | null;
      posted_at: Date | null;
      voided_at: Date | null;
      created_by_user_id: number | null;
      created_at: Date;
      updated_at: Date;
    }>`
      SELECT
        pc.id, pc.company_id, pc.supplier_id, s.name as supplier_name,
        pc.credit_no, pc.credit_date, pc.description, pc.status,
        pc.total_credit_amount, pc.applied_amount, pc.journal_batch_id,
        pc.posted_at, pc.voided_at, pc.created_by_user_id,
        pc.created_at, pc.updated_at
      FROM purchase_credits pc
      LEFT JOIN suppliers s ON s.id = pc.supplier_id AND s.company_id = pc.company_id
      ${whereClause}
      ORDER BY pc.created_at DESC
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `.execute(this.db);

    return {
      credits: rows.rows.map((row) => {
        const totalCredit = toScaled4(String(row.total_credit_amount));
        const applied = toScaled4(String(row.applied_amount));
        const remaining = totalCredit - applied;
        return {
          id: row.id,
          company_id: row.company_id,
          supplier_id: row.supplier_id,
          supplier_name: row.supplier_name,
          credit_no: row.credit_no,
          credit_date: new Date(row.credit_date).toISOString(),
          description: row.description,
          status: toPurchaseCreditStatusLabel(row.status),
          total_credit_amount: String(row.total_credit_amount),
          applied_amount: String(row.applied_amount),
          remaining_amount: fromScaled4(remaining > 0n ? remaining : 0n),
          journal_batch_id: row.journal_batch_id,
          posted_at: row.posted_at ? new Date(row.posted_at).toISOString() : null,
          voided_at: row.voided_at ? new Date(row.voided_at).toISOString() : null,
          created_by_user_id: row.created_by_user_id,
          created_at: new Date(row.created_at).toISOString(),
          updated_at: new Date(row.updated_at).toISOString(),
        };
      }),
      total,
      limit: params.limit,
      offset: params.offset,
    };
  }

  // ---------------------------------------------------------------------------
  // Get Purchase Credit by ID
  // ---------------------------------------------------------------------------

  async getPurchaseCreditById(
    companyId: number,
    creditId: number
  ): Promise<PurchaseCreditGetResult | null> {
    const header = await sql<{
      id: number;
      company_id: number;
      supplier_id: number;
      supplier_name: string | null;
      credit_no: string;
      credit_date: Date;
      description: string | null;
      status: number;
      total_credit_amount: string;
      applied_amount: string;
      journal_batch_id: number | null;
      posted_at: Date | null;
      posted_by_user_id: number | null;
      voided_at: Date | null;
      voided_by_user_id: number | null;
      created_by_user_id: number | null;
      created_at: Date;
      updated_at: Date;
    }>`
      SELECT
        pc.id, pc.company_id, pc.supplier_id, s.name AS supplier_name,
        pc.credit_no, pc.credit_date, pc.description, pc.status,
        pc.total_credit_amount, pc.applied_amount, pc.journal_batch_id,
        pc.posted_at, pc.posted_by_user_id, pc.voided_at, pc.voided_by_user_id,
        pc.created_by_user_id, pc.created_at, pc.updated_at
      FROM purchase_credits pc
      LEFT JOIN suppliers s ON s.id = pc.supplier_id AND s.company_id = pc.company_id
      WHERE pc.id = ${creditId}
        AND pc.company_id = ${companyId}
    `.execute(this.db);

    if (header.rows.length === 0) {
      return null;
    }

    const h = header.rows[0];

    const lines = await this.db
      .selectFrom("purchase_credit_lines")
      .where("purchase_credit_id", "=", creditId)
      .select([
        "id",
        "line_no",
        "purchase_invoice_id",
        "purchase_invoice_line_id",
        "item_id",
        "description",
        "qty",
        "unit_price",
        "line_amount",
        "reason",
        "created_at",
        "updated_at",
      ])
      .orderBy("line_no", "asc")
      .execute();

    const applications = await this.db
      .selectFrom("purchase_credit_applications")
      .where("purchase_credit_id", "=", creditId)
      .where("company_id", "=", companyId)
      .select([
        "id",
        "purchase_credit_line_id",
        "purchase_invoice_id",
        "applied_amount",
        "applied_at",
        "created_at",
      ])
      .orderBy("id", "asc")
      .execute();

    const totalCredit = toScaled4(String(h.total_credit_amount));
    const applied = toScaled4(String(h.applied_amount));
    const remaining = totalCredit - applied;

    return {
      id: h.id,
      company_id: h.company_id,
      supplier_id: h.supplier_id,
      supplier_name: h.supplier_name,
      credit_no: h.credit_no,
      credit_date: new Date(h.credit_date).toISOString(),
      description: h.description,
      status: toPurchaseCreditStatusLabel(h.status),
      total_credit_amount: String(h.total_credit_amount),
      applied_amount: String(h.applied_amount),
      remaining_amount: fromScaled4(remaining > 0n ? remaining : 0n),
      journal_batch_id: h.journal_batch_id,
      posted_at: h.posted_at ? new Date(h.posted_at).toISOString() : null,
      posted_by_user_id: h.posted_by_user_id,
      voided_at: h.voided_at ? new Date(h.voided_at).toISOString() : null,
      voided_by_user_id: h.voided_by_user_id,
      created_by_user_id: h.created_by_user_id,
      created_at: new Date(h.created_at).toISOString(),
      updated_at: new Date(h.updated_at).toISOString(),
      lines: lines.map((line) => ({
        id: line.id,
        line_no: line.line_no,
        purchase_invoice_id: line.purchase_invoice_id,
        purchase_invoice_line_id: line.purchase_invoice_line_id,
        item_id: line.item_id,
        description: line.description,
        qty: String(line.qty),
        unit_price: String(line.unit_price),
        line_amount: String(line.line_amount),
        reason: line.reason,
        created_at: new Date(line.created_at).toISOString(),
        updated_at: new Date(line.updated_at).toISOString(),
      })),
      applications: applications.map((row) => ({
        id: row.id,
        purchase_credit_line_id: row.purchase_credit_line_id,
        purchase_invoice_id: row.purchase_invoice_id,
        applied_amount: String(row.applied_amount),
        applied_at: new Date(row.applied_at).toISOString(),
        created_at: new Date(row.created_at).toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Apply/Post Purchase Credit
  // ---------------------------------------------------------------------------

  async applyPurchaseCredit(
    params: PurchaseCreditApplyParams
  ): Promise<PurchaseCreditApplyResult> {
    const { companyId, userId, creditId, guardrailDecision, validOverrideReason } = params;

    const result = await this.db.transaction().execute(async (trx) => {
      const creditResult = await sql<{
        id: number;
        supplier_id: number;
        credit_no: string;
        credit_date: Date;
        status: number;
        total_credit_amount: string;
        applied_amount: string;
      }>`
        SELECT id, supplier_id, credit_no, credit_date, status, total_credit_amount, applied_amount
        FROM purchase_credits
        WHERE id = ${creditId}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);

      const credit = creditResult.rows[0];
      if (!credit) {
        throw new PurchaseCreditNotFoundError(creditId);
      }

      if (credit.status !== PURCHASE_CREDIT_STATUS.DRAFT) {
        throw new PurchaseCreditInvalidStatusTransitionError(credit.status, PURCHASE_CREDIT_STATUS.APPLIED);
      }

      const supplierResult = await sql<{ id: number; is_active: number; name: string | null }>`
        SELECT id, is_active, name
        FROM suppliers
        WHERE id = ${credit.supplier_id}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);

      const supplier = supplierResult.rows[0];
      if (!supplier) {
        throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
      }
      if (supplier.is_active !== 1) {
        throw new PurchaseCreditSupplierInactiveError(credit.supplier_id);
      }

      const lines = await trx
        .selectFrom("purchase_credit_lines")
        .where("purchase_credit_id", "=", creditId)
        .select([
          "id",
          "line_no",
          "purchase_invoice_id",
          "line_amount",
        ])
        .orderBy("line_no", "asc")
        .execute();

      const explicitInvoiceIds = Array.from(
        new Set(
          lines
            .map((line) => line.purchase_invoice_id)
            .filter((id): id is number => id !== null)
        )
      );

      if (explicitInvoiceIds.length > 0) {
        await sql`
          SELECT id
          FROM purchase_invoices
          WHERE company_id = ${companyId}
            AND id IN (${sql.join(explicitInvoiceIds.map((id) => sql`${id}`), sql`, `)})
          FOR UPDATE
        `.execute(trx);
      }

      const fifoInvoiceRows = await sql<{ id: number }>`
        SELECT id
        FROM purchase_invoices
        WHERE company_id = ${companyId}
          AND supplier_id = ${credit.supplier_id}
          AND status = ${PURCHASE_INVOICE_STATUS.POSTED}
        ORDER BY invoice_date ASC, id ASC
        FOR UPDATE
      `.execute(trx);

      const fifoInvoiceIds = fifoInvoiceRows.rows.map((row) => Number(row.id));

      let totalAppliedNow = 0n;
      const appliedByInvoiceId = new Map<number, bigint>();

      const ensureInvoiceEligible = async (invoiceId: number): Promise<void> => {
        const invoice = await trx
          .selectFrom("purchase_invoices")
          .where("id", "=", invoiceId)
          .where("company_id", "=", companyId)
          .select(["id", "status", "supplier_id"])
          .executeTakeFirst();

        if (!invoice) {
          throw new PurchaseCreditInvoiceNotFoundError(invoiceId);
        }
        if (invoice.status !== PURCHASE_INVOICE_STATUS.POSTED) {
          throw new PurchaseCreditInvoiceNotPostedError(invoiceId, invoice.status);
        }
        if (invoice.supplier_id !== credit.supplier_id) {
          throw new PurchaseCreditInvoiceSupplierMismatchError(invoiceId, credit.supplier_id, invoice.supplier_id);
        }
      };

      for (const line of lines) {
        let remainingLineAmount = toScaled4(String(line.line_amount));

        if (line.purchase_invoice_id) {
          const invoiceId = line.purchase_invoice_id;
          await ensureInvoiceEligible(invoiceId);

          const open = await computePIOpenAmount(trx as KyselySchema, companyId, invoiceId);
          const alreadyApplied = appliedByInvoiceId.get(invoiceId) ?? 0n;
          const effectiveOpen = open - alreadyApplied;
          const effectiveOpenSafe = effectiveOpen > 0n ? effectiveOpen : 0n;
          const applied = effectiveOpenSafe < remainingLineAmount ? effectiveOpenSafe : remainingLineAmount;

          if (applied > 0n) {
            await trx
              .insertInto("purchase_credit_applications")
              .values({
                company_id: companyId,
                purchase_credit_id: creditId,
                purchase_credit_line_id: line.id,
                purchase_invoice_id: invoiceId,
                applied_amount: fromScaled4(applied),
                applied_at: new Date(),
              })
              .executeTakeFirst();

            totalAppliedNow += applied;
            appliedByInvoiceId.set(invoiceId, alreadyApplied + applied);
            remainingLineAmount -= applied;
          }

          continue;
        }

        for (const invoiceId of fifoInvoiceIds) {
          if (remainingLineAmount <= 0n) {
            break;
          }

          const open = await computePIOpenAmount(trx as KyselySchema, companyId, invoiceId);
          const alreadyApplied = appliedByInvoiceId.get(invoiceId) ?? 0n;
          const effectiveOpen = open - alreadyApplied;
          const effectiveOpenSafe = effectiveOpen > 0n ? effectiveOpen : 0n;
          if (effectiveOpenSafe <= 0n) {
            continue;
          }

          const applied = effectiveOpenSafe < remainingLineAmount ? effectiveOpenSafe : remainingLineAmount;
          await trx
            .insertInto("purchase_credit_applications")
            .values({
              company_id: companyId,
              purchase_credit_id: creditId,
              purchase_credit_line_id: line.id,
              purchase_invoice_id: invoiceId,
              applied_amount: fromScaled4(applied),
              applied_at: new Date(),
            })
            .executeTakeFirst();

          totalAppliedNow += applied;
          appliedByInvoiceId.set(invoiceId, alreadyApplied + applied);
          remainingLineAmount -= applied;
        }
      }

      if (totalAppliedNow <= 0n) {
        throw new PurchaseCreditNoApplicableInvoiceError();
      }

      const { apAccountId, expenseAccountId } = await getPurchasingAccountsForUpdate(trx as KyselySchema, companyId);

      const supplierName = supplier.name ?? `Supplier #${credit.supplier_id}`;
      const desc = `Purchase Credit ${credit.credit_no} - ${supplierName}`;
      const amount = fromScaled4(totalAppliedNow);

      const totalDebits = toScaled4(amount);
      const totalCredits = toScaled4(amount);
      if (totalDebits !== totalCredits) {
        throw new PurchaseCreditJournalNotBalancedError(fromScaled4(totalDebits), fromScaled4(totalCredits));
      }

      const batchResult = await sql`
        INSERT INTO journal_batches (
          company_id, outlet_id, doc_type, doc_id, posted_at
        ) VALUES (
          ${companyId}, NULL, 'PURCHASE_CREDIT', ${creditId}, NOW()
        )
      `.execute(trx);

      const batchId = Number(batchResult.insertId);

      await sql`
        INSERT INTO journal_lines (
          journal_batch_id, company_id, outlet_id, account_id,
          line_date, debit, credit, description
        ) VALUES
          (${batchId}, ${companyId}, NULL, ${apAccountId}, ${credit.credit_date}, ${amount}, '0.0000', ${desc}),
          (${batchId}, ${companyId}, NULL, ${expenseAccountId}, ${credit.credit_date}, '0.0000', ${amount}, ${desc})
      `.execute(trx);

      const previousApplied = toScaled4(String(credit.applied_amount));
      const newApplied = previousApplied + totalAppliedNow;
      const totalCredit = toScaled4(String(credit.total_credit_amount));
      const remaining = totalCredit - newApplied;

      const newStatus = remaining > 0n
        ? PURCHASE_CREDIT_STATUS.PARTIAL
        : PURCHASE_CREDIT_STATUS.APPLIED;

      await trx
        .updateTable("purchase_credits")
        .set({
          status: newStatus,
          applied_amount: fromScaled4(newApplied),
          journal_batch_id: batchId,
          posted_at: new Date(),
          posted_by_user_id: userId,
        })
        .where("id", "=", creditId)
        .executeTakeFirst();

      if (guardrailDecision?.overrideRequired && validOverrideReason !== null && guardrailDecision.periodId) {
        await insertPeriodCloseOverride(trx, {
          companyId,
          userId,
          transactionType: "PURCHASE_CREDIT",
          transactionId: creditId,
          periodId: guardrailDecision.periodId,
          reason: validOverrideReason,
          overriddenAt: new Date(),
        });
      }

      return {
        batchId,
        appliedAmount: fromScaled4(totalAppliedNow),
        remainingAmount: fromScaled4(remaining > 0n ? remaining : 0n),
        status: (newStatus === PURCHASE_CREDIT_STATUS.APPLIED ? "APPLIED" : "PARTIAL") as
          | "PARTIAL"
          | "APPLIED",
      };
    });

    return {
      id: creditId,
      journal_batch_id: result.batchId,
      applied_amount: result.appliedAmount,
      remaining_amount: result.remainingAmount,
      status: result.status,
    };
  }

  // ---------------------------------------------------------------------------
  // Void Purchase Credit
  // ---------------------------------------------------------------------------

  async voidPurchaseCredit(
    params: PurchaseCreditVoidParams
  ): Promise<PurchaseCreditVoidResult> {
    const { companyId, userId, creditId, guardrailDecision, validOverrideReason } = params;

    const result = await this.db.transaction().execute(async (trx) => {
      const creditResult = await sql<{
        id: number;
        status: number;
        supplier_id: number;
        journal_batch_id: number | null;
        credit_date: Date;
      }>`
        SELECT id, status, supplier_id, journal_batch_id, credit_date
        FROM purchase_credits
        WHERE id = ${creditId}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);

      const credit = creditResult.rows[0];
      if (!credit) {
        throw new PurchaseCreditNotFoundError(creditId);
      }

      if (
        credit.status !== PURCHASE_CREDIT_STATUS.PARTIAL &&
        credit.status !== PURCHASE_CREDIT_STATUS.APPLIED
      ) {
        throw new PurchaseCreditInvalidStatusTransitionError(credit.status, PURCHASE_CREDIT_STATUS.VOID);
      }

      if (!credit.journal_batch_id) {
        throw new PurchaseCreditError("MISSING_JOURNAL_BATCH", "Applied credit has no journal batch");
      }

      const supplierResult = await sql<{ id: number; is_active: number }>`
        SELECT id, is_active
        FROM suppliers
        WHERE id = ${credit.supplier_id}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);

      const supplier = supplierResult.rows[0];
      if (!supplier) {
        throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
      }
      if (supplier.is_active !== 1) {
        throw new PurchaseCreditSupplierInactiveError(credit.supplier_id);
      }

      const originalLines = await sql<{
        account_id: number;
        debit: string;
        credit: string;
        description: string | null;
      }>`
        SELECT account_id, debit, credit, description
        FROM journal_lines
        WHERE company_id = ${companyId}
          AND journal_batch_id = ${credit.journal_batch_id}
        ORDER BY id ASC
      `.execute(trx);

      if (originalLines.rows.length === 0) {
        throw new PurchaseCreditError("MISSING_JOURNAL_LINES", "Applied credit has no journal lines");
      }

      const reversalBatchResult = await sql`
        INSERT INTO journal_batches (
          company_id, outlet_id, doc_type, doc_id, posted_at
        ) VALUES (
          ${companyId}, NULL, 'PURCHASE_CREDIT_VOID', ${creditId}, NOW()
        )
      `.execute(trx);

      const reversalBatchId = Number(reversalBatchResult.insertId);

      for (const line of originalLines.rows) {
        await sql`
          INSERT INTO journal_lines (
            journal_batch_id, company_id, outlet_id, account_id,
            line_date, debit, credit, description
          ) VALUES (
            ${reversalBatchId}, ${companyId}, NULL, ${line.account_id},
            ${credit.credit_date}, ${line.credit}, ${line.debit}, ${`VOID purchase credit #${creditId}${line.description ? ` - ${line.description}` : ""}`}
          )
        `.execute(trx);
      }

      await trx
        .updateTable("purchase_credits")
        .set({
          status: PURCHASE_CREDIT_STATUS.VOID,
          applied_amount: "0.0000",
          voided_at: new Date(),
          voided_by_user_id: userId,
        })
        .where("id", "=", creditId)
        .executeTakeFirst();

      if (guardrailDecision?.overrideRequired && validOverrideReason !== null && guardrailDecision.periodId) {
        await insertPeriodCloseOverride(trx, {
          companyId,
          userId,
          transactionType: "PURCHASE_CREDIT_VOID",
          transactionId: creditId,
          periodId: guardrailDecision.periodId,
          reason: validOverrideReason,
          overriddenAt: new Date(),
        });
      }

      return { reversalBatchId };
    });

    return {
      id: creditId,
      reversal_batch_id: result.reversalBatchId,
    };
  }
}
