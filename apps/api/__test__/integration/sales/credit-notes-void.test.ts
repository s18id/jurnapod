// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Idempotency test for sales credit note void - Story 52-10
// Voiding an already-voided credit note must return OK, not ERROR,
// and must not create duplicate financial effects.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  createTestItem,
} from '../../fixtures';
import { makeTag } from '../../helpers/tags';

let baseUrl: string;
let accessToken: string;
let outletId: number;
let companyId: number;
let itemCounter = 0;

describe('sales.credit-notes.void - idempotency', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);

    const seedCtx = await getSeedSyncContext();
    outletId = seedCtx.outletId;
    companyId = seedCtx.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it('voiding already-voided credit note is idempotent', async () => {
    // ── Step 1: Create a posted invoice ──────────────────────────────────
    const item = await createTestItem(companyId, {
      sku: makeTag('CNV', 16),
      name: 'Credit Note Void Test Item',
      type: 'PRODUCT',
    });

    const invoicePayload = {
      outlet_id: outletId,
      invoice_date: '2026-03-15',
      draft: true,
      lines: [
        {
          item_id: item.id,
          description: 'Invoice line for credit note void test',
          qty: 1,
          unit_price: 75000,
        },
      ],
    };

    const createInvoiceRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoicePayload),
    });
    expect(createInvoiceRes.status).toBe(201);
    const createdInvoice = await createInvoiceRes.json();
    const invoiceId = createdInvoice.data.id;

    const postInvoiceRes = await fetch(
      `${baseUrl}/api/sales/invoices/${invoiceId}/post`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    expect(postInvoiceRes.status).toBe(200);

    // ── Step 2: Create a credit note against the invoice ─────────────────
    const creditNotePayload = {
      outlet_id: outletId,
      invoice_id: invoiceId,
      credit_note_date: '2026-03-20',
      reason: 'Customer return for void test',
      amount: 75000,
      lines: [
        {
          description: 'Credit for returned item (void test)',
          qty: 1,
          unit_price: 75000,
        },
      ],
    };

    const createCNRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(creditNotePayload),
    });
    expect(createCNRes.status).toBe(201);
    const createdCN = await createCNRes.json();
    const creditNoteId = createdCN.data.id;
    expect(createdCN.data.status).toBe('DRAFT');

    // ── Step 3: Post the credit note ─────────────────────────────────────
    const postCNRes = await fetch(
      `${baseUrl}/api/sales/credit-notes/${creditNoteId}/post`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    expect(postCNRes.status).toBe(200);
    const postedCN = await postCNRes.json();
    expect(postedCN.data.status).toBe('POSTED');

    // ── Step 4: Void the credit note (first time) ────────────────────────
    const firstVoidRes = await fetch(
      `${baseUrl}/api/sales/credit-notes/${creditNoteId}/void`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    expect(firstVoidRes.status).toBe(200);
    const firstVoidCN = await firstVoidRes.json();
    expect(firstVoidCN.data.status).toBe('VOID');

    // ── Step 5: Void the same credit note again (idempotent replay) ──────
    const secondVoidRes = await fetch(
      `${baseUrl}/api/sales/credit-notes/${creditNoteId}/void`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    expect(secondVoidRes.status).toBe(200);
    const secondVoidCN = await secondVoidRes.json();
    expect(secondVoidCN.data.id).toBe(creditNoteId);
    expect(secondVoidCN.data.status).toBe('VOID');

    // ── Step 6: Verify financial effects ─────────────────────────────────
    const db = getTestDb();

    // No duplicate credit note record created.
    const cnRows = await sql<{ count: string }>`
      SELECT COUNT(*) AS count
      FROM sales_credit_notes
      WHERE company_id = ${companyId} AND id = ${creditNoteId}
    `.execute(db);
    expect(Number(cnRows.rows[0].count)).toBe(1);

    // Verify the credit note status is VOID in the DB (not silently reverted).
    const cnStatus = await sql<{ status: string }>`
      SELECT status
      FROM sales_credit_notes
      WHERE company_id = ${companyId} AND id = ${creditNoteId}
    `.execute(db);
    expect(cnStatus.rows[0].status).toBe('VOID');

    // No orphaned invoice paid_total from double-void.
    // The first void restores invoice paid_total. The second void must not
    // double-adjust it. Query the invoice to verify paid_total integrity.
    const invoiceData = await sql<{ paid_total: string }>`
      SELECT paid_total
      FROM sales_invoices
      WHERE company_id = ${companyId} AND id = ${invoiceId}
    `.execute(db);
    // After a single void of a fully-PAID credit note, paid_total should be
    // restored to the original invoice grand_total (paid_total went from
    // grand_total down to grand_total - credit_amount due to credit note post,
    // then back up to grand_total due to void).
    // An extra void would incorrectly push it above grand_total.
    const invoiceGrandTotal = createdInvoice.data.grand_total ?? 0;
    expect(Number(invoiceData.rows[0].paid_total)).toBe(Number(invoiceGrandTotal));
  });
});
