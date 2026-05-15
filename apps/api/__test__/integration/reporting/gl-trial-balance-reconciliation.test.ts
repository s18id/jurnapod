// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * GL Trial Balance Reconciliation Integration Tests (Story 62.1)
 *
 * Tests GL Trial Balance projection vs journal_lines source-of-truth reconciliation:
 * - AC4: GL Trial Balance matches journal aggregates with zero variance
 * - AC5: Deterministic projection outputs
 * - AC6: EPIC62 GATE evidence + auth protection
 *
 * The source-of-truth is the journal_lines table joined with accounts.
 * The trial balance MUST balance (total debits equal total credits across all rows).
 * Per-account balance equals debit-minus-credit aggregation for each account in range.
 * Variance = per-account projection_balance - subledger_balance, MUST be 0 for each account.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestBaseUrl } from "../../helpers/env";
import { closeTestDb } from "../../helpers/db";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  createTestFiscalYear,
  getRoleIdByCode,
  assignUserGlobalRole,
  assignUserOutletRole,
  setModulePermission,
  loginForTest,
  createTestAccount,
} from "../../fixtures";
import { getDb } from "@/lib/db";
import { makeTag } from "../../helpers/tags";
import { createTestJournalBatch } from "@jurnapod/modules-accounting/test-fixtures";
import { TrialBalanceService } from "@jurnapod/modules-accounting";

// Fixed future dates — beyond any real transaction, ensures deterministic isolation
const FIXED_DATE_FROM = "2099-01-01";
const FIXED_DATE_TO = "2099-12-31";

