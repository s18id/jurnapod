// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 60.4: Audit Log Filter Correctness
// Integration tests verifying audit_logs queries filter by `success` (boolean),
// NOT by `result` (varchar).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext,
} from '../../fixtures';
import { createTestAuditLog } from '@jurnapod/modules-platform/test-fixtures';

let baseUrl: string;
let accessToken: string;
let seedCompanyId: number;
let seedUserId: number;
let testRowIds: number[] = [];

describe('audit.audit-log-filter', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const seedCtx = await getSeedSyncContext();
    seedCompanyId = seedCtx.companyId;
    seedUserId = seedCtx.cashierUserId;

    // Seed test audit_log rows with controlled success values
    const db = getTestDb();

    // Insert a successful audit log entry
    const successLog = await createTestAuditLog(db, {
      companyId: seedCompanyId,
      userId: seedUserId,
      action: 'STORY_60_4_TEST',
      success: true,
    });
    testRowIds.push(successLog.id);

    // Insert a failed audit log entry
    const failLog = await createTestAuditLog(db, {
      companyId: seedCompanyId,
      userId: seedUserId,
      action: 'STORY_60_4_TEST',
      success: false,
    });
    testRowIds.push(failLog.id);
  });

  afterAll(async () => {
    try {
      // Clean up test rows
      if (testRowIds.length > 0) {
        const db = getTestDb();
        await db
          .deleteFrom('audit_logs')
          .where('id', 'in', testRowIds)
          .execute();
        testRowIds = [];
      }
      await resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  // ===========================================================================
  // AC1: Audit log queries use `success` field
  // ===========================================================================
  describe('AC1: success field filtering', () => {
    it('filters by success=true and returns only successful rows', async () => {
      const db = getTestDb();

      const rows = await sql<{
        id: number; action: string; result: string; success: number;
      }>`
        SELECT id, action, result, success
        FROM audit_logs
        WHERE id IN (${testRowIds[0]}, ${testRowIds[1]})
          AND success = 1
      `.execute(db);

      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].success).toBe(1);
      expect(rows.rows[0].action).toBe('STORY_60_4_TEST');
      expect(rows.rows[0].result).toBe('SUCCESS');
    });

    it('filters by success=false and returns only failed rows', async () => {
      const db = getTestDb();

      const rows = await sql<{
        id: number; action: string; result: string; success: number;
      }>`
        SELECT id, action, result, success
        FROM audit_logs
        WHERE id IN (${testRowIds[0]}, ${testRowIds[1]})
          AND success = 0
      `.execute(db);

      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].success).toBe(0);
      expect(rows.rows[0].action).toBe('STORY_60_4_TEST');
      expect(rows.rows[0].result).toBe('FAIL');
    });

    it('returns both rows when no success filter is applied', async () => {
      const db = getTestDb();

      const rows = await sql<{
        id: number; action: string; result: string; success: number;
      }>`
        SELECT id, action, result, success
        FROM audit_logs
        WHERE id IN (${testRowIds[0]}, ${testRowIds[1]})
      `.execute(db);

      expect(rows.rows.length).toBe(2);
      const successValues = rows.rows.map(r => r.success);
      expect(successValues).toContain(1);
      expect(successValues).toContain(0);
    });
  });

  // ===========================================================================
  // AC2: Audit log queries do NOT use `result` field for filtering
  // ===========================================================================
  describe('AC2: result field NOT used for filtering', () => {
    it('success=true filtering returns correct row regardless of result string', async () => {
      const db = getTestDb();

      // Verify that filtering by success=true returns the successful row
      // even though both rows have different result strings.
      const rows = await sql<{
        id: number; result: string; success: number;
      }>`
        SELECT id, result, success
        FROM audit_logs
        WHERE id IN (${testRowIds[0]}, ${testRowIds[1]})
          AND success = 1
      `.execute(db);

      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].success).toBe(1);
      // The result field is present but NOT used in the WHERE clause
      expect(rows.rows[0].result).toBe('SUCCESS');
    });

    it('confirming filtering works by success, not by result matching', async () => {
      const db = getTestDb();

      // This test demonstrates that filtering by success=1 returns the
      // correct row, while the result field value is just a display label.
      // If result were used, we could trivially break the query by changing
      // the result string without changing success.

      const allRows = await sql<{
        id: number; result: string; success: number;
      }>`
        SELECT id, result, success
        FROM audit_logs
        WHERE id IN (${testRowIds[0]}, ${testRowIds[1]})
      `.execute(db);

      // Both rows exist
      expect(allRows.rows.length).toBe(2);

      // The success=true row has result='SUCCESS' and success=1
      const successRow = allRows.rows.find(r => r.success === 1);
      expect(successRow).toBeDefined();
      expect(successRow!.result).toBe('SUCCESS');

      // The success=false row has result='FAIL' and success=0
      const failRow = allRows.rows.find(r => r.success === 0);
      expect(failRow).toBeDefined();
      expect(failRow!.result).toBe('FAIL');
    });
  });

  // ===========================================================================
  // AC3: Audit log responses include success field (boolean)
  // ===========================================================================
  describe('AC3: Response shape includes success field', () => {
    it('period-transitions API returns audit data with correct structure', async () => {
      // The period-transitions endpoint queries audit_logs filtered by
      // success=1 internally. We verify the endpoint works and returns
      // the API envelope with success boolean.
      const res = await fetch(
        `${baseUrl}/api/audit/period-transitions?company_id=${seedCompanyId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      // API envelope: body.success is the API-level success indicator
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.transitions ?? body.data)).toBe(true);
    });

    it('audit query service normalizeAuditLog returns success as boolean', async () => {
      // Directly test the normalizeAuditLog function from the platform package
      const { normalizeAuditLog } = await import(
        '@jurnapod/modules-platform'
      );

      const row = {
        id: 1,
        company_id: 1,
        outlet_id: null,
        user_id: 1,
        entity_type: 'TEST',
        entity_id: '100',
        action: 'TEST_ACTION',
        result: 'SUCCESS' as const,
        success: 1,
        status: 1,
        ip_address: null,
        payload_json: '{}',
        changes_json: null,
        created_at: '2026-05-09T00:00:00.000Z',
      };

      const response = normalizeAuditLog(row);

      // success must be boolean true (not number 1)
      expect(response.success).toBe(true);
      expect(typeof response.success).toBe('boolean');

      // Test with success=0 → boolean false
      const failRow = { ...row, success: 0, result: 'FAIL' as const };
      const failResponse = normalizeAuditLog(failRow);
      expect(failResponse.success).toBe(false);
      expect(typeof failResponse.success).toBe('boolean');
    });
  });

  // ===========================================================================
  // AC4: Negative test — success=false rows excluded from success queries
  // ===========================================================================
  describe('AC4: Negative test — success=false excluded', () => {
    it('success=false rows are not in success=true results', async () => {
      const db = getTestDb();

      // Get IDs of success=false rows
      const failRows = await sql<{ id: number }>`
        SELECT id FROM audit_logs
        WHERE id IN (${testRowIds[0]}, ${testRowIds[1]})
          AND success = 0
      `.execute(db);

      const failIds = failRows.rows.map(r => Number(r.id));

      // Get IDs of success=true rows
      const successRows = await sql<{ id: number }>`
        SELECT id FROM audit_logs
        WHERE id IN (${testRowIds[0]}, ${testRowIds[1]})
          AND success = 1
      `.execute(db);

      const successIds = successRows.rows.map(r => Number(r.id));

      // No overlap: fail IDs must not appear in success IDs
      for (const failId of failIds) {
        expect(successIds).not.toContain(failId);
      }

      // Both sets together should cover all test rows
      const allIds = [...failIds, ...successIds];
      expect(allIds.sort()).toEqual([...testRowIds].sort());
    });

    it('success=0 filtering correctly excludes success=1 rows', async () => {
      const db = getTestDb();

      // Reverse direction: verify no success=1 rows appear in success=0 query
      const failOnlyRows = await sql<{ id: number; success: number }>`
        SELECT id, success FROM audit_logs
        WHERE id IN (${testRowIds[0]}, ${testRowIds[1]})
          AND success = 0
      `.execute(db);

      // Every returned row must have success=0
      for (const row of failOnlyRows.rows) {
        expect(row.success).toBe(0);
      }

      expect(failOnlyRows.rows.length).toBe(1);
    });
  });
});
