// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Payment Domain Service
 *
 * Library-first business logic for AP payment management.
 * Handles draft creation, listing, retrieval, posting, and voiding.
 */

import { getDb } from "../db.js";
import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import {
  AP_PAYMENT_STATUS,
  PURCHASE_CREDIT_STATUS,
  PURCHASE_INVOICE_STATUS,
  type ApPaymentLineResponse,
} from "@jurnapod/shared";
// FIX(47.5-WP-C): Import guardrail service for period-close enforcement
import {
  checkPeriodCloseGuardrail,
  insertPeriodCloseOverride,
  PeriodOverrideReasonInvalidError,
  PeriodOverrideForbiddenError,
  evaluateOverrideAccess,
  type GuardrailDecision,
} from "../accounting/ap-period-close-guardrail.js";
import type { AuthContext } from "@/lib/auth-guard.js";

// =============================================================================
// Error Types
// =============================================================================

export class APPaymentError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "APPaymentError";
  }
}

export class APPaymentNotFoundError extends APPaymentError {
  constructor(paymentId: number) {
    super("AP_PAYMENT_NOT_FOUND", `AP payment ${paymentId} not found`);
  }
}

export class APPaymentInvalidStatusTransitionError extends APPaymentError {
  constructor(fromStatus: number, toStatus: number) {
    super(
      "INVALID_STATUS_TRANSITION",
      `Cannot transition AP payment from status ${fromStatus} to ${toStatus}`
    );
  }
}

export class APPaymentOverpaymentError extends APPaymentError {
  constructor(
    public readonly totalPaymentAmount: string,
    public readonly totalPIOpenAmount: string
  ) {
    super(
      "OVERPAYMENT",
      `Payment amount ${totalPaymentAmount} exceeds open PI amount ${totalPIOpenAmount}`
    );
  }
}

export class APPaymentBankAccountNotFoundError extends APPaymentError {
  constructor(bankAccountId: number) {
    super(
      "BANK_ACCOUNT_NOT_FOUND",
      `Bank account ${bankAccountId} not found or not accessible`
    );
  }
}

export class APPaymentSupplierInactiveError extends APPaymentError {
  constructor(supplierId: number) {
    super(
      "SUPPLIER_INACTIVE",
      `Supplier ${supplierId} is inactive`
    );
  }
}

export class APPaymentInvoiceNotFoundError extends APPaymentError {
  constructor(invoiceId: number) {
    super(
      "INVOICE_NOT_FOUND",
      `Purchase invoice ${invoiceId} not found or not accessible`
    );
  }
}

export class APPaymentInvoiceNotPostedError extends APPaymentError {
  constructor(invoiceId: number, status: number) {
    super(
      "INVOICE_NOT_POSTED",
      `Purchase invoice ${invoiceId} must be POSTED but has status ${status}`
    );
  }
}

export class APPaymentInvoiceSupplierMismatchError extends APPaymentError {
  constructor(invoiceId: number, expectedSupplierId: number, actualSupplierId: number) {
    super(
      "INVOICE_SUPPLIER_MISMATCH",
      `Purchase invoice ${invoiceId} belongs to supplier ${actualSupplierId}, expected ${expectedSupplierId}`
    );
  }
}

export class APPaymentJournalNotBalancedError extends APPaymentError {
  constructor(debits: string, credits: string) {
    super(
      "JOURNAL_NOT_BALANCED",
      `Journal not balanced: debits=${debits}, credits=${credits}`
    );
  }
}

export class APPaymentMissingAPAccountError extends APPaymentError {
  constructor() {
    super(
      "AP_ACCOUNT_NOT_CONFIGURED",
      "AP account not configured in purchasing settings"
    );
  }
}

export class APPaymentInvalidAPAccountTypeError extends APPaymentError {
  constructor(accountId: number, typeName: string | null) {
    super(
      "AP_ACCOUNT_INVALID_TYPE",
      `AP account ${accountId} must be LIABILITY/CREDITOR but is ${typeName ?? "UNKNOWN"}`
    );
  }
}

// =============================================================================
// Types
// =============================================================================

