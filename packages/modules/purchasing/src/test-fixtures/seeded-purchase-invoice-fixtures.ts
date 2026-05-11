// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Seeded Purchase Invoice fixture — creates a fully posted purchase invoice
 * through the production PurchaseInvoiceService, producing journal_batches
 * and journal_lines via the production posting engine.
 *
 * This fixture wraps the three-step pattern:
 *   1. Create supplier via createSupplierFixture
 *   2. Create purchasing accounts via createPurchasingAccountsFixture
 *   3. Create draft PI via createTestPurchaseInvoice
 *   4. Post PI via PurchaseInvoiceService.postPI() (PRODUCTION PATH)
 *
 * The journal entries are created by the SAME posting engine used in
 * production — no raw SQL INSERT for journal_batches/journal_lines.
 */

import type { KyselySchema } from "@jurnapod/db";
import { PurchaseInvoiceService } from "../services/purchase-invoice-service.js";
import { createSupplierFixture } from "./supplier.js";
import { createPurchasingAccountsFixture } from "./purchasing-accounts.js";
import { createTestPurchaseInvoice } from "./purchase-invoice-fixtures.js";

/**
 * Result of createSeededPurchaseInvoice — all IDs needed by reconciliation tests.
 */
export interface SeededPurchaseInvoiceResult {
  supplierId: number;
  invoiceId: number;
  journalBatchId: number;
  journalLineIds: number[];
  apAccountId: number;
  expenseAccountId: number;
}

/**
 * Create a fully posted purchase invoice through the production posting flow.
 *
 * Creates:
 *   - A supplier
 *   - AP and expense accounts (configured in company_modules)
 *   - A draft purchase invoice
 *   - A posted purchase invoice with journal_batch + journal_lines
 *
 * @param db - KyselySchema database instance
 * @param opts - Configuration options
 * @param opts.companyId - Company ID (required)
 * @param opts.userId - User ID for posting (required)
 * @param opts.supplierCode - Supplier code (deterministic default: "SUP-{runId}")
 * @param opts.supplierName - Supplier name (deterministic default: "Test Supplier {runId}")
 * @param opts.invoiceNo - Invoice number (deterministic default: "PINV-{runId}")
 * @param opts.invoiceDate - Invoice date (default: new Date("2099-01-01"))
 * @param opts.currencyCode - Currency code (default: "IDR")
 * @param opts.lines - Line items (default: single ITEM line, qty=1, unitPrice=100000.0000)
 * @returns SeededPurchaseInvoiceResult with all IDs
 */
export async function createSeededPurchaseInvoice(
  db: KyselySchema,
  opts: {
    companyId: number;
    userId: number;
    supplierCode?: string;
    supplierName?: string;
    invoiceNo?: string;
    invoiceDate?: Date;
    currencyCode?: string;
    lines?: Array<{
      description: string;
      qty: string;
      unitPrice: string;
      lineType?: string;
    }>;
  }
): Promise<SeededPurchaseInvoiceResult> {
  const companyId = opts.companyId;

  // 1. Create purchasing accounts (AP + Expense) and configure company_modules
  const accounts = await createPurchasingAccountsFixture(db, { companyId });

  // 2. Create supplier
  const supplier = await createSupplierFixture(db, {
    companyId,
    code: opts.supplierCode,
    name: opts.supplierName,
    currency: opts.currencyCode ?? "IDR",
  });

  // 3. Create draft purchase invoice via canonical fixture
  const invoice = await createTestPurchaseInvoice(db, {
    companyId,
    userId: opts.userId,
    supplierId: supplier.id,
    invoiceNo: opts.invoiceNo,
    invoiceDate: opts.invoiceDate ?? new Date("2099-01-01"),
    currencyCode: opts.currencyCode ?? "IDR",
    lines: opts.lines ?? [
      {
        description: "Seeded purchase invoice test line",
        qty: "1",
        unitPrice: "100000.0000",
        lineType: "ITEM",
      },
    ],
  });

  // 4. Post the invoice via production PurchaseInvoiceService
  const piService = new PurchaseInvoiceService(db);
  const postResult = await piService.postPI({
    companyId,
    userId: opts.userId,
    piId: invoice.id,
    guardrailDecision: null,
    validOverrideReason: null,
  });

  // 5. Query the journal_lines to get their IDs
  const journalLines = await db
    .selectFrom("journal_lines")
    .where("journal_batch_id", "=", postResult.journal_batch_id)
    .where("company_id", "=", companyId)
    .select(["id"])
    .execute();

  return {
    supplierId: supplier.id,
    invoiceId: invoice.id,
    journalBatchId: postResult.journal_batch_id,
    journalLineIds: journalLines.map((l) => Number(l.id)),
    apAccountId: accounts.ap_account_id,
    expenseAccountId: accounts.expense_account_id,
  };
}
