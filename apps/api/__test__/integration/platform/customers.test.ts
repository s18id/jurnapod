// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for platform/customers CRUD
// Tests GET /api/platform/customers, POST, PATCH, DELETE

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
  getOrCreateTestCashierForPermission
} from '../../fixtures';

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let cashierCompanyId: number;
let companyCode: string;

describe('platform.customers', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierCompanyId = context.companyId;
    companyCode = process.env.JP_COMPANY_CODE ?? 'JP';

    // Get or create a CASHIER user for permission tests
    // CASHIER has platform.customers = 0 (no permission)
    const cashier = await getOrCreateTestCashierForPermission(
      cashierCompanyId,
      companyCode,
      baseUrl
    );
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // -------------------------------------------------------------------------
  // AC: 401 without authentication
  // -------------------------------------------------------------------------
  it('returns 401 when no auth token is provided', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers`);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // AC: 403 for CASHIER (no platform.customers permission)
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to list customers', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when CASHIER tries to create a customer', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code: `TEMP-${makeTag('TMP', 16)}`,
        type: 'PERSON',
        display_name: 'Should not create'
      })
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: POST creates customer with unique code
  // -------------------------------------------------------------------------
  it('creates a PERSON customer with minimal fields', async () => {
    const code = `CUST-P-${makeTag('CP', 20)}`;
    const payload = {
      company_id: cashierCompanyId,
      code,
      type: 'PERSON',
      display_name: 'John Doe'
    };

    const res = await fetch(`${baseUrl}/api/platform/customers`, {
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
    expect(result.data.type).toBe('PERSON');
    expect(result.data.display_name).toBe('John Doe');
    expect(result.data.company_name).toBeNull();
    expect(result.data.is_active).toBe(true);
    expect(typeof result.data.id).toBe('number');
  });

  it('creates a BUSINESS customer with company_name', async () => {
    const code = `CUST-B-${makeTag('CB', 20)}`;
    const payload = {
      company_id: cashierCompanyId,
      code,
      type: 'BUSINESS',
      display_name: 'Acme Corp',
      company_name: 'Acme Corporation',
      tax_id: '12.345.678.9-001.000',
      email: 'billing@acme.example.com',
      phone: '+622112345678'
    };

    const res = await fetch(`${baseUrl}/api/platform/customers`, {
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
    expect(result.data.type).toBe('BUSINESS');
    expect(result.data.company_name).toBe('Acme Corporation');
    expect(result.data.tax_id).toBe('12.345.678.9-001.000');
    expect(result.data.email).toBe('billing@acme.example.com');
    expect(result.data.phone).toBe('+622112345678');
  });

  // -------------------------------------------------------------------------
  // AC: Code uniqueness — active codes cannot be duplicated
  // -------------------------------------------------------------------------
  it('rejects duplicate code within the same company', async () => {
    const uniqueCode = `CUST-DUP-${makeTag('DUP', 20)}`;
    const payload = {
      company_id: cashierCompanyId,
      code: uniqueCode,
      type: 'PERSON',
      display_name: 'First Customer'
    };

    // Create first
    const first = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    expect(first.status).toBe(201);

    // Attempt duplicate
    const second = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, display_name: 'Second Customer' })
    });
    expect(second.status).toBe(409);
    const err = await second.json();
    expect(err.success).toBe(false);
    expect(err.error.code).toBe('CONFLICT');
  });

  // -------------------------------------------------------------------------
  // AC: BUSINESS type requires company_name
  // -------------------------------------------------------------------------
  it('rejects BUSINESS customer without company_name', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code: `CUST-NOBN-${makeTag('NOBN', 16)}`,
        type: 'BUSINESS',
        display_name: 'No Company Name'
        // company_name intentionally omitted
      })
    });

    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // AC: GET list and GET by id
  // -------------------------------------------------------------------------
  it('lists customers with pagination', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers?limit=5&offset=0`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data.customers)).toBe(true);
    expect(typeof result.data.total).toBe('number');
    expect(result.data.limit).toBe(5);
    expect(result.data.offset).toBe(0);
  });

  it('filters by is_active', async () => {
    // Create an inactive customer
    const code = `CUST-ACT-${makeTag('ACT', 20)}`;
    const create = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        type: 'PERSON',
        display_name: 'Active Filter Test'
      })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    const customerId = created.data.id;

    // Deactivate via PATCH
    const deactivateRes = await fetch(`${baseUrl}/api/platform/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false })
    });
    expect(deactivateRes.status).toBe(200);

    // Filter is_active=false with higher limit to ensure our customer is in results
    const inactiveRes = await fetch(`${baseUrl}/api/platform/customers?is_active=false&limit=100`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(inactiveRes.status).toBe(200);
    const inactiveResult = await inactiveRes.json();
    const found = inactiveResult.data.customers.find((c: any) => c.id === customerId);
    expect(found).toBeDefined();
  });

  it('filters by type', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers?type=PERSON`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.data.customers.every((c: any) => c.type === 'PERSON')).toBe(true);
  });

  it('searches by display_name', async () => {
    const searchRes = await fetch(`${baseUrl}/api/platform/customers?search=John`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(searchRes.status).toBe(200);
    const result = await searchRes.json();
    expect(result.data.customers.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // AC: PATCH updates allowed fields
  // -------------------------------------------------------------------------
  it('updates customer fields via PATCH', async () => {
    // Create a customer to update
    const code = `CUST-UPD-${makeTag('UPD', 20)}`;
    const createRes = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        type: 'PERSON',
        display_name: 'Original Name'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const customerId = created.data.id;

    // Update via PATCH
    const patchRes = await fetch(`${baseUrl}/api/platform/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: 'Updated Name',
        email: 'updated@example.com',
        phone: '+6221900000000',
        city: 'Jakarta'
      })
    });

    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.success).toBe(true);
    expect(updated.data.display_name).toBe('Updated Name');
    expect(updated.data.email).toBe('updated@example.com');
    expect(updated.data.phone).toBe('+6221900000000');
    expect(updated.data.city).toBe('Jakarta');
    // Unchanged fields remain
    expect(updated.data.code).toBe(code);
    expect(updated.data.type).toBe('PERSON');
  });

  it('returns 404 when updating non-existent customer', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers/999999`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Ghost' })
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: DELETE soft-deletes (sets deleted_at)
  // -------------------------------------------------------------------------
  it('soft-deletes customer via DELETE', async () => {
    // Create a customer to delete
    const code = `CUST-DEL-${makeTag('DEL', 20)}`;
    const createRes = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        type: 'PERSON',
        display_name: 'To Be Deleted'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const customerId = created.data.id;

    // Delete
    const delRes = await fetch(`${baseUrl}/api/platform/customers/${customerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(delRes.status).toBe(200);

    // Verify it no longer appears in active list
    const listRes = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    const found = list.data.customers.find((c: any) => c.id === customerId);
    expect(found).toBeUndefined();

    // Verify it appears in inactive list
    const inactiveRes = await fetch(`${baseUrl}/api/platform/customers?is_active=false&limit=100`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(inactiveRes.status).toBe(200);
    const inactive = await inactiveRes.json();
    const inactiveFound = inactive.data.customers.find((c: any) => c.id === customerId);
    expect(inactiveFound).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // AC: Soft-deleted code cannot be reused
  // -------------------------------------------------------------------------
  it('cannot reuse code of a soft-deleted customer', async () => {
    const code = `CUST-SD-${makeTag('SD', 20)}`;

    // Create
    const createRes = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        type: 'PERSON',
        display_name: 'Will Be Deleted'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const customerId = created.data.id;

    // Soft-delete
    await fetch(`${baseUrl}/api/platform/customers/${customerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });

    // Attempt to reuse the code
    const reuseRes = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        type: 'PERSON',
        display_name: 'Should Fail'
      })
    });
    expect(reuseRes.status).toBe(409);
    const err = await reuseRes.json();
    expect(err.error.code).toBe('CONFLICT');
  });

  // -------------------------------------------------------------------------
  // AC: Cannot create customer for another company
  // -------------------------------------------------------------------------
  it('returns 403 when creating customer for a different company', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ownerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: 99998,  // different company
        code: `CUST-CROSS-${makeTag('CRS', 20)}`,
        type: 'PERSON',
        display_name: 'Cross Company'
      })
    });

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: CASHIER cannot update or delete
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to update a customer', async () => {
    // Create a customer first (as owner)
    const code = `CUST-CASH-UPD-${makeTag('CUPD', 20)}`;
    const createRes = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        type: 'PERSON',
        display_name: 'Cashier Update Test'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const customerId = created.data.id;

    // Attempt update as CASHIER
    const patchRes = await fetch(`${baseUrl}/api/platform/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Hijacked' })
    });
    expect(patchRes.status).toBe(403);

    // Cleanup
    await fetch(`${baseUrl}/api/platform/customers/${customerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
  });

  it('returns 403 when CASHIER tries to delete a customer', async () => {
    const code = `CUST-CASH-DEL-${makeTag('CDEL', 20)}`;
    const createRes = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        type: 'PERSON',
        display_name: 'Cashier Delete Test'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const customerId = created.data.id;

    const delRes = await fetch(`${baseUrl}/api/platform/customers/${customerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${cashierToken}` }
    });
    expect(delRes.status).toBe(403);

    // Cleanup
    await fetch(`${baseUrl}/api/platform/customers/${customerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
  });

  // -------------------------------------------------------------------------
  // AC: 403 when trying to GET a non-existent customer
  // -------------------------------------------------------------------------
  it('returns 404 (not 403) when getting a non-existent customer', async () => {
    const res = await fetch(`${baseUrl}/api/platform/customers/999999`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Full lifecycle — create, read, update, delete
  // -------------------------------------------------------------------------
  it('full lifecycle: create → get → update → delete', async () => {
    const code = `CUST-LIFE-${makeTag('LIFE', 20)}`;

    // 1. Create
    const createRes = await fetch(`${baseUrl}/api/platform/customers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code,
        type: 'PERSON',
        display_name: 'Lifecycle Test',
        address_line1: '123 Main St',
        city: 'Bandung'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const id = created.data.id;
    expect(created.data.address_line1).toBe('123 Main St');
    expect(created.data.city).toBe('Bandung');

    // 2. Get
    const getRes = await fetch(`${baseUrl}/api/platform/customers/${id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.data.id).toBe(id);
    expect(fetched.data.code).toBe(code);

    // 3. Update
    const patchRes = await fetch(`${baseUrl}/api/platform/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'Surabaya', postal_code: '60111' })
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.data.city).toBe('Surabaya');
    expect(patched.data.postal_code).toBe('60111');
    expect(patched.data.address_line1).toBe('123 Main St'); // unchanged

    // 4. Delete
    const delRes = await fetch(`${baseUrl}/api/platform/customers/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(delRes.status).toBe(200);

    // 5. Confirm deleted
    const getAfterDel = await fetch(`${baseUrl}/api/platform/customers/${id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getAfterDel.status).toBe(404);
  });
});
