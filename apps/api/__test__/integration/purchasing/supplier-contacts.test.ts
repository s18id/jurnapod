// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for purchasing/supplier-contacts CRUD
// Tests GET /api/purchasing/suppliers/:id/contacts, POST, PATCH, DELETE

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
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

describe('purchasing.supplier-contacts', { timeout: 30000 }, () => {
  let testSupplierId: number;
  let testSupplierCode: string;

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

    // Create a supplier for contact tests
    testSupplierCode = `SUP-CT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const createRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: cashierCompanyId,
        code: testSupplierCode,
        name: 'Contact Test Supplier',
        currency: 'USD'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    testSupplierId = created.data.id;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // -------------------------------------------------------------------------
  // AC: 401 without authentication
  // -------------------------------------------------------------------------
  it('returns 401 when no auth token is provided', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // AC: 403 for CASHIER (no purchasing.suppliers permission)
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to list contacts', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      }
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when CASHIER tries to create a contact', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cashierToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Should not create',
        email: 'test@example.com'
      })
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // AC: POST creates contact
  // -------------------------------------------------------------------------
  it('creates a contact with minimal fields', async () => {
    const payload = {
      name: 'John Contact'
    };

    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
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
    expect(result.data.name).toBe('John Contact');
    expect(result.data.supplier_id).toBe(testSupplierId);
    expect(result.data.is_primary).toBe(false);
    expect(result.data.email).toBeNull();
    expect(result.data.phone).toBeNull();
    expect(result.data.role).toBeNull();
  });

  it('creates a contact with all fields', async () => {
    const payload = {
      name: 'Jane Contact',
      email: 'jane@supplier.example.com',
      phone: '+622112345678',
      role: 'Purchasing Manager',
      is_primary: true,
      notes: 'Primary contact for orders'
    };

    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
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
    expect(result.data.name).toBe('Jane Contact');
    expect(result.data.email).toBe('jane@supplier.example.com');
    expect(result.data.phone).toBe('+622112345678');
    expect(result.data.role).toBe('Purchasing Manager');
    expect(result.data.is_primary).toBe(true);
    expect(result.data.notes).toBe('Primary contact for orders');
  });

  // -------------------------------------------------------------------------
  // AC: Primary contact uniqueness
  // -------------------------------------------------------------------------
  it('only one primary contact per supplier', async () => {
    // Create first contact as non-primary
    const first = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First Non-Primary', is_primary: false })
    });
    expect(first.status).toBe(201);
    const firstData = await first.json();
    expect(firstData.data.is_primary).toBe(false);

    // Create second contact as primary - should unset first primary
    const second = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second Primary', is_primary: true })
    });
    expect(second.status).toBe(201);
    const secondData = await second.json();
    expect(secondData.data.is_primary).toBe(true);

    // Verify first contact is no longer primary
    const getFirst = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${firstData.data.id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    const updatedFirst = await getFirst.json();
    expect(updatedFirst.data.is_primary).toBe(false);
  });

  // -------------------------------------------------------------------------
  // AC: GET list and GET by id
  // -------------------------------------------------------------------------
  it('lists contacts for a supplier', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data.contacts)).toBe(true);
  });

  it('gets contact by id', async () => {
    // Create a contact first
    const create = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Get Test Contact', email: 'get@test.com' })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    const contactId = created.data.id;

    // Get by ID
    const getRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${contactId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.success).toBe(true);
    expect(fetched.data.id).toBe(contactId);
    expect(fetched.data.name).toBe('Get Test Contact');
  });

  it('returns 404 when getting non-existent contact', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/999999`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: PATCH updates allowed fields
  // -------------------------------------------------------------------------
  it('updates contact fields via PATCH', async () => {
    // Create a contact to update
    const create = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Original Contact', email: 'original@test.com' })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    const contactId = created.data.id;

    // Update via PATCH
    const patchRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Contact',
        email: 'updated@test.com',
        phone: '+6221900000000',
        role: 'Manager'
      })
    });

    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.success).toBe(true);
    expect(updated.data.name).toBe('Updated Contact');
    expect(updated.data.email).toBe('updated@test.com');
    expect(updated.data.phone).toBe('+6221900000000');
    expect(updated.data.role).toBe('Manager');
  });

  it('returns 404 when updating non-existent contact', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/999999`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ghost' })
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: DELETE removes contact
  // -------------------------------------------------------------------------
  it('deletes contact via DELETE', async () => {
    // Create a contact to delete
    const create = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'To Be Deleted' })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    const contactId = created.data.id;

    // Delete
    const delRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(delRes.status).toBe(200);

    // Verify it's gone
    const getRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${contactId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getRes.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // AC: CASHIER cannot create, update, or delete contacts
  // -------------------------------------------------------------------------
  it('returns 403 when CASHIER tries to update a contact', async () => {
    // Create a contact first (as owner)
    const create = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cashier Update Test' })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    const contactId = created.data.id;

    // Attempt update as CASHIER
    const patchRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hijacked' })
    });
    expect(patchRes.status).toBe(403);

    // Cleanup
    await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
  });

  it('returns 403 when CASHIER tries to delete a contact', async () => {
    // Create a contact first (as owner)
    const create = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cashier Delete Test' })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    const contactId = created.data.id;

    // Attempt delete as CASHIER
    const delRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${cashierToken}` }
    });
    expect(delRes.status).toBe(403);

    // Cleanup
    await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
  });

  // -------------------------------------------------------------------------
  // AC: 404 when supplier doesn't exist
  // -------------------------------------------------------------------------
  it('returns 404 when supplier does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/999999/contacts`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Full lifecycle
  // -------------------------------------------------------------------------
  it('full lifecycle: create → get → update → delete', async () => {
    // 1. Create
    const createRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lifecycle Contact',
        email: 'lifecycle@test.com',
        role: 'Buyer'
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const id = created.data.id;
    expect(created.data.email).toBe('lifecycle@test.com');

    // 2. Get
    const getRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.data.id).toBe(id);

    // 3. Update
    const patchRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+6221999999999', role: 'Senior Buyer' })
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.data.phone).toBe('+6221999999999');
    expect(patched.data.role).toBe('Senior Buyer');

    // 4. Delete
    const delRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(delRes.status).toBe(200);

    // 5. Confirm deleted
    const getAfterDel = await fetch(`${baseUrl}/api/purchasing/suppliers/${testSupplierId}/contacts/${id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getAfterDel.status).toBe(404);
  });
});
