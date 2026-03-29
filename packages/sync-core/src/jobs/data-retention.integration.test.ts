// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * DataRetentionJob Integration Tests
 *
 * Tests for DataRetentionJob using real database connections from .env.
 * These tests verify actual purge behavior against sync_operations,
 * backoffice_sync_queue, and sync_audit_events tables.
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

// Load .env file before any other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDbPool, DbConn } from '@jurnapod/db';
import type { Pool } from 'mysql2';
import { DataRetentionJob, DEFAULT_RETENTION_POLICIES, RetentionPolicy } from './data-retention.job.js';

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
  db: DbConn;
  pool: Pool;
  testCompanyId: number;
  testOutletId: number;
}

async function setupTestFixtures(): Promise<TestFixtures> {
  const config = loadTestConfig();
  
  // Create database pool using environment variables
  const pool = createDbPool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'jurnapod',
    connectionLimit: 5,
    dateStrings: true,
  });

  const db = new DbConn(pool);

  // Find test company fixture
  const companyRows = await db.queryAll<any>(
    `SELECT c.id AS company_id, o.id AS outlet_id
     FROM companies c
     INNER JOIN outlets o ON o.company_id = c.id
     WHERE c.code = ?
       AND o.code = ?
     LIMIT 1`,
    [config.companyCode, config.outletCode]
  );

  if (companyRows.length === 0) {
    throw new Error(
      `Company fixture not found; run database seed first. ` +
      `Looking for company=${config.companyCode}, outlet=${config.outletCode}`
    );
  }

  return {
    db,
    pool,
    testCompanyId: Number(companyRows[0].company_id),
    testOutletId: Number(companyRows[0].outlet_id),
  };
}

