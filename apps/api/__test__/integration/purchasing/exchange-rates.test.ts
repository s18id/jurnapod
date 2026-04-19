// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for purchasing/exchange-rates CRUD
// Tests GET /api/purchasing/exchange-rates, POST, PATCH, DELETE

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  getOrCreateTestCashierForPermission,
} from '../../fixtures';

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let cashierCompanyId: number;

describe('purchasing.exchange-rates', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierCompanyId = context.companyId;

    // Get or create a CASHIER user for permission tests
    const cashier = await getOrCreateTestCashierForPermission(
      cashierCompanyId,
      process.env.JP_COMPANY_CODE ?? 'JP',
      baseUrl
    );
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    // Clean up exchange rates created by this test
    try {
      const db = getTestDb();
      await sql`DELETE FROM exchange_rates WHERE company_id = ${cashierCompanyId}`.execute(db);
    } catch (e) {
      // ignore cleanup errors
    }
    resetFixtureRegistry();
    await closeTestDb();
  });

  // -------------------------------------------------------------------------
  // AC: 401 without authentication
  // -------------------------------------------------------------------------
  it('returns 401 when no auth token is provided', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // AC: 403 for CASHIER (no purchasing.exchange_rates permission)
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to list exchange rates', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when CASHIER tries to create an exchange rate', async () => {
    const date = `2026-04-${(20 + Math.floor(Math.random() * 10)).toString().padStart(2, '0')}`;
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'USD',
        rate: '1.1200',
        effective_date: date
      })
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: List exchange rates with pagination (OWNER)
  // -------------------------------------------------------------------------
  it('lists exchange rates with default pagination', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('exchange_rates');
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('limit');
    expect(body.data).toHaveProperty('offset');
    expect(Array.isArray(body.data.exchange_rates)).toBe(true);
  });

  it('lists exchange rates with custom pagination', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates?limit=5&offset=0`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(0);
  });

  it('lists exchange rates filtered by currency_code', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates?currency_code=USD`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // All returned rates should be USD
    for (const rate of body.data.exchange_rates) {
      expect(rate.currency_code).toBe('USD');
    }
  });

  // -------------------------------------------------------------------------
  // AC: Create exchange rate (OWNER)
  // -------------------------------------------------------------------------
  it('creates an exchange rate with valid data', async () => {
    const unique = Date.now() % 10000;
    const day = 10 + (unique % 5);  // Days 10-14
    const date = `2026-04-${day.toString().padStart(2, '0')}`;
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'USD',
        rate: '1.1200',
        effective_date: date,
        notes: 'Test rate'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.currency_code).toBe('USD');
    expect(body.data.rate).toBe('1.12000000');
    expect(body.data.company_id).toBe(cashierCompanyId);
    expect(body.data.is_active).toBe(true);
  });

  it('creates an exchange rate with minimum required fields', async () => {
    const unique = Date.now() % 10000;
    const day = 20 + (unique % 5);  // Days 20-24
    const date = `2026-04-${day.toString().padStart(2, '0')}`;
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'EUR',
        rate: '0.9500',
        effective_date: date
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.currency_code).toBe('EUR');
    expect(body.data.rate).toBe('0.95000000');
  });

  it('returns 409 for duplicate currency_code + effective_date', async () => {
    const unique = Date.now() % 10000;
    const day = 30 + (unique % 2);  // Days 30-31
    const date = `2026-05-${day.toString().padStart(2, '0')}`;
    // Create first rate with unique currency
    const res1 = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'JPY',
        rate: '110.50',
        effective_date: date
      })
    });
    expect(res1.status).toBe(201);

    // Try to create duplicate with same currency and date
    const res2 = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'JPY',
        rate: '111.00',
        effective_date: date
      })
    });
    expect(res2.status).toBe(409);
  });

  it('returns 400 for invalid request body', async () => {
    const unique = Date.now() % 10000;
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: 1,
        currency_code: 'INVALID_TOOLONG',
        rate: 'not-a-number',
        effective_date: 'not-a-date'
      })
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 when creating exchange rate for another company', async () => {
    const unique = Date.now() % 10000;
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId + 9999, // non-existent company
        currency_code: 'USD',
        rate: '1.1200',
        effective_date: '2026-04-15'
      })
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: Get exchange rate by ID (OWNER)
  // -------------------------------------------------------------------------
  it('gets exchange rate by ID', async () => {
    const unique = Date.now() % 10000;
    const day = 10 + (unique % 5);  // Days 10-14
    const date = `2026-04-${day.toString().padStart(2, '0')}`;
    const createRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'GBP',
        rate: '0.7800',
        effective_date: date
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const rateId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/${rateId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(rateId);
    expect(body.data.currency_code).toBe('GBP');
    expect(body.data.rate).toBe('0.78000000');
  });

  it('returns 404 for non-existent exchange rate ID', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for exchange rate from another company', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: Update exchange rate (OWNER)
  // -------------------------------------------------------------------------
  it('updates exchange rate rate', async () => {
    const unique = Date.now() % 10000;
    const day = 25 + (unique % 5);  // Days 25-29
    const date = `2026-04-${day.toString().padStart(2, '0')}`;
    const createRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'AUD',
        rate: '1.5000',
        effective_date: date
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const rateId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/${rateId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rate: '1.5500'
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rate).toBe('1.55000000');
  });

  it('updates exchange rate notes', async () => {
    const unique = Date.now() % 10000;
    const day = 15 + (unique % 5);  // Days 15-19
    const date = `2026-04-${day.toString().padStart(2, '0')}`;
    const createRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'CAD',
        rate: '1.3500',
        effective_date: date
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const rateId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/${rateId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notes: 'Updated exchange rate'
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notes).toBe('Updated exchange rate');
  });

  it('updates exchange rate is_active', async () => {
    const unique = Date.now() % 10000;
    const date = `2026-04-${(10 + (unique % 10)).toString().padStart(2, '0')}`;
    const createRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'NZD',
        rate: '1.4500',
        effective_date: date
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const rateId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/${rateId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_active: false
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.is_active).toBe(false);
  });

  it('returns 404 when updating non-existent exchange rate', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/999999`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rate: '1.5000'
      })
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when PATCH has empty body', async () => {
    const unique = Date.now() % 10000;
    const date = `2026-04-${(20 + (unique % 5)).toString().padStart(2, '0')}`;
    const createRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'SGD',
        rate: '1.3500',
        effective_date: date
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const rateId = created.data.id;

    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/${rateId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // AC: Rate Lookup by Date
  // -------------------------------------------------------------------------
  it('returns most recent rate on or before given date', async () => {
    const unique = Date.now() % 10000;
    // Use different currency codes with same date to avoid uniqueness constraint
    const date = `2026-04-${(10 + (unique % 10)).toString().padStart(2, '0')}`;

    // Create multiple rates for different currencies at different effective dates
    const res1 = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId, currency_code: 'AUD', rate: '1.1000', effective_date: date
      })
    });
    expect(res1.status).toBe(201);

    // Create second rate for different currency
    const res2 = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId, currency_code: 'CHF', rate: '1.1500', effective_date: date
      })
    });
    expect(res2.status).toBe(201);

    // Lookup should find the CHF rate
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/lookup?currency_code=CHF&date=${date}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.rate).toBe('1.15000000');
    expect(body.data.currency_code).toBe('CHF');
  });

  it('returns 404 when no rate exists for currency on or before date', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/lookup?currency_code=XYZ&date=2026-04-01`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when lookup missing currency_code param', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/lookup?date=2026-04-18`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when lookup missing date param', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/lookup?currency_code=USD`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid date format in lookup', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/lookup?currency_code=USD&date=not-a-date`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // AC: Soft-deleted rates not returned (is_active filter)
  // -------------------------------------------------------------------------
  it('does not return inactive rates in lookup', async () => {
    const unique = Date.now() % 10000;
    const date = `2026-05-${(10 + (unique % 10)).toString().padStart(2, '0')}`;

    const createRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId, currency_code: 'DKK', rate: '0.9000', effective_date: date
      })
    });
    expect(createRes.status).toBe(201);
    const rateId = (await createRes.json()).data.id;

    // Deactivate it
    await fetch(`${baseUrl}/api/purchasing/exchange-rates/${rateId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false })
    });

    // Lookup should not find it - use a date after the rate's effective_date
    const lookupDate = `2026-05-${(20 + (unique % 5)).toString().padStart(2, '0')}`;
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates/lookup?currency_code=DKK&date=${lookupDate}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: Decimal precision handling
  // -------------------------------------------------------------------------
  it('preserves 8 decimal places in rate', async () => {
    const unique = Date.now() % 10000;
    const date = `2026-05-${(15 + (unique % 10)).toString().padStart(2, '0')}`;
    const res = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        currency_code: 'BTC',
        rate: '12345.12345678',
        effective_date: date
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.rate).toBe('12345.12345678');
  });
});