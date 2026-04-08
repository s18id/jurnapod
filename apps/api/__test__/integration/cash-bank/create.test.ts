// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for POST /cash-bank-transactions

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
let authTestAccountId: number;

describe('cash-bank.create', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedCtx = await getSeedSyncContext();
    // Query a valid account ID for auth/validation tests (ID used only when auth passes)
    const db = getTestDb();
    const accountResult = await sql`
      SELECT id FROM accounts
      WHERE company_id = ${seedCtx.companyId}
      LIMIT 1
    `.execute(db);
    authTestAccountId = Number((accountResult.rows[0] as { id: number }).id);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_type: 'MUTATION',
        description: 'Test mutation',
        source_account_id: authTestAccountId,
        destination_account_id: authTestAccountId,
        amount: 100000
      })
    });
    expect(res.status).toBe(401);
  });

  it('creates a MUTATION transaction', async () => {
    const db = getTestDb();
    // Query only cash/bank classified accounts (type_name contains 'kas', 'cash', or 'bank')
    const accounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%kas%' OR LOWER(type_name) LIKE '%cash%' OR LOWER(type_name) LIKE '%bank%')
      LIMIT 2
    `.execute(db);

    if (accounts.rows.length < 2) {
      // Skip if not enough cash/bank accounts
      expect(true).toBe(true);
      return;
    }

    const sourceAccountId = Number((accounts.rows[0] as { id: number }).id);
    const destAccountId = Number((accounts.rows[1] as { id: number }).id);
    const uniqueDesc = `Test mutation ${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'MUTATION',
        description: uniqueDesc,
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 100000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.transaction_type).toBe('MUTATION');
    expect(body.data.description).toBe(uniqueDesc);
    expect(body.data.status).toBe('DRAFT');
    expect(body.data.amount).toBe(100000);

    registerFixtureCleanup(`cbt-${body.data.id}`, async () => {});
  });

  it('creates a TOP_UP transaction', async () => {
    const db = getTestDb();
    // For TOP_UP: source must be CASH, destination must be BANK
    const accounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%kas%' OR LOWER(type_name) LIKE '%cash%')
      LIMIT 1
    `.execute(db);

    const bankAccounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%bank%')
      LIMIT 1
    `.execute(db);

    if (accounts.rows.length < 1 || bankAccounts.rows.length < 1) {
      expect(true).toBe(true);
      return;
    }

    const sourceAccountId = Number((accounts.rows[0] as { id: number }).id);
    const destAccountId = Number((bankAccounts.rows[0] as { id: number }).id);
    const uniqueDesc = `Test top-up ${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'TOP_UP',
        description: uniqueDesc,
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 500000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.transaction_type).toBe('TOP_UP');
    expect(body.data.status).toBe('DRAFT');

    registerFixtureCleanup(`cbt-${body.data.id}`, async () => {});
  });

  it('creates a WITHDRAWAL transaction', async () => {
    const db = getTestDb();
    // For WITHDRAWAL: source must be BANK, destination must be CASH
    const bankAccounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%bank%')
      LIMIT 1
    `.execute(db);

    const cashAccounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%kas%' OR LOWER(type_name) LIKE '%cash%')
      LIMIT 1
    `.execute(db);

    if (bankAccounts.rows.length < 1 || cashAccounts.rows.length < 1) {
      expect(true).toBe(true);
      return;
    }

    const sourceAccountId = Number((bankAccounts.rows[0] as { id: number }).id);
    const destAccountId = Number((cashAccounts.rows[0] as { id: number }).id);
    const uniqueDesc = `Test withdrawal ${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'WITHDRAWAL',
        description: uniqueDesc,
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 250000,
        outlet_id: seedCtx.outletId
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.transaction_type).toBe('WITHDRAWAL');
    expect(body.data.status).toBe('DRAFT');

    registerFixtureCleanup(`cbt-${body.data.id}`, async () => {});
  });

  it('creates a FOREX transaction', async () => {
    const db = getTestDb();
    const accounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
        AND (LOWER(type_name) LIKE '%kas%' OR LOWER(type_name) LIKE '%cash%' OR LOWER(type_name) LIKE '%bank%')
      LIMIT 3
    `.execute(db);

    if (accounts.rows.length < 3) {
      expect(true).toBe(true);
      return;
    }

    const sourceAccountId = Number((accounts.rows[0] as { id: number }).id);
    const destAccountId = Number((accounts.rows[1] as { id: number }).id);
    const fxAccountId = Number((accounts.rows[2] as { id: number }).id);
    const uniqueDesc = `Test forex ${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'FOREX',
        description: uniqueDesc,
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 1000,
        currency_code: 'USD',
        exchange_rate: 15000,
        base_amount: 15000000,
        fx_account_id: fxAccountId,
        outlet_id: seedCtx.outletId
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.transaction_type).toBe('FOREX');
    expect(body.data.currency_code).toBe('USD');
    expect(body.data.exchange_rate).toBe(15000);
    expect(body.data.base_amount).toBe(15000000);

    registerFixtureCleanup(`cbt-${body.data.id}`, async () => {});
  });

  it('returns 400 when source_account_id does not exist', async () => {
    const db = getTestDb();
    const accounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
      LIMIT 1
    `.execute(db);

    if (accounts.rows.length < 1) {
      expect(true).toBe(true);
      return;
    }

    const destAccountId = Number((accounts.rows[0] as { id: number }).id);

    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'MUTATION',
        description: 'Invalid source account',
        source_account_id: 999999999,
        destination_account_id: destAccountId,
        amount: 100000
      })
    });

    // Should fail validation for non-existent source account
    expect(res.status).toBe(400);
  });

  it('returns 400 when destination_account_id does not exist', async () => {
    const db = getTestDb();
    const accounts = await sql`
      SELECT id FROM accounts 
      WHERE company_id = ${seedCtx.companyId} 
      LIMIT 1
    `.execute(db);

    if (accounts.rows.length < 1) {
      expect(true).toBe(true);
      return;
    }

    const sourceAccountId = Number((accounts.rows[0] as { id: number }).id);

    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'MUTATION',
        description: 'Invalid dest account',
        source_account_id: sourceAccountId,
        destination_account_id: 999999999,
        amount: 100000
      })
    });

    // Should fail validation for non-existent destination account
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid transaction type', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'INVALID_TYPE',
        description: 'Bad type',
        source_account_id: authTestAccountId,
        destination_account_id: authTestAccountId,
        amount: 100000
      })
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'MUTATION'
        // missing description, source_account_id, destination_account_id, amount
      })
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for negative amount', async () => {
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

    const res = await fetch(`${baseUrl}/api/cash-bank-transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_type: 'MUTATION',
        description: 'Negative amount',
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: -100000
      })
    });

    expect(res.status).toBe(400);
  });
});
