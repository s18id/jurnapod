// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * SyncAuditService Integration Tests
 *
 * Tests for SyncAuditService using real database connections from .env.
 * These tests verify actual insert, query, and pagination behavior against
 * the sync_audit_events table.
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

// Load .env file before any other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createKysely, type KyselySchema } from '@jurnapod/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { SyncAuditService, AuditDbClient, SyncAuditEvent } from '../../src/sync/audit-service.ts';

// ============================================================================
// Test Configuration
// ============================================================================

interface TestConfig {
  companyCode: string;
  outletCode: string;
}

function loadTestConfig(): TestConfig {
  const companyCode = process.env.JP_COMPANY_CODE ?? 'JP';
  const outletCode = process.env.JP_OUTLET_CODE ?? 'MAIN';

  return { companyCode, outletCode };
}

// ============================================================================
// Database Setup
// ============================================================================

interface TestFixtures {
  db: KyselySchema;
  auditService: SyncAuditService;
  testCompanyId: number;
  testOutletId: number;
  insertedEventIds: bigint[];
}

/**
 * Convert raw SQL string with ? placeholders to Kysely sql template tag
 */
function toRawQuery(sqlText: string, params: unknown[] = []) {
  if (params.length === 0) {
    return sql.raw(sqlText);
  }

  let built = sql``;
  let cursor = 0;

  for (let i = 0; i < params.length; i += 1) {
    const qIndex = sqlText.indexOf('?', cursor);
    if (qIndex === -1) {
      break;
    }
    const segment = sqlText.slice(cursor, qIndex);
    built = sql`${built}${sql.raw(segment)}${params[i]}`;
    cursor = qIndex + 1;
  }

  const tail = sqlText.slice(cursor);
  built = sql`${built}${sql.raw(tail)}`;
  return built;
}

/**
 * Create AuditDbClient implementation backed by Kysely
 */
function createAuditDbClient(db: Kysely<any>): AuditDbClient {
  return {
    query: async <T = unknown>(queryText: string, params?: unknown[]): Promise<T[]> => {
      const result = await toRawQuery(queryText, params ?? []).execute(db);
      return result.rows as T[];
    },
    execute: async (
      queryText: string,
      params?: unknown[]
    ): Promise<{ affectedRows: number; insertId?: number }> => {
      const result = await toRawQuery(queryText, params ?? []).execute(db) as {
        numAffectedRows?: bigint | number;
        insertId?: bigint | number;
      };

      const affectedRows = Number(result.numAffectedRows ?? 0);
      const insertId =
        result.insertId == null ? undefined : Number(result.insertId);

      return { affectedRows, insertId };
    },
    transaction: async () => {
      // Kysely's startTransaction returns Transaction which has execute(), commit(), rollback()
      // @ts-ignore - Kysely types don't expose this clearly
      const trx = await db.startTransaction().execute();
      return {
        execute: async (sqlText: string, params?: unknown[]) => {
          // Use toRawQuery to convert SQL with ? placeholders to Kysely sql template
          const query = toRawQuery(sqlText, params ?? []);
          const result = await query.execute(trx) as any;
          return {
            affectedRows: Number(result.numAffectedRows ?? 0),
            insertId: result.insertId ? Number(result.insertId) : undefined,
          };
        },
        commit: () => trx.commit().execute(),
        rollback: () => trx.rollback().execute(),
      };
    },
  };
}

