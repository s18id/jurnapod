// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Payment Posting Hook Adapter
 * 
 * Implements PaymentPostingHook from modules-sales using sales-posting.ts.
 * This enables atomic journal posting within the payment transaction.
 */

import { sql } from "kysely";
import type { Transaction } from "@jurnapod/db";
import type { PaymentPostingHook } from "@jurnapod/modules-sales";
import type { PostPaymentInput, SalesPayment, SalesPaymentSplit } from "@jurnapod/modules-sales";
import type { PostingResult } from "@jurnapod/shared";
import { postSalesPaymentToJournal } from "@/lib/sales-posting";
import type { KyselySchema } from "@/lib/db";
import type { QueryExecutor } from "@/lib/shared/common-utils";

/**
 * Find payment by ID using the transaction.
 */
async function findPaymentByIdWithTx(
  tx: Transaction,
  companyId: number,
  paymentId: number
): Promise<SalesPayment | null> {
  const result = await sql`SELECT sp.id, sp.company_id, sp.outlet_id, sp.invoice_id, sp.payment_no, sp.client_ref, sp.payment_at,
          sp.account_id, a.name as account_name, sp.method, sp.status,
          sp.amount, sp.invoice_amount_idr, sp.payment_amount_idr, sp.payment_delta_idr,
          sp.shortfall_settled_as_loss, sp.shortfall_reason, sp.shortfall_settled_by_user_id, sp.shortfall_settled_at,
          sp.fx_acknowledged_at, sp.fx_acknowledged_by,
          sp.created_by_user_id, sp.updated_by_user_id, sp.created_at, sp.updated_at
   FROM sales_payments sp
   LEFT JOIN accounts a ON a.id = sp.account_id AND a.company_id = sp.company_id
   WHERE sp.company_id = ${companyId}
     AND sp.id = ${paymentId}
   LIMIT 1`.execute(tx as unknown as KyselySchema);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as {
    id: number;
    company_id: number;
    outlet_id: number;
    invoice_id: number;
    payment_no: string;
    client_ref?: string | null;
    payment_at: string;
    account_id: number;
    account_name?: string | null;
    method?: string | null;
    status: string;
    amount: string | number;
    actual_amount_idr?: string | number | null;
    invoice_amount_idr?: string | number | null;
    payment_amount_idr?: string | number | null;
    payment_delta_idr?: string | number | null;
    shortfall_settled_as_loss?: number | null;
    shortfall_reason?: string | null;
    shortfall_settled_by_user_id?: number | null;
    shortfall_settled_at?: string | null;
    fx_acknowledged_at?: string | null;
    fx_acknowledged_by?: number | null;
    created_by_user_id?: number | null;
    updated_by_user_id?: number | null;
    created_at: string;
    updated_at: string;
  };

  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    invoice_id: Number(row.invoice_id),
    payment_no: row.payment_no,
    client_ref: row.client_ref ?? undefined,
    payment_at: row.payment_at,
    account_id: Number(row.account_id),
    account_name: row.account_name ?? undefined,
    method: (row.method ?? undefined) as "CASH" | "QRIS" | "CARD" | null ?? undefined,
    status: row.status as "DRAFT" | "POSTED" | "VOID",
    amount: Number(row.amount),
    actual_amount_idr: row.actual_amount_idr !== undefined && row.actual_amount_idr !== null ? Number(row.actual_amount_idr) : undefined,
    invoice_amount_idr: row.invoice_amount_idr !== undefined && row.invoice_amount_idr !== null ? Number(row.invoice_amount_idr) : undefined,
    payment_amount_idr: row.payment_amount_idr !== undefined && row.payment_amount_idr !== null ? Number(row.payment_amount_idr) : undefined,
    payment_delta_idr: row.payment_delta_idr !== undefined ? Number(row.payment_delta_idr) : undefined,
    shortfall_settled_as_loss: row.shortfall_settled_as_loss === 1 ? true : row.shortfall_settled_as_loss === 0 ? false : undefined,
    shortfall_reason: row.shortfall_reason ?? undefined,
    shortfall_settled_by_user_id: row.shortfall_settled_by_user_id ? Number(row.shortfall_settled_by_user_id) : undefined,
    shortfall_settled_at: row.shortfall_settled_at ?? undefined,
    fx_acknowledged_at: row.fx_acknowledged_at ?? undefined,
    fx_acknowledged_by: row.fx_acknowledged_by ? Number(row.fx_acknowledged_by) : undefined,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : undefined,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Find payment splits using the transaction.
 */
async function findPaymentSplitsWithTx(
  tx: Transaction,
  companyId: number,
  paymentId: number
): Promise<SalesPaymentSplit[]> {
  const result = await sql`SELECT sps.id, sps.payment_id, sps.company_id, sps.outlet_id, sps.split_index,
          sps.account_id, a.name as account_name, sps.amount
   FROM sales_payment_splits sps
   LEFT JOIN accounts a ON a.id = sps.account_id AND a.company_id = sps.company_id
   WHERE sps.company_id = ${companyId}
     AND sps.payment_id = ${paymentId}
   ORDER BY sps.split_index`.execute(tx as unknown as KyselySchema);

  return (result.rows as Array<{
    id: number;
    payment_id: number;
    company_id: number;
    outlet_id: number;
    split_index: number;
    account_id: number;
    account_name?: string | null;
    amount: string | number;
  }>).map(row => ({
    id: Number(row.id),
    payment_id: Number(row.payment_id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    split_index: Number(row.split_index),
    account_id: Number(row.account_id),
    account_name: row.account_name ?? undefined,
    amount: Number(row.amount)
  }));
}

/**
 * Find invoice number by ID using the transaction.
 */
async function findInvoiceNoWithTx(
  tx: Transaction,
  companyId: number,
  invoiceId: number
): Promise<string | null> {
  const result = await sql`SELECT invoice_no FROM sales_invoices
   WHERE company_id = ${companyId} AND id = ${invoiceId}
   LIMIT 1`.execute(tx as unknown as KyselySchema);

  if (result.rows.length === 0) {
    return null;
  }

  return (result.rows[0] as { invoice_no: string }).invoice_no;
}

/**
 * ApiPaymentPostingHook
 * 
 * Implements PaymentPostingHook for the API adapter.
 * Uses sales-posting.ts to post payment journal entries atomically
 * within the payment transaction.
 */
export class ApiPaymentPostingHook implements PaymentPostingHook {
  async postPaymentToJournal(
    input: PostPaymentInput,
    tx: Transaction
  ): Promise<PostingResult> {
    // Extract internal IDs that were set by PaymentService
    const paymentId = input._paymentId;
    const companyId = input._companyId;
    const invoiceId = input._invoiceId;

    if (!paymentId || !companyId || !invoiceId) {
      throw new Error("PaymentPostingHook requires _paymentId, _companyId, and _invoiceId in input");
    }

    // Query for the payment using the live transaction
    const payment = await findPaymentByIdWithTx(tx, companyId, paymentId);
    if (!payment) {
      throw new Error("Payment not found for journal posting");
    }

    // Query for the invoice number
    const invoiceNo = await findInvoiceNoWithTx(tx, companyId, invoiceId);
    if (!invoiceNo) {
      throw new Error("Invoice not found for journal posting");
    }

    // Query for payment splits if any
    const splits = await findPaymentSplitsWithTx(tx, companyId, paymentId);
    if (splits.length > 0) {
      payment.splits = splits;
    }

    // Call sales-posting.ts with the transaction handle
    // The transaction is passed as QueryExecutor (KyselySchema compatible)
    return postSalesPaymentToJournal(
      tx as unknown as QueryExecutor,
      payment,
      invoiceNo
    );
  }
}