// FIX(47.5-WP-C): Added optional override_reason for closed-period override path
export interface APPaymentCreateInput {
  paymentDate: Date;
  bankAccountId: number;
  supplierId: number;
  description?: string | null;
  lines: Array<{
    purchaseInvoiceId: number;
    allocationAmount: string;
    description?: string | null;
  }>;
  overrideReason?: string | null;
}

export interface APPaymentListParams {
  companyId: number;
  supplierId?: number;
  status?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
  offset: number;
}

export interface APPaymentListResult {
  payments: Array<{
    id: number;
    company_id: number;
    payment_no: string;
    payment_date: string;
    bank_account_id: number;
    supplier_id: number;
    supplier_name: string | null;
    description: string | null;
    status: string;
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

export interface APPaymentGetResult {
  id: number;
  company_id: number;
  payment_no: string;
  payment_date: string;
  bank_account_id: number;
  supplier_id: number;
  supplier_name: string | null;
  description: string | null;
  status: string;
  journal_batch_id: number | null;
  posted_at: string | null;
  posted_by_user_id: number | null;
  voided_at: string | null;
  voided_by_user_id: number | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: ApPaymentLineResponse[];
}

export interface APPaymentPostResult {
  id: number;
  journal_batch_id: number;
}

export interface APPaymentVoidResult {
  id: number;
  reversal_batch_id: number;
}

// =============================================================================
// BigInt Scaled Decimal Helpers (DECIMAL(19,4) = 4 decimal places)
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

// =============================================================================
// Compute PI Open Amount (base-grand_total - sum of posted payment allocations)
// For foreign-currency invoices: grand_total is in foreign currency,
// allocations are in company/base currency, so conversion is required.
// Formula: base_grand_total = grand_total * exchange_rate
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

  // Sum of posted payment allocations for this invoice (already in base currency)
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
  return baseGrandTotal - paidAmount - creditedAmount;
}

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

  // Serialize numbering per company to avoid duplicate payment_no races.
  await sql`
    SELECT id
    FROM companies
    WHERE id = ${companyId}
    FOR UPDATE
  `.execute(db);

