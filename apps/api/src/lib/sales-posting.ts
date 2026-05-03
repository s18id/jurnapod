// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Thin adapter that delegates to @jurnapod/modules-accounting
// All business logic is in the accounting package

import { sql } from "kysely";
import { type KyselySchema } from "./db";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years";
import type { SalesInvoiceDetail } from "@jurnapod/modules-sales";
import type { SalesPayment } from "@jurnapod/modules-sales";
import type { QueryExecutor } from "@/lib/shared/common-utils";
import {
  ACCOUNT_MAPPING_TYPE_ID_BY_CODE,
  accountMappingIdToCode,
  type AccountMappingCode,
  toUtcIso,
  fromUtcIso,
} from "@jurnapod/shared";
import type { PostingResult } from "@jurnapod/shared";
import {
  type SalesPostingExecutor,
  type SalesInvoicePostingData,
  type SalesPaymentPostingData,
  type SalesCreditNotePostingData,
  type OutletAccountMapping,
  type PaymentVarianceAccounts,
  type TaxRateInfo,
  postSalesInvoice,
  postSalesPayment,
  postCreditNote,
  voidCreditNote,
  PaymentVarianceConfigError,
  SALES_OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE,
  SALES_TAX_ACCOUNT_MISSING_MESSAGE,
  PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE,
  PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE
} from "@jurnapod/modules-accounting";
import { journalMetrics } from "./metrics";
import type { JournalFailureReason } from "./metrics";

/**
 * Categorize a posting error into a failure reason
 */
function categorizePostingError(error: unknown): JournalFailureReason {
  if (error instanceof PaymentVarianceConfigError) {
    return "validation_error";
  }
  
  const message = error instanceof Error ? error.message : String(error);
  
  if (message.includes("OUTLET_ACCOUNT_MAPPING_MISSING") ||
      message.includes("TAX_ACCOUNT_MISSING") ||
      message.includes("PAYMENT_VARIANCE")) {
    return "validation_error";
  }
  
  if (message.includes("UNBALANCED") || message.includes("IMBALANCE")) {
    return "gl_imbalance";
  }
  
  if (message.includes("MISSING") || message.includes("NOT_FOUND")) {
    return "missing_reference";
  }
  
  return "posting_error";
}

// Re-export for backward compatibility
export {
  PaymentVarianceConfigError,
  SALES_OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE,
  SALES_TAX_ACCOUNT_MISSING_MESSAGE,
  PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE,
  PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE
};

export const OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE = SALES_OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE;
export const OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE = "OUTLET_PAYMENT_MAPPING_MISSING";
export const TAX_ACCOUNT_MISSING_MESSAGE = SALES_TAX_ACCOUNT_MISSING_MESSAGE;
export const UNSUPPORTED_PAYMENT_METHOD_MESSAGE = "UNSUPPORTED_PAYMENT_METHOD";

// =============================================================================
// Sales Posting Executor Implementation
// =============================================================================

function resolveMappingCode(
  row: { mapping_type_id?: number | null; mapping_key?: string | null }
): AccountMappingCode | undefined {
  const fromId = accountMappingIdToCode(row.mapping_type_id);
  if (fromId) {
    return fromId;
  }

  if (typeof row.mapping_key === "string") {
    const normalized = row.mapping_key.trim().toUpperCase() as AccountMappingCode;
    if (ACCOUNT_MAPPING_TYPE_ID_BY_CODE[normalized]) {
      return normalized;
    }
  }

  return undefined;
}

class ApiSalesPostingExecutor implements SalesPostingExecutor {
  constructor(private readonly db: KyselySchema) {}

  async readOutletAccountMappingByKey(
    companyId: number,
    outletId: number
  ): Promise<OutletAccountMapping> {
    const requiredKeys = ["SALES_REVENUE", "AR"] as const;
    const requiredTypeIds = requiredKeys.map((key) => ACCOUNT_MAPPING_TYPE_ID_BY_CODE[key]);

    const outletRows = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id", "outlet_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "=", outletId)
      .where((eb) =>
        eb.or([
          eb("mapping_type_id", "in", requiredTypeIds),
          eb("mapping_key", "in", requiredKeys)
        ])
      )
      .execute();

