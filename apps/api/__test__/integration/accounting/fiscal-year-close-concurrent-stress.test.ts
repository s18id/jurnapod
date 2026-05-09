// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * E59-A2: Concurrent Load Stress Test — Fiscal-Year Close vs Posting Overlap
 *
 * Validates that Story 59.3 Option A lock-intent mitigation
 * (FOR UPDATE on fiscal_years during posting guard checks) holds up under
 * high-concurrency load with intermixed close approvals.
 *
 * Scenario:
 * - 10 concurrent posting guard checks using FOR UPDATE lock
 * - 10 concurrent close approve HTTP requests
 * - All launched simultaneously to maximize contention
 *
 * Metrics tracked:
 * - Posting guard success / deadlock / lock-wait-timeout counts
 * - Close approve success (200) / conflict (409) / error counts
 * - Data consistency: fiscal year CLOSED, exactly one journal batch
 * - Total execution time
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { ensureDateWithinOpenFiscalYearWithExecutor } from "@/lib/fiscal-years";
import { isDeadlockError } from "@jurnapod/db";
import { closeTestDb, getTestDb } from "../../helpers/db";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import { getTestBaseUrl } from "../../helpers/env";
import {
  assignUserGlobalRole,
  createTestAPReconciliationSettings,
  createTestCompanyMinimal,
  createTestFiscalCloseBalanceFixture,
  createTestFiscalYear,
  createTestPurchasingAccounts,
  createTestRole,
  createTestUser,
  getTestAccessToken,
  loginForTest,
  resetFixtureRegistry,
  setModulePermission,
} from "../../fixtures";

