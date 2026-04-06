// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * DataRetentionJob Integration Tests
 *
 * Tests for DataRetentionJob using real database connections from .env.
 * These tests verify actual purge behavior against
 * backoffice_sync_queue and sync_audit_events tables.
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

// Load .env file before any other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createKysely, type KyselySchema } from '@jurnapod/db';
import { sql } from 'kysely';
import { DataRetentionJob, DEFAULT_RETENTION_POLICIES, RetentionPolicy } from '../../src/jobs/data-retention.job.js';

// ============================================================================
// Test Configuration
// ============================================================================

interface TestConfig {
  companyCode: string;
  outletCode: string;
  ownerEmail: string;
}

function loadTestConfig(): TestConfig {
  const companyCode = process.env.JP_COMPANY_CODE ?? 'JP';
  const outletCode = process.env.JP_OUTLET_CODE ?? 'MAIN';
  const ownerEmail = process.env.JP_OWNER_EMAIL ?? 'signaldelapanbelas@gmail.com';
  
  return { companyCode, outletCode, ownerEmail };
}

// ============================================================================
// Database Setup
// ============================================================================

interface TestFixtures {
  db: KyselySchema;
  testCompanyId: number;
  testOutletId: number;
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

  return {
    db,
    testCompanyId: Number(companyRows[0].company_id),
    testOutletId: Number(companyRows[0].outlet_id),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Insert a backoffice_sync_queue record with a specific created_at date
 */
async function insertBackofficeSyncQueue(
  db: KyselySchema,
  companyId: number,
  createdAt: Date,
  syncStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'PROCESSING' = 'SUCCESS'
): Promise<number> {
  const result = await db
    .insertInto('backoffice_sync_queue')
    .values({
      company_id: companyId,
      document_type: 'INVOICE',
      document_id: 1,
      tier: 'OPERATIONAL',
      sync_status: syncStatus,
      scheduled_at: createdAt,
      created_at: createdAt,
    })
    .executeTakeFirstOrThrow();
  return Number(result.insertId);
}

/**
 * Insert a sync_audit_event record with a specific created_at date
 */
async function insertSyncAuditEvent(
  db: KyselySchema,
  companyId: number,
  createdAt: Date
): Promise<number> {
  const result = await db
    .insertInto('sync_audit_events')
    .values({
      company_id: companyId,
      operation_type: 'PUSH',
      tier_name: 'OPERATIONAL',
      status: 'SUCCESS',
      started_at: createdAt,
      completed_at: createdAt,
      created_at: createdAt,
    })
    .executeTakeFirstOrThrow();
  return Number(result.insertId);
}

/**
 * Get count of records older than a certain number of days in a table
 */
async function getOldRecordsCount(
  db: KyselySchema,
  table: string,
  dateColumn: string,
  days: number
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  // Use raw SQL for dynamic table/column names since they're not in the schema
  const result = await sql<{ cnt: number }>`
    SELECT COUNT(*) as cnt FROM ${sql.raw(table)} WHERE ${sql.raw(dateColumn)} < ${cutoffDate}
  `.execute(db);
  
  return result.rows[0]?.cnt ?? 0;
}

/**
 * Get count from archive table using raw SQL
 */
async function getArchivedEventCount(
  db: KyselySchema,
  eventId: number
): Promise<number> {
  const result = await sql<{ cnt: number }>`
    SELECT COUNT(*) as cnt FROM sync_audit_events_archive WHERE id = ${eventId}
  `.execute(db);
  return result.rows[0]?.cnt ?? 0;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('DataRetentionJob Integration', () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
  });

  afterAll(async () => {
    await fixtures.db.destroy();
  });

  beforeEach(async () => {
    // Clean up test data before each test to ensure isolation
    await fixtures.db
      .deleteFrom('backoffice_sync_queue')
      .where('document_id', '=', 99999)
      .execute();
    await fixtures.db
      .deleteFrom('sync_audit_events')
      .where('operation_type', '=', 'TEST')
      .execute();
    // Archive table not in schema, use raw SQL
    await sql`DELETE FROM sync_audit_events_archive WHERE operation_type = 'TEST'`.execute(fixtures.db);
  });

  describe('purgeTable', () => {
    test('should respect additional WHERE clauses', async () => {
      const companyId = fixtures.testCompanyId;
      
      // Insert old records with SUCCESS status (should be deleted)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      await insertBackofficeSyncQueue(fixtures.db, companyId, oldDate, 'SUCCESS');
      await insertBackofficeSyncQueue(fixtures.db, companyId, oldDate, 'SUCCESS');
      
      // Insert old records with PENDING status (should NOT be deleted due to additionalWhere)
      await fixtures.db
        .insertInto('backoffice_sync_queue')
        .values({
          company_id: companyId,
          document_type: 'INVOICE',
          document_id: 99999,
          tier: 'OPERATIONAL',
          sync_status: 'PENDING',
          scheduled_at: oldDate,
          created_at: oldDate,
        })
        .execute();
      
      const job = new DataRetentionJob(fixtures.db);
      const result = await (job as any).purgeTable({
        table: 'backoffice_sync_queue',
        retentionDays: 7,
        dateColumn: 'created_at',
        additionalWhere: "AND sync_status IN ('SUCCESS', 'FAILED')",
      });
      
      // Should have deleted only the SUCCESS ones (2), not the PENDING one
      expect(result.recordsAffected).toBeGreaterThanOrEqual(2);
      
      // Verify PENDING record still exists
      const pendingRows = await fixtures.db
        .selectFrom('backoffice_sync_queue')
        .selectAll()
        .where('document_id', '=', 99999)
        .where('sync_status', '=', 'PENDING')
        .execute();
      expect(pendingRows.length).toBe(1);
    });
  });

  describe('archiveEvents', () => {
    test('should archive sync_audit_events older than retention days', async () => {
      const companyId = fixtures.testCompanyId;
      
      // Insert old events (100 days old)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);
      
      const oldEventId = await insertSyncAuditEvent(fixtures.db, companyId, oldDate);
      
      // Insert recent event (5 days old) - should NOT be archived
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      await insertSyncAuditEvent(fixtures.db, companyId, recentDate);
      
      const job = new DataRetentionJob(fixtures.db);
      const result = await job.archiveEvents(90);
      
      // Should have archived the old event
      expect(result.recordsAffected).toBeGreaterThanOrEqual(1);
      
      // Verify old event was moved to archive
      const archivedRows = await getArchivedEventCount(fixtures.db, oldEventId);
      expect(archivedRows).toBe(1);
      
      // Verify recent event still exists in main table
      const recentEventCount = await fixtures.db
        .selectFrom('sync_audit_events')
        .selectAll()
        .where('id', '=', oldEventId + 1) // recent event has different id
        .execute();
      expect(recentEventCount.length).toBe(1);
    });

    test('should return 0 when no events to archive', async () => {
      // First clean up any old test events
      await fixtures.db
        .deleteFrom('sync_audit_events')
        .where('operation_type', '=', 'TEST')
        .execute();
      
      const job = new DataRetentionJob(fixtures.db);
      
      // Insert only recent events (should not be archived)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      await insertSyncAuditEvent(fixtures.db, fixtures.testCompanyId, recentDate);
      
      const result = await job.archiveEvents(90);
      
      expect(result.recordsAffected).toBe(0);
    });
  });

  describe('run', () => {
    test('should execute all default retention policies', async () => {
      const companyId = fixtures.testCompanyId;
      
      // Insert old data for each table
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      
      // Old backoffice_sync_queue (SUCCESS status)
      await insertBackofficeSyncQueue(fixtures.db, companyId, oldDate, 'SUCCESS');
      
      // Old sync_audit_event
      await insertSyncAuditEvent(fixtures.db, companyId, oldDate);
      
      const job = new DataRetentionJob(fixtures.db);
      const result = await job.run();
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2); // 2 default policies (sync_operations dropped)
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.totalRecordsAffected).toBeGreaterThanOrEqual(0);
      expect(result.errors).toHaveLength(0);
      
      // Verify all two policies were executed
      const tablesExecuted = result.results.map(r => r.table);
      expect(tablesExecuted).toContain('backoffice_sync_queue');
      expect(tablesExecuted).toContain('sync_audit_events');
    });

    test('should return error results when policies fail', async () => {
      // Use a non-existent table to trigger an error
      const job = new DataRetentionJob(fixtures.db, [
        {
          table: 'non_existent_table_xyz',
          retentionDays: 30,
          dateColumn: 'created_at',
        },
      ]);
      
      const result = await job.run();
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('non_existent_table_xyz');
      
      // Should still have a result entry for the failed policy
      const failedResult = result.results.find(r => r.table === 'non_existent_table_xyz');
      expect(failedResult).toBeDefined();
      expect(failedResult!.error).toBeDefined();
    });

    test('should include date ranges in results', async () => {
      const companyId = fixtures.testCompanyId;
      
      // Insert old backoffice_sync_queue
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      await insertBackofficeSyncQueue(fixtures.db, companyId, oldDate, 'SUCCESS');
      
      const job = new DataRetentionJob(fixtures.db);
      const result = await job.run();
      
      const backofficeResult = result.results.find(r => r.table === 'backoffice_sync_queue');
      expect(backofficeResult).toBeDefined();
      expect(backofficeResult!.dateRange.from).toBeInstanceOf(Date);
      expect(backofficeResult!.dateRange.to).toBeInstanceOf(Date);
      expect(backofficeResult!.dateRange.from.getTime()).toBeLessThan(backofficeResult!.dateRange.to.getTime());
    });
  });

  describe('Retention Policies', () => {
    test('should have correct default policies defined', () => {
      expect(DEFAULT_RETENTION_POLICIES).toHaveLength(2); // sync_operations dropped
      
      const backofficePolicy = DEFAULT_RETENTION_POLICIES.find(p => p.table === 'backoffice_sync_queue');
      expect(backofficePolicy).toBeDefined();
      expect(backofficePolicy!.retentionDays).toBe(7);
      expect(backofficePolicy!.dateColumn).toBe('created_at');
      expect(backofficePolicy!.additionalWhere).toBe("AND sync_status IN ('SUCCESS', 'FAILED')");
      
      const auditPolicy = DEFAULT_RETENTION_POLICIES.find(p => p.table === 'sync_audit_events');
      expect(auditPolicy).toBeDefined();
      expect(auditPolicy!.retentionDays).toBe(90);
      expect(auditPolicy!.dateColumn).toBe('created_at');
      expect(auditPolicy!.archiveTable).toBe('sync_audit_events_archive');
    });

    test('should accept custom policies', () => {
      const customPolicies: RetentionPolicy[] = [
        {
          table: 'test_table',
          retentionDays: 14,
          dateColumn: 'created_at',
        },
      ];
      
      const job = new DataRetentionJob(fixtures.db, customPolicies);
      expect((job as any).policies).toEqual(customPolicies);
    });
  });
});
