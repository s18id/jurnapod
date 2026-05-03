// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Payment Service for purchasing module.
 *
 * Business logic for AP payment management.
 * Handles draft creation, listing, retrieval, posting, and voiding.
 */

import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import {
  AP_PAYMENT_STATUS,
  PURCHASE_INVOICE_STATUS,
  toUtcIso,
  type ApPaymentLineResponse,
} from "@jurnapod/shared";
import type {
  APPaymentCreateInput,
  APPaymentListParams,
  APPaymentListResult,
  APPaymentGetResult,
  APPaymentPostResult,
  APPaymentVoidResult,
  APPaymentPostParams,
  APPaymentVoidParams,
} from "../types/ap-payment.js";
import type { GuardrailDecision } from "../types/guardrail.js";
import {
  APPaymentError,
  APPaymentNotFoundError,
  APPaymentInvalidStatusTransitionError,
  APPaymentOverpaymentError,
  APPaymentBankAccountNotFoundError,
  APPaymentSupplierInactiveError,
  APPaymentInvoiceNotFoundError,
  APPaymentInvoiceNotPostedError,
  APPaymentInvoiceSupplierMismatchError,
  APPaymentJournalNotBalancedError,
  APPaymentMissingAPAccountError,
  APPaymentInvalidAPAccountTypeError,
} from "../types/ap-payment.js";
import { fromScaled4, toScaled4 } from "./decimal-scale4.js";
import { computePurchaseInvoiceOpenAmount } from "./purchase-invoice-open-amount.js";

// =============================================================================
// Validate Bank Account Ownership
// =============================================================================

async function validateBankAccountOwnership(
  db: KyselySchema,
  companyId: number,
  bankAccountId: number
): Promise<void> {
  const account = await db
    .selectFrom("accounts")
    .where("id", "=", bankAccountId)
    .where("company_id", "=", companyId)
    .select(["id", "type_name", "is_active"])
    .executeTakeFirst();

  if (
    !account ||
    account.is_active !== 1 ||
    (account.type_name !== "BANK" && account.type_name !== "CASH")
  ) {
    throw new APPaymentBankAccountNotFoundError(bankAccountId);
  }
}

// =============================================================================
// Get Next Payment Number
// =============================================================================

