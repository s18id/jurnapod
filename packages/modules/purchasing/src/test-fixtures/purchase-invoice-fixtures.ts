// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase invoice test fixtures for purchasing module.
 *
 * All fixture functions use the production PurchaseInvoiceService to create
 * domain-valid purchase invoices (never raw SQL). Deterministic defaults
 * ensure reproducible test data.
 */

import type { KyselySchema } from "@jurnapod/db";
import { PurchaseInvoiceService } from "../services/purchase-invoice-service.js";
import type { PurchaseInvoiceFixture } from "./types.js";

// Deterministic run ID for fixture code/name generation (matches API fixture behavior)
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

/**
 * Create a deterministic purchase invoice fixture via the production service.
 *
 * Creates a DRAFT purchase invoice with sensible defaults. The caller MAY
 * post the invoice separately using PurchaseInvoiceService.postPI() if a
 * POSTED invoice is required.
 *
 * @param db - KyselySchema database instance
 * @param opts - Purchase invoice options
 * @param opts.companyId - Company ID (required)
 * @param opts.userId - User ID for created_by_user_id (required)
 * @param opts.supplierId - Supplier ID (required)
 * @param opts.invoiceNo - Invoice number (deterministic default: PI-{runId})
 * @param opts.invoiceDate - Invoice date (default: 2099-01-01)
 * @param opts.dueDate - Due date (default: null)
 * @param opts.currencyCode - Currency code (default: "IDR")
 * @param opts.exchangeRate - Exchange rate (default: "1.00000000")
 * @param opts.notes - Notes (default: null)
 * @param opts.lines - Line items (default: single line with qty=1, unitPrice=100000.0000)
 * @returns PurchaseInvoiceFixture with id, company_id, supplier_id, invoice_no, etc.
 */
export async function createTestPurchaseInvoice(
  db: KyselySchema,
  opts: {
    companyId: number;
    userId: number;
    supplierId: number;
    invoiceNo?: string;
    invoiceDate?: Date;
    dueDate?: Date | null;
    currencyCode?: string;
    exchangeRate?: string;
    notes?: string | null;
    lines?: Array<{
      description: string;
      qty: string;
      unitPrice: string;
      lineType?: string;
    }>;
  }
): Promise<PurchaseInvoiceFixture> {
  const runId = makeRunId();

  const service = new PurchaseInvoiceService(db);

  const invoiceNo = opts.invoiceNo ?? `PI-${runId}`;
  const invoiceDate = opts.invoiceDate ?? new Date("2099-01-01");
  const currencyCode = opts.currencyCode ?? "IDR";
  const exchangeRate = opts.exchangeRate ?? "1.00000000";
  const defaultLines = opts.lines ?? [
    {
      description: "Test line item",
      qty: "1",
      unitPrice: "100000.0000",
      lineType: "ITEM",
    },
  ];

  const result = await service.createDraftPI({
    companyId: opts.companyId,
    userId: opts.userId,
    supplierId: opts.supplierId,
    invoiceNo,
    invoiceDate,
    dueDate: opts.dueDate ?? null,
    currencyCode,
    exchangeRate,
    notes: opts.notes ?? null,
    lines: defaultLines.map((l) => ({
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineType: (l.lineType ?? "ITEM") as "ITEM" | "SERVICE" | "FREIGHT" | "TAX" | "DISCOUNT",
    })),
  });

  return {
    id: result.id,
    company_id: result.company_id,
    supplier_id: result.supplier_id,
    supplier_name: result.supplier_name,
    invoice_no: result.invoice_no,
    invoice_date: result.invoice_date,
    due_date: result.due_date,
    status: result.status,
    currency_code: result.currency_code,
    exchange_rate: result.exchange_rate,
    grand_total: result.grand_total,
    subtotal: result.subtotal,
    tax_amount: result.tax_amount,
  };
}