  // Try to find existing payment with highest number for this month
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
// Create Draft AP Payment
// =============================================================================

export async function createDraftAPPayment(
  companyId: number,
  userId: number,
  input: APPaymentCreateInput,
  auth: AuthContext
): Promise<APPaymentGetResult> {
  const db = getDb() as KyselySchema;

  // FIX(47.5-WP-C): Period-close guardrail check for payment creation
  const paymentDateStr = input.paymentDate.toISOString().split("T")[0];
  const decision = await checkPeriodCloseGuardrail(companyId, paymentDateStr);

  // FIX(47.5-WP-C): Evaluate override access using unified helper
  let isOverrideEligible = false;
  let trackedOverrideReason: string | null = null;
  if (!decision.allowed && decision.overrideRequired) {
    const access = await evaluateOverrideAccess(auth, input.overrideReason, decision);
    if (!access.allowed) {
      if (access.error === "reason") {
        throw new PeriodOverrideReasonInvalidError(access.message);
      }
      throw new PeriodOverrideForbiddenError(access.message);
    }
    if (decision.periodId === null || decision.periodId <= 0) {
      const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
      err.code = "PERIOD_CLOSED";
      err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
      throw err;
    }
    isOverrideEligible = true;
    trackedOverrideReason = access.overrideReason;
  } else if (!decision.allowed) {
    const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
    err.code = "PERIOD_CLOSED";
    err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
    throw err;
  }

  // Validate bank account ownership (tenant isolation)
  await validateBankAccountOwnership(db, companyId, input.bankAccountId);

  // Validate supplier ownership (tenant isolation)
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", input.supplierId)
    .where("company_id", "=", companyId)
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

  let result: { paymentId: number; paymentNo: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await db.transaction().execute(async (trx) => {
        const invoiceIds = Array.from(allocationByInvoiceId.keys());
        if (invoiceIds.length > 0) {
          await sql`
            SELECT id
            FROM purchase_invoices
            WHERE company_id = ${companyId}
              AND id IN (${sql.join(invoiceIds.map((id) => sql`${id}`), sql`, `)})
            FOR UPDATE
          `.execute(trx);
        }

        for (const [invoiceId, allocatedAmount] of allocationByInvoiceId.entries()) {
          const pi = await trx
            .selectFrom("purchase_invoices")
            .where("id", "=", invoiceId)
            .where("company_id", "=", companyId)
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

          const openAmount = await computePIOpenAmount(trx as KyselySchema, companyId, invoiceId);
          if (allocatedAmount > openAmount) {
            throw new APPaymentOverpaymentError(
              fromScaled4(allocatedAmount),
              fromScaled4(openAmount)
            );
          }
        }

        // Generate payment number
        const paymentNo = await generatePaymentNo(trx as KyselySchema, companyId, input.paymentDate);

        // Insert AP payment header
        const headerResult = await trx
          .insertInto("ap_payments")
          .values({
            company_id: companyId,
            payment_no: paymentNo,
            payment_date: input.paymentDate,
            bank_account_id: input.bankAccountId,
            supplier_id: input.supplierId,
            description: input.description ?? null,
            status: AP_PAYMENT_STATUS.DRAFT,
            created_by_user_id: userId,
          })
          .executeTakeFirst();

        const paymentId = Number(headerResult.insertId);
        if (!paymentId) throw new Error("Failed to create AP payment");

        // Insert payment lines
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

        // FIX(47.5-WP-C): Insert period_close_overrides audit row when override is eligible
        // isOverrideEligible is only true when: valid reason + MANAGE + periodId > 0
        if (isOverrideEligible && trackedOverrideReason !== null) {
          await insertPeriodCloseOverride(trx, {
            companyId,
            userId,
            transactionType: "AP_PAYMENT",
            transactionId: paymentId,
            periodId: decision.periodId!, // Safe: isOverrideEligible ensures periodId > 0
            reason: trackedOverrideReason,
            overriddenAt: new Date(),
          });
        }

        return { paymentId, paymentNo };
      });
      break;
    } catch (error) {
      if (attempt < 2 && isDuplicatePaymentNoError(error)) {
        continue;
      }
      throw error;
    }
  }
  if (!result) {
    throw new Error("Failed to create AP payment");
  }

  const payment = await getAPPaymentById(companyId, result.paymentId);
  if (!payment) throw new Error("Failed to fetch created AP payment");
  return payment;
}

// =============================================================================
// List AP Payments
// =============================================================================

export async function listAPPayments(
  params: APPaymentListParams
): Promise<APPaymentListResult> {
  const db = getDb() as KyselySchema;

  // Build where conditions with tenant isolation
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

  // Count total
  const countResult = await sql<{ count: string }>`
    SELECT COUNT(*) as count
    FROM ap_payments ap
    ${whereClause}
  `.execute(db);

  const total = Number(countResult.rows[0]?.count ?? 0);

  // Fetch payments with supplier name
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
  `.execute(db);

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
      payment_date: new Date(r.payment_date).toISOString(),
      bank_account_id: r.bank_account_id,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      description: r.description,
      status: statusLabels[r.status] ?? String(r.status),
      journal_batch_id: r.journal_batch_id,
      posted_at: r.posted_at ? new Date(r.posted_at).toISOString() : null,
      voided_at: r.voided_at ? new Date(r.voided_at).toISOString() : null,
      created_by_user_id: r.created_by_user_id,
      updated_by_user_id: null,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    })),
    total,
    limit: params.limit,
    offset: params.offset,
  };
}

// =============================================================================
// Get AP Payment by ID
// =============================================================================

export async function getAPPaymentById(
  companyId: number,
  paymentId: number
): Promise<APPaymentGetResult | null> {
  const db = getDb() as KyselySchema;

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
  `.execute(db);

  if (header.rows.length === 0) {
    return null;
  }

  const h = header.rows[0];

  // Fetch lines
  const lines = await db
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
    payment_date: new Date(h.payment_date).toISOString(),
    bank_account_id: h.bank_account_id,
    supplier_id: h.supplier_id,
    supplier_name: h.supplier_name,
    description: h.description,
    status: statusLabels[h.status] ?? String(h.status),
    journal_batch_id: h.journal_batch_id,
    posted_at: h.posted_at ? new Date(h.posted_at).toISOString() : null,
    posted_by_user_id: h.posted_by_user_id,
    voided_at: h.voided_at ? new Date(h.voided_at).toISOString() : null,
    voided_by_user_id: h.voided_by_user_id,
    created_by_user_id: h.created_by_user_id,
    updated_by_user_id: null,
    created_at: new Date(h.created_at).toISOString(),
    updated_at: new Date(h.updated_at).toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      line_no: l.line_no,
      purchase_invoice_id: l.purchase_invoice_id,
      allocation_amount: String(l.allocation_amount),
      description: l.description,
      created_at: new Date(l.created_at).toISOString(),
      updated_at: new Date(l.updated_at).toISOString(),
    })),
  };
}

