import { PostingService, type PostingMapper, type PostingRepository } from "@jurnapod/core";
import type { JournalLine, PostingRequest, PostingResult } from "@jurnapod/shared";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import type { SalesInvoiceDetail, SalesPayment } from "./sales";

const SALES_INVOICE_DOC_TYPE = "SALES_INVOICE";
const SALES_PAYMENT_IN_DOC_TYPE = "SALES_PAYMENT_IN";

const OUTLET_ACCOUNT_MAPPING_KEYS = ["SALES_REVENUE", "SALES_TAX", "AR"] as const;
type OutletAccountMappingKey = (typeof OUTLET_ACCOUNT_MAPPING_KEYS)[number];
type OutletAccountMapping = Record<OutletAccountMappingKey, number>;

export const OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE = "OUTLET_ACCOUNT_MAPPING_MISSING";
export const OUTLET_PAYMENT_MAPPING_MISSING_MESSAGE = "OUTLET_PAYMENT_MAPPING_MISSING";
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

async function readOutletAccountMappingByKey(
  dbExecutor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<OutletAccountMapping> {
  const placeholders = OUTLET_ACCOUNT_MAPPING_KEYS.map(() => "?").join(", ");
  const [rows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [companyId, outletId, ...OUTLET_ACCOUNT_MAPPING_KEYS]
  );

  const accountByKey = new Map<OutletAccountMappingKey, number>();
  for (const row of rows as Array<{ mapping_key?: string; account_id?: number }>) {
    if (typeof row.mapping_key !== "string" || !Number.isFinite(row.account_id)) {
      continue;
    }

    if (!OUTLET_ACCOUNT_MAPPING_KEYS.includes(row.mapping_key as OutletAccountMappingKey)) {
      continue;
    }

    accountByKey.set(row.mapping_key as OutletAccountMappingKey, Number(row.account_id));
  }

  const missingKeys = OUTLET_ACCOUNT_MAPPING_KEYS.filter((key) => !accountByKey.has(key));
  if (missingKeys.length > 0) {
    throw new Error(OUTLET_ACCOUNT_MAPPING_MISSING_MESSAGE);
  }

  return {
    SALES_REVENUE: accountByKey.get("SALES_REVENUE") as number,
    SALES_TAX: accountByKey.get("SALES_TAX") as number,
    AR: accountByKey.get("AR") as number
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
  const placeholders = fallbackKeys.map(() => "?").join(", ");
  const [fallbackRows] = await dbExecutor.execute<RowDataPacket[]>(
    `SELECT mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [companyId, outletId, ...fallbackKeys]
  );

  for (const row of fallbackRows as Array<{ mapping_key?: string; account_id?: number }>) {
    if (!row.mapping_key || !Number.isFinite(row.account_id)) {
      continue;
    }
    const methodCode = normalizePaymentMethodCode(String(row.mapping_key));
    if (!accountByMethod.has(methodCode)) {
      accountByMethod.set(methodCode, Number(row.account_id));
    }
  }

  return accountByMethod;
}

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

    if (this.invoice.tax_amount > 0) {
      lines.push({
        account_id: mapping.SALES_TAX,
        debit: 0,
        credit: normalizeMoney(this.invoice.tax_amount),
        description: `Invoice ${this.invoice.invoice_no} - Tax`
      });
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

    // Use account_id directly from payment
    const cashBankAccountId = this.payment.account_id;
    const accountLabel = this.payment.account_name ?? `Account #${cashBankAccountId}`;

    const lines: JournalLine[] = [];

    lines.push({
      account_id: cashBankAccountId,
      debit: normalizeMoney(this.payment.amount),
      credit: 0,
      description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - ${accountLabel}`
    });

    lines.push({
      account_id: mapping.AR,
      debit: 0,
      credit: normalizeMoney(this.payment.amount),
      description: `Payment ${this.payment.payment_no} for Invoice ${this.invoiceNo} - AR`
    });

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

function toMysqlDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid datetime");
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

export async function postSalesInvoiceToJournal(
  dbExecutor: QueryExecutor,
  invoice: SalesInvoiceDetail
): Promise<PostingResult> {
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
