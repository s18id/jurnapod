// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import { PostingService, type PostingMapper, type PostingRepository } from "../index.js";
import { normalizeMoney, resolveMappingCode } from "./common.js";
import type { KyselySchema } from "@jurnapod/db";

// =============================================================================
// Types for Sales Posting
// =============================================================================

export interface SalesInvoicePostingData {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  invoice_date: string;
  subtotal: number;
  grand_total: number;
  taxes?: Array<{ tax_rate_id: number; amount: number }>;
  updated_at: string;
}

export interface SalesPaymentPostingData {
  id: number;
  company_id: number;
  outlet_id: number;
  payment_no: string;
  payment_at: string;
  payment_amount_idr?: number;
  amount: number;
  invoice_amount_idr?: number;
  payment_delta_idr?: number;
  account_id: number;
  account_name?: string | null;
  splits?: Array<{
    split_index: number;
    account_id: number;
    account_name?: string | null;
    amount: number;
  }>;
  updated_at: string;
}

export interface SalesCreditNotePostingData {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  credit_note_no: string;
  credit_note_date: string;
  amount: number;
  updated_at: string;
}

export interface OutletAccountMapping {
  SALES_REVENUE: number;
  AR: number;
  SALES_RETURNS: number;
}

export interface PaymentVarianceAccounts {
  gain: number | null;
  loss: number | null;
}

export interface TaxRateInfo {
  id: number;
  code: string;
  account_id: number | null;
}

// =============================================================================
// Executor Interface - implemented by API adapter
// =============================================================================

export interface SalesPostingExecutor {
  readOutletAccountMappingByKey(
    companyId: number,
    outletId: number
  ): Promise<OutletAccountMapping>;

  readCreditNoteAccountMapping(
    companyId: number,
    outletId: number
  ): Promise<{ AR: number; SALES_RETURNS: number }>;

  readCompanyPaymentVarianceAccounts(companyId: number): Promise<PaymentVarianceAccounts>;

  readTaxRatesByIds(taxRateIds: number[], companyId: number): Promise<Map<number, TaxRateInfo>>;
}

// =============================================================================
// Mappers
// =============================================================================

const TAX_ACCOUNT_MISSING_MESSAGE = "TAX_ACCOUNT_MISSING";

