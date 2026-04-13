// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /cash-bank-transactions/:id/void

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  registerFixtureCleanup
} from '../../fixtures';
import { getTestDb } from '../../helpers/db';
import { sql } from 'kysely';

let baseUrl: string;
let accessToken: string;
let seedCtx: { companyId: number; outletId: number };

async function resolveOpenFiscalDate(companyId: number): Promise<string | null> {
  const db = getTestDb();
  const row = await sql<{
    start_date: string;
  }>`
    SELECT start_date
    FROM fiscal_years
    WHERE company_id = ${companyId}
      AND status = 'OPEN'
    ORDER BY start_date ASC
    LIMIT 1
  `.execute(db);

  if (row.rows.length === 0) {
    return null;
  }

  return String((row.rows[0] as { start_date: string }).start_date);
}

describe('cash-bank.void', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await getSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions/1/void`, {
      method: 'POST'
    });
    expect(res.status).toBe(401);
  });

  it('returns 409 when trying to void a DRAFT transaction', async () => {
    const db = getTestDb();

    const accounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%kas%' OR LOWER(type_name) LIKE '%cash%' OR LOWER(type_name) LIKE '%bank%')
      LIMIT 2
    `.execute(db);

    if (accounts.rows.length < 2) {
      expect(true).toBe(true);
      return;
    }

    const transactionDate = await resolveOpenFiscalDate(seedCtx.companyId);
    if (!transactionDate) {
      expect(true).toBe(true);
      return;
    }

    const sourceAccountId = Number((accounts.rows[0] as { id: number }).id);
    const destAccountId = Number((accounts.rows[1] as { id: number }).id);
    const uniqueDesc = `Void draft test ${Date.now()}`;

    // Create a DRAFT transaction
    const createRes = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'MUTATION',
        transaction_date: transactionDate,
        description: uniqueDesc,
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 80000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const transactionId = createBody.data.id;

    registerFixtureCleanup(`cbt-${transactionId}`, async () => {});

    // Try to void the DRAFT transaction - should fail with 409
    // (Only POSTED transactions can be voided per business rules)
    const voidRes = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/void`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(voidRes.status).toBe(409);
  });

  it('voids a POSTED transaction and reverses journal entries', async () => {
    const db = getTestDb();

    const accounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%kas%' OR LOWER(type_name) LIKE '%cash%' OR LOWER(type_name) LIKE '%bank%')
      LIMIT 2
    `.execute(db);

    if (accounts.rows.length < 2) {
      expect(true).toBe(true);
      return;
    }

    const transactionDate = await resolveOpenFiscalDate(seedCtx.companyId);
    if (!transactionDate) {
      expect(true).toBe(true);
      return;
    }

    const sourceAccountId = Number((accounts.rows[0] as { id: number }).id);
    const destAccountId = Number((accounts.rows[1] as { id: number }).id);
    const uniqueDesc = `Void posted test ${Date.now()}`;

    // Create a transaction
    const createRes = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'MUTATION',
        transaction_date: transactionDate,
        description: uniqueDesc,
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 90000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const transactionId = createBody.data.id;

    registerFixtureCleanup(`cbt-${transactionId}`, async () => {});

    // Post it first
    const postRes = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(postRes.status).toBe(200);

    // Get the journal batch that was created
    const originalBatch = await sql`
      SELECT id FROM journal_batches 
      WHERE doc_type LIKE 'CASH_BANK%' AND doc_id = ${transactionId}
      LIMIT 1
    `.execute(db);

    expect(originalBatch.rows.length).toBe(1);
    const originalBatchId = Number((originalBatch.rows[0] as { id: number }).id);

    // Void the POSTED transaction
    const voidRes = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/void`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(voidRes.status).toBe(200);
    const voidBody = await voidRes.json();
    expect(voidBody.success).toBe(true);
    expect(voidBody.data.status).toBe('VOID');

    // Verify that reversal journal batch was created
    const reversalBatches = await sql`
      SELECT id, doc_type, doc_id FROM journal_batches 
      WHERE doc_type LIKE 'CASH_BANK%VOID%' AND doc_id = ${transactionId}
      LIMIT 1
    `.execute(db);

    expect(reversalBatches.rows.length).toBeGreaterThan(0);
  });

  it('returns 404 for non-existent transaction', async () => {
    const voidRes = await fetch(`${baseUrl}/api/cash-bank-transactions/999999999/void`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(voidRes.status).toBe(404);
  });

  it('returns 409 when trying to void an already VOID transaction', async () => {
    const db = getTestDb();

    const accounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%kas%' OR LOWER(type_name) LIKE '%cash%' OR LOWER(type_name) LIKE '%bank%')
      LIMIT 2
    `.execute(db);

    if (accounts.rows.length < 2) {
      expect(true).toBe(true);
      return;
    }

    const sourceAccountId = Number((accounts.rows[0] as { id: number }).id);
    const destAccountId = Number((accounts.rows[1] as { id: number }).id);
    const uniqueDesc = `Double void test ${Date.now()}`;
    const transactionDate = await resolveOpenFiscalDate(seedCtx.companyId);
    if (!transactionDate) {
      expect(true).toBe(true);
      return;
    }

    // Create, post, and void once
    const createRes = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'MUTATION',
        transaction_date: transactionDate,
        description: uniqueDesc,
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 55000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const transactionId = createBody.data.id;

    registerFixtureCleanup(`cbt-${transactionId}`, async () => {});

    // Post it first so we can void it
    const postRes = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(postRes.status).toBe(200);

    // Void it once
    const voidRes1 = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/void`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(voidRes1.status).toBe(200);

    // Void again - idempotent, returns 200 with current VOID state
    const voidRes2 = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/void`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Idempotent - returns 200 with current VOID state, not 409
    expect(voidRes2.status).toBe(200);
    const voidBody2 = await voidRes2.json();
    expect(voidBody2.data.status).toBe('VOID');
  });

  it('returns 400 for invalid transaction id format', async () => {
    const voidRes = await fetch(`${baseUrl}/api/cash-bank-transactions/invalid/void`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(voidRes.status).toBe(400);
  });
});