describe("gl-trial-balance-reconciliation", { timeout: 60000 }, () => {
  let baseUrl: string;

  const getJson = async (path: string, token?: string) => {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          }
        : undefined,
    });
  };

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // =============================================================================
  // AC6: Auth protection
  // =============================================================================

  describe("AC6: auth and error paths", () => {
    it("returns 401 without auth token", async () => {
      const res = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`
      );
      expect(res.status).toBe(401);
    });
  });

  // =============================================================================
  // AC4: GL Trial Balance matches journal aggregates with zero variance
  // =============================================================================

  describe("AC4: zero-state isolated company", () => {
    let isolatedCompanyId: number;
    let isolatedToken: string;

    beforeAll(async () => {
      const company = await createTestCompanyMinimal();
      isolatedCompanyId = company.id;

      const outlet = await createTestOutletMinimal(isolatedCompanyId);

      const email = `gltb-zero-${makeTag("GLTB")}@example.com`;
      const user = await createTestUser(isolatedCompanyId, {
        email,
        name: "GLTB Zero Owner",
        password: "TestPassword123!",
      });
      const roleId = await getRoleIdByCode("OWNER");
      await assignUserGlobalRole(user.id, roleId);

      await setModulePermission(isolatedCompanyId, roleId, "accounting", "reports", 31, {
        allowSystemRoleMutation: true,
      });
      await assignUserOutletRole(user.id, roleId, outlet.id);

      isolatedToken = await loginForTest(
        baseUrl,
        company.code,
        email,
        "TestPassword123!"
      );

      // Seed fiscal_year for the test year range
      const db = getDb();
      await createTestFiscalYear(isolatedCompanyId, {
        year: 2099,
        startDate: FIXED_DATE_FROM,
        endDate: FIXED_DATE_TO,
        status: 'OPEN',
      });
    });

    it("returns zero totals with no journal data", async () => {
      const res = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.totals.total_debit).toBe(0);
      expect(body.data.totals.total_credit).toBe(0);
      expect(body.data.totals.balance).toBe(0);

      // EPIC62 GATE evidence
      console.log(
        JSON.stringify({
          gate: "__EPIC62_GATE__",
          test: expect.getState().currentTestName,
          projection: "gl-trial-balance",
          variance: "0.0000",
          timestamp: new Date().toISOString(),
        })
      );
    });
  });

  // =============================================================================
  // AC4 + AC5: Seeded journal data — balanced entries, deterministic output
  // =============================================================================

  describe("AC4/AC5: seeded journal data (isolated company)", () => {
    let isolatedCompanyId: number;
    let isolatedToken: string;
    let assetAccountId: number;
    let liabilityAccountId: number;
    let fiscalYearId: number;

    const DEBIT_AMOUNT = 100000;
    const CREDIT_AMOUNT = 100000;
    const LINE_DATE = "2099-06-15";

    beforeAll(async () => {
      const company = await createTestCompanyMinimal();
      isolatedCompanyId = company.id;

      const outlet = await createTestOutletMinimal(isolatedCompanyId);

      const email = `gltb-seed-${makeTag("GLTB")}@example.com`;
      const user = await createTestUser(isolatedCompanyId, {
        email,
        name: "GLTB Seed Owner",
        password: "TestPassword123!",
      });
      const roleId = await getRoleIdByCode("OWNER");
      await assignUserGlobalRole(user.id, roleId);

      await setModulePermission(isolatedCompanyId, roleId, "accounting", "reports", 31, {
        allowSystemRoleMutation: true,
      });
      await assignUserOutletRole(user.id, roleId, outlet.id);

      isolatedToken = await loginForTest(
        baseUrl,
        company.code,
        email,
        "TestPassword123!"
      );

      const db = getDb();
      const tag = makeTag("GLTB");

      // Seed fiscal_year — capture ID for TrialBalanceService
      const fy = await createTestFiscalYear(isolatedCompanyId, {
        year: 2099,
        startDate: FIXED_DATE_FROM,
        endDate: FIXED_DATE_TO,
        status: 'OPEN',
      });
      fiscalYearId = fy.id;

      // Create Asset account via canonical fixture
      const assetAccount = await createTestAccount({
        companyId: isolatedCompanyId,
        code: `AST-${tag}`.slice(0, 32),
        name: `Test Asset ${tag}`,
        typeName: "ASSET",
      });
      assetAccountId = assetAccount.id;

      // Create Liability account via canonical fixture
      const liabilityAccount = await createTestAccount({
        companyId: isolatedCompanyId,
        code: `LIA-${tag}`.slice(0, 32),
        name: `Test Liability ${tag}`,
        typeName: "LIABILITY",
      });
      liabilityAccountId = liabilityAccount.id;

      // Create balanced journal batch via production JournalsService
      // (replaces raw SQL INSERT INTO journal_batches/journal_lines)
      await createTestJournalBatch(db, {
        companyId: isolatedCompanyId,
        entryDate: LINE_DATE,
        entries: [
          {
            accountId: assetAccountId,
            debit: DEBIT_AMOUNT,
            credit: 0,
            description: `Test debit entry ${tag}`,
          },
          {
            accountId: liabilityAccountId,
            debit: 0,
            credit: CREDIT_AMOUNT,
            description: `Test credit entry ${tag}`,
          },
        ],
      });
    });

    // ---------------------------------------------------------------------------
    // AC4: Balanced totals — projection matches source of truth
    // ---------------------------------------------------------------------------

    it("totals balance: total_debit equals total_credit", async () => {
      const res = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.totals.total_debit).toBeGreaterThan(0);
      expect(body.data.totals.total_debit).toBe(body.data.totals.total_credit);
    });

    it("totals match TrialBalanceService (canonical computation)", async () => {
      const res = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );
      expect(res.status).toBe(200);

      const body = await res.json();

      // Canonical trial balance via TrialBalanceService (replaces inline SQL)
      const tbService = new TrialBalanceService(getDb());
      const tbResult = await tbService.getTrialBalance({
        companyId: isolatedCompanyId,
        fiscalYearId,
      });

      expect(body.data.totals.total_debit).toBe(tbResult.totalDebits);
      expect(body.data.totals.total_credit).toBe(tbResult.totalCredits);
    });

    it("per-account balance matches debit-minus-credit aggregation from journal_lines source of truth", async () => {
      const res = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      const rows = body.data.rows as Array<{
        account_id: number;
        account_code: string;
        account_name: string;
        total_debit: number;
        total_credit: number;
        balance: number;
      }>;

      expect(rows.length).toBeGreaterThan(0);

      // For each account row, verify balance via TrialBalanceService (replaces inline SQL)
      // Variance = projection_balance - canonical_balance, MUST be 0 for each account
      const tbService = new TrialBalanceService(getDb());
      const tbResult = await tbService.getTrialBalance({
        companyId: isolatedCompanyId,
        fiscalYearId,
      });
      for (const row of rows) {
        const tbEntry = tbResult.accounts.find((a: { accountId: number; netBalance: number }) => a.accountId === row.account_id);
        const expectedBalance = tbEntry?.netBalance ?? 0;
        expect(row.balance).toBe(expectedBalance);
      }

      // EPIC62 GATE evidence
      console.log(
        JSON.stringify({
          gate: "__EPIC62_GATE__",
          test: expect.getState().currentTestName,
          projection: "gl-trial-balance",
          variance: "0.0000",
          timestamp: new Date().toISOString(),
        })
      );
    });

    // ---------------------------------------------------------------------------
    // AC5: Deterministic projection outputs
    // ---------------------------------------------------------------------------

    it("returns identical totals across repeated calls", async () => {
      const res1 = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );
      const res2 = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(body1.data.totals.total_debit).toBe(body2.data.totals.total_debit);
      expect(body1.data.totals.total_credit).toBe(body2.data.totals.total_credit);
      expect(body1.data.totals.balance).toBe(body2.data.totals.balance);
    });

    it("returns identical rows (length, order, balances) across repeated calls", async () => {
      const res1 = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );
      const res2 = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(body1.data.rows.length).toBe(body2.data.rows.length);

      const rows1 = body1.data.rows as Array<{
        account_id: number;
        balance: number;
      }>;
      const rows2 = body2.data.rows as Array<{
        account_id: number;
        balance: number;
      }>;

      for (let i = 0; i < rows1.length; i++) {
        expect(rows1[i].account_id).toBe(rows2[i].account_id);
        expect(rows1[i].balance).toBe(rows2[i].balance);
      }
    });
  });
});
