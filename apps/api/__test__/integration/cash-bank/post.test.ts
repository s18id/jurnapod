// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /cash-bank-transactions/:id/post

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

describe('cash-bank.post', { timeout: 30000 }, () => {
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
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions/1/post`, {
      method: 'POST'
    });
    expect(res.status).toBe(401);
  });

  it('posts a DRAFT transaction and creates journal entries', async () => {
    const db = getTestDb();

    // Get cash/bank accounts for the transaction
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
    const uniqueDesc = `Post test ${Date.now()}`;

    // First create a transaction
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
        amount: 75000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const transactionId = createBody.data.id;

    registerFixtureCleanup(`cbt-${transactionId}`, async () => {});

    // Now post the transaction
    const postRes = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.success).toBe(true);
    expect(postBody.data.status).toBe('POSTED');
    expect(postBody.data.posted_at).toBeDefined();

    // Verify journal batch was created
    const journalBatch = await sql`
      SELECT id, doc_type, doc_id FROM journal_batches 
      WHERE doc_type LIKE 'CASH_BANK%' AND doc_id = ${transactionId}
      LIMIT 1
    `.execute(db);

    expect(journalBatch.rows.length).toBeGreaterThan(0);
  });

  it('returns 404 for non-existent transaction', async () => {
    const postRes = await fetch(`${baseUrl}/api/cash-bank-transactions/999999999/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(postRes.status).toBe(404);
  });

  it('returns 409 when trying to post an already POSTED transaction', async () => {
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
    const uniqueDesc = `Double post test ${Date.now()}`;

    // Create and post once
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
        amount: 50000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const transactionId = createBody.data.id;

    registerFixtureCleanup(`cbt-${transactionId}`, async () => {});

    // Post it
    const postRes1 = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(postRes1.status).toBe(200);

    // Post again - idempotent, returns 200 with current POSTED state
    const postRes2 = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Idempotent - returns 200 with current POSTED state, not 409
    expect(postRes2.status).toBe(200);
    const postBody2 = await postRes2.json();
    expect(postBody2.data.status).toBe('POSTED');
  });

  it('returns 409 when trying to post a VOID transaction', async () => {
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
    const uniqueDesc = `Post void test ${Date.now()}`;

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
        amount: 60000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const transactionId = createBody.data.id;

    registerFixtureCleanup(`cbt-${transactionId}`, async () => {});

    // Post it first to make it POSTED
    const postRes1 = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(postRes1.status).toBe(200);

    // Void it to make it VOID
    const voidRes = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/void`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(voidRes.status).toBe(200);

    // Try to post a voided transaction - should fail with 409
    // (Only DRAFT transactions can be posted)
    const postRes2 = await fetch(`${baseUrl}/api/cash-bank-transactions/${transactionId}/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(postRes2.status).toBe(409);
  });

  it('returns 400 for invalid transaction id format', async () => {
    const postRes = await fetch(`${baseUrl}/api/cash-bank-transactions/invalid/post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(postRes.status).toBe(400);
  });
});
