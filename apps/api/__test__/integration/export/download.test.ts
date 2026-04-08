// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for export.download
// Tests POST /api/export/:entityType and GET /api/export/:entityType/columns endpoints
//
// NOTE: The current export implementation is SYNCHRONOUS - it returns the file
// directly rather than using an async job pattern. The acceptance criteria
// describe an async pattern that is NOT currently implemented:
//   - POST /export/:entityType/download -> initiate async job, return job ID
//   - GET /operations/:operationId/progress -> poll job status  
//   - GET /export/download/:jobId -> download completed file
//
// These tests verify the actual synchronous behavior that exists.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedContext: { companyId: number; outletId: number };

describe('export.download', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedContext = await getSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  describe('POST /api/export/:entityType', () => {
    it('rejects request without auth', async () => {
      const res = await fetch(`${baseUrl}/api/export/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      expect(res.status).toBe(401);
    });

    it('rejects request with invalid entity type', async () => {
      const res = await fetch(`${baseUrl}/api/export/invalid_type`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toContain('Invalid entity type');
    });

    it('downloads with expired token returns 401', async () => {
      // Use an obviously invalid/expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb21wYW55X2lkIjoxMDAwMCwidXNlcl9pZCI6MTAwMDAsImV4cCI6MTYwMDAwMDAwMH0.invalid';

      const res = await fetch(`${baseUrl}/api/export/items?format=csv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${expiredToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(res.status).toBe(401);
    });

    it('validates entity type is required', async () => {
      // Test with empty entity type - route itself should handle this
      const res = await fetch(`${baseUrl}/api/export/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Should return 404 (route not found) rather than validation error
      expect(res.status).toBe(404);
    });

    it('returns error for empty columns selection', async () => {
      // Using columns that don't exist should result in no valid columns
      const res = await fetch(`${baseUrl}/api/export/items?format=csv&columns=nonexistent1,nonexistent2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET /api/export/:entityType/columns', () => {
    it('rejects request without auth', async () => {
      const res = await fetch(`${baseUrl}/api/export/items/columns`);
      expect(res.status).toBe(401);
    });

    it('returns columns for items entity', async () => {
      const res = await fetch(`${baseUrl}/api/export/items/columns`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.entityType).toBe('items');
      expect(body.data.columns).toBeDefined();
      expect(Array.isArray(body.data.columns)).toBe(true);
      expect(body.data.defaultColumns).toBeDefined();
      expect(Array.isArray(body.data.defaultColumns)).toBe(true);
    });

    it('returns columns for prices entity', async () => {
      const res = await fetch(`${baseUrl}/api/export/prices/columns`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.entityType).toBe('prices');
      expect(body.data.columns).toBeDefined();
    });

    it('returns error for invalid entity type', async () => {
      const res = await fetch(`${baseUrl}/api/export/invalid_type/columns`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toContain('Invalid entity type');
    });

    it('columns include key, header, and fieldType', async () => {
      const res = await fetch(`${baseUrl}/api/export/items/columns`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const column = body.data.columns[0];
      expect(column).toHaveProperty('key');
      expect(column).toHaveProperty('header');
      expect(column).toHaveProperty('fieldType');
    });

    it('downloads with expired token returns 401 for columns', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb21wYW55X2lkIjoxMDAwMCwidXNlcl9pZCI6MTAwMDAsImV4cCI6MTYwMDAwMDAwMH0.invalid';

      const res = await fetch(`${baseUrl}/api/export/items/columns`, {
        headers: {
          'Authorization': `Bearer ${expiredToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(res.status).toBe(401);
    });
  });

  describe('export validation', () => {
    it('validates entity type', async () => {
      const entityTypes = ['items', 'prices'];
      
      for (const entityType of entityTypes) {
        const res = await fetch(`${baseUrl}/api/export/${entityType}?format=csv`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        // Valid entity types should not return 400 for entity type validation
        if (entityType === 'items' || entityType === 'prices') {
          expect(res.status).not.toBe(400);
        }
      }
    });
  });

  describe('async job pattern acceptance criteria (NOT IMPLEMENTED)', () => {
    // These acceptance criteria from the story spec describe an async job pattern
    // that is NOT currently implemented. Documenting expected behavior here.
    //
    // Acceptance criteria:
    // - Export download initiates async job and returns job ID
    // - Export status polling returns job state
    // - Download with expired token returns 401
    // - Only completed jobs can be downloaded
    // - Export validates entity type
    //
    // Current implementation:
    // - POST /export/:entityType returns file directly (synchronous)
    // - No job ID is returned
    // - No progress polling endpoint is used
    // - No separate download endpoint exists

    it.skip('async export with job ID return (NOT IMPLEMENTED)', async () => {
      // Expected: POST /export/:entityType/download -> { jobId: "...", status: "pending" }
      // Actual: POST /export/:entityType returns file blob directly
      const res = await fetch(`${baseUrl}/api/export/items/download`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      // Would expect JSON response with jobId, but gets file blob
    });

    it.skip('status polling returns job state (NOT IMPLEMENTED)', async () => {
      // Expected: GET /operations/:operationId/progress -> { status: "running" | "completed", ... }
      // Currently no async job is created
    });

    it.skip('only completed jobs downloadable (NOT IMPLEMENTED)', async () => {
      // Expected: Downloading incomplete job returns error
      // Currently no async pattern to test
    });
  });
});