async function generatePaymentNo(
  db: KyselySchema,
  companyId: number,
  paymentDate: Date
): Promise<string> {
  const year = paymentDate.getFullYear().toString();
  const month = (paymentDate.getMonth() + 1).toString().padStart(2, "0");

  await sql`
    SELECT id
    FROM companies
    WHERE id = ${companyId}
    FOR UPDATE
  `.execute(db);

  const lastPayment = await sql<{ payment_no: string }>`
    SELECT payment_no
    FROM ap_payments
    WHERE company_id = ${companyId}
      AND payment_no LIKE ${`APP/${year}/${month}/%`}
    ORDER BY payment_no DESC
    LIMIT 1
  `.execute(db);

  let nextSeq = 1;
  if (lastPayment.rows.length > 0) {
    const lastNo = lastPayment.rows[0].payment_no;
    const match = lastNo.match(/APP\/\d{4}\/\d{2}\/(\d+)$/);
    if (match) {
      nextSeq = parseInt(match[1], 10) + 1;
    }
  }

  return `APP/${year}/${month}/${nextSeq.toString().padStart(4, "0")}`;
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

export class APPaymentService {
  constructor(private readonly db: KyselySchema) {}

  // ---------------------------------------------------------------------------
  // Create Draft AP Payment
  // ---------------------------------------------------------------------------

  async createDraftAPPayment(
    input: APPaymentCreateInput
  ): Promise<APPaymentGetResult> {
    if (input.idempotencyKey) {
      const existingByIdempotency = await this.db
        .selectFrom("ap_payments")
        .where("company_id", "=", input.companyId)
        .where("idempotency_key", "=", input.idempotencyKey)
        .select(["id"])
        .executeTakeFirst();

      if (existingByIdempotency) {
        const existingPayment = await this.getAPPaymentById(input.companyId, Number(existingByIdempotency.id));
        if (existingPayment) {
          return existingPayment;
        }
      }
    }

    await validateBankAccountOwnership(this.db, input.companyId, input.bankAccountId);

    const supplier = await this.db
      .selectFrom("suppliers")
      .where("id", "=", input.supplierId)
      .where("company_id", "=", input.companyId)
      .select(["id", "name", "is_active"])
      .executeTakeFirst();

    if (!supplier) {
      throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
    }
    if (supplier.is_active !== 1) {
      throw new APPaymentSupplierInactiveError(input.supplierId);
    }

    const allocationByInvoiceId = new Map<number, bigint>();
    for (const line of input.lines) {
      const current = allocationByInvoiceId.get(line.purchaseInvoiceId) ?? 0n;
      allocationByInvoiceId.set(line.purchaseInvoiceId, current + toScaled4(line.allocationAmount));
    }

    const isDuplicatePaymentNoError = (error: unknown): boolean => {
      if (typeof error !== "object" || error === null) return false;
      const err = error as { code?: string; sqlMessage?: string };
      return err.code === "ER_DUP_ENTRY" && (err.sqlMessage?.includes("uk_ap_payments_company_payment_no") ?? false);
    };

    const isDuplicatePaymentLineError = (error: unknown): boolean => {
      if (typeof error !== "object" || error === null) return false;
      const err = error as { code?: string; sqlMessage?: string };
      return err.code === "ER_DUP_ENTRY" && (err.sqlMessage?.includes("uk_ap_payment_lines_payment_line") ?? false);
    };

    let result: { paymentId: number; paymentNo: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await this.db.transaction().execute(async (trx) => {
          const invoiceIds = Array.from(allocationByInvoiceId.keys());
          if (invoiceIds.length > 0) {
            await sql`
              SELECT id
              FROM purchase_invoices
              WHERE company_id = ${input.companyId}
                AND id IN (${sql.join(invoiceIds.map((id) => sql`${id}`), sql`, `)})
              FOR UPDATE
            `.execute(trx);
          }

          for (const [invoiceId, allocatedAmount] of allocationByInvoiceId.entries()) {
            const pi = await trx
              .selectFrom("purchase_invoices")
              .where("id", "=", invoiceId)
              .where("company_id", "=", input.companyId)
              .select(["id", "status", "supplier_id"])
              .executeTakeFirst();

            if (!pi) {
              throw new APPaymentInvoiceNotFoundError(invoiceId);
            }
            if (pi.status !== PURCHASE_INVOICE_STATUS.POSTED) {
              throw new APPaymentInvoiceNotPostedError(invoiceId, pi.status);
            }
            if (pi.supplier_id !== input.supplierId) {
              throw new APPaymentInvoiceSupplierMismatchError(invoiceId, input.supplierId, pi.supplier_id);
            }

            const openAmount = await computePurchaseInvoiceOpenAmount(
              trx as KyselySchema,
              input.companyId,
              invoiceId
            );
            if (allocatedAmount > openAmount) {
              throw new APPaymentOverpaymentError(
                fromScaled4(allocatedAmount),
                fromScaled4(openAmount)
              );
            }
          }

          const paymentNo = await generatePaymentNo(trx as KyselySchema, input.companyId, input.paymentDate);

          if (input.idempotencyKey) {
            const upsertResult = await sql`
              INSERT INTO ap_payments (
                company_id,
                idempotency_key,
                payment_no,
                payment_date,
                bank_account_id,
                supplier_id,
                description,
                status,
                created_by_user_id
              ) VALUES (
                ${input.companyId},
                ${input.idempotencyKey},
                ${paymentNo},
                ${input.paymentDate},
                ${input.bankAccountId},
                ${input.supplierId},
                ${input.description ?? null},
                ${AP_PAYMENT_STATUS.DRAFT},
                ${input.userId}
              )
              ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id)
            `.execute(trx);

            const paymentId = Number((upsertResult as { insertId?: unknown }).insertId ?? 0);
            if (!paymentId) {
              throw new Error("Failed to create AP payment");
            }

            const matchedRow = await trx
              .selectFrom("ap_payments")
              .where("id", "=", paymentId)
              .where("company_id", "=", input.companyId)
              .select(["idempotency_key", "payment_no"])
              .executeTakeFirst();

            if (!matchedRow) {
              throw new Error("Failed to fetch idempotent AP payment row");
            }

            if (matchedRow.idempotency_key !== input.idempotencyKey) {
              throw { code: "ER_DUP_ENTRY", sqlMessage: "uk_ap_payments_company_payment_no" };
            }

            const existingLineCountResult = await sql<{ count: number | string }>`
              SELECT COUNT(*) as count
              FROM ap_payment_lines
              WHERE ap_payment_id = ${paymentId}
            `.execute(trx);

            const existingLineCount = Number(existingLineCountResult.rows[0]?.count ?? 0);
            if (existingLineCount === 0) {
              for (let i = 0; i < input.lines.length; i++) {
                const line = input.lines[i];
                try {
                  await trx
                    .insertInto("ap_payment_lines")
                    .values({
                      ap_payment_id: paymentId,
                      line_no: i + 1,
                      purchase_invoice_id: line.purchaseInvoiceId,
                      allocation_amount: line.allocationAmount,
                      description: line.description ?? null,
                    })
                    .executeTakeFirst();
                } catch (lineInsertError) {
                  if (!isDuplicatePaymentLineError(lineInsertError)) {
                    throw lineInsertError;
                  }
                }
              }
            }

            return { paymentId, paymentNo: matchedRow.payment_no };
          }

          const headerResult = await trx
            .insertInto("ap_payments")
            .values({
              company_id: input.companyId,
              idempotency_key: null,
              payment_no: paymentNo,
              payment_date: input.paymentDate,
              bank_account_id: input.bankAccountId,
              supplier_id: input.supplierId,
              description: input.description ?? null,
              status: AP_PAYMENT_STATUS.DRAFT,
              created_by_user_id: input.userId,
            })
            .executeTakeFirst();

          const paymentId = Number(headerResult.insertId);
          if (!paymentId) throw new Error("Failed to create AP payment");

          for (let i = 0; i < input.lines.length; i++) {
            const line = input.lines[i];
            await trx
              .insertInto("ap_payment_lines")
              .values({
                ap_payment_id: paymentId,
                line_no: i + 1,
                purchase_invoice_id: line.purchaseInvoiceId,
                allocation_amount: line.allocationAmount,
                description: line.description ?? null,
              })
              .executeTakeFirst();
          }

          return { paymentId, paymentNo };
        });
        break;
      } catch (error) {
        if (input.idempotencyKey && typeof error === "object" && error !== null) {
          const mysqlErr = error as { errno?: number; code?: string };
          const isDuplicate = mysqlErr.errno === 1062 || mysqlErr.code === "ER_DUP_ENTRY";
          if (isDuplicate) {
            const existingByIdempotency = await this.db
              .selectFrom("ap_payments")
              .where("company_id", "=", input.companyId)
              .where("idempotency_key", "=", input.idempotencyKey)
              .select(["id"])
              .executeTakeFirst();

            if (existingByIdempotency) {
              const existingPayment = await this.getAPPaymentById(input.companyId, Number(existingByIdempotency.id));
              if (existingPayment) {
                return existingPayment;
              }
            }
          }
        }

        if (attempt < 2 && isDuplicatePaymentNoError(error)) {
          continue;
        }
        throw error;
      }
    }
    if (!result) {
      throw new Error("Failed to create AP payment");
    }

    const payment = await this.getAPPaymentById(input.companyId, result.paymentId);
    if (!payment) throw new Error("Failed to fetch created AP payment");
    return payment;
  }

  // ---------------------------------------------------------------------------
  // List AP Payments
  // ---------------------------------------------------------------------------

  async listAPPayments(
    params: APPaymentListParams
  ): Promise<APPaymentListResult> {
    const conditions = [sql`ap.company_id = ${params.companyId}`];

    if (params.supplierId !== undefined) {
      conditions.push(sql`ap.supplier_id = ${params.supplierId}`);
    }
    if (params.status !== undefined) {
      conditions.push(sql`ap.status = ${params.status}`);
    }
    if (params.dateFrom !== undefined) {
      conditions.push(sql`ap.payment_date >= ${params.dateFrom}`);
    }
    if (params.dateTo !== undefined) {
      conditions.push(sql`ap.payment_date <= ${params.dateTo}`);
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const countResult = await sql<{ count: string }>`
      SELECT COUNT(*) as count
      FROM ap_payments ap
      ${whereClause}
    `.execute(this.db);

    const total = Number(countResult.rows[0]?.count ?? 0);

    const rows = await sql<{
      id: number;
      company_id: number;
      payment_no: string;
      payment_date: Date;
      bank_account_id: number;
      supplier_id: number;
      supplier_name: string | null;
      description: string | null;
      status: number;
      journal_batch_id: number | null;
      posted_at: Date | null;
      voided_at: Date | null;
      created_by_user_id: number | null;
      created_at: Date;
      updated_at: Date;
    }>`
      SELECT
        ap.id, ap.company_id, ap.payment_no, ap.payment_date,
        ap.bank_account_id, ap.supplier_id, s.name as supplier_name,
        ap.description, ap.status, ap.journal_batch_id, ap.posted_at,
        ap.voided_at, ap.created_by_user_id,
        ap.created_at, ap.updated_at
      FROM ap_payments ap
      LEFT JOIN suppliers s ON s.id = ap.supplier_id AND s.company_id = ap.company_id
      ${whereClause}
      ORDER BY ap.created_at DESC
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `.execute(this.db);

    const statusLabels: Record<number, string> = {
      [AP_PAYMENT_STATUS.DRAFT]: "DRAFT",
      [AP_PAYMENT_STATUS.POSTED]: "POSTED",
      [AP_PAYMENT_STATUS.VOID]: "VOID",
    };

    return {
      payments: rows.rows.map((r) => ({
        id: r.id,
        company_id: r.company_id,
        payment_no: r.payment_no,
        payment_date: toUtcIso.dateLike(r.payment_date) as string,
        bank_account_id: r.bank_account_id,
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        description: r.description,
        status: statusLabels[r.status] ?? String(r.status),
        journal_batch_id: r.journal_batch_id,
        posted_at: r.posted_at ? toUtcIso.dateLike(r.posted_at) as string : null,
        voided_at: r.voided_at ? toUtcIso.dateLike(r.voided_at) as string : null,
        created_by_user_id: r.created_by_user_id,
        updated_by_user_id: null,
        created_at: toUtcIso.dateLike(r.created_at) as string,
        updated_at: toUtcIso.dateLike(r.updated_at) as string,
      })),
      total,
      limit: params.limit,
      offset: params.offset,
    };
  }

  // ---------------------------------------------------------------------------
  // Get AP Payment by ID
  // ---------------------------------------------------------------------------

  async getAPPaymentById(
    companyId: number,
    paymentId: number
  ): Promise<APPaymentGetResult | null> {
    const header = await sql<{
      id: number;
      company_id: number;
      payment_no: string;
      payment_date: Date;
      bank_account_id: number;
      supplier_id: number;
      supplier_name: string | null;
      description: string | null;
      status: number;
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
        ap.id, ap.company_id, ap.payment_no, ap.payment_date,
        ap.bank_account_id, ap.supplier_id, s.name as supplier_name,
        ap.description, ap.status, ap.journal_batch_id, ap.posted_at,
        ap.posted_by_user_id, ap.voided_at, ap.voided_by_user_id,
        ap.created_by_user_id, ap.created_at, ap.updated_at
      FROM ap_payments ap
      LEFT JOIN suppliers s ON s.id = ap.supplier_id AND s.company_id = ap.company_id
      WHERE ap.id = ${paymentId} AND ap.company_id = ${companyId}
    `.execute(this.db);

    if (header.rows.length === 0) {
      return null;
    }

    const h = header.rows[0];

    const lines = await this.db
      .selectFrom("ap_payment_lines")
      .where("ap_payment_id", "=", paymentId)
      .select([
        "id", "line_no", "purchase_invoice_id", "allocation_amount",
        "description", "created_at", "updated_at",
      ])
      .orderBy("line_no", "asc")
      .execute();

    const statusLabels: Record<number, string> = {
      [AP_PAYMENT_STATUS.DRAFT]: "DRAFT",
      [AP_PAYMENT_STATUS.POSTED]: "POSTED",
      [AP_PAYMENT_STATUS.VOID]: "VOID",
    };

    return {
      id: h.id,
      company_id: h.company_id,
      payment_no: h.payment_no,
      payment_date: toUtcIso.dateLike(h.payment_date) as string,
      bank_account_id: h.bank_account_id,
      supplier_id: h.supplier_id,
      supplier_name: h.supplier_name,
      description: h.description,
      status: statusLabels[h.status] ?? String(h.status),
      journal_batch_id: h.journal_batch_id,
      posted_at: h.posted_at ? toUtcIso.dateLike(h.posted_at) as string : null,
      posted_by_user_id: h.posted_by_user_id,
      voided_at: h.voided_at ? toUtcIso.dateLike(h.voided_at) as string : null,
      voided_by_user_id: h.voided_by_user_id,
      created_by_user_id: h.created_by_user_id,
      updated_by_user_id: null,
      created_at: toUtcIso.dateLike(h.created_at) as string,
      updated_at: toUtcIso.dateLike(h.updated_at) as string,
      lines: lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        purchase_invoice_id: l.purchase_invoice_id,
        allocation_amount: String(l.allocation_amount),
        description: l.description,
        created_at: toUtcIso.dateLike(l.created_at) as string,
        updated_at: toUtcIso.dateLike(l.updated_at) as string,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Post AP Payment
  // ---------------------------------------------------------------------------

  async postAPPayment(
    params: APPaymentPostParams
  ): Promise<APPaymentPostResult> {
    const { companyId, userId, paymentId, guardrailDecision, validOverrideReason } = params;

    const result = await this.db.transaction().execute(async (trx) => {
      const paymentResult = await sql<{
        id: number;
        payment_no: string;
        bank_account_id: number;
        supplier_id: number;
        status: number;
        payment_date: Date;
        journal_batch_id: number | null;
      }>`
        SELECT id, payment_no, bank_account_id, supplier_id, status, payment_date, journal_batch_id
        FROM ap_payments
        WHERE id = ${paymentId}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);

      const payment = paymentResult.rows[0];
      if (!payment) {
        throw new APPaymentNotFoundError(paymentId);
      }

      // Idempotent: if already POSTED, return existing payment + journal
      if (payment.status === AP_PAYMENT_STATUS.POSTED) {
        if (!payment.journal_batch_id) {
          throw new APPaymentError("MISSING_JOURNAL_BATCH", "Posted payment has no journal batch");
        }
        return { batchId: payment.journal_batch_id };
      }
      if (payment.status !== AP_PAYMENT_STATUS.DRAFT) {
        throw new APPaymentInvalidStatusTransitionError(payment.status, AP_PAYMENT_STATUS.POSTED);
      }

      const bankAccount = await sql<{ id: number; type_name: string | null; is_active: number }>`
        SELECT id, type_name, is_active
        FROM accounts
        WHERE id = ${payment.bank_account_id}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);

      const bank = bankAccount.rows[0];
      if (
        !bank ||
        bank.is_active !== 1 ||
        (bank.type_name !== "BANK" && bank.type_name !== "CASH")
      ) {
        throw new APPaymentBankAccountNotFoundError(payment.bank_account_id);
      }

      const lines = await trx
        .selectFrom("ap_payment_lines")
        .where("ap_payment_id", "=", paymentId)
        .select([
          "id", "purchase_invoice_id", "allocation_amount", "description",
        ])
        .orderBy("line_no", "asc")
        .execute();

      const invoiceIds = Array.from(new Set(lines.map((line) => line.purchase_invoice_id)));
      if (invoiceIds.length > 0) {
        await sql`
          SELECT id
          FROM purchase_invoices
          WHERE company_id = ${companyId}
            AND id IN (${sql.join(invoiceIds.map((id) => sql`${id}`), sql`, `)})
          FOR UPDATE
        `.execute(trx);
      }

      const allocationByInvoiceId = new Map<number, bigint>();
      for (const line of lines) {
        const pi = await trx
          .selectFrom("purchase_invoices")
          .where("id", "=", line.purchase_invoice_id)
          .where("company_id", "=", companyId)
          .select(["id", "status", "supplier_id"])
          .executeTakeFirst();

        if (!pi) {
          throw new APPaymentInvoiceNotFoundError(line.purchase_invoice_id);
        }

        if (pi.status !== PURCHASE_INVOICE_STATUS.POSTED) {
          throw new APPaymentInvoiceNotPostedError(line.purchase_invoice_id, pi.status);
        }
        if (pi.supplier_id !== payment.supplier_id) {
          throw new APPaymentInvoiceSupplierMismatchError(line.purchase_invoice_id, payment.supplier_id, pi.supplier_id);
        }

        const paymentAmount = toScaled4(String(line.allocation_amount));
        const current = allocationByInvoiceId.get(line.purchase_invoice_id) ?? 0n;
        allocationByInvoiceId.set(line.purchase_invoice_id, current + paymentAmount);
      }

      for (const [invoiceId, allocatedAmount] of allocationByInvoiceId.entries()) {
        const openAmount = await computePurchaseInvoiceOpenAmount(
          trx as KyselySchema,
          companyId,
          invoiceId
        );
        if (allocatedAmount > openAmount) {
          throw new APPaymentOverpaymentError(
            fromScaled4(allocatedAmount),
            fromScaled4(openAmount)
          );
        }
      }

      const modulesResult = await sql<{ purchasing_default_ap_account_id: number | null }>`
        SELECT cm.purchasing_default_ap_account_id
        FROM company_modules cm
        INNER JOIN modules m ON m.id = cm.module_id
        WHERE cm.company_id = ${companyId}
          AND m.code = 'purchasing'
        LIMIT 1
      `.execute(trx);

      const apAccountId = modulesResult.rows[0]?.purchasing_default_ap_account_id ?? null;
      if (!apAccountId) {
        throw new APPaymentMissingAPAccountError();
      }

      const apAccountResult = await sql<{ id: number; type_name: string | null }>`
        SELECT id, type_name
        FROM accounts
        WHERE id = ${apAccountId}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);

      const apAccount = apAccountResult.rows[0];
      if (!apAccount) {
        throw new APPaymentMissingAPAccountError();
      }
      if (apAccount.type_name !== "LIABILITY" && apAccount.type_name !== "CREDITOR") {
        throw new APPaymentInvalidAPAccountTypeError(apAccountId, apAccount.type_name);
      }

      const supplier = await trx
        .selectFrom("suppliers")
        .where("id", "=", payment.supplier_id)
        .where("company_id", "=", companyId)
        .select(["name", "is_active"])
        .executeTakeFirst();
      if (!supplier) {
        throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
      }
      if (supplier.is_active !== 1) {
        throw new APPaymentSupplierInactiveError(payment.supplier_id);
      }

      const supplierName = supplier?.name ?? `Supplier #${payment.supplier_id}`;
      const paymentDesc = `AP Payment ${payment.payment_no} to ${supplierName}`;

      const journalLines: Array<{
        account_id: number;
        debit: string;
        credit: string;
        description: string;
      }> = [];

      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const amount = fromScaled4(toScaled4(String(line.allocation_amount)));
        const lineDesc = `${paymentDesc} (line ${idx + 1}, PI ${line.purchase_invoice_id})`;

        journalLines.push({
          account_id: apAccountId,
          debit: amount,
          credit: "0.0000",
          description: lineDesc,
        });

        journalLines.push({
          account_id: payment.bank_account_id,
          debit: "0.0000",
          credit: amount,
          description: lineDesc,
        });
      }

      let totalDebits = 0n;
      let totalCredits = 0n;
      for (const line of journalLines) {
        totalDebits += toScaled4(line.debit);
        totalCredits += toScaled4(line.credit);
      }
      if (totalDebits !== totalCredits) {
        throw new APPaymentJournalNotBalancedError(
          fromScaled4(totalDebits),
          fromScaled4(totalCredits)
        );
      }

      const batchResult = await sql`
        INSERT INTO journal_batches (
          company_id, outlet_id, doc_type, doc_id, posted_at
        ) VALUES (
          ${companyId}, NULL, 'AP_PAYMENT', ${paymentId}, NOW()
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
            ${line.account_id}, ${payment.payment_date}, ${line.debit}, ${line.credit}, ${line.description}
          )
        `.execute(trx);
      }

      await trx
        .updateTable("ap_payments")
        .set({
          status: AP_PAYMENT_STATUS.POSTED,
          journal_batch_id: batchId,
          posted_at: new Date(),
          posted_by_user_id: userId,
        })
        .where("id", "=", paymentId)
        .executeTakeFirst();

      if (guardrailDecision?.overrideRequired && validOverrideReason !== null && guardrailDecision.periodId) {
        await insertPeriodCloseOverride(trx, {
          companyId,
          userId,
          transactionType: "AP_PAYMENT",
          transactionId: paymentId,
          periodId: guardrailDecision.periodId,
          reason: validOverrideReason,
          overriddenAt: new Date(),
        });
      }

      return { batchId };
    });

    return {
      id: paymentId,
      journal_batch_id: result.batchId,
    };
  }

  // ---------------------------------------------------------------------------
  // Void AP Payment
  // ---------------------------------------------------------------------------

  async voidAPPayment(
    params: APPaymentVoidParams
  ): Promise<APPaymentVoidResult> {
    const { companyId, userId, paymentId, guardrailDecision, validOverrideReason } = params;

    const result = await this.db.transaction().execute(async (trx) => {
      const paymentResult = await sql<{
        id: number;
        bank_account_id: number;
        supplier_id: number;
        status: number;
        journal_batch_id: number | null;
        payment_date: Date;
      }>`
        SELECT id, bank_account_id, supplier_id, status, journal_batch_id, payment_date
        FROM ap_payments
        WHERE id = ${paymentId}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);

      const payment = paymentResult.rows[0];
      if (!payment) {
        throw new APPaymentNotFoundError(paymentId);
      }

      if (payment.status !== AP_PAYMENT_STATUS.POSTED) {
        throw new APPaymentInvalidStatusTransitionError(payment.status, AP_PAYMENT_STATUS.VOID);
      }

      if (!payment.journal_batch_id) {
        throw new APPaymentError("MISSING_JOURNAL_BATCH", "Posted payment has no journal batch");
      }

      const bankAccountResult = await sql<{ id: number; type_name: string | null; is_active: number }>`
        SELECT id, type_name, is_active
        FROM accounts
        WHERE id = ${payment.bank_account_id}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);
      const bankAccount = bankAccountResult.rows[0];
      if (
        !bankAccount ||
        bankAccount.is_active !== 1 ||
        (bankAccount.type_name !== "BANK" && bankAccount.type_name !== "CASH")
      ) {
        throw new APPaymentBankAccountNotFoundError(payment.bank_account_id);
      }

      const supplierResult = await sql<{ id: number; is_active: number }>`
        SELECT id, is_active
        FROM suppliers
        WHERE id = ${payment.supplier_id}
          AND company_id = ${companyId}
        FOR UPDATE
      `.execute(trx);
      const supplier = supplierResult.rows[0];
      if (!supplier) {
        throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
      }
      if (supplier.is_active !== 1) {
        throw new APPaymentSupplierInactiveError(payment.supplier_id);
      }

      const lines = await trx
        .selectFrom("ap_payment_lines")
        .where("ap_payment_id", "=", paymentId)
        .select(["purchase_invoice_id"])
        .execute();

      const invoiceIds = Array.from(new Set(lines.map((l) => l.purchase_invoice_id)));
      if (invoiceIds.length > 0) {
        await sql`
          SELECT id
          FROM purchase_invoices
          WHERE company_id = ${companyId}
            AND id IN (${sql.join(invoiceIds.map((id) => sql`${id}`), sql`, `)})
          FOR UPDATE
        `.execute(trx);
      }

      const originalLines = await trx
        .selectFrom("journal_lines")
        .where("journal_batch_id", "=", payment.journal_batch_id)
        .where("company_id", "=", companyId)
        .select(["account_id", "debit", "credit", "description"])
        .execute();

      const batchResult = await sql`
        INSERT INTO journal_batches (
          company_id, outlet_id, doc_type, doc_id, posted_at
        ) VALUES (
          ${companyId}, NULL, 'AP_PAYMENT_VOID', ${paymentId}, NOW()
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
            ${line.account_id}, ${payment.payment_date},
            ${line.credit}, ${line.debit},
            ${"VOID: " + line.description}
          )
        `.execute(trx);
      }

      await trx
        .updateTable("ap_payments")
        .set({
          status: AP_PAYMENT_STATUS.VOID,
          voided_at: new Date(),
          voided_by_user_id: userId,
        })
        .where("id", "=", paymentId)
        .where("status", "=", AP_PAYMENT_STATUS.POSTED)
        .executeTakeFirst();

      if (guardrailDecision?.overrideRequired && validOverrideReason !== null && guardrailDecision.periodId) {
        await insertPeriodCloseOverride(trx, {
          companyId,
          userId,
          transactionType: "AP_PAYMENT_VOID",
          transactionId: paymentId,
          periodId: guardrailDecision.periodId,
          reason: validOverrideReason,
          overriddenAt: new Date(),
        });
      }

      return { reversalBatchId };
    });

    return {
      id: paymentId,
      reversal_batch_id: result.reversalBatchId,
    };
  }
}
