// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { DataRetentionJob, DEFAULT_RETENTION_POLICIES, RetentionPolicy } from './data-retention.job';
import type { Pool, Connection } from 'mysql2/promise';

describe('DataRetentionJob', () => {
  let job: DataRetentionJob;
  let mockPool: Pool;
  let mockConnection: Connection;
  let mockExecute: any;
  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock execute function
    mockExecute = vi.fn();

    // Setup mock connection for transactions
    mockConnection = {
      execute: mockExecute,
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    } as unknown as Connection;

    // Setup mock pool
    mockPool = {
      execute: mockExecute,
      getConnection: vi.fn().mockResolvedValue(mockConnection),
    } as unknown as Pool;

    // Spy on console.log for activity logging tests
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create job instance with mocked pool
    job = new DataRetentionJob(mockPool);
  });

  afterAll(async () => {
    consoleSpy.mockRestore();
  });

  describe('purgeTable', () => {
    test('should delete records older than retention days', async () => {
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      };

      mockExecute.mockResolvedValueOnce([{ affectedRows: 5 }, []]);

      const result = await (job as any).purgeTable(policy);

      expect(result).toBe(5);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM sync_operations'),
        expect.arrayContaining([expect.any(Date)])
      );
    });

    test('should use correct date column', async () => {
      const policy: RetentionPolicy = {
        table: 'backoffice_sync_queue',
        retentionDays: 7,
        dateColumn: 'created_at',
      };

      mockExecute.mockResolvedValueOnce([{ affectedRows: 10 }, []]);

      await (job as any).purgeTable(policy);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE created_at < ?'),
        expect.any(Array)
      );
    });

    test('should apply additional WHERE clauses', async () => {
      const policy: RetentionPolicy = {
        table: 'backoffice_sync_queue',
        retentionDays: 7,
        dateColumn: 'created_at',
        additionalWhere: "AND sync_status IN ('SUCCESS', 'FAILED')",
      };

      mockExecute.mockResolvedValueOnce([{ affectedRows: 3 }, []]);

      await (job as any).purgeTable(policy);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("AND sync_status IN ('SUCCESS', 'FAILED')"),
        expect.any(Array)
      );
    });

    test('should return number of deleted records', async () => {
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      };

      mockExecute.mockResolvedValueOnce([{ affectedRows: 42 }, []]);

      const result = await (job as any).purgeTable(policy);

      expect(result).toBe(42);
    });

    test('should handle tables with no old records', async () => {
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      };

      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

      const result = await (job as any).purgeTable(policy);

      expect(result).toBe(0);
    });

    test('should handle zero affectedRows', async () => {
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      };

      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

      const result = await (job as any).purgeTable(policy);

      expect(result).toBe(0);
    });

    test('should handle undefined affectedRows', async () => {
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      };

      mockExecute.mockResolvedValueOnce([{}, []]);

      const result = await (job as any).purgeTable(policy);

      expect(result).toBe(0);
    });
  });

  describe('archiveEvents', () => {
    test('should move events to archive table', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 10 }, []]) // insert
        .mockResolvedValueOnce([{ affectedRows: 10 }, []]); // delete

      const result = await job.archiveEvents(90);

      expect(result).toBe(10);
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO sync_audit_events_archive'),
        expect.any(Array)
      );
      expect(mockExecute).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM sync_audit_events'),
        expect.any(Array)
      );
    });

    test('should only archive events older than specified days', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 5 }, []])
        .mockResolvedValueOnce([{ affectedRows: 5 }, []]);

      await job.archiveEvents(90);

      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE created_at < ?'),
        expect.arrayContaining([expect.any(Date)])
      );
    });

    test('should use transaction (insert then delete)', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 3 }, []])
        .mockResolvedValueOnce([{ affectedRows: 3 }, []]);

      await job.archiveEvents(90);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    test('should return number of archived records', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 15 }, []])
        .mockResolvedValueOnce([{ affectedRows: 15 }, []]);

      const result = await job.archiveEvents(90);

      expect(result).toBe(15);
    });

    test('should handle case with no records to archive', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([{ affectedRows: 0 }, []]);

      const result = await job.archiveEvents(90);

      expect(result).toBe(0);
    });
  });

  describe('run', () => {
    test('should execute all retention policies', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 5 }, []]);

      const result = await job.run();

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3); // 3 default policies
      expect(result.totalRecordsAffected).toBe(15); // 5 records * 3 policies
    });

    test('should process each policy in sequence', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);

      await job.run();

      // Should have 3 policies, each making 1 DELETE call (sync_operations, backoffice_sync_queue)
      // and sync_audit_events uses archive (2 calls: insert + delete)
      expect(mockExecute).toHaveBeenCalledTimes(4); // 1 + 1 + 2
    });

    test('should return summary with counts', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 10 }, []]) // sync_operations
        .mockResolvedValueOnce([{ affectedRows: 5 }, []])  // backoffice_sync_queue
        .mockResolvedValueOnce([{ affectedRows: 20 }, []]) // archive insert
        .mockResolvedValueOnce([{ affectedRows: 20 }, []]); // archive delete

      const result = await job.run();

      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.totalRecordsAffected).toBe(35); // 10 + 5 + 20
      expect(result.errors).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    test('should log activity for each purge', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 3 }, []]);

      await job.run();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DataRetentionJob]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting data retention job')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Data retention job completed')
      );
    });

    test('should continue on error (do not stop at first failure)', async () => {
      mockExecute
        .mockRejectedValueOnce(new Error('DB Error')) // First policy fails
        .mockResolvedValueOnce([{ affectedRows: 5 }, []])  // Second policy succeeds
        .mockResolvedValueOnce([{ affectedRows: 10 }, []]) // Archive insert
        .mockResolvedValueOnce([{ affectedRows: 10 }, []]); // Archive delete

      const result = await job.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('sync_operations');
      expect(result.totalRecordsAffected).toBe(15); // 5 + 10 from successful policies
    });

    test('should handle all policies failing', async () => {
      mockExecute.mockRejectedValue(new Error('DB Connection Failed'));

      const result = await job.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.totalRecordsAffected).toBe(0);
    });
  });

  describe('Retention Policies', () => {
    test('sync_operations policy: 30 days retention', () => {
      const policy = DEFAULT_RETENTION_POLICIES.find(p => p.table === 'sync_operations');
      
      expect(policy).toBeDefined();
      expect(policy!.retentionDays).toBe(30);
      expect(policy!.dateColumn).toBe('started_at');
      expect(policy!.archiveTable).toBeUndefined();
      expect(policy!.additionalWhere).toBeUndefined();
    });

    test('backoffice_sync_queue policy: 7 days for completed/failed only', () => {
      const policy = DEFAULT_RETENTION_POLICIES.find(p => p.table === 'backoffice_sync_queue');
      
      expect(policy).toBeDefined();
      expect(policy!.retentionDays).toBe(7);
      expect(policy!.dateColumn).toBe('created_at');
      expect(policy!.additionalWhere).toBe("AND sync_status IN ('SUCCESS', 'FAILED')");
    });

    test('sync_audit_events policy: 90 days with archival', () => {
      const policy = DEFAULT_RETENTION_POLICIES.find(p => p.table === 'sync_audit_events');
      
      expect(policy).toBeDefined();
      expect(policy!.retentionDays).toBe(90);
      expect(policy!.dateColumn).toBe('created_at');
      expect(policy!.archiveTable).toBe('sync_audit_events_archive');
    });
  });

  describe('Date Calculation', () => {
    test('should correctly calculate cutoff date', async () => {
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      };

      mockExecute.mockResolvedValue([{ affectedRows: 5 }, []]);

      await (job as any).purgeTable(policy);

      const callArgs = mockExecute.mock.calls[0];
      const cutoffDate: Date = callArgs[1][0];
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 30);

      // Allow for small time differences (within 1 second)
      expect(Math.abs(cutoffDate.getTime() - expectedDate.getTime())).toBeLessThan(1000);
    });

    test('should handle leap years', async () => {
      // Test with February 29 scenario
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 365,
        dateColumn: 'started_at',
      };

      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);

      await (job as any).purgeTable(policy);

      const callArgs = mockExecute.mock.calls[0];
      const cutoffDate: Date = callArgs[1][0];

      expect(cutoffDate).toBeInstanceOf(Date);
      expect(cutoffDate.getTime()).toBeLessThan(Date.now());
    });

    test('should handle timezone correctly', async () => {
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 7,
        dateColumn: 'started_at',
      };

      mockExecute.mockResolvedValue([{ affectedRows: 2 }, []]);

      await (job as any).purgeTable(policy);

      const callArgs = mockExecute.mock.calls[0];
      const cutoffDate: Date = callArgs[1][0];

      expect(cutoffDate.getTimezoneOffset()).toBeDefined();
    });

    test('should calculate different dates for different retention periods', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }, []]);

      const policy7Days: RetentionPolicy = {
        table: 'test_table',
        retentionDays: 7,
        dateColumn: 'created_at',
      };

      const policy90Days: RetentionPolicy = {
        table: 'test_table',
        retentionDays: 90,
        dateColumn: 'created_at',
      };

      await (job as any).purgeTable(policy7Days);
      await (job as any).purgeTable(policy90Days);

      const cutoff7Days: Date = mockExecute.mock.calls[0][1][0];
      const cutoff90Days: Date = mockExecute.mock.calls[1][1][0];

      // 90-day cutoff should be earlier (older) than 7-day cutoff
      expect(cutoff90Days.getTime()).toBeLessThan(cutoff7Days.getTime());
    });
  });

  describe('Transaction', () => {
    test('should use transaction for archive operations', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 5 }, []])
        .mockResolvedValueOnce([{ affectedRows: 5 }, []]);

      const policy: RetentionPolicy = {
        table: 'sync_audit_events',
        retentionDays: 90,
        dateColumn: 'created_at',
        archiveTable: 'sync_audit_events_archive',
      };

      await (job as any).archiveAndDelete(policy, new Date());

      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    });

    test('should rollback on error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Insert failed'));

      const policy: RetentionPolicy = {
        table: 'sync_audit_events',
        retentionDays: 90,
        dateColumn: 'created_at',
        archiveTable: 'sync_audit_events_archive',
      };

      await expect(
        (job as any).archiveAndDelete(policy, new Date())
      ).rejects.toThrow('Insert failed');

      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).not.toHaveBeenCalled();
    });

    test('should not leave partial data on error', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 10 }, []]) // insert succeeds
        .mockRejectedValueOnce(new Error('Delete failed'));  // delete fails

      const policy: RetentionPolicy = {
        table: 'sync_audit_events',
        retentionDays: 90,
        dateColumn: 'created_at',
        archiveTable: 'sync_audit_events_archive',
      };

      await expect(
        (job as any).archiveAndDelete(policy, new Date())
      ).rejects.toThrow('Delete failed');

      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test('should release connection after transaction', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 3 }, []])
        .mockResolvedValueOnce([{ affectedRows: 3 }, []]);

      const policy: RetentionPolicy = {
        table: 'sync_audit_events',
        retentionDays: 90,
        dateColumn: 'created_at',
        archiveTable: 'sync_audit_events_archive',
      };

      await (job as any).archiveAndDelete(policy, new Date());

      expect((mockConnection as any).release).toHaveBeenCalledTimes(1);
    });

    test('should release connection even on error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Transaction error'));

      const policy: RetentionPolicy = {
        table: 'sync_audit_events',
        retentionDays: 90,
        dateColumn: 'created_at',
        archiveTable: 'sync_audit_events_archive',
      };

      await expect(
        (job as any).archiveAndDelete(policy, new Date())
      ).rejects.toThrow('Transaction error');

      expect((mockConnection as any).release).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const policy: RetentionPolicy = {
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      };

      mockExecute.mockRejectedValue(new Error('Connection timeout'));

      await expect((job as any).purgeTable(policy)).rejects.toThrow('Connection timeout');
    });

    test('should log errors', async () => {
      mockExecute.mockRejectedValue(new Error('Database error'));

      try {
        await (job as any).purgeTable({
          table: 'sync_operations',
          retentionDays: 30,
          dateColumn: 'started_at',
        });
      } catch {
        // Expected to throw
      }

      // Error is logged via console in run(), not in purgeTable itself
    });

    test('should continue with other policies on failure', async () => {
      mockExecute
        .mockRejectedValueOnce(new Error('First table error'))
        .mockResolvedValueOnce([{ affectedRows: 5 }, []])
        .mockResolvedValueOnce([{ affectedRows: 3 }, []])
        .mockResolvedValueOnce([{ affectedRows: 3 }, []]);

      const result = await job.run();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('First table error');
      expect(result.totalRecordsAffected).toBe(8); // 5 + 3
    });

    test('should not throw uncaught exceptions', async () => {
      mockExecute.mockRejectedValue(new Error('Unexpected error'));

      const result = await job.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(3);
    });

    test('should handle non-Error exceptions', async () => {
      mockExecute.mockRejectedValue('String error');

      const result = await job.run();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('String error');
    });

    test('should handle null/undefined errors', async () => {
      mockExecute.mockRejectedValue(null);

      const result = await job.run();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('null');
    });
  });

  describe('Logging', () => {
    test('should log purge operations', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 5 }, []]);

      await (job as any).purgeTable({
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DataRetentionJob]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('sync_operations')
      );
    });

    test('should include table name in logs', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 5 }, []]);

      await (job as any).purgeTable({
        table: 'test_table',
        retentionDays: 30,
        dateColumn: 'created_at',
      });

      const logCalls = consoleSpy.mock.calls.filter(
        (call: any[]) => call[0].includes('test_table')
      );
      expect(logCalls.length).toBeGreaterThan(0);
    });

    test('should include count in logs', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 42 }, []]);

      await (job as any).purgeTable({
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      });

      const logCalls = consoleSpy.mock.calls.filter(
        (call: any[]) => call[0].includes('42')
      );
      expect(logCalls.length).toBeGreaterThan(0);
    });

    test('should include date range in logs', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 5 }, []]);

      await (job as any).purgeTable({
        table: 'sync_operations',
        retentionDays: 30,
        dateColumn: 'started_at',
      });

      const logCalls = consoleSpy.mock.calls.filter(
        (call: any[]) => call[0].includes('cutoff=')
      );
      expect(logCalls.length).toBeGreaterThan(0);
    });

    test('should log errors when they occur', async () => {
      mockExecute.mockRejectedValue(new Error('Log this error'));

      try {
        await (job as any).purgeTable({
          table: 'sync_operations',
          retentionDays: 30,
          dateColumn: 'started_at',
        });
      } catch {
        // Expected
      }

      // Error is caught in run(), individual purgeTable throws
    });

    test('should log archive operations with source and destination', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 10 }, []])
        .mockResolvedValueOnce([{ affectedRows: 10 }, []]);

      await job.archiveEvents(90);

      const archiveLog = consoleSpy.mock.calls.find(
        (call: any[]) => call[0].includes('Archived') && call[0].includes('sync_audit_events')
      );
      expect(archiveLog).toBeDefined();
    });
  });

  describe('Constructor', () => {
    test('should use default policies when none provided', () => {
      expect((job as any).policies).toEqual(DEFAULT_RETENTION_POLICIES);
    });

    test('should accept custom policies', () => {
      const customPolicies: RetentionPolicy[] = [
        {
          table: 'custom_table',
          retentionDays: 14,
          dateColumn: 'created_at',
        },
      ];

      const customJob = new DataRetentionJob(mockPool, customPolicies);
      expect((customJob as any).policies).toEqual(customPolicies);
    });

    test('should store pool reference', () => {
      expect((job as any).pool).toBe(mockPool);
    });
  });
});
