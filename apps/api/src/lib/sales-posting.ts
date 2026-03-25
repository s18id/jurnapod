// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { PostingService, type PostingMapper, type PostingRepository } from "@jurnapod/core";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import {
  ACCOUNT_MAPPING_TYPE_ID_BY_CODE,
  accountMappingIdToCode,
  type AccountMappingCode
} from "@jurnapod/shared";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { toMysqlDateTime, toMysqlDateTimeFromDateLike } from "./date-helpers";
import type { SalesInvoiceDetail, SalesPayment } from "./sales";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "./fiscal-years";

const SALES_INVOICE_DOC_TYPE = "SALES_INVOICE";
const SALES_PAYMENT_IN_DOC_TYPE = "SALES_PAYMENT_IN";

const OUTLET_ACCOUNT_MAPPING_KEYS = ["SALES_REVENUE", "AR", "SALES_RETURNS"] as const;
type OutletAccountMappingKey = (typeof OUTLET_ACCOUNT_MAPPING_KEYS)[number];
type OutletAccountMapping = Record<OutletAccountMappingKey, number>;

export const OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE = "OUTLET_ACCOUNT_MAPPING_MISSING";
export const OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE = "OUTLET_PAYMENT_MAPPING_MISSING";
export const TAX_ACCOUNT_MISSING_MESSAGE = "TAX_ACCOUNT_MISSING";
export const UNSUPPORTED_PAYMENT_METHOD_MESSAGE = "UNSUPPORTED_PAYMENT_METHOD";

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

const MONEY_SCALE = 100;

function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function fromMinorUnits(value: number): number {
  return value / MONEY_SCALE;
}

function normalizeMoney(value: number): number {
  return fromMinorUnits(toMinorUnits(value));
}

function normalizePaymentMethodCode(method: string): string {
  const normalized = method.trim().toUpperCase();
  if (!normalized) {
    throw new Error(UNSUPPORTED_PAYMENT_METHOD_MESSAGE);
  }
  return normalized;
}