    const companyRows = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id", "outlet_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "is", null)
      .where((eb) =>
        eb.or([
          eb("mapping_type_id", "in", requiredTypeIds),
          eb("mapping_key", "in", requiredKeys)
        ])
      )
      .execute();

    const accountByKey = new Map<string, number>();

    for (const row of companyRows) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) continue;
      if (!requiredKeys.includes(mappingCode as typeof requiredKeys[number])) continue;
      accountByKey.set(mappingCode, Number(row.account_id));
    }

    for (const row of outletRows) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) continue;
      if (!requiredKeys.includes(mappingCode as typeof requiredKeys[number])) continue;
      accountByKey.set(mappingCode, Number(row.account_id));
    }

    const missingKeys = requiredKeys.filter((key) => !accountByKey.has(key));
    if (missingKeys.length > 0) {
      throw new Error(OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE);
    }

    return {
      SALES_REVENUE: accountByKey.get("SALES_REVENUE") as number,
      AR: accountByKey.get("AR") as number,
      SALES_RETURNS: accountByKey.get("SALES_REVENUE") as number
    };
  }

  async readCreditNoteAccountMapping(
    companyId: number,
    outletId: number
  ): Promise<{ AR: number; SALES_RETURNS: number }> {
    const creditNoteKeys = ["AR", "SALES_RETURNS", "SALES_REVENUE"] as const;
    const creditNoteTypeIds = [
      ACCOUNT_MAPPING_TYPE_ID_BY_CODE.AR,
      ACCOUNT_MAPPING_TYPE_ID_BY_CODE.SALES_RETURNS,
      ACCOUNT_MAPPING_TYPE_ID_BY_CODE.SALES_REVENUE
    ];

    const outletRows = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id", "outlet_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "=", outletId)
      .where((eb) =>
        eb.or([
          eb("mapping_type_id", "in", creditNoteTypeIds),
          eb("mapping_key", "in", creditNoteKeys)
        ])
      )
      .execute();

    const companyRows = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id", "outlet_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "is", null)
      .where((eb) =>
        eb.or([
          eb("mapping_type_id", "in", creditNoteTypeIds),
          eb("mapping_key", "in", creditNoteKeys)
        ])
      )
      .execute();

    const accountByKey = new Map<string, number>();

    for (const row of companyRows) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) continue;
      accountByKey.set(mappingCode, Number(row.account_id));
    }

    for (const row of outletRows) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) continue;
      accountByKey.set(mappingCode, Number(row.account_id));
    }

    const arAccountId = accountByKey.get("AR");
    if (!arAccountId) {
      throw new Error(OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE);
    }

    const salesReturnsAccountId = accountByKey.get("SALES_RETURNS") ?? accountByKey.get("SALES_REVENUE");
    if (!salesReturnsAccountId) {
      throw new Error(OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE);
    }

    return {
      AR: arAccountId,
      SALES_RETURNS: salesReturnsAccountId
    };
  }

  async readCompanyPaymentVarianceAccounts(companyId: number): Promise<PaymentVarianceAccounts> {
    const result = await this.db
      .selectFrom("account_mappings")
      .select(["mapping_type_id", "mapping_key", "account_id"])
      .where("company_id", "=", companyId)
      .where("outlet_id", "is", null)
      .where((eb) =>
        eb.or([
          eb("mapping_type_id", "in", [
            ACCOUNT_MAPPING_TYPE_ID_BY_CODE.PAYMENT_VARIANCE_GAIN,
            ACCOUNT_MAPPING_TYPE_ID_BY_CODE.PAYMENT_VARIANCE_LOSS
          ]),
          eb("mapping_key", "in", ["PAYMENT_VARIANCE_GAIN", "PAYMENT_VARIANCE_LOSS"])
        ])
      )
      .execute();

    let gain: number | null = null;
    let loss: number | null = null;

    for (const row of result as Array<{
      mapping_type_id?: number | null;
      mapping_key?: string | null;
      account_id?: number | null;
    }>) {
      const mappingCode = resolveMappingCode(row);
      if (!mappingCode || !Number.isFinite(row.account_id)) {
        continue;
      }
      if (mappingCode === "PAYMENT_VARIANCE_GAIN") {
        gain = Number(row.account_id);
      } else if (mappingCode === "PAYMENT_VARIANCE_LOSS") {
        loss = Number(row.account_id);
      }
    }

    return { gain, loss };
  }

  async readTaxRatesByIds(
    taxRateIds: number[],
    companyId: number
  ): Promise<Map<number, TaxRateInfo>> {
    const result = await sql<{ id: number; code: string; account_id: number | null }>`
      SELECT tr.id, tr.code, tr.account_id
      FROM tax_rates tr
      WHERE tr.id IN (${sql.join(taxRateIds.map((id) => sql`${id}`), sql`, `)}) AND tr.company_id = ${companyId}
    `.execute(this.db);

    const map = new Map<number, TaxRateInfo>();
    for (const row of result.rows) {
      map.set(Number(row.id), {
        id: Number(row.id),
        code: String(row.code),
        account_id: row.account_id ? Number(row.account_id) : null
      });
    }
    return map;
  }
}

