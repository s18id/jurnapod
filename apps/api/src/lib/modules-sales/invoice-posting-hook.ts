// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Invoice Posting Hook Adapter
 * 
 * Implements InvoicePostingHook from modules-sales using sales-posting.ts.
 * This enables atomic journal posting within the invoice transaction.
 */

import { sql } from "kysely";
import type { Transaction } from "@jurnapod/db";
import type { InvoicePostingHook } from "@jurnapod/modules-sales";
import type { PostInvoiceInput, SalesInvoiceDetail } from "@jurnapod/modules-sales";
import type { PostingResult } from "@jurnapod/shared";
import { postSalesInvoiceToJournal } from "@/lib/sales-posting";
import type { KyselySchema } from "@/lib/db";
import type { QueryExecutor } from "@/lib/shared/common-utils";

interface SalesInvoiceRow {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  due_date?: string | null;
  status: string;
  payment_status: string;
  subtotal: string | number;
  discount_percent?: string | number | null;
  discount_fixed?: string | number | null;
  tax_amount: string | number;
  grand_total: string | number;
  paid_total: string | number;
  customer_id?: number | null;
  approved_by_user_id?: number | null;
  approved_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
}

interface SalesInvoiceLineRow {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
}

interface SalesInvoiceTaxRow {
  id: number;
  invoice_id: number;
  tax_rate_id: number;
  amount: string | number;
}

/**
 * Find invoice by ID using the transaction.
 */
async function findInvoiceByIdWithTx(
  tx: Transaction,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceRow | null> {
  const result = await sql`SELECT si.* FROM sales_invoices si
   WHERE si.company_id = ${companyId} AND si.id = ${invoiceId}
   LIMIT 1`.execute(tx as unknown as KyselySchema);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as SalesInvoiceRow;
}

/**
 * Find invoice lines using the transaction.
 */
async function findInvoiceLinesWithTx(
  tx: Transaction,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceLineRow[]> {
  const result = await sql`SELECT * FROM sales_invoice_lines
   WHERE company_id = ${companyId} AND invoice_id = ${invoiceId}
   ORDER BY line_no`.execute(tx as unknown as KyselySchema);

  return result.rows as SalesInvoiceLineRow[];
}

/**
 * Find invoice taxes using the transaction.
 */
async function findInvoiceTaxesWithTx(
  tx: Transaction,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceTaxRow[]> {
  const result = await sql`SELECT id, sales_invoice_id AS invoice_id, tax_rate_id, amount
   FROM sales_invoice_taxes
   WHERE company_id = ${companyId} AND sales_invoice_id = ${invoiceId}`.execute(tx as unknown as KyselySchema);

  return result.rows as SalesInvoiceTaxRow[];
}

/**
 * ApiInvoicePostingHook
 * 
 * Implements InvoicePostingHook for the API adapter.
 * Uses sales-posting.ts to post invoice journal entries atomically
 * within the invoice transaction.
 */
export class ApiInvoicePostingHook implements InvoicePostingHook {
  async postInvoiceToJournal(
    input: PostInvoiceInput,
    tx: Transaction
  ): Promise<PostingResult> {
    const invoiceId = input._invoiceId;
    const companyId = input._companyId;

    if (!invoiceId || !companyId) {
      throw new Error("InvoicePostingHook requires _invoiceId and _companyId in input");
    }

    // Query for the invoice using the live transaction
    const invoice = await findInvoiceByIdWithTx(tx, companyId, invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found for journal posting: companyId=${companyId}, invoiceId=${invoiceId}`);
    }

    // Query for lines and taxes
    const lines = await findInvoiceLinesWithTx(tx, companyId, invoiceId);
    const taxes = await findInvoiceTaxesWithTx(tx, companyId, invoiceId);

    // Build SalesInvoiceDetail from query results
    const invoiceDetail: SalesInvoiceDetail = {
      id: Number(invoice.id),
      company_id: Number(invoice.company_id),
      outlet_id: Number(invoice.outlet_id),
      invoice_no: invoice.invoice_no,
      client_ref: invoice.client_ref ?? undefined,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date ?? undefined,
      status: invoice.status as "DRAFT" | "APPROVED" | "POSTED" | "VOID",
      payment_status: invoice.payment_status as "UNPAID" | "PARTIAL" | "PAID",
      subtotal: Number(invoice.subtotal),
      discount_percent: invoice.discount_percent != null ? Number(invoice.discount_percent) : undefined,
      discount_fixed: invoice.discount_fixed != null ? Number(invoice.discount_fixed) : undefined,
      tax_amount: Number(invoice.tax_amount),
      grand_total: Number(invoice.grand_total),
      paid_total: Number(invoice.paid_total),
      customer_id: invoice.customer_id != null ? Number(invoice.customer_id) : undefined,
      approved_by_user_id: invoice.approved_by_user_id ? Number(invoice.approved_by_user_id) : undefined,
      approved_at: invoice.approved_at ?? undefined,
      created_by_user_id: invoice.created_by_user_id ? Number(invoice.created_by_user_id) : undefined,
      updated_by_user_id: invoice.updated_by_user_id ? Number(invoice.updated_by_user_id) : undefined,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
      lines: lines.map(l => ({
        id: Number(l.id),
        invoice_id: Number(l.invoice_id),
        line_no: Number(l.line_no),
        line_type: l.line_type,
        item_id: l.item_id !== null ? Number(l.item_id) : null,
        description: l.description,
        qty: Number(l.qty),
        unit_price: Number(l.unit_price),
        line_total: Number(l.line_total)
      })),
      taxes: taxes.map(t => ({
        id: Number(t.id),
        invoice_id: Number(t.invoice_id),
        tax_rate_id: Number(t.tax_rate_id),
        amount: Number(t.amount)
      }))
    };

    // Call sales-posting.ts with the transaction handle
    const postingResult = await postSalesInvoiceToJournal(
      tx as unknown as QueryExecutor,
      invoiceDetail
    );

    return postingResult;
  }
}
