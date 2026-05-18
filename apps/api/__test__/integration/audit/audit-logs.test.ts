// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 66-5: generic read-only audit log endpoints.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestAuditLog } from '@jurnapod/modules-platform/test-fixtures';

import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import {
  getOrCreateTestCashierForPermission,
  getSeedSyncContext,
  getTestAccessToken,
  resetFixtureRegistry,
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let cashierToken: string;
let seedCompanyId: number;
let seedOutletId: number;
let seedUserId: number;
let entityId: string;
let successLogId: number;
let failLogId: number;
const testRowIds: number[] = [];

async function requestAuditLogs(query = '', token = accessToken): Promise<Response> {
  return fetch(`${baseUrl}/api/audit-logs${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('audit.generic-audit-logs', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const seedCtx = await getSeedSyncContext();
    seedCompanyId = seedCtx.companyId;
    seedOutletId = seedCtx.outletId;
    seedUserId = seedCtx.cashierUserId;
    const companyCode = process.env.JP_COMPANY_CODE;
    if (!companyCode) throw new Error('JP_COMPANY_CODE must be set');
    cashierToken = (await getOrCreateTestCashierForPermission(seedCompanyId, companyCode, baseUrl)).accessToken;
    entityId = makeTag('AUD665', 32);

    const db = getTestDb();
    const successLog = await createTestAuditLog(db, {
      companyId: seedCompanyId,
      outletId: seedOutletId,
      userId: seedUserId,
      action: 'STORY_66_5_TEST',
      entityType: 'setting',
      entityId,
      success: true,
    });
    successLogId = successLog.id;
    testRowIds.push(successLog.id);

    const failLog = await createTestAuditLog(db, {
      companyId: seedCompanyId,
      outletId: seedOutletId,
      userId: seedUserId,
      action: 'STORY_66_5_TEST',
      entityType: 'setting',
      entityId,
      success: false,
    });
    failLogId = failLog.id;
    testRowIds.push(failLog.id);
  });

  afterAll(async () => {
    try {
      if (testRowIds.length > 0) {
        await getTestDb().deleteFrom('audit_logs').where('id', 'in', testRowIds).execute();
      }
      resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  it('rejects unauthenticated list requests', async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs`);
    expect(res.status).toBe(401);
  });

  it('denies low-privilege users via platform.settings.READ', async () => {
    const res = await requestAuditLogs(`?action=STORY_66_5_TEST&entity_id=${entityId}`, cashierToken);
    expect(res.status).toBe(403);
  });

  it('lists tenant-scoped audit logs with default pagination of 25', async () => {
    const res = await requestAuditLogs(`?action=STORY_66_5_TEST&entity_id=${entityId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.limit).toBe(25);
    expect(body.data.offset).toBe(0);
    expect(body.data.total).toBe(2);
    expect(body.data.logs).toHaveLength(2);
    for (const log of body.data.logs) {
      expect(log.company_id).toBe(seedCompanyId);
      expect(log.entity_id).toBe(entityId);
      expect(log).toHaveProperty('success');
      expect(log).toHaveProperty('result');
    }
  });

  it('filters by success and never requires result query filtering', async () => {
    const res = await requestAuditLogs(`?action=STORY_66_5_TEST&entity_id=${entityId}&success=1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.logs[0].id).toBe(successLogId);
    expect(body.data.logs[0].success).toBe(true);
  });

  it('filters by actor, entity, and outlet scope', async () => {
    const res = await requestAuditLogs(
      `?actor_user_id=${seedUserId}&entity_type=setting&entity_id=${entityId}&outlet_id=${seedOutletId}&success=0`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.logs[0].id).toBe(failLogId);
    expect(body.data.logs[0].outlet_id).toBe(seedOutletId);
    expect(body.data.logs[0].success).toBe(false);
  });

  it('uses authenticated company even when company_id query differs', async () => {
    const res = await requestAuditLogs(`?company_id=999999&action=STORY_66_5_TEST&entity_id=${entityId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(2);
    for (const log of body.data.logs) {
      expect(log.company_id).toBe(seedCompanyId);
    }
  });

  it('applies half-open from_ts/to_ts filtering', async () => {
    const excluded = await requestAuditLogs(`?action=STORY_66_5_TEST&entity_id=${entityId}&to_ts=0`);
    expect(excluded.status).toBe(200);
    const excludedBody = await excluded.json();
    expect(excludedBody.data.logs.some((log: { id: number }) => log.id === successLogId)).toBe(false);

    const included = await requestAuditLogs(`?action=STORY_66_5_TEST&entity_id=${entityId}&from_ts=0&to_ts=4102444800000`);
    expect(included.status).toBe(200);
    const includedBody = await included.json();
    expect(includedBody.data.logs.some((log: { id: number }) => log.id === successLogId)).toBe(true);
  });

  it('rejects invalid half-open date ranges where from_ts is greater than or equal to to_ts', async () => {
    const equalRange = await requestAuditLogs('?from_ts=1712304000000&to_ts=1712304000000');
    expect(equalRange.status).toBe(400);

    const reversedRange = await requestAuditLogs('?from_ts=1712390400000&to_ts=1712304000000');
    expect(reversedRange.status).toBe(400);
  });

  it('returns detail by id scoped to authenticated company', async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs/${successLogId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(successLogId);
    expect(body.data.company_id).toBe(seedCompanyId);
    expect(body.data.success).toBe(true);
  });

  it('returns 404 for missing tenant-scoped detail row', async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs/999999999`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(404);
  });

  it('rejects invalid query parameters', async () => {
    const res = await requestAuditLogs('?success=result&limit=0');
    expect(res.status).toBe(400);
  });
});