// =============================================================================
// Adapter Functions
// =============================================================================

export async function postSalesInvoiceToJournal(
  dbExecutor: QueryExecutor,
  invoice: SalesInvoiceDetail
): Promise<PostingResult> {
  await ensureDateWithinOpenFiscalYearWithExecutor(
    dbExecutor,
    invoice.company_id,
    invoice.invoice_date
  );

  const executor = new ApiSalesPostingExecutor(dbExecutor as KyselySchema);

  const postingData: SalesInvoicePostingData = {
    id: invoice.id,
    company_id: invoice.company_id,
    outlet_id: invoice.outlet_id,
    invoice_no: invoice.invoice_no,
    invoice_date: invoice.invoice_date,
    subtotal: invoice.subtotal,
    grand_total: invoice.grand_total,
    taxes: invoice.taxes,
    updated_at: invoice.updated_at
  };

  try {
    const result = await postSalesInvoice(dbExecutor as KyselySchema, executor, postingData);
    journalMetrics.recordPostSuccess(invoice.company_id, "sales");
    return result;
  } catch (error) {
    const reason = categorizePostingError(error);
    journalMetrics.recordPostFailure(invoice.company_id, "sales", reason);
    throw error;
  }
}

export async function postSalesPaymentToJournal(
  dbExecutor: QueryExecutor,
  payment: SalesPayment,
  invoiceNo: string
): Promise<PostingResult> {
  await ensureDateWithinOpenFiscalYearWithExecutor(
    dbExecutor,
    payment.company_id,
    fromUtcIso.dateOnly(toUtcIso.dateLike(payment.payment_at) as string)
  );

  const executor = new ApiSalesPostingExecutor(dbExecutor as KyselySchema);

  const postingData: SalesPaymentPostingData = {
    id: payment.id,
    company_id: payment.company_id,
    outlet_id: payment.outlet_id,
    payment_no: payment.payment_no,
    payment_at: payment.payment_at,
    actual_amount_idr: payment.actual_amount_idr ?? undefined,
    payment_amount_idr: payment.payment_amount_idr ?? undefined,
    amount: payment.amount,
    invoice_amount_idr: payment.invoice_amount_idr ?? undefined,
    payment_delta_idr: payment.payment_delta_idr ?? undefined,
    account_id: payment.account_id,
    account_name: payment.account_name,
    splits: payment.splits,
    updated_at: payment.updated_at
  };

  try {
    const result = await postSalesPayment(dbExecutor as KyselySchema, executor, postingData, invoiceNo);
    journalMetrics.recordPostSuccess(payment.company_id, "sales");
    return result;
  } catch (error) {
    const reason = categorizePostingError(error);
    journalMetrics.recordPostFailure(payment.company_id, "sales", reason);
    throw error;
  }
}