export class SalesInvoicePostingMapper implements PostingMapper {
  constructor(
    private readonly executor: SalesPostingExecutor,
    private readonly invoice: SalesInvoicePostingData
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const mapping = await this.executor.readOutletAccountMappingByKey(
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
      const taxRateIds = this.invoice.taxes.map((t) => t.tax_rate_id);
      if (taxRateIds.length > 0) {
        const taxRateAccountMap = await this.executor.readTaxRatesByIds(
          taxRateIds,
          this.invoice.company_id
        );

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

export class SalesPaymentPostingMapper implements PostingMapper {
  constructor(
    private readonly executor: SalesPostingExecutor,
    private readonly payment: SalesPaymentPostingData,
    private readonly invoiceNo: string
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const mapping = await this.executor.readOutletAccountMappingByKey(
      this.payment.company_id,
      this.payment.outlet_id
    );

    const lines: JournalLine[] = [];

    const paymentAmount = this.payment.payment_amount_idr ?? this.payment.amount;
    const invoiceAmountApplied = this.payment.invoice_amount_idr ?? paymentAmount;
    const delta = this.payment.payment_delta_idr ?? 0;

    // Phase 8: Handle split payments
    const splits = this.payment.splits;
    if (splits && splits.length > 0) {
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
      const cashBankAccountId = this.payment.account_id;
      const accountLabel = this.payment.account_name ?? `Account #${cashBankAccountId}`;
      lines.push({
        account_id: cashBankAccountId,
        debit: normalizeMoney(paymentAmount),
        credit: 0,
        description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - ${accountLabel}`
      });
    }

    lines.push({
      account_id: mapping.AR,
      debit: 0,
      credit: normalizeMoney(invoiceAmountApplied),
      description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - AR`
    });

    if (delta !== 0) {
      const varianceAccounts = await this.executor.readCompanyPaymentVarianceAccounts(
        this.payment.company_id
      );

      if (delta > 0) {
        if (!varianceAccounts.gain) {
          throw new PaymentVarianceConfigError("PAYMENT_VARIANCE_GAIN_MISSING");
        }
        lines.push({
          account_id: varianceAccounts.gain,
          debit: 0,
          credit: normalizeMoney(delta),
          description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - Variance Gain`
        });
      } else if (delta < 0) {
        if (!varianceAccounts.loss) {
          throw new PaymentVarianceConfigError("PAYMENT_VARIANCE_LOSS_MISSING");
        }
        lines.push({
          account_id: varianceAccounts.loss,
          debit: normalizeMoney(Math.abs(delta)),
          credit: 0,
          description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - Variance Loss`
        });
      }
    }

    // Guard posting balance for split entries
    const totalDebitsMinor = lines.reduce((sum, line) => sum + Math.round(line.debit * 100), 0);
    const totalCreditsMinor = lines.reduce((sum, line) => sum + Math.round(line.credit * 100), 0);
    if (totalDebitsMinor !== totalCreditsMinor) {
      throw new Error("PAYMENT_SPLIT_IMBALANCE: Debit/Credit totals do not match");
    }

    return lines;
  }
}

export class SalesCreditNotePostingMapper implements PostingMapper {
  constructor(
    private readonly executor: SalesPostingExecutor,
    private readonly creditNote: SalesCreditNotePostingData
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const mapping = await this.executor.readCreditNoteAccountMapping(
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

export class VoidCreditNotePostingMapper implements PostingMapper {
  constructor(
    private readonly executor: SalesPostingExecutor,
    private readonly creditNote: SalesCreditNotePostingData
  ) {}

  async mapToJournal(_request: PostingRequest): Promise<JournalLine[]> {
    const mapping = await this.executor.readCreditNoteAccountMapping(
      this.creditNote.company_id,
      this.creditNote.outlet_id
    );

    const lines: JournalLine[] = [];

    // Reverse the original credit note entries
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

// =============================================================================
// Repository
// =============================================================================

export class SalesPostingRepository implements PostingRepository {
  private readonly lineDate: string;

  constructor(
    private readonly db: KyselySchema,
    private readonly postedAt: string
  ) {
    this.lineDate = postedAt.slice(0, 10);
  }

  async createJournalBatch(request: PostingRequest): Promise<{ journal_batch_id: number }> {
    const { sql } = await import("kysely");
    const result = await sql`INSERT INTO journal_batches (
         company_id,
         outlet_id,
         doc_type,
         doc_id,
         posted_at
       ) VALUES (${request.company_id}, ${request.outlet_id ?? null}, ${request.doc_type}, ${request.doc_id}, ${this.postedAt})`.execute(this.db);

    return {
      journal_batch_id: Number(result.insertId)
    };
  }

  async insertJournalLines(journalBatchId: number, request: PostingRequest, lines: JournalLine[]): Promise<void> {
    if (lines.length === 0) return;

    const { sql } = await import("kysely");
    await sql`INSERT INTO journal_lines (
         journal_batch_id,
         company_id,
         outlet_id,
         account_id,
         line_date,
         debit,
         credit,
         description
       ) VALUES ${sql.join(lines.map(line => sql`(${journalBatchId}, ${request.company_id}, ${request.outlet_id ?? null}, ${line.account_id}, ${this.lineDate}, ${line.debit}, ${line.credit}, ${line.description})`), sql`, `)}`.execute(this.db);
  }
}

// =============================================================================
// Error Classes
// =============================================================================

export class PaymentVarianceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentVarianceConfigError";
  }
}

// =============================================================================
// Public API Functions (used by API adapter)
// =============================================================================

const SALES_INVOICE_DOC_TYPE = "SALES_INVOICE";
const SALES_PAYMENT_IN_DOC_TYPE = "SALES_PAYMENT_IN";
const SALES_CREDIT_NOTE_DOC_TYPE = "SALES_CREDIT_NOTE";

export const SALES_OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE = "OUTLET_ACCOUNT_MAPPING_MISSING";
export const SALES_OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE = "OUTLET_PAYMENT_MAPPING_MISSING";
export const SALES_TAX_ACCOUNT_MISSING_MESSAGE = "TAX_ACCOUNT_MISSING";
export const PAYMENT_VARIANCE_GAIN_MISSING_MESSAGE = "PAYMENT_VARIANCE_GAIN_MISSING";
export const PAYMENT_VARIANCE_LOSS_MISSING_MESSAGE = "PAYMENT_VARIANCE_LOSS_MISSING";

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

export interface SalesPostingOptions {
  transactionOwner?: "service" | "external";
}

export async function postSalesInvoice(
  db: KyselySchema,
  executor: SalesPostingExecutor,
  invoice: SalesInvoicePostingData,
  options: SalesPostingOptions = {}
): Promise<PostingResult> {
  const postingRequest: PostingRequest = {
    doc_type: SALES_INVOICE_DOC_TYPE,
    doc_id: invoice.id,
    company_id: invoice.company_id,
    outlet_id: invoice.outlet_id
  };

  const postingService = new PostingService(
    new SalesPostingRepository(db, toMysqlDateTime(invoice.updated_at)),
    {
      [SALES_INVOICE_DOC_TYPE]: new SalesInvoicePostingMapper(executor, invoice)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: options.transactionOwner ?? "external"
  });
}

export async function postSalesPayment(
  db: KyselySchema,
  executor: SalesPostingExecutor,
  payment: SalesPaymentPostingData,
  invoiceNo: string,
  options: SalesPostingOptions = {}
): Promise<PostingResult> {
  const postingRequest: PostingRequest = {
    doc_type: SALES_PAYMENT_IN_DOC_TYPE,
    doc_id: payment.id,
    company_id: payment.company_id,
    outlet_id: payment.outlet_id
  };

  const postingService = new PostingService(
    new SalesPostingRepository(db, toMysqlDateTime(payment.updated_at)),
    {
      [SALES_PAYMENT_IN_DOC_TYPE]: new SalesPaymentPostingMapper(executor, payment, invoiceNo)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: options.transactionOwner ?? "external"
  });
}

export async function postCreditNote(
  db: KyselySchema,
  executor: SalesPostingExecutor,
  creditNote: SalesCreditNotePostingData,
  options: SalesPostingOptions = {}
): Promise<PostingResult> {
  const postingRequest: PostingRequest = {
    doc_type: SALES_CREDIT_NOTE_DOC_TYPE,
    doc_id: creditNote.id,
    company_id: creditNote.company_id,
    outlet_id: creditNote.outlet_id
  };

  const postingService = new PostingService(
    new SalesPostingRepository(db, toMysqlDateTimeFromDateLike(creditNote.updated_at)),
    {
      [SALES_CREDIT_NOTE_DOC_TYPE]: new SalesCreditNotePostingMapper(executor, creditNote)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: options.transactionOwner ?? "external"
  });
}

export async function voidCreditNote(
  db: KyselySchema,
  executor: SalesPostingExecutor,
  creditNote: SalesCreditNotePostingData,
  options: SalesPostingOptions = {}
): Promise<PostingResult> {
  const postingRequest: PostingRequest = {
    doc_type: `${SALES_CREDIT_NOTE_DOC_TYPE}_VOID`,
    doc_id: creditNote.id,
    company_id: creditNote.company_id,
    outlet_id: creditNote.outlet_id
  };

  const postingService = new PostingService(
    new SalesPostingRepository(db, toMysqlDateTimeFromDateLike(creditNote.updated_at)),
    {
      [`${SALES_CREDIT_NOTE_DOC_TYPE}_VOID`]: new VoidCreditNotePostingMapper(executor, creditNote)
    }
  );

  return postingService.post(postingRequest, {
    transactionOwner: options.transactionOwner ?? "external"
  });
}

function toMysqlDateTime(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 19).replace("T", " ");
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value + " 00:00:00";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid datetime for toMysqlDateTime");
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toMysqlDateTimeFromDateLike(value: string): string {
  return toMysqlDateTime(value);
}
