// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  SyncAuditService,
  AuditDbClient,
  SyncAuditEvent,
  AuditQuery,
} from './audit-service';

describe('SyncAuditService', () => {
  let auditService: SyncAuditService;
  let mockDbClient: AuditDbClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDbClient = {
      query: vi.fn(),
      execute: vi.fn(),
      getConnection: vi.fn(),
    };

    auditService = new SyncAuditService(mockDbClient);
  });

  describe('startEvent', () => {
    test('should insert event with IN_PROGRESS status', async () => {
      const mockResult = { affectedRows: 1, insertId: 123 };
      vi.mocked(mockDbClient.execute).mockResolvedValue(mockResult);

      const event: Omit<SyncAuditEvent, 'id'> = {
        companyId: 1,
        outletId: 2,
        operationType: 'PUSH',
        tierName: 'orders',
        status: 'SUCCESS',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        itemsCount: 100,
        versionBefore: BigInt(10),
        clientDeviceId: 'device-123',
      };

      const result = await auditService.startEvent(event);

      expect(mockDbClient.execute).toHaveBeenCalledTimes(1);
      const [sql, values] = vi.mocked(mockDbClient.execute).mock.calls[0];
      expect(sql).toContain('INSERT INTO sync_audit_events');
      expect(values).toContain('IN_PROGRESS');
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain('PUSH');
      expect(values).toContain('orders');
      expect(result).toBe(BigInt(123));
    });

    test('should return event ID', async () => {
      const mockResult = { affectedRows: 1, insertId: 456 };
      vi.mocked(mockDbClient.execute).mockResolvedValue(mockResult);

      const event: Omit<SyncAuditEvent, 'id'> = {
        companyId: 1,
        operationType: 'PULL',
        tierName: 'products',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };

      const result = await auditService.startEvent(event);

      expect(result).toBe(BigInt(456));
    });

    test('should handle database errors', async () => {
      const dbError = new Error('Connection failed');
      vi.mocked(mockDbClient.execute).mockRejectedValue(dbError);

      const event: Omit<SyncAuditEvent, 'id'> = {
        companyId: 1,
        operationType: 'PUSH',
        tierName: 'orders',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };

      await expect(auditService.startEvent(event)).rejects.toThrow('Connection failed');
    });

    test('should handle optional fields as null', async () => {
      const mockResult = { affectedRows: 1, insertId: 789 };
      vi.mocked(mockDbClient.execute).mockResolvedValue(mockResult);

      const event: Omit<SyncAuditEvent, 'id'> = {
        companyId: 1,
        operationType: 'HEALTH_CHECK',
        tierName: 'system',
        status: 'SUCCESS',
        startedAt: new Date(),
      };

      await auditService.startEvent(event);

      const [, values] = vi.mocked(mockDbClient.execute).mock.calls[0];
      expect(values).toContain(null);
    });
  });

  describe('completeEvent', () => {
    test('should update event with completion details', async () => {
      vi.mocked(mockDbClient.execute).mockResolvedValue({ affectedRows: 1 });

      const eventId = BigInt(123);
      const updates: Partial<SyncAuditEvent> = {
        status: 'SUCCESS',
        completedAt: new Date('2024-01-01T10:01:00Z'),
        durationMs: 60000,
        itemsCount: 100,
        versionAfter: BigInt(11),
        responseSizeBytes: 5000,
      };

      await auditService.completeEvent(eventId, updates);

      expect(mockDbClient.execute).toHaveBeenCalledTimes(1);
      const [sql, values] = vi.mocked(mockDbClient.execute).mock.calls[0];
      expect(sql).toContain('UPDATE sync_audit_events');
      expect(sql).toContain('status = ?');
      expect(sql).toContain('completed_at = ?');
      expect(sql).toContain('duration_ms = ?');
      expect(sql).toContain('WHERE id = ?');
      expect(values).toContain('SUCCESS');
      expect(values).toContain(60000);
      expect(values).toContain(123);
    });

    test('should set completed_at, duration_ms, status', async () => {
      vi.mocked(mockDbClient.execute).mockResolvedValue({ affectedRows: 1 });

      const completedAt = new Date('2024-01-01T10:01:00Z');
      const updates: Partial<SyncAuditEvent> = {
        status: 'FAILED',
        completedAt,
        durationMs: 30000,
        errorCode: 'ERR_001',
        errorMessage: 'Sync failed',
      };

      await auditService.completeEvent(BigInt(1), updates);

      const [sql, values] = vi.mocked(mockDbClient.execute).mock.calls[0];
      expect(sql).toContain('status = ?');
      expect(sql).toContain('completed_at = ?');
      expect(sql).toContain('duration_ms = ?');
      expect(sql).toContain('error_code = ?');
      expect(sql).toContain('error_message = ?');
      expect(values).toContain('FAILED');
      expect(values).toContain(completedAt);
      expect(values).toContain(30000);
      expect(values).toContain('ERR_001');
      expect(values).toContain('Sync failed');
    });

    test('should handle non-existent event ID gracefully', async () => {
      vi.mocked(mockDbClient.execute).mockResolvedValue({ affectedRows: 0 });

      const updates: Partial<SyncAuditEvent> = {
        status: 'SUCCESS',
        completedAt: new Date(),
        durationMs: 1000,
      };

      await expect(
        auditService.completeEvent(BigInt(99999), updates)
      ).resolves.not.toThrow();

      expect(mockDbClient.execute).toHaveBeenCalledTimes(1);
    });

    test('should return early when no updates provided', async () => {
      await auditService.completeEvent(BigInt(1), {});

      expect(mockDbClient.execute).not.toHaveBeenCalled();
    });

    test('should only update provided fields', async () => {
      vi.mocked(mockDbClient.execute).mockResolvedValue({ affectedRows: 1 });

      const updates: Partial<SyncAuditEvent> = {
        status: 'PARTIAL',
      };

      await auditService.completeEvent(BigInt(1), updates);

      const [sql] = vi.mocked(mockDbClient.execute).mock.calls[0];
      expect(sql).toContain('status = ?');
      expect(sql).not.toContain('completed_at');
      expect(sql).not.toContain('duration_ms');
    });
  });

  describe('logEvent', () => {
    test('should create complete event in one call', async () => {
      const mockResult = { affectedRows: 1, insertId: 100 };
      vi.mocked(mockDbClient.execute).mockResolvedValue(mockResult);

      const event: SyncAuditEvent = {
        companyId: 1,
        outletId: 2,
        operationType: 'VERSION_BUMP',
        tierName: 'invoices',
        status: 'SUCCESS',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:00:05Z'),
        durationMs: 5000,
        itemsCount: 1,
        versionBefore: BigInt(5),
        versionAfter: BigInt(6),
      };

      await auditService.logEvent(event);

      expect(mockDbClient.execute).toHaveBeenCalledTimes(1);
      const [sql, values] = vi.mocked(mockDbClient.execute).mock.calls[0];
      expect(sql).toContain('INSERT INTO sync_audit_events');
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain('VERSION_BUMP');
      expect(values).toContain('invoices');
      expect(values).toContain('SUCCESS');
      expect(values).toContain(5000);
    });

    test('should return event ID', async () => {
      const mockResult = { affectedRows: 1, insertId: 200 };
      vi.mocked(mockDbClient.execute).mockResolvedValue(mockResult);

      const event: SyncAuditEvent = {
        companyId: 1,
        operationType: 'HEALTH_CHECK',
        tierName: 'system',
        status: 'SUCCESS',
        startedAt: new Date(),
      };

      const result = await auditService.logEvent(event);

      expect(result).toBe(BigInt(200));
    });

    test('should handle all event fields', async () => {
      const mockResult = { affectedRows: 1, insertId: 300 };
      vi.mocked(mockDbClient.execute).mockResolvedValue(mockResult);

      const event: SyncAuditEvent = {
        companyId: 1,
        outletId: 2,
        operationType: 'PUSH',
        tierName: 'orders',
        status: 'PARTIAL',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:01:00Z'),
        durationMs: 60000,
        itemsCount: 100,
        versionBefore: BigInt(10),
        versionAfter: BigInt(11),
        errorCode: 'PARTIAL_001',
        errorMessage: 'Some items failed',
        clientDeviceId: 'device-abc',
        clientVersion: 'v1.2.3',
        requestSizeBytes: 10000,
        responseSizeBytes: 5000,
      };

      await auditService.logEvent(event);

      const [, values] = vi.mocked(mockDbClient.execute).mock.calls[0];
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain('PUSH');
      expect(values).toContain('orders');
      expect(values).toContain('PARTIAL');
      expect(values).toContain(60000);
      expect(values).toContain(100);
      expect(values).toContain('PARTIAL_001');
      expect(values).toContain('Some items failed');
      expect(values).toContain('device-abc');
      expect(values).toContain('v1.2.3');
      expect(values).toContain(10000);
      expect(values).toContain(5000);
    });
  });

  describe('queryEvents', () => {
    test('should query by companyId', async () => {
      const mockRows = [
        {
          id: BigInt(1),
          company_id: 1,
          outlet_id: null,
          operation_type: 'PUSH',
          tier_name: 'orders',
          status: 'SUCCESS',
          started_at: new Date(),
          completed_at: null,
          duration_ms: null,
          items_count: null,
          version_before: null,
          version_after: null,
          error_code: null,
          error_message: null,
          client_device_id: null,
          client_version: null,
          request_size_bytes: null,
          response_size_bytes: null,
        },
      ];
      vi.mocked(mockDbClient.query).mockResolvedValueOnce([{ total: 1 }]);
      vi.mocked(mockDbClient.query).mockResolvedValueOnce(mockRows);

      const query: AuditQuery = { companyId: 1 };
      const result = await auditService.queryEvents(query);

      expect(mockDbClient.query).toHaveBeenCalledTimes(2);
      const [countSql, countValues] = vi.mocked(mockDbClient.query).mock.calls[0];
      expect(countSql).toContain('company_id = ?');
      expect(countValues).toContain(1);
      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    test('should query by outletId', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 5 }])
        .mockResolvedValueOnce([]);

      const query: AuditQuery = { outletId: 10 };
      await auditService.queryEvents(query);

      const [sql, values] = vi.mocked(mockDbClient.query).mock.calls[0];
      expect(sql).toContain('outlet_id = ?');
      expect(values).toContain(10);
    });

    test('should query by operationType', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce([]);

      const query: AuditQuery = { operationType: 'PUSH' };
      await auditService.queryEvents(query);

      const [sql, values] = vi.mocked(mockDbClient.query).mock.calls[0];
      expect(sql).toContain('operation_type = ?');
      expect(values).toContain('PUSH');
    });

    test('should query by tierName', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([]);

      const query: AuditQuery = { tierName: 'orders' };
      await auditService.queryEvents(query);

      const [sql, values] = vi.mocked(mockDbClient.query).mock.calls[0];
      expect(sql).toContain('tier_name = ?');
      expect(values).toContain('orders');
    });

    test('should query by status', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([]);

      const query: AuditQuery = { status: 'FAILED' };
      await auditService.queryEvents(query);

      const [sql, values] = vi.mocked(mockDbClient.query).mock.calls[0];
      expect(sql).toContain('status = ?');
      expect(values).toContain('FAILED');
    });

    test('should query by date range', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 10 }])
        .mockResolvedValueOnce([]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const query: AuditQuery = { startDate, endDate };
      await auditService.queryEvents(query);

      const [sql, values] = vi.mocked(mockDbClient.query).mock.calls[0];
      expect(sql).toContain('started_at >= ?');
      expect(sql).toContain('started_at <= ?');
      expect(values).toContain(startDate);
      expect(values).toContain(endDate);
    });

    test('should support pagination with limit and offset', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 100 }])
        .mockResolvedValueOnce([]);

      const query: AuditQuery = { limit: 10, offset: 20 };
      await auditService.queryEvents(query);

      const [, dataValues] = vi.mocked(mockDbClient.query).mock.calls[1];
      expect(dataValues).toContain(10);
      expect(dataValues).toContain(20);
    });

    test('should return total count', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 42 }])
        .mockResolvedValueOnce([]);

      const result = await auditService.queryEvents({});

      expect(result.total).toBe(42);
    });

    test('should combine multiple filters', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([]);

      const query: AuditQuery = {
        companyId: 1,
        outletId: 2,
        operationType: 'PUSH',
        tierName: 'orders',
        status: 'SUCCESS',
      };
      await auditService.queryEvents(query);

      const [sql, values] = vi.mocked(mockDbClient.query).mock.calls[0];
      expect(sql).toContain('company_id = ?');
      expect(sql).toContain('outlet_id = ?');
      expect(sql).toContain('operation_type = ?');
      expect(sql).toContain('tier_name = ?');
      expect(sql).toContain('status = ?');
      expect(values).toContain(1);
      expect(values).toContain(2);
      expect(values).toContain('PUSH');
      expect(values).toContain('orders');
      expect(values).toContain('SUCCESS');
    });

    test('should return events mapped to SyncAuditEvent interface', async () => {
      const mockRows = [
        {
          id: BigInt(1),
          company_id: 1,
          outlet_id: 2,
          operation_type: 'PUSH',
          tier_name: 'orders',
          status: 'SUCCESS',
          started_at: new Date('2024-01-01T10:00:00Z'),
          completed_at: new Date('2024-01-01T10:01:00Z'),
          duration_ms: 60000,
          items_count: 100,
          version_before: BigInt(10),
          version_after: BigInt(11),
          error_code: null,
          error_message: null,
          client_device_id: 'device-123',
          client_version: 'v1.0.0',
          request_size_bytes: 1000,
          response_size_bytes: 2000,
        },
      ];
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockRows);

      const result = await auditService.queryEvents({});

      expect(result.events).toHaveLength(1);
      const event = result.events[0];
      expect(event.id).toBe(BigInt(1));
      expect(event.companyId).toBe(1);
      expect(event.outletId).toBe(2);
      expect(event.operationType).toBe('PUSH');
      expect(event.tierName).toBe('orders');
      expect(event.status).toBe('SUCCESS');
      expect(event.durationMs).toBe(60000);
      expect(event.itemsCount).toBe(100);
      expect(event.clientDeviceId).toBe('device-123');
    });
  });

  describe('getStats', () => {
    test('should return totalOperations count', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 100 }])
        .mockResolvedValueOnce([{ total: 80 }])
        .mockResolvedValueOnce([{ avg_duration: 5000 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await auditService.getStats(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.totalOperations).toBe(100);
    });

    test('should calculate successRate percentage', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 100 }])
        .mockResolvedValueOnce([{ total: 75 }])
        .mockResolvedValueOnce([{ avg_duration: 5000 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await auditService.getStats(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.successRate).toBe(75);
    });

    test('should handle zero total operations for successRate', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ avg_duration: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await auditService.getStats(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.successRate).toBe(0);
    });

    test('should calculate avgDurationMs', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 50 }])
        .mockResolvedValueOnce([{ total: 45 }])
        .mockResolvedValueOnce([{ avg_duration: 1234.56 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await auditService.getStats(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.avgDurationMs).toBe(1234.56);
    });

    test('should handle null avg_duration', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 10 }])
        .mockResolvedValueOnce([{ total: 10 }])
        .mockResolvedValueOnce([{ avg_duration: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await auditService.getStats(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.avgDurationMs).toBe(0);
    });

    test('should return operationsByType breakdown', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 100 }])
        .mockResolvedValueOnce([{ total: 90 }])
        .mockResolvedValueOnce([{ avg_duration: 5000 }])
        .mockResolvedValueOnce([
          { operation_type: 'PUSH', count: 50 },
          { operation_type: 'PULL', count: 30 },
          { operation_type: 'VERSION_BUMP', count: 20 },
        ])
        .mockResolvedValueOnce([]);

      const result = await auditService.getStats(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.operationsByType).toEqual({
        PUSH: 50,
        PULL: 30,
        VERSION_BUMP: 20,
      });
    });

    test('should return operationsByStatus breakdown', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 100 }])
        .mockResolvedValueOnce([{ total: 90 }])
        .mockResolvedValueOnce([{ avg_duration: 5000 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { status: 'SUCCESS', count: 90 },
          { status: 'FAILED', count: 8 },
          { status: 'PARTIAL', count: 2 },
        ]);

      const result = await auditService.getStats(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.operationsByStatus).toEqual({
        SUCCESS: 90,
        FAILED: 8,
        PARTIAL: 2,
      });
    });

    test('should filter by company and date range', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 10 }])
        .mockResolvedValueOnce([{ total: 9 }])
        .mockResolvedValueOnce([{ avg_duration: 1000 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const companyId = 5;
      const startDate = new Date('2024-06-01');
      const endDate = new Date('2024-06-30');

      await auditService.getStats(companyId, startDate, endDate);

      expect(mockDbClient.query).toHaveBeenCalledTimes(5);
      for (const call of vi.mocked(mockDbClient.query).mock.calls) {
        const [, values] = call;
        expect(values).toContain(companyId);
        expect(values).toContain(startDate);
        expect(values).toContain(endDate);
      }
    });

    test('should round values to 2 decimal places', async () => {
      vi.mocked(mockDbClient.query)
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ avg_duration: 1234.56789 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await auditService.getStats(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.successRate).toBe(33.33);
      expect(result.avgDurationMs).toBe(1234.57);
    });
  });

  describe('archiveEvents', () => {
    test('should move events to archive table', async () => {
      const mockConnection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ affectedRows: 50 }),
        release: vi.fn(),
      };
      vi.mocked(mockDbClient.getConnection!).mockResolvedValue(mockConnection);

      const result = await auditService.archiveEvents(30);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.execute).toHaveBeenCalledTimes(2);
      const [insertSql] = mockConnection.execute.mock.calls[0];
      const [deleteSql] = mockConnection.execute.mock.calls[1];
      expect(insertSql).toContain('INSERT INTO sync_audit_events_archive');
      expect(deleteSql).toContain('DELETE FROM sync_audit_events');
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(result).toBe(50);
    });

    test('should only archive events older than specified days', async () => {
      const mockConnection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ affectedRows: 10 }),
        release: vi.fn(),
      };
      vi.mocked(mockDbClient.getConnection!).mockResolvedValue(mockConnection);

      await auditService.archiveEvents(90);

      const [sql, values] = mockConnection.execute.mock.calls[0];
      expect(sql).toContain('WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)');
      expect(values).toContain(90);
    });

    test('should return number of archived events', async () => {
      const mockConnection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ affectedRows: 100 }),
        release: vi.fn(),
      };
      vi.mocked(mockDbClient.getConnection!).mockResolvedValue(mockConnection);

      const result = await auditService.archiveEvents(30);

      expect(result).toBe(100);
    });

    test('should use transaction for atomic operation', async () => {
      const mockConnection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ affectedRows: 10 }),
        release: vi.fn(),
      };
      vi.mocked(mockDbClient.getConnection!).mockResolvedValue(mockConnection);

      await auditService.archiveEvents(30);

      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.rollback).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully with rollback', async () => {
      const mockConnection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockRejectedValue(new Error('Database error')),
        release: vi.fn(),
      };
      vi.mocked(mockDbClient.getConnection!).mockResolvedValue(mockConnection);

      await expect(auditService.archiveEvents(30)).rejects.toThrow('Database error');

      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).not.toHaveBeenCalled();
    });

    test('should skip delete when no events archived', async () => {
      const mockConnection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ affectedRows: 0 }),
        release: vi.fn(),
      };
      vi.mocked(mockDbClient.getConnection!).mockResolvedValue(mockConnection);

      const result = await auditService.archiveEvents(30);

      expect(mockConnection.execute).toHaveBeenCalledTimes(1);
      expect(result).toBe(0);
    });

    test('should release connection in finally block', async () => {
      const mockConnection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ affectedRows: 10 }),
        release: vi.fn(),
      };
      vi.mocked(mockDbClient.getConnection!).mockResolvedValue(mockConnection);

      await auditService.archiveEvents(30);

      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test('should release connection even on error', async () => {
      const mockConnection = {
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockRejectedValue(new Error('DB error')),
        release: vi.fn(),
      };
      vi.mocked(mockDbClient.getConnection!).mockResolvedValue(mockConnection);

      await expect(auditService.archiveEvents(30)).rejects.toThrow();

      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test('should throw error when getConnection is not supported', async () => {
      const serviceWithoutConnection = new SyncAuditService({
        query: vi.fn(),
        execute: vi.fn(),
      });

      await expect(serviceWithoutConnection.archiveEvents(30)).rejects.toThrow(
        'Database client does not support transactions'
      );
    });
  });
});
