// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for purchasing.suppliers tenant isolation
// Tests that companies cannot access each other's suppliers
// P2 fix: True cross-company access validation with real supplier IDs

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  cleanupTestFixtures,
  createTestCompanyMinimal,
  createTestUser,
  assignUserGlobalRole,
  getRoleIdByCode,
  loginForTest,
  setModulePermission,
} from '../../fixtures';

// Deterministic code generator for constrained fields (max 20 chars)
function makeTag(prefix: string, counter: number): string {
  const worker = process.env.VITEST_POOL_ID ?? '0';
  const pidTag = String(process.pid % 10000).padStart(4, '0');
  return `${prefix}${worker}${String(counter).padStart(4, '0')}${pidTag}`;
}

let baseUrl: string;
let ownerToken: string;
let ownerCompanyId: number;
let isoTagCounter = 0;
const createdCompanyIds: number[] = [];

describe('purchasing.suppliers.tenant-isolation', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const ownerCompany = await createTestCompanyMinimal({
      code: makeTag('COMPISOA', ++isoTagCounter).toUpperCase(),
      name: 'Company A Isolation Test',
    });
    ownerCompanyId = ownerCompany.id;

    const ownerRoleId = await getRoleIdByCode('OWNER');
    const ownerUser = await createTestUser(ownerCompanyId, {
      email: `iso-owner-a-${++isoTagCounter}@example.com`,
      name: 'Company A Owner',
      password: process.env.JP_OWNER_PASSWORD ?? 'TestOwner123!'
    });
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);
    await setModulePermission(ownerCompanyId, ownerRoleId, 'purchasing', 'suppliers', 63, { allowSystemRoleMutation: true });

    ownerToken = await loginForTest(
      baseUrl,
      ownerCompany.code,
      ownerUser.email,
      process.env.JP_OWNER_PASSWORD ?? 'TestOwner123!'
    );
  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      for (const companyId of [ownerCompanyId, ...createdCompanyIds]) {
        await sql`DELETE FROM supplier_contacts WHERE supplier_id IN (
          SELECT id FROM suppliers WHERE company_id = ${companyId}
        )`.execute(db);
        await sql`DELETE FROM suppliers WHERE company_id = ${companyId}`.execute(db);
      }
    } catch {
      // ignore cleanup errors
    }
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  // -------------------------------------------------------------------------
  // AC: Tenant Isolation - True cross-company access with real supplier IDs
  // Company A attempts to access Company B's real supplier and gets NOT_FOUND
  // -------------------------------------------------------------------------
  it('company A cannot GET company B supplier by id (true cross-company)', async () => {
    // Step 1: Create Company B (minimal - no settings bootstrap needed)
    const companyB = await createTestCompanyMinimal({
      code: makeTag('COMPISOB', ++isoTagCounter).toUpperCase(),
      name: 'Company B Isolation Test'
    });
    createdCompanyIds.push(companyB.id);

    // Step 2: Create an OWNER user in Company B
    const ownerRoleId = await getRoleIdByCode('OWNER');
    const userB = await createTestUser(companyB.id, {
      email: `iso-owner-b-${++isoTagCounter}@example.com`,
      name: 'Company B Owner',
      password: process.env.JP_OWNER_PASSWORD ?? 'TestOwner123!'
    });
    await assignUserGlobalRole(userB.id, ownerRoleId);
    await setModulePermission(companyB.id, ownerRoleId, 'purchasing', 'suppliers', 63, { allowSystemRoleMutation: true });

    // Step 3: Login as Company B owner to get token
    const tokenB = await loginForTest(
      baseUrl,
      companyB.code,  // Use code from created company
      userB.email,
      process.env.JP_OWNER_PASSWORD ?? 'TestOwner123!'
    );

    // Step 4: Create a supplier in Company B using Company B's token
    const supplierCodeB = makeTag('SUPISOB', ++isoTagCounter);
    const createB = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyB.id,
        code: supplierCodeB,
        name: 'Company B Supplier',
        currency: 'USD'
      })
    });
    expect(createB.status).toBe(201);
    const supplierB = await createB.json();
    const supplierBId = supplierB.data.id;

    // Step 5: Create a supplier in Company A (owner token)
    const supplierCodeA = makeTag('SUPISOA', ++isoTagCounter);
    const createA = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: ownerCompanyId,
        code: supplierCodeA,
        name: 'Company A Supplier',
        currency: 'USD'
      })
    });
    expect(createA.status).toBe(201);

    // Step 6: Company A tries to GET Company B's supplier - should get 404 NOT_FOUND
    // NOT 403 - because the supplier exists but belongs to another company (tenant isolation)
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierBId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(res.status).toBe(404);

    // Step 7: Verify Company A CAN see its own supplier
    const getOwn = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    expect(getOwn.status).toBe(200);
    const ownData = await getOwn.json();
    const ownSupplierIds = ownData.data.suppliers.map((s: { id: number }) => s.id);
    // Company A should see its own supplier
    expect(ownSupplierIds.length).toBeGreaterThan(0);
  });

  it('company A cannot UPDATE company B supplier by id (true cross-company)', async () => {
    // Create Company C (minimal - no settings bootstrap needed)
    const companyC = await createTestCompanyMinimal({
      code: makeTag('COMPISOC', ++isoTagCounter).toUpperCase(),
      name: 'Company C Isolation Test'
    });
    createdCompanyIds.push(companyC.id);

    // Create OWNER user in Company C
    const ownerRoleId = await getRoleIdByCode('OWNER');
    const userC = await createTestUser(companyC.id, {
      email: `iso-owner-c-${++isoTagCounter}@example.com`,
      name: 'Company C Owner',
      password: process.env.JP_OWNER_PASSWORD ?? 'TestOwner123!'
    });
    await assignUserGlobalRole(userC.id, ownerRoleId);
    await setModulePermission(companyC.id, ownerRoleId, 'purchasing', 'suppliers', 63, { allowSystemRoleMutation: true });

    const tokenC = await loginForTest(
      baseUrl,
      companyC.code,
      userC.email,
      process.env.JP_OWNER_PASSWORD ?? 'TestOwner123!'
    );

    // Create supplier in Company C
    const supplierCodeC = makeTag('SUPISOC', ++isoTagCounter);
    const createC = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenC}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyC.id,
        code: supplierCodeC,
        name: 'Company C Supplier',
        currency: 'USD'
      })
    });
    expect(createC.status).toBe(201);
    const supplierC = await createC.json();
    const supplierCId = supplierC.data.id;

    // Company A (owner token) tries to UPDATE Company C's supplier
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierCId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacked Name' })
    });
    // Should be 404 - supplier exists but company_id doesn't match
    expect(res.status).toBe(404);
  });

  it('company A cannot DELETE company B supplier by id (true cross-company)', async () => {
    // Create Company D (minimal - no settings bootstrap needed)
    const companyD = await createTestCompanyMinimal({
      code: makeTag('COMPISOD', ++isoTagCounter).toUpperCase(),
      name: 'Company D Isolation Test'
    });
    createdCompanyIds.push(companyD.id);

    // Create OWNER user in Company D
    const ownerRoleId = await getRoleIdByCode('OWNER');
    const userD = await createTestUser(companyD.id, {
      email: `iso-owner-d-${++isoTagCounter}@example.com`,
      name: 'Company D Owner',
      password: process.env.JP_OWNER_PASSWORD ?? 'TestOwner123!'
    });
    await assignUserGlobalRole(userD.id, ownerRoleId);
    await setModulePermission(companyD.id, ownerRoleId, 'purchasing', 'suppliers', 63, { allowSystemRoleMutation: true });

    const tokenD = await loginForTest(
      baseUrl,
      companyD.code,
      userD.email,
      process.env.JP_OWNER_PASSWORD ?? 'TestOwner123!'
    );

    // Create supplier in Company D
    const supplierCodeD = makeTag('SUPISOD', ++isoTagCounter);
    const createD = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenD}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyD.id,
        code: supplierCodeD,
        name: 'Company D Supplier',
        currency: 'USD'
      })
    });
    expect(createD.status).toBe(201);
    const supplierD = await createD.json();
    const supplierDId = supplierD.data.id;

    // Company A (owner token) tries to DELETE Company D's supplier
    const res = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierDId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    // Should be 404 - supplier exists but company_id doesn't match
    expect(res.status).toBe(404);
  });

  it('supplier code is unique only within company', async () => {
    const uniqueCode = makeTag('SUPUNI', ++isoTagCounter);

    // Create supplier with code in Company A
    const createA = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: ownerCompanyId,
        code: uniqueCode,
        name: 'Company A Supplier',
        currency: 'USD'
      })
    });
    expect(createA.status).toBe(201);

    // Company A cannot create duplicate code within same company
    const duplicateRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: ownerCompanyId,
        code: uniqueCode,
        name: 'Duplicate Code Supplier',
        currency: 'USD'
      })
    });
    expect(duplicateRes.status).toBe(409);
  });

  it('company A list only shows company A suppliers', async () => {
    // Create a supplier in company A (the seeded company)
    const codeA = makeTag('SUPISOLIST', ++isoTagCounter);
    const createA = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: ownerCompanyId,
        code: codeA,
        name: 'Company A List Test Supplier',
        currency: 'USD'
      })
    });
    expect(createA.status).toBe(201);

    // List suppliers for Company A
    const listRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();

    // All returned suppliers should belong to Company A
    for (const supplier of listData.data.suppliers) {
      expect(supplier.company_id).toBe(ownerCompanyId);
    }
  });
});