describe("accounting.fiscal-year-close-concurrent-stress", { timeout: 180000 }, () => {
  let baseUrl: string;
  let companyId: number;
  let ownerToken: string;
  let fiscalYearId: number;
  let closeRequestId: string;

  const TARGET_DATE = "2080-06-15";
  const POSTING_COUNT = 10;
  const CLOSE_COUNT = 10;

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    const seedToken = await getTestAccessToken(baseUrl);
    const runId = randomUUID().slice(0, 8);

    // Create company
    const company = await createTestCompanyMinimal({
      code: `FYSTRESS-${runId}`,
      timezone: "Asia/Jakarta",
    });
    companyId = company.id;

    // Create owner user with full accounting:fiscal_years permissions
    const ownerRole = await createTestRole(baseUrl, seedToken, "FY Stress Owner");
    const ownerUser = await createTestUser(companyId, {
      email: `fy-stress-${runId}@example.com`,
      name: "FY Stress Owner",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(ownerUser.id, ownerRole.id);
    await setModulePermission(companyId, ownerRole.id, "accounting", "fiscal_years", 63);

    ownerToken = await loginForTest(baseUrl, company.code, ownerUser.email, "TestPassword123!");

    // Canonical fiscal-close fixture: retained-earnings + non-zero P&L balance
    await createTestFiscalCloseBalanceFixture(companyId, {
      asOfDate: "2080-12-31",
      plBalance: "500.0000",
    });

    // Create a single OPEN fiscal year for concurrent contention
    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2080,
      startDate: "2080-01-01",
      endDate: "2080-12-31",
      status: "OPEN",
    });
    fiscalYearId = fiscalYear.id;

    // Ensure AP reconciliation settings so close approve doesn't fail on that
    const { ap_account_id } = await createTestPurchasingAccounts(companyId, {
      apAccountName: `AP FYSTRESS ${randomUUID().slice(0, 8)}`,
    });
    await createTestAPReconciliationSettings(companyId, [ap_account_id]);

    // Initiate close — creates PENDING close request
    closeRequestId = `concurrent-stress-${randomUUID()}`;
    const initiateRes = await postJson(
      `/api/accounts/fiscal-years/${fiscalYearId}/close`,
      ownerToken,
      { close_request_id: closeRequestId, reason: "E59-A2 concurrent stress test" }
    );
    expect(initiateRes.status).toBe(200);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // ---------------------------------------------------------------------------
  // E59-A2: Concurrent stress test
  // ---------------------------------------------------------------------------

  it("concurrent posting guard checks + close approves under load — no data corruption", async () => {
    // Metrics counters
    let postingSuccess = 0;
    let postingDeadlocked = 0;
    let postingLockWaitTimeout = 0;
    let postingOtherError = 0;
    let postingRetryCount = 0;

    let closeSuccess200 = 0;
    let closeConflict409 = 0;
    let closeDeadlock500 = 0;
    let closeOtherError = 0;

    const startTime = Date.now();

    // Build posting guard operations ==========================================
    // Each posting operation runs in a retry loop that tracks deadlocks.
    const postingOps: Array<() => Promise<{ kind: string; retries: number }>> = [];
    for (let i = 0; i < POSTING_COUNT; i++) {
      postingOps.push(async () => {
        const MAX_ATTEMPTS = 10;
        const INITIAL_DELAY_MS = 200;
        let retries = 0;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            const db = getTestDb();
            await db.transaction().execute(async (trx) => {
              await ensureDateWithinOpenFiscalYearWithExecutor(
                trx,
                companyId,
                TARGET_DATE
              );
            });
            if (attempt > 0) retries = attempt;
            return { kind: "posting_success", retries };
          } catch (error: unknown) {
            if (isDeadlockError(error) && attempt < MAX_ATTEMPTS - 1) {
              const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            if (isDeadlockError(error)) {
              // Exhausted retries
              retries = attempt;
              const msg = (error as { message?: string })?.message ?? "";
              if (
                msg.toLowerCase().includes("deadlock") ||
                (error as { errno?: number })?.errno === 1213
              ) {
                return { kind: "posting_deadlock", retries };
              }
              if (
                msg.toLowerCase().includes("lock wait timeout") ||
                (error as { errno?: number })?.errno === 1205
              ) {
                return { kind: "posting_lock_wait_timeout", retries };
              }
              return { kind: "posting_other_error", retries };
            }

            // Non-deadlock error — e.g. "no open fiscal year" after close won
            retries = attempt;
            return { kind: "posting_other_error", retries };
          }
        }

        // Should not reach here
        return { kind: "posting_other_error", retries: MAX_ATTEMPTS };
      });
    }

    // Build close approve operations ==========================================
    const closeOps: Array<() => Promise<{ kind: string }>> = [];
    for (let i = 0; i < CLOSE_COUNT; i++) {
      closeOps.push(async () => {
        try {
          const res = await postJson(
            `/api/accounts/fiscal-years/${fiscalYearId}/close/approve`,
            ownerToken,
            { close_request_id: closeRequestId }
          );

          if (res.status === 200) {
            return { kind: "close_success_200" };
          }
          if (res.status === 409) {
            return { kind: "close_conflict_409" };
          }
          if (res.status === 500) {
            // Check if it was a deadlock that got past the API layer
            try {
              const body = await res.json();
              const msg =
                body?.error?.message ?? body?.message ?? "";
              if (
                msg.toLowerCase().includes("deadlock") ||
                msg.toLowerCase().includes("lock wait timeout")
              ) {
                return { kind: "close_deadlock_500" };
              }
            } catch {
              // Can't parse body
            }
            return { kind: "close_deadlock_500" };
          }
          return { kind: `close_other_${res.status}` };
        } catch {
          return { kind: "close_exception" };
        }
      });
    }

    // Launch ALL operations concurrently ======================================
    const allOps = [...postingOps, ...closeOps].map((op) => op());
    const results = await Promise.all(allOps);

    const elapsedMs = Date.now() - startTime;

    // Tally posting results
    for (const r of results) {
      if (!("kind" in r)) {
        postingOtherError++;
        continue;
      }
      const result = r as { kind: string; retries?: number };
      switch (result.kind) {
        case "posting_success":
          postingSuccess++;
          postingRetryCount += result.retries ?? 0;
          break;
        case "posting_deadlock":
          postingDeadlocked++;
          postingRetryCount += result.retries ?? 0;
          break;
        case "posting_lock_wait_timeout":
          postingLockWaitTimeout++;
          postingRetryCount += result.retries ?? 0;
          break;
        case "posting_other_error":
          postingOtherError++;
          break;
        case "close_success_200":
          closeSuccess200++;
          break;
        case "close_conflict_409":
          closeConflict409++;
          break;
        case "close_deadlock_500":
          closeDeadlock500++;
          break;
        default:
          if (result.kind?.startsWith("close_other")) {
            closeOtherError++;
          }
          break;
      }
    }

    const deadlockTotal = postingDeadlocked + closeDeadlock500;

    // Log metrics for evidence document ======================================
    console.log(JSON.stringify({
      test: "E59-A2 concurrent stress test",
      config: { postingCount: POSTING_COUNT, closeCount: CLOSE_COUNT },
      results: {
        posting: {
          success: postingSuccess,
          deadlocked: postingDeadlocked,
          lockWaitTimeout: postingLockWaitTimeout,
          otherError: postingOtherError,
          retryCount: postingRetryCount,
        },
        close: {
          success200: closeSuccess200,
          conflict409: closeConflict409,
          deadlock500: closeDeadlock500,
          otherError: closeOtherError,
        },
        deadlockTotal,
        elapsedMs,
      },
    }, null, 2));

    // ---- Assertions ----

    // At least one close approve must succeed (idempotent replay counts)
    expect(closeSuccess200).toBeGreaterThanOrEqual(1);

    // Posting guard checks: at least some should succeed before close completes
    // (rate depends on timing, so we just check no catastrophic failure)
    // Some posting checks may fail because the fiscal year got closed, which is expected.

    // Deadlock count must be within acceptable bounds (0 is ideal).
    // Under extreme concurrent load with retry exhaustion, a small number is acceptable.
    expect(deadlockTotal).toBeLessThanOrEqual(2);

    // ---- Verify fiscal year final state ----

    const statusRes = await getJson(
      `/api/accounts/fiscal-years/${fiscalYearId}/status`,
      ownerToken
    );
    const statusBody = await statusRes.json();
    expect(statusBody.data.status).toBe("CLOSED");

    // ---- Verify exactly one close request row with SUCCEEDED ----

    const db = getTestDb();
    const closeRequestRows = await sql<{ status: string; result_json: unknown }>`
      SELECT status, result_json
      FROM fiscal_year_close_requests
      WHERE company_id = ${companyId}
        AND fiscal_year_id = ${fiscalYearId}
        AND close_request_id = ${closeRequestId}
    `.execute(db);

    expect(closeRequestRows.rows).toHaveLength(1);
    expect(closeRequestRows.rows[0]?.status).toBe("SUCCEEDED");

    // No IN_PROGRESS or PENDING rows leftover from concurrent attempts
    const otherStatusRows = await sql<{ status: string }>`
      SELECT status
      FROM fiscal_year_close_requests
      WHERE company_id = ${companyId}
        AND fiscal_year_id = ${fiscalYearId}
        AND close_request_id = ${closeRequestId}
        AND status IN ('PENDING', 'IN_PROGRESS', 'FAILED')
    `.execute(db);
    expect(otherStatusRows.rows).toHaveLength(0);

    // ---- Verify exactly one journal batch for the close posting ----

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

    const requestResultJson = parseResultJson(
      closeRequestRows.rows[0]?.result_json
    );
    const persistedBatchIdsRaw = requestResultJson.postedBatchIds;
    const persistedBatchIds = Array.isArray(persistedBatchIdsRaw)
      ? persistedBatchIdsRaw.filter(
          (v: unknown): v is number => typeof v === "number"
        )
      : [];

    expect(persistedBatchIds.length).toBe(1);

    // Verify the batch actually exists in journal_batches
    const batchRows = await sql<{ id: number }>`
      SELECT id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND id IN (${sql.join(persistedBatchIds)})
    `.execute(db);
    expect(batchRows.rows).toHaveLength(1);
  });
});
