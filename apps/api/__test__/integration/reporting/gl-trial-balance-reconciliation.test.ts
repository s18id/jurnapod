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
 * The trial balance MUST balance (SUM(debits) == SUM(credits) across all rows).
 * Per-account balance = SUM(jl.debit - jl.credit) for that account_id within date range.
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
  getRoleIdByCode,
  assignUserGlobalRole,
  assignUserOutletRole,
  setModulePermission,
  loginForTest,
} from "../../fixtures";
import { getDb } from "@/lib/db";
import { sql } from "kysely";
import { makeTag } from "../../helpers/tags";

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
      const tag = makeTag("GLTB");
      await sql`
        INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status)
        VALUES (${isolatedCompanyId}, ${(`FY-${tag}`).slice(0, 32)}, ${`Fiscal Year ${tag}`}, ${FIXED_DATE_FROM}, ${FIXED_DATE_TO}, 'OPEN')
      `.execute(db);
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

      // Seed fiscal_year
      await sql`
        INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status)
        VALUES (${isolatedCompanyId}, ${(`FY-${tag}`).slice(0, 32)}, ${`Fiscal Year ${tag}`}, ${FIXED_DATE_FROM}, ${FIXED_DATE_TO}, 'OPEN')
      `.execute(db);

      // Create Asset account (type_name='ASSET', normal_balance='D')
      const assetResult = await sql<{ insertId: number }>`
        INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_active, is_group)
        VALUES (${isolatedCompanyId}, ${(`AST-${tag}`).slice(0, 32)}, ${`Test Asset ${tag}`}, 'ASSET', 'D', 'NRC', 1, 0)
      `.execute(db);
      assetAccountId = Number(assetResult.insertId);

      // Create Liability account (type_name='LIABILITY', normal_balance='K')
      const liabilityResult = await sql<{ insertId: number }>`
        INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_active, is_group)
        VALUES (${isolatedCompanyId}, ${(`LIA-${tag}`).slice(0, 32)}, ${`Test Liability ${tag}`}, 'LIABILITY', 'K', 'NRC', 1, 0)
      `.execute(db);
      liabilityAccountId = Number(liabilityResult.insertId);

      // Create journal batch (doc_type='JOURNAL', doc_id=1 for this isolated company)
      const batchResult = await sql<{ insertId: number }>`
        INSERT INTO journal_batches (company_id, doc_type, doc_id, posted_at, created_at, updated_at)
        VALUES (${isolatedCompanyId}, 'JOURNAL', 1, ${`${FIXED_DATE_FROM} 12:00:00`}, NOW(), NOW())
      `.execute(db);
      const batchId = Number(batchResult.insertId);

      // Debit line: Asset account debited
      await sql`
        INSERT INTO journal_lines (company_id, journal_batch_id, account_id, line_date, debit, credit, description, created_at, updated_at)
        VALUES (${isolatedCompanyId}, ${batchId}, ${assetAccountId}, ${LINE_DATE}, ${DEBIT_AMOUNT}, 0, ${`Test debit entry ${tag}`}, NOW(), NOW())
      `.execute(db);

      // Credit line: Liability account credited (balanced entry)
      await sql`
        INSERT INTO journal_lines (company_id, journal_batch_id, account_id, line_date, debit, credit, description, created_at, updated_at)
        VALUES (${isolatedCompanyId}, ${batchId}, ${liabilityAccountId}, ${LINE_DATE}, 0, ${CREDIT_AMOUNT}, ${`Test credit entry ${tag}`}, NOW(), NOW())
      `.execute(db);
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

    it("totals match direct SUM(journal_lines) aggregate from source of truth", async () => {
      const res = await getJson(
        `/api/reports/trial-balance?date_from=${FIXED_DATE_FROM}&date_to=${FIXED_DATE_TO}`,
        isolatedToken
      );
      expect(res.status).toBe(200);

      const body = await res.json();

      // Direct DB query: sum of all journal_lines for this company in range
      const db = getDb();
      const jlResult = await sql<{ total_debit: number; total_credit: number }>`
        SELECT COALESCE(SUM(debit), 0) AS total_debit, COALESCE(SUM(credit), 0) AS total_credit
        FROM journal_lines
        WHERE company_id = ${isolatedCompanyId}
          AND line_date BETWEEN ${FIXED_DATE_FROM} AND ${FIXED_DATE_TO}
      `.execute(db);
      const jlRow = jlResult.rows[0];

      expect(body.data.totals.total_debit).toBe(Number(jlRow.total_debit));
      expect(body.data.totals.total_credit).toBe(Number(jlRow.total_credit));
    });

    it("per-account balance matches SUM(jl.debit - jl.credit) from journal_lines source of truth", async () => {
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

      const db = getDb();

      // For each account row, verify balance = SUM(debit - credit) from journal_lines
      // Variance = projection_balance - subledger_balance, MUST be 0 for each account
      for (const row of rows) {
        const aggResult = await sql<{ balance: number }>`
          SELECT COALESCE(SUM(debit - credit), 0) AS balance
          FROM journal_lines
          WHERE company_id = ${isolatedCompanyId}
            AND account_id = ${row.account_id}
            AND line_date BETWEEN ${FIXED_DATE_FROM} AND ${FIXED_DATE_TO}
        `.execute(db);

        const expectedBalance = Number(aggResult.rows[0]?.balance ?? 0);
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
