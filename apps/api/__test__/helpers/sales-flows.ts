// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared sales flow helpers for integration tests.
 *
 * These use the API layer (fetch) to create test data through production API
 * endpoints. They are not package-level fixtures because they depend on the
 * HTTP server, auth tokens, and route-level validation.
 *
 * Usage:
 *   import { createPostedInvoice, createAndPostPayment, createCustomerForSales } from '../../helpers/sales-flows';
 *
 *   const invoice = await createPostedInvoice({
 *     baseUrl, token, outletId, amount: 500000,
 *   });
 */

// =============================================================================
// createPostedInvoice
// =============================================================================

export interface CreatePostedInvoiceOpts {
  baseUrl: string;
  token: string;
  outletId: number;
  /** Pre-existing customer ID for the invoice. */
  customerId: number;
  /** Invoice amount (unit_price * qty=1). */
  amount: number;
  /** Invoice date in YYYY-MM-DD format (defaults to '2026-05-20'). */
  invoiceDate?: string;
  /** Optional custom invoice_no (defaults to auto-generated tag). */
  invoiceNo?: string;
  /** Optional line description (defaults to 'Test invoice'). */
  description?: string;
}

export interface PostedInvoiceResult {
  id: number;
  invoice_no: string;
}

/**
 * Creates and auto-posts a sales invoice via POST /api/sales/invoices.
 *
 * The invoice is created with a single line item (qty=1, unit_price=amount).
 * Auto-posting happens because `draft` is not set.
 *
 * Requires a pre-existing customer (caller must create customer first).
 *
 * Returns { id, invoice_no }.
 */
export async function createPostedInvoice(
  opts: CreatePostedInvoiceOpts
): Promise<PostedInvoiceResult> {
  const {
    baseUrl,
    token,
    outletId,
    customerId,
    amount,
    invoiceDate = '2026-05-20',
    invoiceNo,
    description = 'Test invoice',
  } = opts;

  const effectiveInvoiceNo =
    invoiceNo ?? `INV${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  const res = await fetch(`${baseUrl}/api/sales/invoices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outlet_id: outletId,
      customer_id: customerId,
      client_ref: crypto.randomUUID(),
      invoice_no: effectiveInvoiceNo,
      invoice_date: invoiceDate,
      lines: [{ description, qty: 1, unit_price: amount }],
    }),
  });

  if (res.status !== 201) {
    throw new Error(
      `createPostedInvoice expected 201, got ${res.status}: ${await res.text()}`
    );
  }

  const body = (await res.json()) as {
    success: boolean;
    data: { id: number; status: string; invoice_no?: string };
  };

  if (!body.success) {
    throw new Error(`createPostedInvoice: POST failed — ${JSON.stringify(body)}`);
  }

  return { id: body.data.id, invoice_no: body.data.invoice_no ?? effectiveInvoiceNo };
}

// =============================================================================
// createAndPostPayment
// =============================================================================

export interface CreateAndPostPaymentOpts {
  baseUrl: string;
  token: string;
  outletId: number;
  invoiceId: number;
  accountId: number;
  amount: number;
  /** Payment date + time in ISO format (defaults to 2026-05-21T10:00:00Z). */
  paymentAt?: string;
  /** Payment method (defaults to 'CASH'). */
  method?: string;
}

export interface PostedPaymentResult {
  id: number;
  payment_no: string;
}

/**
 * Creates a draft payment via POST /api/sales/payments, then posts it via
 * POST /api/sales/payments/:id/post.
 *
 * Returns { id, payment_no }.
 */
export async function createAndPostPayment(
  opts: CreateAndPostPaymentOpts
): Promise<PostedPaymentResult> {
  const {
    baseUrl,
    token,
    outletId,
    invoiceId,
    accountId,
    amount,
    paymentAt = '2026-05-21T10:00:00Z',
    method = 'CASH',
  } = opts;

  const paymentNo = `PAY${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  // Create draft payment
  const createRes = await fetch(`${baseUrl}/api/sales/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outlet_id: outletId,
      invoice_id: invoiceId,
      client_ref: crypto.randomUUID(),
      payment_no: paymentNo,
      payment_at: paymentAt,
      account_id: accountId,
      method,
      amount,
    }),
  });

  if (createRes.status !== 201) {
    throw new Error(
      `createAndPostPayment create expected 201, got ${createRes.status}: ${await createRes.text()}`
    );
  }

  const createBody = (await createRes.json()) as {
    data: { id: number; status: string };
  };

  if (createBody.data.status !== 'DRAFT') {
    throw new Error(
      `createAndPostPayment expected DRAFT status, got ${createBody.data.status}`
    );
  }

  const paymentId = createBody.data.id;

  // Post the payment
  const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (postRes.status !== 200) {
    throw new Error(
      `createAndPostPayment post expected 200, got ${postRes.status}: ${await postRes.text()}`
    );
  }

  const postBody = (await postRes.json()) as {
    data: { id: number; status: string };
  };

  if (postBody.data.status !== 'POSTED') {
    throw new Error(
      `createAndPostPayment expected POSTED status after post, got ${postBody.data.status}`
    );
  }

  return { id: paymentId, payment_no: paymentNo };
}
