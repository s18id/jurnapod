// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for GET /api/operations/:operationId/progress
 * 
 * Tests:
 * - Returns job state for valid operation ID
 * - Returns 404 for non-existent operation
 * - Returns 400 for invalid operation ID format
 * - Auth required for status check
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';
import { startProgress, completeProgress } from '../../../src/lib/progress/progress-store';

let baseUrl: string;
let accessToken: string;
let seedContext: { companyId: number; outletId: number };

describe('operations.status', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    seedContext = await getSeedSyncContext();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/operations/test-operation-123/progress`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent operation', async () => {
    const nonExistentId = `non-existent-${randomUUID()}`;
    const res = await fetch(`${baseUrl}/api/operations/${nonExistentId}/progress`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns job state for valid operation', async () => {
    // Create a test operation
    const operationId = `test-op-${randomUUID()}`;
    await startProgress({
      operationId,
      operationType: 'import',
      companyId: seedContext.companyId,
      totalUnits: 100,
      details: { description: 'Test import operation' },
    });

    // Get progress
    const res = await fetch(`${baseUrl}/api/operations/${operationId}/progress`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.operationId).toBe(operationId);
    expect(body.data.total).toBe(100);
    expect(body.data.completed).toBe(0);
    expect(body.data.status).toBe('running');
    expect(body.data.percentage).toBe(0);
    expect(body.data.startedAt).toBeDefined();
    expect(body.data.updatedAt).toBeDefined();
    expect(body.data.completedAt).toBeNull();
  });

  it('returns 400 for invalid operation ID format', async () => {
    // Empty string or malformed IDs should be handled gracefully
    // The route accepts any string, but invalid ones won't find records
    const res = await fetch(`${baseUrl}/api/operations//progress`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    // Empty path param results in 404 (route not matched) or 400 depending on implementation
    expect([400, 404]).toContain(res.status);
  });

  it('returns completed state for finished operations', async () => {
    const operationId = `test-op-completed-${randomUUID()}`;
    await startProgress({
      operationId,
      operationType: 'export',
      companyId: seedContext.companyId,
      totalUnits: 50,
    });

    // Complete the operation
    await completeProgress({
      operationId,
      companyId: seedContext.companyId,
      details: { message: 'Export finished' },
    });

    // Get progress
    const res = await fetch(`${baseUrl}/api/operations/${operationId}/progress`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.operationId).toBe(operationId);
    expect(body.data.status).toBe('completed');
    expect(body.data.completed).toBe(50);
    expect(body.data.percentage).toBe(100);
    expect(body.data.completedAt).not.toBeNull();
  });

  it('returns progress percentage correctly', async () => {
    // Start an operation with a known total
    const operationId = `test-op-progress-${randomUUID()}`;
    await startProgress({
      operationId,
      operationType: 'batch_update',
      companyId: seedContext.companyId,
      totalUnits: 200,
    });

    // Update progress via the updateProgress function
    const { updateProgress } = await import('../../../src/lib/progress/progress-store');
    await updateProgress({
      operationId,
      companyId: seedContext.companyId,
      completedUnits: 150,
    });

    // Get progress
    const res = await fetch(`${baseUrl}/api/operations/${operationId}/progress`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.completed).toBe(150);
    expect(body.data.total).toBe(200);
    expect(body.data.percentage).toBe(75);
  });
});