// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for purchasing/suppliers CRUD
// Tests GET /api/purchasing/suppliers, POST, PATCH, DELETE

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  getOrCreateTestCashierForPermission,
} from '../../fixtures';

// Deterministic code generator for constrained fields (max 20 chars)
function makeTag(prefix: string, counter: number): string {
  const worker = process.env.VITEST_POOL_ID ?? '0';
  return `${prefix}${worker}${String(counter).padStart(4, '0')}`.slice(0, 20);
}

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let cashierCompanyId: number;
let supTagCounter = 0;

describe('purchasing.suppliers', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierCompanyId = context.companyId;

    // Get or create a CASHIER user for permission tests
    // CASHIER has purchasing.suppliers = 0 (no permission)
    const cashier = await getOrCreateTestCashierForPermission(
      cashierCompanyId,
      process.env.JP_COMPANY_CODE ?? 'JP',
      baseUrl
    );
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    // Clean up suppliers created by this test
    try {
      const db = getTestDb();
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM supplier_contacts WHERE supplier_id IN (
        SELECT id FROM suppliers WHERE company_id = ${cashierCompanyId}
      )`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM suppliers WHERE company_id = ${cashierCompanyId}`.execute(db);
    } catch (e) {
      // ignore cleanup errors
    }
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // -------------------------------------------------------------------------
  // AC: 401 without authentication
  // -------------------------------------------------------------------------
  it('returns 401 when no auth token is provided', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers`);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // AC: 403 for CASHIER (no purchasing.suppliers permission)
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to list suppliers', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when CASHIER tries to create a supplier', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code: makeTag('SUP', ++supTagCounter),
        name: 'Should not create',
        currency: 'USD'
      })
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: POST creates supplier
  // -------------------------------------------------------------------------
  it('creates a supplier with minimal fields', async () => {
    const code = makeTag('SUPMIN', ++supTagCounter);
    const payload = {
      company_id: cashierCompanyId,
      code,
      name: 'Minimal Supplier',
      currency: 'USD'
    };

    const res = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(201);
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(result.data.code).toBe(code);
    expect(result.data.name).toBe('Minimal Supplier');
    expect(result.data.currency).toBe('USD');
    expect(result.data.credit_limit).toBe('0.0000');
    expect(result.data.is_active).toBe(true);
    expect(typeof result.data.id).toBe('number');
  });

  it('creates a supplier with all fields', async () => {
    const code = makeTag('SUPALL', ++supTagCounter);
    const payload = {
      company_id: cashierCompanyId,
      code,
      name: 'Full Supplier Corp',
      email: 'contact@supplier.example.com',
      phone: '+622112345678',
      address_line1: '123 Supplier St',
      address_line2: 'Suite 100',
      city: 'Jakarta',
      postal_code: '10110',
      country: 'Indonesia',
      currency: 'IDR',
      credit_limit: '50000000.0000',
      payment_terms_days: 30,
      notes: 'Important supplier'
    };

    const res = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(201);
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(result.data.code).toBe(code);
    expect(result.data.name).toBe('Full Supplier Corp');
    expect(result.data.email).toBe('contact@supplier.example.com');
    expect(result.data.phone).toBe('+622112345678');
    expect(result.data.address_line1).toBe('123 Supplier St');
    expect(result.data.address_line2).toBe('Suite 100');
    expect(result.data.city).toBe('Jakarta');
    expect(result.data.postal_code).toBe('10110');
    expect(result.data.country).toBe('Indonesia');
    expect(result.data.currency).toBe('IDR');
    expect(result.data.credit_limit).toBe('50000000.0000');
    expect(result.data.payment_terms_days).toBe(30);
    expect(result.data.notes).toBe('Important supplier');
  });

  // -------------------------------------------------------------------------
  // AC: Code uniqueness within company
  // -------------------------------------------------------------------------
  it('rejects duplicate code within the same company', async () => {
    const uniqueCode = makeTag('SUPDUP', ++supTagCounter);
    const payload = {
      company_id: cashierCompanyId,
      code: uniqueCode,
      name: 'First Supplier',
      currency: 'USD'
    };

    // Create first
    const first = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    expect(first.status).toBe(201);

    // Attempt duplicate
    const second = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, name: 'Second Supplier' })
    });
    expect(second.status).toBe(409);
    const err = await second.json();
    expect(err.success).toBe(false);
    expect(err.error.code).toBe('CONFLICT');
  });

  // -------------------------------------------------------------------------
  // AC: GET list and GET by id
  // -------------------------------------------------------------------------
  it('lists suppliers with pagination', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers?limit=5&offset=0`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data.suppliers)).toBe(true);
    expect(typeof result.data.total).toBe('number');
    expect(result.data.limit).toBe(5);
    expect(result.data.offset).toBe(0);
  });

  it('filters by is_active', async () => {
    // Create a supplier
    const code = makeTag('SUPACT', ++supTagCounter);
    const create = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        name: 'Active Filter Test',
        currency: 'USD'
      })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    const supplierId = created.data.id;

    // Deactivate via PATCH
    const deactivateRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false })
    });
    expect(deactivateRes.status).toBe(200);

    // Filter is_active=false with higher limit
    const inactiveRes = await fetch(`${baseUrl}/api/purchasing/suppliers?is_active=false&limit=100`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(inactiveRes.status).toBe(200);
    const inactiveResult = await inactiveRes.json();
    const found = inactiveResult.data.suppliers.find((s: any) => s.id === supplierId);
    expect(found).toBeDefined();
  });

  it('searches by name or code', async () => {
    const searchRes = await fetch(`${baseUrl}/api/purchasing/suppliers?search=Supplier`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(searchRes.status).toBe(200);
    const result = await searchRes.json();
    expect(Array.isArray(result.data.suppliers)).toBe(true);
  });

  it('gets supplier by id with contacts', async () => {
    // Create a supplier
    const code = makeTag('SUPGET', ++supTagCounter);
    const create = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        name: 'Get Test Supplier',
        currency: 'USD'
      })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    const supplierId = created.data.id;

    // Get by ID
    const getRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.success).toBe(true);
    expect(fetched.data.id).toBe(supplierId);
    expect(fetched.data.code).toBe(code);
    expect(Array.isArray(fetched.data.contacts)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // AC: PATCH updates allowed fields
  // -------------------------------------------------------------------------
  it('updates supplier fields via PATCH', async () => {
    // Create a supplier to update
    const code = makeTag('SUPUPD', ++supTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        name: 'Original Name',
        currency: 'USD',
        credit_limit: '1000'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const supplierId = created.data.id;

    // Update via PATCH
    const patchRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Name',
        email: 'updated@supplier.example.com',
        phone: '+6221900000000',
        city: 'Bandung',
        credit_limit: '5000.5',
        payment_terms_days: 45
      })
    });

    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.success).toBe(true);
    expect(updated.data.name).toBe('Updated Name');
    expect(updated.data.email).toBe('updated@supplier.example.com');
    expect(updated.data.phone).toBe('+6221900000000');
    expect(updated.data.city).toBe('Bandung');
    expect(updated.data.credit_limit).toBe('5000.5000');
    expect(updated.data.payment_terms_days).toBe(45);
    // Unchanged fields remain
    expect(updated.data.code).toBe(code);
    expect(updated.data.currency).toBe('USD');
  });

  it('returns 404 when updating non-existent supplier', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/999999`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ghost' })
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: DELETE soft-deletes (sets is_active = 0)
  // -------------------------------------------------------------------------
  it('soft-deletes supplier via DELETE', async () => {
    // Create a supplier to delete
    const code = makeTag('SUPDEL', ++supTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        name: 'To Be Deleted',
        currency: 'USD'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const supplierId = created.data.id;

    // Delete
    const delRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(delRes.status).toBe(200);

    // Verify it no longer appears in active list
    const listRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    const found = list.data.suppliers.find((s: any) => s.id === supplierId);
    expect(found).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // AC: Cannot create supplier for another company
  // -------------------------------------------------------------------------
  it('returns 403 when creating supplier for a different company', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: 99998,  // different company
        code: makeTag('SUPCROSS', ++supTagCounter),
        name: 'Cross Company',
        currency: 'USD'
      })
    });

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: CASHIER cannot update or delete
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to update a supplier', async () => {
    // Create a supplier first (as owner)
    const code = makeTag('SUPCUPD', ++supTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        name: 'Cashier Update Test',
        currency: 'USD'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const supplierId = created.data.id;

    // Attempt update as CASHIER
    const patchRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hijacked' })
    });
    expect(patchRes.status).toBe(403);

    // Cleanup
    await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
  });

  it('returns 403 when CASHIER tries to delete a supplier', async () => {
    const code = makeTag('SUPCDEL', ++supTagCounter);
    const createRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        name: 'Cashier Delete Test',
        currency: 'USD'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const supplierId = created.data.id;

    const delRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${cashierToken}` }
    });
    expect(delRes.status).toBe(403);

    // Cleanup
    await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
  });

  // -------------------------------------------------------------------------
  // AC: 404 when getting non-existent supplier
  // -------------------------------------------------------------------------
  it('returns 404 when getting a non-existent supplier', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/999999`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Full lifecycle
  // -------------------------------------------------------------------------
  it('full lifecycle: create → get → update → delete', async () => {
    const code = makeTag('SUPLIFE', ++supTagCounter);

    // 1. Create
    const createRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        name: 'Lifecycle Test Supplier',
        currency: 'EUR',
        credit_limit: '10000',
        payment_terms_days: 30
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const id = created.data.id;
    expect(created.data.credit_limit).toBe('10000.0000');
    expect(created.data.payment_terms_days).toBe(30);

    // 2. Get
    const getRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.data.id).toBe(id);
    expect(fetched.data.code).toBe(code);

    // 3. Update
    const patchRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'Berlin', payment_terms_days: 60 })
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.data.city).toBe('Berlin');
    expect(patched.data.payment_terms_days).toBe(60);

    // 4. Delete
    const delRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(delRes.status).toBe(200);

    // 5. Confirm deleted
    const getAfterDel = await fetch(`${baseUrl}/api/purchasing/suppliers/${id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getAfterDel.status).toBe(404);
  });
});