async function closePool(pool: Pool): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    pool.end((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Insert a sync_operation record with a specific started_at date
 */
async function insertSyncOperation(
  db: DbConn,
  companyId: number,
  outletId: number | null,
  startedAt: Date,
  status: string = 'SUCCESS'
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO sync_operations 
     (company_id, outlet_id, sync_module, tier, operation_type, request_id, started_at, completed_at, status)
     VALUES (?, ?, 'POS', 'OPERATIONAL', 'PUSH', UUID(), ?, ?, ?)`,
    [companyId, outletId, startedAt, startedAt, status]
  );
  return result.insertId ?? 0;
}

/**
 * Insert a backoffice_sync_queue record with a specific created_at date
 */
async function insertBackofficeSyncQueue(
  db: DbConn,
  companyId: number,
  createdAt: Date,
  syncStatus: string = 'SUCCESS'
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO backoffice_sync_queue 
     (company_id, document_type, document_id, tier, sync_status, scheduled_at, created_at)
     VALUES (?, 'INVOICE', 1, 'OPERATIONAL', ?, ?, ?)`,
    [companyId, syncStatus, createdAt, createdAt]
  );
  return result.insertId ?? 0;
}

/**
 * Insert a sync_audit_event record with a specific created_at date
 */
async function insertSyncAuditEvent(
  db: DbConn,
  companyId: number,
  createdAt: Date
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO sync_audit_events 
     (company_id, operation_type, tier_name, status, started_at, completed_at, created_at)
     VALUES (?, 'PUSH', 'OPERATIONAL', 'SUCCESS', ?, ?, ?)`,
    [companyId, createdAt, createdAt, createdAt]
  );
  return result.insertId ?? 0;
}

/**
 * Get count of records older than a certain number of days in a table
 */
async function getOldRecordsCount(
  db: DbConn,
  table: string,
  dateColumn: string,
  days: number
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const rows = await db.queryAll<any>(
    `SELECT COUNT(*) as cnt FROM ${table} WHERE ${dateColumn} < ?`,
    [cutoffDate]
  );
  return rows[0]?.cnt ?? 0;
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
    await closePool(fixtures.pool);
  });

  beforeEach(async () => {
    // Clean up test data before each test to ensure isolation
    await fixtures.db.execute(
      `DELETE FROM sync_operations WHERE request_id LIKE 'test-%'`
    );
    await fixtures.db.execute(
      `DELETE FROM backoffice_sync_queue WHERE document_id = 99999`
    );
    await fixtures.db.execute(
      `DELETE FROM sync_audit_events WHERE operation_type = 'TEST'`
    );
    await fixtures.db.execute(
      `DELETE FROM sync_audit_events_archive WHERE operation_type = 'TEST'`
    );
  });

  describe('purgeTable', () => {
    test('should delete sync_operations older than 30 days', async () => {
      const companyId = fixtures.testCompanyId;
      
      // Insert old records (35 days old)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);
      
      await insertSyncOperation(fixtures.db, companyId, null, oldDate, 'SUCCESS');
      await insertSyncOperation(fixtures.db, companyId, null, oldDate, 'SUCCESS');
      
      // Insert recent records (5 days old) - should NOT be deleted
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      const recentId = await insertSyncOperation(fixtures.db, companyId, null, recentDate, 'SUCCESS');
      
      const oldCountBefore = await getOldRecordsCount(fixtures.db, 'sync_operations', 'started_at', 30);
      
      const job = new DataRetentionJob(fixtures.db);
      const result = await (job as any).purgeTable({
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      });
      
      expect(result.table).toBe('sync_operations');
      expect(result.recordsAffected).toBeGreaterThanOrEqual(2);
      expect(result.archived).toBe(false);
      
      // Verify old records are gone
      const oldCountAfter = await getOldRecordsCount(fixtures.db, 'sync_operations', 'started_at', 30);
      expect(oldCountAfter).toBeLessThan(oldCountBefore);
    });

    test('should respect additional WHERE clauses', async () => {
      const companyId = fixtures.testCompanyId;
      
      // Insert old records with SUCCESS status (should be deleted)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      await insertBackofficeSyncQueue(fixtures.db, companyId, oldDate, 'SUCCESS');
      await insertBackofficeSyncQueue(fixtures.db, companyId, oldDate, 'SUCCESS');
      
      // Insert old records with PENDING status (should NOT be deleted due to additionalWhere)
      await fixtures.db.execute(
        `INSERT INTO backoffice_sync_queue 
         (company_id, document_type, document_id, tier, sync_status, scheduled_at, created_at)
         VALUES (?, 'INVOICE', 99999, 'OPERATIONAL', 'PENDING', ?, ?)`,
        [companyId, oldDate, oldDate]
      );
      
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
      const pendingRows = await fixtures.db.queryAll<any>(
        `SELECT COUNT(*) as cnt FROM backoffice_sync_queue WHERE document_id = 99999 AND sync_status = 'PENDING'`
      );
      expect(pendingRows[0].cnt).toBe(1);
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
      
      const recentEventId = await insertSyncAuditEvent(fixtures.db, companyId, recentDate);
      
      const job = new DataRetentionJob(fixtures.db);
      const result = await job.archiveEvents(90);
      
      // Should have archived the old event
      expect(result.recordsAffected).toBeGreaterThanOrEqual(1);
      
      // Verify old event was moved to archive
      const archivedRows = await fixtures.db.queryAll<any>(
        `SELECT COUNT(*) as cnt FROM sync_audit_events_archive WHERE id = ?`,
        [oldEventId]
      );
      expect(archivedRows[0].cnt).toBe(1);
      
      // Verify recent event still exists in main table
      const recentRows = await fixtures.db.queryAll<any>(
        `SELECT COUNT(*) as cnt FROM sync_audit_events WHERE id = ?`,
        [recentEventId]
      );
      expect(recentRows[0].cnt).toBe(1);
    });

    test('should return 0 when no events to archive', async () => {
      // First clean up any old test events
      await fixtures.db.execute(
        `DELETE FROM sync_audit_events WHERE operation_type = 'TEST' AND created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)`
      );
      
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
      
      // Old sync_operation
      await insertSyncOperation(fixtures.db, companyId, null, oldDate, 'SUCCESS');
      
      // Old backoffice_sync_queue (SUCCESS status)
      await insertBackofficeSyncQueue(fixtures.db, companyId, oldDate, 'SUCCESS');
      
      // Old sync_audit_event
      await insertSyncAuditEvent(fixtures.db, companyId, oldDate);
      
      const job = new DataRetentionJob(fixtures.db);
      const result = await job.run();
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3); // 3 default policies
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.totalRecordsAffected).toBeGreaterThanOrEqual(0);
      expect(result.errors).toHaveLength(0);
      
      // Verify all three policies were executed
      const tablesExecuted = result.results.map(r => r.table);
      expect(tablesExecuted).toContain('sync_operations');
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
      
      // Insert old sync_operation
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      await insertSyncOperation(fixtures.db, companyId, null, oldDate, 'SUCCESS');
      
      const job = new DataRetentionJob(fixtures.db);
      const result = await job.run();
      
      const syncOpResult = result.results.find(r => r.table === 'sync_operations');
      expect(syncOpResult).toBeDefined();
      expect(syncOpResult!.dateRange.from).toBeInstanceOf(Date);
      expect(syncOpResult!.dateRange.to).toBeInstanceOf(Date);
      expect(syncOpResult!.dateRange.from.getTime()).toBeLessThan(syncOpResult!.dateRange.to.getTime());
    });
  });

  describe('Retention Policies', () => {
    test('should have correct default policies defined', () => {
      expect(DEFAULT_RETENTION_POLICIES).toHaveLength(3);
      
      const syncOpsPolicy = DEFAULT_RETENTION_POLICIES.find(p => p.table === 'sync_operations');
      expect(syncOpsPolicy).toBeDefined();
      expect(syncOpsPolicy!.retentionDays).toBe(30);
      expect(syncOpsPolicy!.dateColumn).toBe('started_at');
      expect(syncOpsPolicy!.archiveTable).toBeUndefined();
      
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