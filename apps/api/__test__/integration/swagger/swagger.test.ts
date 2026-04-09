// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Swagger Routes Integration Tests
 *
 * Tests for OpenAPI spec endpoint and Scalar UI availability.
 * These tests verify that:
 * - /swagger.json returns valid OpenAPI 3.0 spec in development
 * - The spec contains correct structure and security schemes
 *
 * Story 36.1: OpenAPI Infrastructure & Swagger UI
 *
 * Note: These tests use app.fetch() directly because swagger routes
 * depend on NODE_ENV being set to non-production to be registered.
 */

import { describe, it, expect } from 'vitest';
import { app } from '../../../src/app.js';

/**
 * Helper to make HTTP request using Hono's fetch via standard Request/Response
 * Note: swagger routes are mounted at root (/) so paths are /swagger and /swagger.json
 */
async function makeAppRequest(method: string, path: string): Promise<Response> {
  const url = new URL(path, 'http://127.0.0.1:3001');
  const request = new Request(url, { method });
  return app.fetch(request);
}

describe('swagger.routes', () => {
  describe('in development mode (NODE_ENV != production)', () => {
    it('GET /swagger.json returns valid OpenAPI 3.0 JSON', async () => {
      const res = await makeAppRequest('GET', '/swagger.json');

      expect(res.ok).toBe(true);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = await res.json();

      // Verify OpenAPI 3.0 structure
      expect(body.openapi).toBe('3.0.0');
      expect(body.info).toBeDefined();
      expect(body.info.title).toBe('Jurnapod API');
      expect(body.info.version).toBe('0.3.0');
      expect(body.info.description).toBe('From cashier to ledger. Modular ERP API.');
    });

    it('GET /swagger.json contains BearerAuth security scheme', async () => {
      const res = await makeAppRequest('GET', '/swagger.json');
      const body = await res.json();

      expect(body.components).toBeDefined();
      expect(body.components.securitySchemes).toBeDefined();
      expect(body.components.securitySchemes.BearerAuth).toBeDefined();
      expect(body.components.securitySchemes.BearerAuth.type).toBe('http');
      expect(body.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
      expect(body.components.securitySchemes.BearerAuth.bearerFormat).toBe('JWT');
    });

    it('GET /swagger.json contains health routes', async () => {
      const res = await makeAppRequest('GET', '/swagger.json');
      const body = await res.json();

      expect(body.paths['/health']).toBeDefined();
      expect(body.paths['/health/live']).toBeDefined();
      expect(body.paths['/health/ready']).toBeDefined();

      // Verify health routes have GET method
      expect(body.paths['/health'].get).toBeDefined();
      expect(body.paths['/health/live'].get).toBeDefined();
      expect(body.paths['/health/ready'].get).toBeDefined();
    });

    it('GET /swagger.json contains auth routes', async () => {
      const res = await makeAppRequest('GET', '/swagger.json');
      const body = await res.json();

      expect(body.paths['/auth/login']).toBeDefined();
      expect(body.paths['/auth/logout']).toBeDefined();
      expect(body.paths['/auth/refresh']).toBeDefined();

      // Verify auth routes have POST method
      expect(body.paths['/auth/login'].post).toBeDefined();
      expect(body.paths['/auth/logout'].post).toBeDefined();
      expect(body.paths['/auth/refresh'].post).toBeDefined();
    });

    it('GET /swagger returns HTML for Scalar UI', async () => {
      const res = await makeAppRequest('GET', '/swagger');

      expect(res.ok).toBe(true);
      expect(res.headers.get('content-type')).toContain('text/html');
    });
  });
});