// =============================================================================
// Post AP Payment
// =============================================================================

export async function postAPPayment(
  companyId: number,
  userId: number,
  paymentId: number,
  overrideReason: string | null | undefined,
  auth: AuthContext
): Promise<APPaymentPostResult> {
  const db = getDb() as KyselySchema;

  // FIX(47.5-WP-C): Period-close guardrail check for payment posting
  // Get payment date for guardrail evaluation
  const paymentDateResult = await sql<{ id: number; payment_date: Date }>`
    SELECT id, payment_date
    FROM ap_payments
    WHERE id = ${paymentId}
      AND company_id = ${companyId}
  `.execute(db);

  const paymentForDate = paymentDateResult.rows[0];

  // FIX(47.5-WP-C): Evaluate override access using unified helper
  let isOverrideEligible = false;
  let validOverrideReason: string | null = null;
  let cachedDecision: GuardrailDecision | null = null;

  if (paymentForDate) {
    const paymentDateStr = new Date(paymentForDate.payment_date).toISOString().split("T")[0];
    const decision = await checkPeriodCloseGuardrail(companyId, paymentDateStr);
    cachedDecision = decision;

    if (!decision.allowed && decision.overrideRequired) {
      const access = await evaluateOverrideAccess(auth, overrideReason, decision);
      if (!access.allowed) {
        if (access.error === "reason") {
          throw new PeriodOverrideReasonInvalidError(access.message);
        }
        throw new PeriodOverrideForbiddenError(access.message);
      }
      if (decision.periodId === null || decision.periodId <= 0) {
        const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
        err.code = "PERIOD_CLOSED";
        err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
        throw err;
      }
      isOverrideEligible = true;
      validOverrideReason = access.overrideReason;
    } else if (!decision.allowed) {
      const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
      err.code = "PERIOD_CLOSED";
      err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
      throw err;
    }
  }

  const result = await db.transaction().execute(async (trx) => {
    const paymentResult = await sql<{
      id: number;
      payment_no: string;
      bank_account_id: number;
      supplier_id: number;
      status: number;
      payment_date: Date;
    }>`
      SELECT id, payment_no, bank_account_id, supplier_id, status, payment_date
      FROM ap_payments
      WHERE id = ${paymentId}
        AND company_id = ${companyId}
      FOR UPDATE
    `.execute(trx);

    const payment = paymentResult.rows[0];
    if (!payment) {
      throw new APPaymentNotFoundError(paymentId);
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
      const openAmount = await computePIOpenAmount(trx as KyselySchema, companyId, invoiceId);
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

    // Create AP/Bank pair per payment line for line-level audit traceability.
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

    // Create journal batch
    const batchResult = await sql`
      INSERT INTO journal_batches (
        company_id, outlet_id, doc_type, doc_id, posted_at
      ) VALUES (
        ${companyId}, NULL, 'AP_PAYMENT', ${paymentId}, NOW()
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
          ${line.account_id}, ${payment.payment_date}, ${line.debit}, ${line.credit}, ${line.description}
        )
      `.execute(trx);
    }

    // Update payment status to POSTED
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

    // FIX(47.5-WP-C): Insert period_close_overrides audit row when override is eligible
    // isOverrideEligible is only true when: valid reason AND periodId > 0
    if (isOverrideEligible && validOverrideReason !== null && cachedDecision) {
      await insertPeriodCloseOverride(trx, {
        companyId,
        userId,
        transactionType: "AP_PAYMENT",
        transactionId: paymentId,
        periodId: cachedDecision.periodId!, // Safe: isOverrideEligible ensures periodId > 0
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

// =============================================================================
// Void AP Payment
// =============================================================================

export async function voidAPPayment(
  companyId: number,
  userId: number,
  paymentId: number,
  overrideReason: string | null | undefined,
  auth: AuthContext
): Promise<APPaymentVoidResult> {
  const db = getDb() as KyselySchema;

  // FIX(47.5-WP-C): Period-close guardrail check for payment voiding
  // Get payment date for guardrail evaluation
  const paymentDateResult = await sql<{ id: number; payment_date: Date }>`
    SELECT id, payment_date
    FROM ap_payments
    WHERE id = ${paymentId}
      AND company_id = ${companyId}
  `.execute(db);

  const paymentForDate = paymentDateResult.rows[0];

  // FIX(47.5-WP-C): Evaluate override access using unified helper
  let isOverrideEligible = false;
  let validOverrideReason: string | null = null;
  let cachedDecision: GuardrailDecision | null = null;

  if (paymentForDate) {
    const paymentDateStr = new Date(paymentForDate.payment_date).toISOString().split("T")[0];
    const decision = await checkPeriodCloseGuardrail(companyId, paymentDateStr);
    cachedDecision = decision;

    if (!decision.allowed && decision.overrideRequired) {
      const access = await evaluateOverrideAccess(auth, overrideReason, decision);
      if (!access.allowed) {
        if (access.error === "reason") {
          throw new PeriodOverrideReasonInvalidError(access.message);
        }
        throw new PeriodOverrideForbiddenError(access.message);
      }
      if (decision.periodId === null || decision.periodId <= 0) {
        const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
        err.code = "PERIOD_CLOSED";
        err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
        throw err;
      }
      isOverrideEligible = true;
      validOverrideReason = access.overrideReason;
    } else if (!decision.allowed) {
      const err = new Error(decision.blockReason ?? "Period is closed for AP transactions") as Error & { code: string; blockCode: string };
      err.code = "PERIOD_CLOSED";
      err.blockCode = decision.blockCode ?? "PERIOD_CLOSED";
      throw err;
    }
  }

  const result = await db.transaction().execute(async (trx) => {
    // P1: Lock payment row FOR UPDATE first
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

    // P1: Lock affected invoice rows FOR UPDATE to ensure consistent reads during reversal
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

    // Now read journal lines after locks are held
    const originalLines = await trx
      .selectFrom("journal_lines")
      .where("journal_batch_id", "=", payment.journal_batch_id)
      .where("company_id", "=", companyId)
      .select(["account_id", "debit", "credit", "description"])
      .execute();

    // Create reversal journal batch
    const batchResult = await sql`
      INSERT INTO journal_batches (
        company_id, outlet_id, doc_type, doc_id, posted_at
      ) VALUES (
        ${companyId}, NULL, 'AP_PAYMENT_VOID', ${paymentId}, NOW()
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
          ${line.account_id}, ${payment.payment_date},
          ${line.credit}, ${line.debit},
          ${"VOID: " + line.description}
        )
      `.execute(trx);
    }

    // Update payment status to VOID
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

    // FIX(47.5-WP-C): Insert period_close_overrides audit row when override is eligible
    // isOverrideEligible is only true when: valid reason AND periodId > 0
    if (isOverrideEligible && validOverrideReason !== null && cachedDecision) {
      await insertPeriodCloseOverride(trx, {
        companyId,
        userId,
        transactionType: "AP_PAYMENT_VOID",
        transactionId: paymentId,
        periodId: cachedDecision.periodId!, // Safe: isOverrideEligible ensures periodId > 0
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