function resolveMappingCode(row: { mapping_type_id?: number | null; mapping_key?: string | null }): AccountMappingCode | undefined {
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

async function readOutletAccountMappingByKey(
  dbExecutor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<OutletAccountMapping> {
  const requiredKeys = ["SALES_REVENUE", "AR"] as const;
  const requiredTypeIds = requiredKeys.map((key) => ACCOUNT_MAPPING_TYPE_ID_BY_CODE[key]);
  const idPlaceholders = requiredTypeIds.map(() => "?").join(", ");
  const keyPlaceholders = requiredKeys.map(() => "?").join(", ");
  const [rows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT mapping_type_id, mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND (mapping_type_id IN (${idPlaceholders}) OR mapping_key IN (${keyPlaceholders}))`,
    [companyId, outletId, ...requiredTypeIds, ...requiredKeys]
  );

  const accountByKey = new Map<string, number>();
  for (const row of rows as Array<{ mapping_type_id?: number | null; mapping_key?: string; account_id?: number }>) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) {
      continue;
    }

    if (!requiredKeys.includes(mappingCode as typeof requiredKeys[number])) {
      continue;
    }

    accountByKey.set(mappingCode, Number(row.account_id));
  }

  const [companyRows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT mapping_type_id, mapping_key, account_id
     FROM company_account_mappings
     WHERE company_id = ?
       AND (mapping_type_id IN (${idPlaceholders}) OR mapping_key IN (${keyPlaceholders}))`,
    [companyId, ...requiredTypeIds, ...requiredKeys]
  );

  for (const row of companyRows as Array<{ mapping_type_id?: number | null; mapping_key?: string; account_id?: number }>) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) {
      continue;
    }

    if (!requiredKeys.includes(mappingCode as typeof requiredKeys[number])) {
      continue;
    }

    if (!accountByKey.has(mappingCode)) {
      accountByKey.set(mappingCode, Number(row.account_id));
    }
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

async function readCreditNoteAccountMapping(
  dbExecutor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<{ AR: number; SALES_RETURNS: number }> {
  const [rows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT mapping_type_id, mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND (mapping_type_id IN (?, ?, ?) OR mapping_key IN ('AR', 'SALES_RETURNS', 'SALES_REVENUE'))`,
    [companyId, outletId, ACCOUNT_MAPPING_TYPE_ID_BY_CODE.AR, ACCOUNT_MAPPING_TYPE_ID_BY_CODE.SALES_RETURNS, ACCOUNT_MAPPING_TYPE_ID_BY_CODE.SALES_REVENUE]
  );

  const accountByKey = new Map<string, number>();
  for (const row of rows as Array<{ mapping_type_id?: number | null; mapping_key?: string; account_id?: number }>) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) {
      continue;
    }
    accountByKey.set(mappingCode, Number(row.account_id));
  }

  const [companyRows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT mapping_type_id, mapping_key, account_id
     FROM company_account_mappings
     WHERE company_id = ?
       AND (mapping_type_id IN (?, ?, ?) OR mapping_key IN ('AR', 'SALES_RETURNS', 'SALES_REVENUE'))`,
    [companyId, ACCOUNT_MAPPING_TYPE_ID_BY_CODE.AR, ACCOUNT_MAPPING_TYPE_ID_BY_CODE.SALES_RETURNS, ACCOUNT_MAPPING_TYPE_ID_BY_CODE.SALES_REVENUE]
  );

  for (const row of companyRows as Array<{ mapping_type_id?: number | null; mapping_key?: string; account_id?: number }>) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) {
      continue;
    }
    if (!accountByKey.has(mappingCode)) {
      accountByKey.set(mappingCode, Number(row.account_id));
    }
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

async function readOutletPaymentMethodMappings(
  dbExecutor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<Map<string, number>> {
  const [rows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT method_code, account_id
     FROM outlet_payment_method_mappings
     WHERE company_id = ?
       AND outlet_id = ?`,
    [companyId, outletId]
  );

  const accountByMethod = new Map<string, number>();
  for (const row of rows as Array<{ method_code?: string; account_id?: number }>) {
    if (!row.method_code || !Number.isFinite(row.account_id)) {
      continue;
    }
    const methodCode = normalizePaymentMethodCode(String(row.method_code));
    accountByMethod.set(methodCode, Number(row.account_id));
  }

  const fallbackKeys = ["CASH", "QRIS", "CARD"];
  const fallbackTypeIds = fallbackKeys.map((key) => ACCOUNT_MAPPING_TYPE_ID_BY_CODE[key as keyof typeof ACCOUNT_MAPPING_TYPE_ID_BY_CODE]);
  const placeholders = fallbackKeys.map(() => "?").join(", ");
  const typePlaceholders = fallbackTypeIds.map(() => "?").join(", ");
  const [fallbackRows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT mapping_type_id, mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND (mapping_type_id IN (${typePlaceholders}) OR mapping_key IN (${placeholders}))`,
    [companyId, outletId, ...fallbackTypeIds, ...fallbackKeys]
  );

  for (const row of fallbackRows as Array<{ mapping_type_id?: number | null; mapping_key?: string; account_id?: number }>) {
    const mappingCode = resolveMappingCode(row);
    if (!mappingCode || !Number.isFinite(row.account_id)) {
      continue;
    }
    const methodCode = normalizePaymentMethodCode(mappingCode);
    if (!accountByMethod.has(methodCode)) {
      accountByMethod.set(methodCode, Number(row.account_id));
    }
  }

  const [companyRows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT method_code, account_id
     FROM company_payment_method_mappings
     WHERE company_id = ?`,
    [companyId]
  );

  for (const row of companyRows as Array<{ method_code?: string; account_id?: number }>) {
    if (!row.method_code || !Number.isFinite(row.account_id)) {
      continue;
    }
    const methodCode = normalizePaymentMethodCode(String(row.method_code));
    if (!accountByMethod.has(methodCode)) {
      accountByMethod.set(methodCode, Number(row.account_id));
    }
  }

  return accountByMethod;
}

export const PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE = "PAYMENT_VARIANCE_GAIN_MISSING";
export const PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE = "PAYMENT_VARIANCE_LOSS_MISSING";

export class PaymentVarianceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentVarianceConfigError";
  }
}

async function readCompanyPaymentVarianceAccounts(
  dbExecutor: QueryExecutor,
  companyId: number
): Promise<{ gain: number | null; loss: number | null }> {
  const [rows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT mapping_type_id, mapping_key, account_id
     FROM company_account_mappings
     WHERE company_id = ?
       AND (mapping_type_id IN (?, ?) OR mapping_key IN ('PAYMENT_VARIANCE_GAIN', 'PAYMENT_VARIANCE_LOSS'))`,
    [companyId, ACCOUNT_MAPPING_TYPE_ID_BY_CODE.PAYMENT_VARIANCE_GAIN, ACCOUNT_MAPPING_TYPE_ID_BY_CODE.PAYMENT_VARIANCE_LOSS]
  );

  let gain: number | null = null;
  let loss: number | null = null;

  for (const row of rows as Array<{ mapping_type_id?: number | null; mapping_key?: string; account_id?: number }>) {
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

export const __salesPostingTestables = {
  readOutletAccountMappingByKey,
  readOutletPaymentMethodMappings,
  readCompanyPaymentVarianceAccounts,
  OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE,
  OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE,
  TAX_ACCOUNT_MISSING_MESSAGE,
  PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE,
  PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE,
  PaymentVarianceConfigError
} as const;

class SalesInvoicePostingMapper implements PostingMapper {
  constructor(
    private readonly dbExecutor: QueryExecutor,
    private readonly invoice: SalesInvoiceDetail
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const mapping = await readOutletAccountMappingByKey(
      this.dbExecutor,
      this.invoice.company_id,
      this.invoice.outlet_id
    );

    const lines: JournalLine[] = [];

    lines.push({
      account_id: mapping.AR,
      debit: normalizeMoney(this.invoice.grand_total),
      credit: 0,
      description: `Invoice ${this.invoice.invoice_no} - AR`
    });

    lines.push({
      account_id: mapping.SALES_REVENUE,
      debit: 0,
      credit: normalizeMoney(this.invoice.subtotal),
      description: `Invoice ${this.invoice.invoice_no} - Revenue`
    });

    if (this.invoice.taxes && this.invoice.taxes.length > 0) {
      const taxRateIds = this.invoice.taxes.map(t => t.tax_rate_id);
      if (taxRateIds.length > 0) {
        const placeholders = taxRateIds.map(() => "?").join(", ");
        const [taxRows] = await this.dbExecutor.execute<RowDataPacket[]>(
          `SELECT tr.id, tr.code, tr.account_id
           FROM tax_rates tr
           WHERE tr.id IN (${placeholders}) AND tr.company_id = ?`,
          [...taxRateIds, this.invoice.company_id]
        );
        
        const taxRateAccountMap = new Map<number, { code: string; account_id: number | null }>();
        for (const row of taxRows as Array<{ id: number; code: string; account_id: number | null }>) {
          taxRateAccountMap.set(Number(row.id), {
            code: String(row.code),
            account_id: row.account_id
          });
        }

        for (const taxLine of this.invoice.taxes) {
          if (taxLine.amount <= 0) continue;
          
          const taxRateInfo = taxRateAccountMap.get(taxLine.tax_rate_id);
          if (!taxRateInfo || !taxRateInfo.account_id) {
            const taxCode = taxRateInfo?.code ?? `ID:${taxLine.tax_rate_id}`;
            throw new Error(`${TAX_ACCOUNT_MISSING_MESSAGE}:${taxCode}`);
          }

          lines.push({
            account_id: taxRateInfo.account_id,
            debit: 0,
            credit: normalizeMoney(taxLine.amount),
            description: `Invoice ${this.invoice.invoice_no} - Tax (${taxRateInfo.code})`
          });
        }
      }
    }

    return lines;
  }
}

class SalesPaymentPostingMapper implements PostingMapper {
  constructor(
    private readonly dbExecutor: QueryExecutor,
    private readonly payment: SalesPayment,
    private readonly invoiceNo: string
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const mapping = await readOutletAccountMappingByKey(
      this.dbExecutor,
      this.payment.company_id,
      this.payment.outlet_id
    );

    const lines: JournalLine[] = [];

    const paymentAmount = this.payment.payment_amount_idr ?? this.payment.amount;
    const invoiceAmountApplied = this.payment.invoice_amount_idr ?? paymentAmount;
    const delta = this.payment.payment_delta_idr ?? 0;

    // Phase 8: Handle split payments - use paymentAmount for total
    const splits = this.payment.splits;
    if (splits && splits.length > 0) {
      // Multiple debit lines for split payments - each split is part of total payment
      for (const split of splits) {
        const accountLabel = split.account_name ?? `Account #${split.account_id}`;
        lines.push({
          account_id: split.account_id,
          debit: normalizeMoney(split.amount),
          credit: 0,
          description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - ${accountLabel} (Split ${split.split_index + 1}/${splits.length})`
        });
      }
    } else {
      // Single debit line for non-split payments (backward compatibility)
      const cashBankAccountId = this.payment.account_id;
      const accountLabel = this.payment.account_name ?? `Account #${cashBankAccountId}`;
      lines.push({
        account_id: cashBankAccountId,
        debit: normalizeMoney(paymentAmount),
        credit: 0,
        description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - ${accountLabel}`
      });
    }

    // Credit AR by invoice amount applied (not full payment amount)
    lines.push({
      account_id: mapping.AR,
      debit: 0,
      credit: normalizeMoney(invoiceAmountApplied),
      description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - AR`
    });

    // Phase 2 (ADR-0008): Handle payment variance for forex delta
    // Variance is computed against outstanding AR at posting time (see sales.ts postPayment).
    // In normal flow: delta >= 0 (overpayment produces gain, partial underpayment produces 0)
    // The delta < 0 branch is defensive fallback for edge cases / data repair.
    if (delta !== 0) {
      const varianceAccounts = await readCompanyPaymentVarianceAccounts(
        this.dbExecutor,
        this.payment.company_id
      );

      if (delta > 0) {
        // Gain: payment > outstanding AR - credit variance gain account
        if (!varianceAccounts.gain) {
          throw new PaymentVarianceConfigError(PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE);
        }
        lines.push({
          account_id: varianceAccounts.gain,
          debit: 0,
          credit: normalizeMoney(delta),
          description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - Variance Gain`
        });
      } else if (delta < 0) {
        // Defensive: should not occur in normal flow (partial underpayment keeps delta = 0)
        // Loss: payment < outstanding AR - debit variance loss account
        if (!varianceAccounts.loss) {
          throw new PaymentVarianceConfigError(PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE);
        }
        lines.push({
          account_id: varianceAccounts.loss,
          debit: normalizeMoney(Math.abs(delta)),
          credit: 0,
          description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - Variance Loss`
        });
      }
    }

    // Phase 8: Guard posting balance for split entries
    const totalDebitsMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.debit), 0);
    const totalCreditsMinor = lines.reduce((sum, line) => sum + toMinorUnits(line.credit), 0);
    if (totalDebitsMinor !== totalCreditsMinor) {
      throw new Error("PAYMENT_SPLIT_IMBALANCE: Debit/Credit totals do not match");
    }

    return lines;
  }
}

class SalesPostingRepository implements PostingRepository {
  private readonly lineDate: string;

  constructor(
    private readonly dbExecutor: QueryExecutor,
    private readonly postedAt: string
  ) {
    this.lineDate = postedAt.slice(0, 10);
  }

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const [insertResult] = await this.dbExecutor.execute<ResultSetHeader>(
      `INSERT INTO journal_batches (
         company_id,
         outlet_id,
         doc_type,
         doc_id,
         posted_at
       ) VALUES (?, ?, ?, ?, ?)`,
      [request.company_id, request.outlet_id ?? null, request.doc_type, request.doc_id, this.postedAt]
    );

    return {
      journal_batch_id: Number(insertResult.insertId)
    };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void> {
    const placeholders = lines.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = lines.flatMap((line) => [
      journalBatchId,
      request.company_id,
      request.outlet_id ?? null,
      line.account_id,
      this.lineDate,
      line.debit,
      line.credit,
      line.description
    ]);

    await this.dbExecutor.execute(
      `INSERT INTO journal_lines (
         journal_batch_id,
         company_id,
         outlet_id,
         account_id,
         line_date,
         debit,
         credit,
         description
       ) VALUES ${placeholders}`,
      values
    );
  }
}

function toDateOnly(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid datetime");
  }

  return date.toISOString().slice(0, 10);
}

export async function postSalesInvoiceToJournal(
  dbExecutor: QueryExecutor,
  invoice: SalesInvoiceDetail
): Promise<PostingResult> {
  await ensureDateWithinOpenFiscalYearWithExecutor(
    dbExecutor,
    invoice.company_id,
    invoice.invoice_date
  );

  const postingRequest: PostingRequest = {
    doc_type: SALES_INVOICE_DOC_TYPE,
    doc_id: invoice.id,
    company_id: invoice.company_id,
    outlet_id: invoice.outlet_id
  };

  const postingService = new PostingService(
    new SalesPostingRepository(dbExecutor, toMysqlDateTime(invoice.updated_at)),
    {
      [SALES_INVOICE_DOC_TYPE]: new SalesInvoicePostingMapper(dbExecutor, invoice)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: "external"
  });
}

export async function postSalesPaymentToJournal(
  dbExecutor: QueryExecutor,
  payment: SalesPayment,
  invoiceNo: string
): Promise<PostingResult> {
  await ensureDateWithinOpenFiscalYearWithExecutor(
    dbExecutor,
    payment.company_id,
    toDateOnly(payment.payment_at)
  );

  const postingRequest: PostingRequest = {
    doc_type: SALES_PAYMENT_IN_DOC_TYPE,
    doc_id: payment.id,
    company_id: payment.company_id,
    outlet_id: payment.outlet_id
  };

  const postingService = new PostingService(
    new SalesPostingRepository(dbExecutor, toMysqlDateTime(payment.updated_at)),
    {
      [SALES_PAYMENT_IN_DOC_TYPE]: new SalesPaymentPostingMapper(dbExecutor, payment, invoiceNo)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: "external"
  });
}

const SALES_CREDIT_NOTE_DOC_TYPE = "SALES_CREDIT_NOTE";

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

class SalesCreditNotePostingMapper implements PostingMapper {
  constructor(
    private readonly dbExecutor: QueryExecutor,
    private readonly creditNote: SalesCreditNoteDetail
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const mapping = await readCreditNoteAccountMapping(
      this.dbExecutor,
      this.creditNote.company_id,
      this.creditNote.outlet_id
    );

    const lines: JournalLine[] = [];

    lines.push({
      account_id: mapping.SALES_RETURNS,
      debit: normalizeMoney(this.creditNote.amount),
      credit: 0,
      description: `Credit Note ${this.creditNote.credit_note_no} - Sales Returns`
    });

    lines.push({
      account_id: mapping.AR,
      debit: 0,
      credit: normalizeMoney(this.creditNote.amount),
      description: `Credit Note ${this.creditNote.credit_note_no} - AR`
    });

    return lines;
  }
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

  const postingRequest: PostingRequest = {
    doc_type: SALES_CREDIT_NOTE_DOC_TYPE,
    doc_id: creditNote.id,
    company_id: creditNote.company_id,
    outlet_id: creditNote.outlet_id
  };

  const postingService = new PostingService(
    new SalesPostingRepository(dbExecutor, toMysqlDateTimeFromDateLike(creditNote.updated_at)),
    {
      [SALES_CREDIT_NOTE_DOC_TYPE]: new SalesCreditNotePostingMapper(dbExecutor, creditNote)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: "external"
  });
}

class VoidCreditNotePostingMapper implements PostingMapper {
  constructor(
    private readonly dbExecutor: QueryExecutor,
    private readonly creditNote: SalesCreditNoteDetail
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const mapping = await readCreditNoteAccountMapping(
      this.dbExecutor,
      this.creditNote.company_id,
      this.creditNote.outlet_id
    );

    const lines: JournalLine[] = [];

    // Reverse the original credit note entries
    // Original: Dr: Sales Returns, Cr: AR
    // Reversal: Dr: AR, Cr: Sales Returns

    lines.push({
      account_id: mapping.AR,
      debit: normalizeMoney(this.creditNote.amount),
      credit: 0,
      description: `Void Credit Note ${this.creditNote.credit_note_no} - AR Reversal`
    });

    lines.push({
      account_id: mapping.SALES_RETURNS,
      debit: 0,
      credit: normalizeMoney(this.creditNote.amount),
      description: `Void Credit Note ${this.creditNote.credit_note_no} - Sales Returns Reversal`
    });

    return lines;
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

  const postingRequest: PostingRequest = {
    doc_type: `${SALES_CREDIT_NOTE_DOC_TYPE}_VOID`,
    doc_id: creditNote.id,
    company_id: creditNote.company_id,
    outlet_id: creditNote.outlet_id
  };

  const postingService = new PostingService(
    new SalesPostingRepository(dbExecutor, toMysqlDateTimeFromDateLike(creditNote.updated_at)),
    {
      [`${SALES_CREDIT_NOTE_DOC_TYPE}_VOID`]: new VoidCreditNotePostingMapper(dbExecutor, creditNote)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: "external"
  });
}
