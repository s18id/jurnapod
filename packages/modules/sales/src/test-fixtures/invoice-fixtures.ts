// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import type { SalesInvoiceFixture } from "./types.js";
import { insertSalesInvoice } from "../services/invoice-db.js";

// Deterministic run ID for fixture code/name generation
const _runIdSeed = (Date.now() ^ (process.pid << 8) ^ (Number(process.env.VITEST_POOL_ID ?? 0) << 16)) & 0x7fffffff;
let _runIdCounter = _runIdSeed;

function makeRunId(): string {
  return (++_runIdCounter).toString(36);
}

export interface SalesInvoiceLineInput {
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
}

/**
 * Create a deterministic sales invoice fixture.
 *
 * Inserts a sales_invoices record with optional lines using the production
 * database path. Follows the same column conventions as InvoiceService.createInvoice().
 *
 * Defaults:
 *   - invoice_no: "SINV-{runId}"
 *   - invoice_date: "2099-12-31" (far-future, safe for as-of-date queries)
 *   - status: "POSTED"
 *   - payment_status: "UNPAID"
 *   - subtotal: computed from lines or defaults to totalAmount
 *   - tax_amount: 0
 *   - grand_total: subtotal + tax_amount
 *   - paid_total: 0
 *
 * @param db - KyselySchema database instance
 * @param opts - Invoice options
 * @returns Sales invoice fixture with id
 */
export async function createTestSalesInvoice(
  db: KyselySchema,
  opts: {
    companyId: number;
    outletId: number;
    customerId?: number;
    invoiceDate?: string;
    dueDate?: string;
    status?: string;
    paymentStatus?: string;
    totalAmount?: number;
    lines?: SalesInvoiceLineInput[];
  }
): Promise<SalesInvoiceFixture> {
  const runId = makeRunId();

  const invoiceNo = `SINV-${runId}`;
  const invoiceDate = opts.invoiceDate ?? "2099-12-31";
  const dueDate = opts.dueDate ?? "2020-01-01";
  const status = opts.status ?? "POSTED";
  const paymentStatus = opts.paymentStatus ?? "UNPAID";

  // Compute totals from lines or use totalAmount
  let subtotal: number;
  if (opts.lines && opts.lines.length > 0) {
    subtotal = opts.lines.reduce((sum, line) => {
      const qty = Number(line.qty);
      const unitPrice = Number(line.unit_price);
      return sum + Math.round(qty * unitPrice * 100) / 100;
    }, 0);
  } else if (opts.totalAmount !== undefined) {
    subtotal = opts.totalAmount;
  } else {
    subtotal = 0;
  }

  const taxAmount = 0;
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;

  // We must NOT set discount_percent or discount_fixed because the DB CHECK constraint
  // enforces grand_total = subtotal - discount_amounts + tax_amount.
  // When they are NULL, grand_total = subtotal + tax_amount (which our calculation satisfies).

  try {
    const invoiceId = await insertSalesInvoice(db, {
      companyId: opts.companyId,
      outletId: opts.outletId,
      invoiceNo,
      invoiceDate,
      dueDate,
      status,
      paymentStatus,
      subtotal,
      taxAmount,
      grandTotal,
      paidTotal: 0,
      customerId: opts.customerId ?? null,
    });

    // SELECT to get invoice_no (for return value)
    const invResult = await sql<{ id: number; invoice_no: string }>`
      SELECT id, invoice_no FROM sales_invoices
      WHERE company_id = ${opts.companyId} AND invoice_no = ${invoiceNo}
      LIMIT 1
    `.execute(db);

    if (invResult.rows.length === 0) {
      throw new Error("Failed to create sales invoice");
    }

    // Insert invoice lines if provided
    if (opts.lines && opts.lines.length > 0) {
      for (let i = 0; i < opts.lines.length; i++) {
        const line = opts.lines[i];
        const qty = Number(line.qty);
        const unitPrice = Number(line.unit_price);
        const lineTotal = Math.round(qty * unitPrice * 100) / 100;

        await sql`
          INSERT INTO sales_invoice_lines
            (invoice_id, company_id, outlet_id, line_no, line_type, item_id,
             description, qty, unit_price, line_total, created_at, updated_at)
          VALUES
            (${invoiceId}, ${opts.companyId}, ${opts.outletId}, ${i + 1}, 'SERVICE',
             ${line.item_id ?? null}, ${line.description}, ${qty}, ${unitPrice},
             ${lineTotal}, NOW(), NOW())
        `.execute(db);
      }
    }

    return {
      id: invoiceId,
      company_id: opts.companyId,
      outlet_id: opts.outletId,
      invoice_no: invResult.rows[0].invoice_no,
    };
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === "ER_DUP_ENTRY" || mysqlErr?.code === "ER_DUP_KEY") {
      const existing = await sql<{ id: number; invoice_no: string }>`
        SELECT id, invoice_no FROM sales_invoices
        WHERE company_id = ${opts.companyId} AND invoice_no = ${invoiceNo}
        LIMIT 1
      `.execute(db);
      if (existing.rows.length > 0) {
        return {
          id: Number(existing.rows[0].id),
          company_id: opts.companyId,
          outlet_id: opts.outletId,
          invoice_no: existing.rows[0].invoice_no,
        };
      }
    }
    throw error;
  }
}
