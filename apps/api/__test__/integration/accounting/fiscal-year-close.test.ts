// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * R48-001: Fiscal Year Close Contract - Two-Step Close with Idempotency Safety
 * 
 * Validates the strict two-step fiscal close contract:
 * - /accounts/fiscal-years/:id/close = initiate only (idempotency claim/prepare), no close status transition
 * - /accounts/fiscal-years/:id/close/approve = only path that posts closing journals and closes fiscal year atomically
 * 
 * Also validates:
 * - Same key retry does not duplicate side effects
 * - Concurrent approvals with same key result in exactly one financial effect
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { closeTestDb, getTestDb } from "../../helpers/db";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import { getTestBaseUrl } from "../../helpers/env";
import {
  assignUserGlobalRole,
  createTestCompanyMinimal,
  createTestFiscalCloseBalanceFixture,
  createTestFiscalYear,
  createTestRole,
  createTestUser,
  getTestAccessToken,
  loginForTest,
  resetFixtureRegistry,
  setModulePermission,
} from "../../fixtures";

describe("accounting.fiscal-year-close", { timeout: 120000 }, () => {
  let baseUrl: string;
  let companyId: number;
  let ownerToken: string;

  const postJson = async (path: string, token: string, body?: unknown) => {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const getJson = async (path: string, token: string) => {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };

  const parseResultJson = (value: unknown): Record<string, unknown> => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return {};
      }
    }

    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }

    return {};
  };

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    const seedToken = await getTestAccessToken(baseUrl);

    const company = await createTestCompanyMinimal({
      code: `FYCLOSE-${Date.now()}`.slice(0, 15),
      timezone: "Asia/Jakarta",
    });
    companyId = company.id;

    const ownerRole = await createTestRole(baseUrl, seedToken, "FY Close Owner");
    const ownerUser = await createTestUser(companyId, {
      email: `fy-close-${Date.now()}@example.com`,
      name: "FY Close Owner",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(ownerUser.id, ownerRole.id);
    await setModulePermission(companyId, ownerRole.id, "accounting", "fiscal_years", 63);

    ownerToken = await loginForTest(baseUrl, company.code, ownerUser.email, "TestPassword123!");

    // Canonical fiscal-close fixture setup: retained-earnings-like account
    // and non-zero P&L balance so close-preview generates closing entries.
    await createTestFiscalCloseBalanceFixture(companyId, {
      asOfDate: "2040-12-31",
      plBalance: "100.0000",
    });
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  /**
   * AC-1: Initiate does not close fiscal year
   */
  it("initiate does NOT close fiscal year - year remains OPEN after initiate", async () => {
    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2040,
      startDate: "2040-01-01",
      endDate: "2040-12-31",
      status: "OPEN",
    });

    const closeRequestId = `init-test-${Date.now()}`;
    const res = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "AC-1 test: initiate should not close" }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // closeRequestId was claimed but fiscal year should still be OPEN

    // Verify fiscal year is still OPEN (not CLOSED)
    const statusRes = await getJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/status`,
      ownerToken
    );
    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.data.status).toBe("OPEN");
  });

  /**
   * AC-2: Approve after initiate succeeds and closes year
   */
  it("approve after initiate succeeds and closes fiscal year", async () => {
    await createTestFiscalCloseBalanceFixture(companyId, {
      asOfDate: "2041-12-31",
      plBalance: "125.0000",
    });

    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2041,
      startDate: "2041-01-01",
      endDate: "2041-12-31",
      status: "OPEN",
    });

    const closeRequestId = `approve-test-${Date.now()}`;

    // Step 1: Initiate
    const initiateRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "AC-2 test: full close flow" }
    );
    expect(initiateRes.status).toBe(200);

    // Verify still OPEN after initiate
    const statusAfterInit = await getJson(`/api/accounts/fiscal-years/${fiscalYear.id}/status`, ownerToken);
    expect((await statusAfterInit.json()).data.status).toBe("OPEN");

    // Step 2: Approve
    const approveRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
      ownerToken,
      { close_request_id: closeRequestId }
    );

    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.success).toBe(true);

    // Verify fiscal year is now CLOSED
    const statusAfterApprove = await getJson(`/api/accounts/fiscal-years/${fiscalYear.id}/status`, ownerToken);
    const statusBody = await statusAfterApprove.json();
    expect(statusBody.data.status).toBe("CLOSED");
  });

  /**
   * AC-3: Same key retry does not duplicate side effects (idempotency)
   */
  it("same key retry does NOT duplicate side effects - only one journal batch created", async () => {
    await createTestFiscalCloseBalanceFixture(companyId, {
      asOfDate: "2042-12-31",
      plBalance: "150.0000",
    });

    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2042,
      startDate: "2042-01-01",
      endDate: "2042-12-31",
      status: "OPEN",
    });

    const closeRequestId = `idempotent-${Date.now()}`;

    // Initiate
    const initiateRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "AC-3 test: idempotency check" }
    );
    expect(initiateRes.status).toBe(200);

    // Approve first time
    const approve1Res = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
      ownerToken,
      { close_request_id: closeRequestId }
    );
    expect(approve1Res.status).toBe(200);
    const approve1Body = await approve1Res.json();
    const approve1BatchIdsRaw = approve1Body?.data?.postedBatchIds;
    const approve1BatchIds = Array.isArray(approve1BatchIdsRaw)
      ? approve1BatchIdsRaw.filter((v: unknown): v is number => typeof v === "number")
      : [];
    expect(approve1BatchIds.length).toBeGreaterThan(0);

    // Approve second time (same key - should be idempotent, no new batch)
    const approve2Res = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
      ownerToken,
      { close_request_id: closeRequestId }
    );

    // Should return success without creating duplicate batches
    expect(approve2Res.status).toBe(200);
    const approve2Body = await approve2Res.json();
    // Should indicate it already succeeded (idempotent response)
    expect(approve2Body.success).toBe(true);
    const approve2BatchIdsRaw = approve2Body?.data?.postedBatchIds;
    const approve2BatchIds = Array.isArray(approve2BatchIdsRaw)
      ? approve2BatchIdsRaw.filter((v: unknown): v is number => typeof v === "number")
      : [];
    expect(approve2BatchIds).toEqual(approve1BatchIds);

    // Verify batch ids from response exist and are unique in DB.
    const db = getTestDb();
    const persistedBatches = await sql<{ id: number }>`
      SELECT id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND id IN (${sql.join(approve1BatchIds)})
    `.execute(db);
    expect(persistedBatches.rows).toHaveLength(approve1BatchIds.length);
  });

  /**
   * AC-4: Cannot approve without initiate (enforce two-step contract)
   */
  it("cannot approve without initiate - returns error for uninitiated close", async () => {
    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2043,
      startDate: "2043-01-01",
      endDate: "2043-12-31",
      status: "OPEN",
    });

    // Try to approve without initiating first
    const fakeCloseRequestId = `never-initiated-${Date.now()}`;
    const approveRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
      ownerToken,
      { close_request_id: fakeCloseRequestId }
    );

    // Should fail because no initiate was done
    expect(approveRes.status).toBe(400);
    const body = await approveRes.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CLOSE_CONFLICT");
  });

  /**
   * AC-5: Initiate is idempotent - calling initiate twice with same key returns same result
   */
  it("initiate is idempotent - calling initiate twice with same key returns same result", async () => {
    await createTestFiscalCloseBalanceFixture(companyId, {
      asOfDate: "2044-12-31",
      plBalance: "175.0000",
    });

    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2044,
      startDate: "2044-01-01",
      endDate: "2044-12-31",
      status: "OPEN",
    });

    const closeRequestId = `dup-init-${Date.now()}`;

    // Initiate first time
    const init1Res = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "First initiate" }
    );
    expect(init1Res.status).toBe(200);

    // Initiate second time with same key
    const init2Res = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "Second initiate" }
    );
    expect(init2Res.status).toBe(200);
    const init2Body = await init2Res.json();

    // Should return same closeRequestId (idempotent)
    expect(init2Body.data.closeRequestId).toBe(closeRequestId);
  });

  /**
   * AC-6: Concurrent approvals with same key result in exactly one financial effect.
   * Two concurrent approve requests for the same closeRequestId must not duplicate posting.
   * Depending on lock timing, second request may replay idempotent success (200)
   * or return conflict (409), but financial side effects must still be single.
   */
  it("concurrent approve requests - only one wins and posts journals", async () => {
    await createTestFiscalCloseBalanceFixture(companyId, {
      asOfDate: "2045-12-31",
      plBalance: "200.0000",
    });

    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2045,
      startDate: "2045-01-01",
      endDate: "2045-12-31",
      status: "OPEN",
    });

    const closeRequestId = `concurrent-approve-${Date.now()}`;

    // Initiate first (creates PENDING close request)
    const initiateRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "AC-6 concurrency test" }
    );
    expect(initiateRes.status).toBe(200);

    // Fire TWO concurrent approve requests using Promise.allSettled
    const [result1, result2] = await Promise.allSettled([
      postJson(
        `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
        ownerToken,
        { close_request_id: closeRequestId }
      ),
      postJson(
        `/api/accounts/fiscal-years/${fiscalYear.id}/close/approve`,
        ownerToken,
        { close_request_id: closeRequestId }
      ),
    ]);

    // Extract responses - one may be rejected (not a Response object)
    const res1 = result1.status === "fulfilled" ? result1.value : null;
    const res2 = result2.status === "fulfilled" ? result2.value : null;

    const statuses = [
      res1 ? res1.status : -1,
      res2 ? res2.status : -1,
    ];

    // Log for debugging
    console.debug(`[AC-6] Concurrent approve statuses: ${JSON.stringify(statuses)}`);

    // Exactly one close side effect must occur. Depending on lock timing,
    // second request may return 200 (idempotent SUCCEEDED replay) or 409 (conflict).
    const successCount = statuses.filter((s) => s === 200).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount).toBeGreaterThanOrEqual(1);
    expect(conflictCount + successCount).toBe(2);

    const successfulBodies: Array<{ data?: { postedBatchIds?: unknown } }> = [];
    if (res1?.status === 200) {
      successfulBodies.push(await res1.json());
    }
    if (res2?.status === 200) {
      successfulBodies.push(await res2.json());
    }

    const returnedBatchIds = successfulBodies.flatMap((body) => {
      const raw = body?.data?.postedBatchIds;
      return Array.isArray(raw) ? raw.filter((v): v is number => typeof v === "number") : [];
    });
    const uniqueReturnedBatchIds = [...new Set(returnedBatchIds)];
    expect(uniqueReturnedBatchIds.length).toBe(1);

    // Verify fiscal year is CLOSED (one of them closed it)
    const statusRes = await getJson(
      `/api/accounts/fiscal-years/${fiscalYear.id}/status`,
      ownerToken
    );
    const statusBody = await statusRes.json();
    expect(statusBody.data.status).toBe("CLOSED");

    const db = getTestDb();
    const closeRequestRows = await sql<{ status: string; result_json: unknown }>`
      SELECT status, result_json
      FROM fiscal_year_close_requests
      WHERE company_id = ${companyId}
        AND fiscal_year_id = ${fiscalYear.id}
        AND close_request_id = ${closeRequestId}
    `.execute(db);

    expect(closeRequestRows.rows).toHaveLength(1);
    expect(closeRequestRows.rows[0]?.status).toBe("SUCCEEDED");

    const requestResultJson = parseResultJson(closeRequestRows.rows[0]?.result_json);
    const persistedBatchIdsRaw = requestResultJson.postedBatchIds;
    const persistedBatchIds = Array.isArray(persistedBatchIdsRaw)
      ? persistedBatchIdsRaw.filter((v): v is number => typeof v === "number")
      : [];

    expect(persistedBatchIds.length).toBe(1);
    expect(new Set(persistedBatchIds)).toEqual(new Set(uniqueReturnedBatchIds));

    const persistedBatchRows = await sql<{ id: number }>`
      SELECT id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND id IN (${sql.join(persistedBatchIds)})
    `.execute(db);
    expect(persistedBatchRows.rows).toHaveLength(1);
  });
});
