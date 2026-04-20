// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Regression test for: SUP-001 - Supplier soft delete without integrity check
// Bug: softDeleteSupplier allows deactivation even when open purchase orders exist.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;

describe('supplier - Regression: Soft Delete Referential Integrity', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    companyId = context.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // =============================================================================
  // Regression: SUP-001 - Soft delete blocks on open POs
  // =============================================================================

  describe('REGRESSION-SUP-001: Soft delete should block when open purchase orders exist', () => {
    it('should NOT allow soft-deleting a supplier with open purchase orders (P1)', async () => {
      // Arrange: Create a supplier
      const supplierRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: companyId,
          code: `SUP-DEL-${Date.now()}`,
          name: 'Delete Test Supplier',
          currency: 'IDR'
        })
      });
      expect(supplierRes.status).toBe(201);
      const supplier = await supplierRes.json();
      const supplierId = supplier.data.id;

      // Create an open PO for this supplier
      const poRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          supplier_id: supplierId,
          order_date: '2026-04-20',
          lines: [{ qty: '1', unit_price: '1000.00' }]
        })
      });
      expect(poRes.status).toBe(201);

      // Act: Try to soft-delete the supplier
      const delRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // Assert: Should be rejected (409 or 422)
      expect([409, 422]).toContain(delRes.status);

      // Verify supplier is still active in DB
      const db = getTestDb();
      const row = await sql<{ is_active: number }>`
        SELECT is_active FROM suppliers WHERE id = ${supplierId}
      `.execute(db);
      expect(row.rows[0]?.is_active).toBe(1);
    });

    it('should allow soft-deleting a supplier with no open documents (P1)', async () => {
      // Arrange: Create a supplier with no POs
      const supplierRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: companyId,
          code: `SUP-DEL-OK-${Date.now()}`,
          name: 'Safe Delete Supplier',
          currency: 'IDR'
        })
      });
      expect(supplierRes.status).toBe(201);
      const supplier = await supplierRes.json();
      const supplierId = supplier.data.id;

      // Act: Soft-delete
      const delRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // Assert: Should succeed
      expect(delRes.status).toBe(200);

      // Verify inactive
      const db = getTestDb();
      const row = await sql<{ is_active: number }>`
        SELECT is_active FROM suppliers WHERE id = ${supplierId}
      `.execute(db);
      expect(row.rows[0]?.is_active).toBe(0);
    });

    it('should NOT allow PATCH deactivation when open purchase orders exist (P1)', async () => {
      // Arrange: Create supplier
      const supplierRes = await fetch(`${baseUrl}/api/purchasing/suppliers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_id: companyId,
          code: `SUP-PATCH-DEL-${Date.now()}`,
          name: 'Patch Deactivate Guard Supplier',
          currency: 'IDR'
        })
      });
      expect(supplierRes.status).toBe(201);
      const supplier = await supplierRes.json();
      const supplierId = supplier.data.id;

      // Arrange: Create open PO
      const poRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          supplier_id: supplierId,
          order_date: '2026-04-20',
          lines: [{ qty: '1', unit_price: '1000.00' }]
        })
      });
      expect(poRes.status).toBe(201);

      // Act: Attempt PATCH deactivation bypass
      const patchRes = await fetch(`${baseUrl}/api/purchasing/suppliers/${supplierId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: false })
      });

      // Assert: Should be blocked and remain active
      expect([409, 422]).toContain(patchRes.status);

      const db = getTestDb();
      const row = await sql<{ is_active: number }>`
        SELECT is_active FROM suppliers WHERE id = ${supplierId}
      `.execute(db);
      expect(row.rows[0]?.is_active).toBe(1);
    });
  });
});
