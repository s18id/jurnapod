// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Standalone invoice DB functions extracted from the API layer's
 * ApiSalesDbExecutor for reuse by test fixtures and direct consumers.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

export interface InsertSalesInvoiceInput {
  companyId: number;
  outletId: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  paidTotal: number;
  customerId?: number | null;
  clientRef?: string;
  discountPercent?: number | null;
  discountFixed?: number | null;
  createdByUserId?: number;
}

/**
 * Insert a sales invoice row directly.
 *
 * Extracted from ApiSalesDbExecutor.insertInvoice() — uses the same
 * `sql` template INSERT pattern as the production DB executor.
 *
 * @param db - KyselySchema database instance
 * @param input - Invoice data
 * @returns Inserted invoice ID
 */
export async function insertSalesInvoice(
  db: KyselySchema,
  input: InsertSalesInvoiceInput
): Promise<number> {
  const result = await sql`INSERT INTO sales_invoices (
      company_id,
      outlet_id,
      invoice_no,
      invoice_date,
      due_date,
      client_ref,
      status,
      payment_status,
      subtotal,
      discount_percent,
      discount_fixed,
      tax_amount,
      grand_total,
      paid_total,
      customer_id,
      created_by_user_id,
      updated_by_user_id
    ) VALUES (
      ${input.companyId},
      ${input.outletId},
      ${input.invoiceNo},
      ${input.invoiceDate},
      ${input.dueDate},
      ${input.clientRef ?? null},
      ${input.status},
      ${input.paymentStatus},
      ${input.subtotal},
      ${input.discountPercent ?? null},
      ${input.discountFixed ?? null},
      ${input.taxAmount},
      ${input.grandTotal},
      ${input.paidTotal},
      ${input.customerId ?? null},
      ${input.createdByUserId ?? null},
      ${input.createdByUserId ?? null}
    )`.execute(db);
  return Number(result.insertId);
}