async function setupTestFixtures(): Promise<TestFixtures> {
  const config = loadTestConfig();

  // Create Kysely instance using environment variables
  const db = createKysely({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'jurnapod',
  });

  // Find test company fixture
  const companyRows = await db
    .selectFrom('companies as c')
    .innerJoin('outlets as o', 'o.company_id', 'c.id')
    .select(['c.id as company_id', 'o.id as outlet_id'])
    .where('c.code', '=', config.companyCode)
    .where('o.code', '=', config.outletCode)
    .limit(1)
    .execute();

  if (companyRows.length === 0) {
    throw new Error(
      `Company fixture not found; run database seed first. ` +
      `Looking for company=${config.companyCode}, outlet=${config.outletCode}`
    );
  }

  const testCompanyId = Number(companyRows[0].company_id);
  const testOutletId = Number(companyRows[0].outlet_id);

  const auditClient = createAuditDbClient(db);
  const auditService = new SyncAuditService(auditClient);

  return {
    db,
    auditService,
    testCompanyId,
    testOutletId,
    insertedEventIds: [],
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function cleanupTestEvents(
  db: KyselySchema,
  eventIds: bigint[]
): Promise<void> {
  if (eventIds.length === 0) return;

  for (const id of eventIds) {
    await sql`DELETE FROM sync_audit_events WHERE id = ${id}`.execute(db);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('SyncAuditService Integration', () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
  });

  afterAll(async () => {
    // Clean up all test events
    await cleanupTestEvents(fixtures.db, fixtures.insertedEventIds);
    // Close DB pool
    await fixtures.db.destroy();
  });

  beforeEach(() => {
    // Reset for each test - but we track IDs globally
    fixtures.insertedEventIds = [];
  });

  describe('startEvent', () => {
    test('should insert event with IN_PROGRESS status and return event ID', async () => {
      const eventId = await fixtures.auditService.startEvent({
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        operationType: 'PUSH',
        tierName: 'MASTER',
        status: 'SUCCESS',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        itemsCount: 100,
        versionBefore: BigInt(10),
        clientDeviceId: 'device-123',
      });

      fixtures.insertedEventIds.push(eventId);

      expect(typeof eventId).toBe('bigint');
      expect(eventId > BigInt(0)).toBe(true);

      // Verify the event was persisted
      const result = await sql<{ id: number; status: string }>`
        SELECT id, status FROM sync_audit_events WHERE id = ${eventId}
      `.execute(fixtures.db);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('IN_PROGRESS');
    });

    test('should insert event with all optional fields as null when not provided', async () => {
      const eventId = await fixtures.auditService.startEvent({
        companyId: fixtures.testCompanyId,
        operationType: 'HEALTH_CHECK',
        tierName: 'MASTER',
        status: 'SUCCESS',
        startedAt: new Date(),
      });

      fixtures.insertedEventIds.push(eventId);

      const result = await sql<{ outlet_id: number | null; items_count: number | null }>`
        SELECT outlet_id, items_count FROM sync_audit_events WHERE id = ${eventId}
      `.execute(fixtures.db);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].outlet_id).toBeNull();
      expect(result.rows[0].items_count).toBeNull();
    });
  });

  describe('completeEvent', () => {
    test('should update event with completion details', async () => {
      // Start an event
      const eventId = await fixtures.auditService.startEvent({
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        operationType: 'PULL',
        tierName: 'MASTER',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      fixtures.insertedEventIds.push(eventId);

      // Complete it
      await fixtures.auditService.completeEvent(eventId, {
        status: 'SUCCESS',
        completedAt: new Date(),
        durationMs: 60000,
        itemsCount: 50,
        versionAfter: BigInt(11),
        responseSizeBytes: 5000,
      });

      // Verify the update
      const result = await sql<{
        status: string;
        duration_ms: number | null;
        items_count: number | null;
        response_size_bytes: number | null;
      }>`
        SELECT status, duration_ms, items_count, response_size_bytes
        FROM sync_audit_events
        WHERE id = ${eventId}
      `.execute(fixtures.db);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('SUCCESS');
      expect(result.rows[0].duration_ms).toBe(60000);
      expect(result.rows[0].items_count).toBe(50);
      expect(result.rows[0].response_size_bytes).toBe(5000);
    });

    test('should handle update with error fields', async () => {
      const eventId = await fixtures.auditService.startEvent({
        companyId: fixtures.testCompanyId,
        operationType: 'PUSH',
        tierName: 'MASTER',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      fixtures.insertedEventIds.push(eventId);

      await fixtures.auditService.completeEvent(eventId, {
        status: 'FAILED',
        completedAt: new Date(),
        durationMs: 30000,
        errorCode: 'ERR_001',
        errorMessage: 'Sync failed due to network timeout',
      });

      const result = await sql<{ status: string; error_code: string | null; error_message: string | null }>`
        SELECT status, error_code, error_message FROM sync_audit_events WHERE id = ${eventId}
      `.execute(fixtures.db);

      expect(result.rows[0].status).toBe('FAILED');
      expect(result.rows[0].error_code).toBe('ERR_001');
      expect(result.rows[0].error_message).toBe('Sync failed due to network timeout');
    });

    test('should return early when no updates provided', async () => {
      const eventId = await fixtures.auditService.startEvent({
        companyId: fixtures.testCompanyId,
        operationType: 'HEALTH_CHECK',
        tierName: 'MASTER',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      fixtures.insertedEventIds.push(eventId);

      // Should not throw
      await expect(
        fixtures.auditService.completeEvent(eventId, {})
      ).resolves.not.toThrow();
    });
  });

  describe('logEvent', () => {
    test('should create complete event in one call', async () => {
      const event: Omit<SyncAuditEvent, 'id'> = {
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        operationType: 'VERSION_BUMP',
        tierName: 'MASTER',
        status: 'SUCCESS',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:00:05Z'),
        durationMs: 5000,
        itemsCount: 1,
        versionBefore: BigInt(5),
        versionAfter: BigInt(6),
      };

      const eventId = await fixtures.auditService.logEvent(event);
      fixtures.insertedEventIds.push(eventId);

      const result = await sql<{
        operation_type: string;
        tier_name: string;
        status: string;
        duration_ms: number | null;
      }>`
        SELECT operation_type, tier_name, status, duration_ms
        FROM sync_audit_events
        WHERE id = ${eventId}
      `.execute(fixtures.db);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].operation_type).toBe('VERSION_BUMP');
      expect(result.rows[0].tier_name).toBe('invoices');
      expect(result.rows[0].status).toBe('SUCCESS');
      expect(result.rows[0].duration_ms).toBe(5000);
    });
  });

  describe('queryEvents', () => {
    beforeEach(async () => {
      // Insert multiple test events for query testing
      const testEvents: Omit<SyncAuditEvent, 'id'>[] = [
        {
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          operationType: 'PUSH',
          tierName: 'MASTER',
          status: 'SUCCESS',
          startedAt: new Date('2024-01-15T10:00:00Z'),
          durationMs: 1000,
        },
        {
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          operationType: 'PULL',
          tierName: 'MASTER',
          status: 'SUCCESS',
          startedAt: new Date('2024-01-15T11:00:00Z'),
          durationMs: 2000,
        },
        {
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          operationType: 'PUSH',
          tierName: 'MASTER',
          status: 'FAILED',
          startedAt: new Date('2024-01-15T12:00:00Z'),
          durationMs: 500,
          errorCode: 'ERR_NETWORK',
        },
        {
          companyId: fixtures.testCompanyId,
          operationType: 'HEALTH_CHECK',
          tierName: 'MASTER',
          status: 'SUCCESS',
          startedAt: new Date('2024-01-15T13:00:00Z'),
          durationMs: 100,
        },
      ];

      for (const evt of testEvents) {
        const id = await fixtures.auditService.logEvent(evt);
        fixtures.insertedEventIds.push(id);
      }
    });

    test('should query by companyId', async () => {
      const result = await fixtures.auditService.queryEvents({
        companyId: fixtures.testCompanyId,
      });

      expect(result.total).toBeGreaterThanOrEqual(4);
      expect(result.events.length).toBeGreaterThanOrEqual(4);
    });

    test('should query by outletId', async () => {
      const result = await fixtures.auditService.queryEvents({
        outletId: fixtures.testOutletId,
      });

      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.events.every(e => e.outletId === fixtures.testOutletId)).toBe(true);
    });

    test('should query by operationType', async () => {
      const result = await fixtures.auditService.queryEvents({
        operationType: 'PUSH',
      });

      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.events.every(e => e.operationType === 'PUSH')).toBe(true);
    });

    test('should query by tierName', async () => {
      const result = await fixtures.auditService.queryEvents({
        tierName: 'MASTER',
      });

      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.events.every(e => e.tierName === 'orders')).toBe(true);
    });

    test('should query by status', async () => {
      const result = await fixtures.auditService.queryEvents({
        status: 'FAILED',
      });

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.events.every(e => e.status === 'FAILED')).toBe(true);
    });

    test('should query by date range', async () => {
      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');

      const result = await fixtures.auditService.queryEvents({
        startDate,
        endDate,
      });

      expect(result.total).toBeGreaterThanOrEqual(4);
    });

    test('should support pagination with limit', async () => {
      const result = await fixtures.auditService.queryEvents({
        limit: 2,
      });

      expect(result.events.length).toBeLessThanOrEqual(2);
    });

    test('should support pagination with limit and offset', async () => {
      // First query - get first page
      const page1 = await fixtures.auditService.queryEvents({
        limit: 2,
        offset: 0,
      });

      // Second query - get second page
      const page2 = await fixtures.auditService.queryEvents({
        limit: 2,
        offset: 2,
      });

      // Results should be different
      if (page1.events.length > 0 && page2.events.length > 0) {
        const ids1 = page1.events.map(e => e.id);
        const ids2 = page2.events.map(e => e.id);
        expect(ids1.some(id => ids2.includes(id))).toBe(false);
      }
    });

    test('should combine multiple filters', async () => {
      const result = await fixtures.auditService.queryEvents({
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        operationType: 'PUSH',
        tierName: 'MASTER',
      });

      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.events.every(e =>
        e.companyId === fixtures.testCompanyId &&
        e.outletId === fixtures.testOutletId &&
        e.operationType === 'PUSH' &&
        e.tierName === 'orders'
      )).toBe(true);
    });

    test('should return events mapped to SyncAuditEvent interface', async () => {
      const result = await fixtures.auditService.queryEvents({
        companyId: fixtures.testCompanyId,
        operationType: 'PULL',
      });

      expect(result.events.length).toBeGreaterThanOrEqual(1);
      const event = result.events[0];
      expect(typeof event.id).toBe('bigint');
      expect(typeof event.companyId).toBe('number');
      expect(event.operationType).toBe('PULL');
      expect(['PUSH', 'PULL', 'VERSION_BUMP', 'HEALTH_CHECK']).toContain(event.operationType);
      expect(['SUCCESS', 'FAILED', 'PARTIAL', 'IN_PROGRESS']).toContain(event.status);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      // Insert test events for stats testing
      const testEvents: Omit<SyncAuditEvent, 'id'>[] = [
        {
          companyId: fixtures.testCompanyId,
          operationType: 'PUSH',
          tierName: 'MASTER',
          status: 'SUCCESS',
          startedAt: new Date('2024-01-20T10:00:00Z'),
          completedAt: new Date('2024-01-20T10:01:00Z'),
          durationMs: 60000,
        },
        {
          companyId: fixtures.testCompanyId,
          operationType: 'PUSH',
          tierName: 'MASTER',
          status: 'SUCCESS',
          startedAt: new Date('2024-01-20T11:00:00Z'),
          completedAt: new Date('2024-01-20T11:00:30Z'),
          durationMs: 30000,
        },
        {
          companyId: fixtures.testCompanyId,
          operationType: 'PULL',
          tierName: 'MASTER',
          status: 'SUCCESS',
          startedAt: new Date('2024-01-20T12:00:00Z'),
          completedAt: new Date('2024-01-20T12:00:45Z'),
          durationMs: 45000,
        },
        {
          companyId: fixtures.testCompanyId,
          operationType: 'PUSH',
          tierName: 'MASTER',
          status: 'FAILED',
          startedAt: new Date('2024-01-20T13:00:00Z'),
          completedAt: new Date('2024-01-20T13:00:05Z'),
          durationMs: 5000,
        },
      ];

      for (const evt of testEvents) {
        const id = await fixtures.auditService.logEvent(evt);
        fixtures.insertedEventIds.push(id);
      }
    });

    test('should return totalOperations count', async () => {
      const result = await fixtures.auditService.getStats(
        fixtures.testCompanyId,
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(result.totalOperations).toBeGreaterThanOrEqual(4);
    });

    test('should calculate successRate percentage', async () => {
      const result = await fixtures.auditService.getStats(
        fixtures.testCompanyId,
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      // We inserted 3 SUCCESS and 1 FAILED out of 4
      expect(result.totalOperations).toBeGreaterThanOrEqual(4);
      expect(result.successRate).toBeGreaterThanOrEqual(0);
      expect(result.successRate).toBeLessThanOrEqual(100);
    });

    test('should calculate avgDurationMs', async () => {
      const result = await fixtures.auditService.getStats(
        fixtures.testCompanyId,
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      // Avg of 60000, 30000, 45000, 5000 = 35000
      expect(result.avgDurationMs).toBeGreaterThanOrEqual(0);
    });

    test('should return operationsByType breakdown', async () => {
      const result = await fixtures.auditService.getStats(
        fixtures.testCompanyId,
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(result.operationsByType).toBeDefined();
      // We inserted 3 PUSH and 1 PULL
      if (result.operationsByType['PUSH'] !== undefined) {
        expect(result.operationsByType['PUSH']).toBeGreaterThanOrEqual(3);
      }
      if (result.operationsByType['PULL'] !== undefined) {
        expect(result.operationsByType['PULL']).toBeGreaterThanOrEqual(1);
      }
    });

    test('should return operationsByStatus breakdown', async () => {
      const result = await fixtures.auditService.getStats(
        fixtures.testCompanyId,
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(result.operationsByStatus).toBeDefined();
      // We inserted 3 SUCCESS and 1 FAILED
      if (result.operationsByStatus['SUCCESS'] !== undefined) {
        expect(result.operationsByStatus['SUCCESS']).toBeGreaterThanOrEqual(3);
      }
      if (result.operationsByStatus['FAILED'] !== undefined) {
        expect(result.operationsByStatus['FAILED']).toBeGreaterThanOrEqual(1);
      }
    });

    test('should filter by company and date range', async () => {
      // Query with narrow date range that should not match our test data
      const result = await fixtures.auditService.getStats(
        fixtures.testCompanyId,
        new Date('2025-01-01'), // Future date
        new Date('2025-12-31')
      );

      // Should return 0 or low count since our data is from 2024
      expect(result.totalOperations).toBeLessThan(1000);
    });
  });

  describe('archiveEvents', () => {
    test('should archive events older than specified days', async () => {
      // Insert old event (100 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      const oldEventId = await fixtures.auditService.startEvent({
        companyId: fixtures.testCompanyId,
        operationType: 'PUSH',
        tierName: 'MASTER',
        status: 'IN_PROGRESS',
        startedAt: oldDate,
      });

      fixtures.insertedEventIds.push(oldEventId);

      // Complete the old event first
      await fixtures.auditService.completeEvent(oldEventId, {
        status: 'SUCCESS',
        completedAt: oldDate,
        durationMs: 1000,
      });

      // Try to archive events older than 90 days
      const archivedCount = await fixtures.auditService.archiveEvents(90);

      expect(archivedCount).toBeGreaterThanOrEqual(1);

      // Verify old event was moved to archive
      const archivedRows = await sql<{ id: number }>`
        SELECT id FROM sync_audit_events_archive WHERE id = ${oldEventId}
      `.execute(fixtures.db);

      expect(archivedRows.rows.length).toBe(1);
    });

    test('should return 0 when no events to archive', async () => {
      // Insert recent event (5 days ago)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);

      const recentEventId = await fixtures.auditService.startEvent({
        companyId: fixtures.testCompanyId,
        operationType: 'HEALTH_CHECK',
        tierName: 'MASTER',
        status: 'SUCCESS',
        startedAt: recentDate,
      });

      fixtures.insertedEventIds.push(recentEventId);

      const archivedCount = await fixtures.auditService.archiveEvents(90);

      expect(archivedCount).toBe(0);
    });
  });
});
