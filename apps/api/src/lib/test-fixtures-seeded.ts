// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Seeded fixtures — create posted documents with journal entries through
 * production posting flows. These fixtures ensure reconciliation and
 * reporting tests exercise the same code paths as production.
 *
 * Gap documented (createSeededSalesInvoice):
 *   The full production posting flow for sales invoices travels through
 *   InvoiceService.postInvoice() → InvoicePostingHook (API adapter) →
 *   sales-posting.ts (account mapping). The InvoicePostingHook requires
 *   API-layer implementations (Transaction, Kysely, etc.), making it
 *   unsuitable for package-level fixtures.
 *
 *   Instead, this fixture uses JournalsService.createManualEntry() with
 *   custom doc_type='SALES_INVOICE' and doc_id=<invoiceId>. The caller
 *   MUST provide the correct account IDs for AR and revenue.
 *
 *   This satisfies the "NO raw SQL INSERT for journal_batches/journal_lines"
 *   invariant — all journal entries go through the production JournalsService.
 */

import type { KyselySchema } from "@jurnapod/db";
import { JournalsService } from "@jurnapod/modules-accounting";
import {
  createTestCustomer,
  createTestSalesInvoice,
  type SalesInvoiceLineInput,
} from "@jurnapod/modules-sales/test-fixtures";

export interface SeededSalesInvoiceResult {
  customerId: number;
  invoiceId: number;
  journalBatchId: number;
  journalLineIds: number[];
}

/**
 * Create a sales invoice with balanced journal entries through the
 * production JournalsService.
 *
 * Creates:
 *   - A customer (via createTestCustomer from modules-sales)
 *   - A posted sales invoice (via createTestSalesInvoice from modules-sales)
 *   - A balanced journal batch with doc_type='SALES_INVOICE' linked to the invoice
 *
 * The journal batch has two lines:
 *   - Debit: AR account (totalAmount)
 *   - Credit: revenue account (totalAmount)
 *
 * @param db - KyselySchema database instance
 * @param opts - Configuration options
 * @param opts.companyId - Company ID (required)
 * @param opts.outletId - Outlet ID (required)
 * @param opts.arAccountId - AR account ID for debit line (required)
 * @param opts.revenueAccountId - Revenue account ID for credit line (required)
 * @param opts.customerCode - Customer code (deterministic default)
 * @param opts.customerName - Customer name (deterministic default)
 * @param opts.invoiceDate - Invoice date string (default: "2099-12-31")
 * @param opts.totalAmount - Invoice total amount (default: 500000)
 * @param opts.lines - Invoice lines (default: single SERVICE line)
 * @param opts.entryDate - Journal entry date (default: same as invoiceDate)
 * @returns SeededSalesInvoiceResult with all IDs
 */
export async function createSeededSalesInvoice(
  db: KyselySchema,
  opts: {
    companyId: number;
    outletId: number;
    arAccountId: number;
    revenueAccountId: number;
    customerCode?: string;
    customerName?: string;
    invoiceDate?: string;
    totalAmount?: number;
    lines?: SalesInvoiceLineInput[];
    entryDate?: string;
  }
): Promise<SeededSalesInvoiceResult> {
  const companyId = opts.companyId;
  const outletId = opts.outletId;
  const invoiceDate = opts.invoiceDate ?? "2099-12-31";
  const totalAmount = opts.totalAmount ?? 500000;
  const entryDate = opts.entryDate ?? invoiceDate;

  // 1. Create customer
  const customer = await createTestCustomer(db, {
    companyId,
    code: opts.customerCode,
    name: opts.customerName,
  });

  // 2. Create sales invoice via canonical fixture
  const invoice = await createTestSalesInvoice(db, {
    companyId,
    outletId,
    customerId: customer.id,
    invoiceDate,
    totalAmount,
    lines: opts.lines,
    status: "POSTED",
    paymentStatus: "UNPAID",
  });

  // 3. Create journal entries via production JournalsService
  //    Using custom doc_type='SALES_INVOICE' and doc_id=<invoiceId>
  const journalService = new JournalsService(db);
  const journalResult = await journalService.createManualEntry(
    {
      company_id: companyId,
      entry_date: entryDate,
      description: `Sales invoice ${invoice.invoice_no} posting (seeded fixture)`,
      lines: [
        {
          account_id: opts.arAccountId,
          debit: totalAmount,
          credit: 0,
          description: `AR debit for ${invoice.invoice_no}`,
        },
        {
          account_id: opts.revenueAccountId,
          debit: 0,
          credit: totalAmount,
          description: `Revenue credit for ${invoice.invoice_no}`,
        },
      ],
    },
    undefined, // userId
    undefined, // trx
    {
      docType: "SALES_INVOICE",
      docId: invoice.id,
    }
  );

  return {
    customerId: customer.id,
    invoiceId: invoice.id,
    journalBatchId: journalResult.id,
    journalLineIds: journalResult.lines.map((l) => l.id),
  };
}