interface SalesCreditNoteDetail {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  credit_note_no: string;
  credit_note_date: string;
  amount: number;
  updated_at: string;
}

export async function postCreditNoteToJournal(
  dbExecutor: QueryExecutor,
  creditNote: SalesCreditNoteDetail
): Promise<PostingResult> {
  await ensureDateWithinOpenFiscalYearWithExecutor(
    dbExecutor,
    creditNote.company_id,
    creditNote.credit_note_date
  );

  const executor = new ApiSalesPostingExecutor(dbExecutor as KyselySchema);

  const postingData: SalesCreditNotePostingData = {
    id: creditNote.id,
    company_id: creditNote.company_id,
    outlet_id: creditNote.outlet_id,
    invoice_id: creditNote.invoice_id,
    credit_note_no: creditNote.credit_note_no,
    credit_note_date: creditNote.credit_note_date,
    amount: creditNote.amount,
    updated_at: creditNote.updated_at
  };

  try {
    const result = await postCreditNote(dbExecutor as KyselySchema, executor, postingData);
    journalMetrics.recordPostSuccess(creditNote.company_id, "sales");
    return result;
  } catch (error) {
    const reason = categorizePostingError(error);
    journalMetrics.recordPostFailure(creditNote.company_id, "sales", reason);
    throw error;
  }
}

export async function voidCreditNoteToJournal(
  dbExecutor: QueryExecutor,
  creditNote: SalesCreditNoteDetail
): Promise<PostingResult> {
  await ensureDateWithinOpenFiscalYearWithExecutor(
    dbExecutor,
    creditNote.company_id,
    creditNote.credit_note_date
  );

  const executor = new ApiSalesPostingExecutor(dbExecutor as KyselySchema);

  const postingData: SalesCreditNotePostingData = {
    id: creditNote.id,
    company_id: creditNote.company_id,
    outlet_id: creditNote.outlet_id,
    invoice_id: creditNote.invoice_id,
    credit_note_no: creditNote.credit_note_no,
    credit_note_date: creditNote.credit_note_date,
    amount: creditNote.amount,
    updated_at: creditNote.updated_at
  };

  try {
    const result = await voidCreditNote(dbExecutor as KyselySchema, executor, postingData);
    journalMetrics.recordPostSuccess(creditNote.company_id, "sales");
    return result;
  } catch (error) {
    const reason = categorizePostingError(error);
    journalMetrics.recordPostFailure(creditNote.company_id, "sales", reason);
    throw error;
  }
}

// =============================================================================
// Helper functions (kept for backward compatibility with tests)
// =============================================================================

async function readOutletAccountMappingByKey(
  db: KyselySchema,
  companyId: number,
  outletId: number
): Promise<OutletAccountMapping> {
  const executor = new ApiSalesPostingExecutor(db);
  return executor.readOutletAccountMappingByKey(companyId, outletId);
}

async function readCompanyPaymentVarianceAccounts(
  db: KyselySchema,
  companyId: number
): Promise<PaymentVarianceAccounts> {
  const executor = new ApiSalesPostingExecutor(db);
  return executor.readCompanyPaymentVarianceAccounts(companyId);
}

// Re-export testables for backward compatibility
export const __salesPostingTestables = {
  readOutletAccountMappingByKey,
  readCompanyPaymentVarianceAccounts,
  OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE,
  OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE,
  TAX_ACCOUNT_MISSING_MESSAGE,
  PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE,
  PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE,
  PaymentVarianceConfigError
} as const;
