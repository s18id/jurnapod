// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared purchasing flow helpers for integration tests.
 *
 * These use the API layer (fetch) to create test data through production API
 * endpoints. They are not package-level fixtures because they depend on the
 * HTTP server, auth tokens, and route-level validation.
 *
 * Usage:
 *   import { createSentPurchaseOrder, createPostedPurchaseInvoice } from '../../helpers/purchasing-flows';
 *
 *   const po = await createSentPurchaseOrder({
 *     baseUrl, token: ownerToken, supplierId,
 *     lines: [{ qty: '10', unit_price: '5000.00' }],
 *   });
 */

/**
 * Options for createSentPurchaseOrder.
 */
export interface CreateSentPOOpts {
  baseUrl: string;
  token: string;
  supplierId: number;
  /** PO line items. At minimum: qty and unit_price. Optional: item_id, tax_rate. */
  lines: Array<{ item_id?: number; qty: string; unit_price: string; tax_rate?: string }>;
  /** Order date in YYYY-MM-DD format (defaults to '2026-05-01'). */
  orderDate?: string;
  /** Optional tracking array — poId is pushed here for cleanup. */
  createdPOIds?: number[];
}

/**
 * Result of createSentPurchaseOrder.
 */
export interface SentPOResult {
  /** Purchase order ID. */
  poId: number;
  /** IDs of the PO lines created (same length as input lines). */
  lineIds: number[];
  /** Same as poId — convenience alias used by some callers. */
  orderId: number;
}

/**
 * Creates a purchase order via POST /api/purchasing/orders, then transitions it
 * to SENT status via PATCH /api/purchasing/orders/:id/status.
 *
 * Callers can use `createdPOIds.push(result.poId)` for cleanup tracking.
 */
export async function createSentPurchaseOrder(opts: CreateSentPOOpts): Promise<SentPOResult> {
  const { baseUrl, token, supplierId, lines, orderDate = '2026-05-01', createdPOIds } = opts;

  // Create PO
  const poRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      supplier_id: supplierId,
      order_date: orderDate,
      lines,
    }),
  });

  if (poRes.status !== 201) {
    const errBody = await poRes.text();
    throw new Error(
      `createSentPurchaseOrder expected 201 from POST orders, got ${poRes.status}: ${errBody}`
    );
  }

  const po = await poRes.json();
  if (po.data.status !== 'DRAFT') {
    throw new Error(`createSentPurchaseOrder expected DRAFT status, got ${po.data.status}`);
  }
  const poId: number = po.data.id;

  // Track for cleanup if requested
  if (createdPOIds) createdPOIds.push(poId);

  // Transition to SENT
  const statusRes = await fetch(`${baseUrl}/api/purchasing/orders/${poId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'SENT' }),
  });

  if (statusRes.status !== 200) {
    const errBody = await statusRes.text();
    throw new Error(
      `createSentPurchaseOrder expected 200 from PATCH orders/:id/status, got ${statusRes.status}: ${errBody}`
    );
  }

  const updatedPo = await statusRes.json();
  if (updatedPo.data.status !== 'SENT') {
    throw new Error(
      `createSentPurchaseOrder expected SENT status after transition, got ${updatedPo.data.status}`
    );
  }

  const lineIds: number[] = po.data.lines.map((l: any) => l.id);

  return { poId, lineIds, orderId: poId };
}

// =============================================================================
// createPostedPurchaseInvoice
// =============================================================================

/**
 * Options for createPostedPurchaseInvoice.
 */
export interface CreatePostedPIOpts {
  baseUrl: string;
  token: string;
  supplierId: number;
  /** Invoice number (tag). */
  invoiceNo: string;
  /** Invoice date in YYYY-MM-DD format (defaults to '2026-05-01'). */
  invoiceDate?: string;
  /** Currency code (defaults to 'IDR'). */
  currencyCode?: string;
  /**
   * Invoice lines. Must include at minimum description, qty, unit_price.
   * For service lines, add line_type: 'SERVICE'.
   * For PO-linked lines, add po_line_id.
   */
  lines: Array<{
    description: string;
    qty: string;
    unit_price: string;
    line_type?: string;
    po_line_id?: number;
  }>;
  /** Optional notes. */
  notes?: string;
}

/**
 * Creates a draft purchase invoice via POST /api/purchasing/invoices, then posts
 * it via POST /api/purchasing/invoices/:id/post.
 *
 * Returns the invoice ID.
 */
export async function createPostedPurchaseInvoice(
  opts: CreatePostedPIOpts
): Promise<number> {
  const {
    baseUrl,
    token,
    supplierId,
    invoiceNo,
    invoiceDate = '2026-04-01',
    currencyCode = 'IDR',
    lines,
    notes,
  } = opts;

  const body: Record<string, unknown> = {
    supplier_id: supplierId,
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    currency_code: currencyCode,
    lines,
  };
  if (notes !== undefined) body.notes = notes;

  const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (piRes.status !== 201) {
    const errBody = await piRes.text();
    throw new Error(
      `createPostedPurchaseInvoice expected 201 from POST invoices, got ${piRes.status}: ${errBody}`
    );
  }

  const pi = await piRes.json();
  const piId: number = pi.data.id;

  const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${piId}/post`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (postRes.status !== 200) {
    const errBody = await postRes.text();
    throw new Error(
      `createPostedPurchaseInvoice expected 200 from POST invoices/:id/post, got ${postRes.status}: ${errBody}`
    );
  }

  return piId;
}
