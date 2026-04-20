// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Regression test for: RTE-001 - Unhandled exception in POST route handlers
// Bug: POST /purchasing/suppliers and POST /purchasing/suppliers/:id/contacts
// have requireAccess() calls outside the try block. If requireAccess throws,
// the route crashes instead of returning a JSON 500 error.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Test Setup
// =============================================================================

describe('purchasing.routes - Regression: Unhandled exception in POST handlers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // Regression: RTE-001
  // =============================================================================

  describe('REGRESSION-RTE-001: POST handlers must catch requireAccess failures', () => {
    it('should return JSON 500 when requireAccess throws on POST /suppliers (P1)', async () => {
      // Arrange: Mock requireAccess to throw
      vi.doMock('../../../src/lib/auth-guard.js', () => ({
        requireAccess: vi.fn(() => vi.fn(() => Promise.reject(new Error('ACL DB failure')))),
        authenticateRequest: vi.fn(() => Promise.resolve({ success: true, auth: { companyId: 1, userId: 1 } })),
      }));

      // Act: Import route module with mocked dependency
      const { supplierRoutes } = await import('../../../src/routes/purchasing/suppliers.js');

      const response = await supplierRoutes.request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      // Assert: Should return JSON 500, not crash
      expect(response.status).toBe(500);
      const body = await response.json() as { success: boolean; error?: { code?: string } };
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should return JSON 500 when requireAccess throws on POST /contacts (P1)', async () => {
      // Arrange: Mock requireAccess to throw
      vi.doMock('../../../src/lib/auth-guard.js', () => ({
        requireAccess: vi.fn(() => vi.fn(() => Promise.reject(new Error('ACL DB failure')))),
        authenticateRequest: vi.fn(() => Promise.resolve({ success: true, auth: { companyId: 1, userId: 1 } })),
      }));

      // Act: Import route module with mocked dependency
      const { supplierContactRoutes } = await import('../../../src/routes/purchasing/supplier-contacts.js');

      const response = await supplierContactRoutes.request('http://localhost/1/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      // Assert: Should return JSON 500, not crash
      expect(response.status).toBe(500);
      const body = await response.json() as { success: boolean; error?: { code?: string } };
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});
