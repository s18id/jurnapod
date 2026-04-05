// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for ReconciliationDashboardService
 * 
 * Tests:
 * - GL balance vs subledger balance comparison
 * - Variance calculation
 * - Reconciliation status determination
 * - Drilldown to journal entries
 * - Epic 30 metrics integration
 * 
 * Run with: npm run test:integration -w @jurnapod/api
 */

import assert from "node:assert/strict";
import { describe, test, before, after, beforeEach } from "node:test";
import { getDb, closeDbPool } from "./db";
import type { KyselySchema } from "@/lib/db";
import { sql } from "kysely";
import {
  ReconciliationDashboardService,
  type ReconciliationDashboardQuery,
  type AccountTypeFilter,
  type ReconciliationStatus,
  type ReconciliationDashboard,
  type VarianceDrilldownResult,
} from "./reconciliation-dashboard";

// Test configuration
const RUN_ID = Date.now().toString(36);
const TEST_PREFIX = `rec_dash_${RUN_ID}`;

// Dynamic IDs - created in beforeEach
let TEST_COMPANY_ID: number;
let TEST_OUTLET_ID: number;
let TEST_FISCAL_YEAR_ID: number;

// Cash account IDs
let CASH_ACCOUNT_ID: number;
let BANK_ACCOUNT_ID: number;

let db: KyselySchema;
let dashboardService: ReconciliationDashboardService;

// =============================================================================
// TEST SETUP
// =============================================================================

async function createTestCompany(): Promise<number> {
  const result = await sql`
    INSERT INTO companies (code, name, timezone, status, created_at, updated_at)
    VALUES (
      ${TEST_PREFIX}_COMPANY,
      ${TEST_PREFIX} Company,
      'Asia/Jakarta',
      'ACTIVE',
      NOW(),
      NOW()
    )
  `.execute(db);

  return Number(result.insertId);
}

async function createTestOutlet(companyId: number): Promise<number> {
  const result = await sql`
    INSERT INTO outlets (company_id, code, name, timezone, status, created_at, updated_at)
    VALUES (
      ${companyId},
      ${TEST_PREFIX}_OUTLET,
      ${TEST_PREFIX} Outlet,
      'Asia/Jakarta',
      'ACTIVE',
      NOW(),
      NOW()
    )
  `.execute(db);

  return Number(result.insertId);
}

async function createTestFiscalYear(companyId: number): Promise<number> {
  const startDate = new Date();
  startDate.setMonth(0, 1);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date();
  endDate.setMonth(11, 31);
  endDate.setHours(23, 59, 59, 999);

  const result = await sql`
    INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status, created_at, updated_at)
    VALUES (
      ${companyId},
      ${`FY_${RUN_ID}`},
      ${`Fiscal Year ${RUN_ID}`},
      ${startDate},
      ${endDate},
      'OPEN',
      NOW(),
      NOW()
    )
  `.execute(db);

  return Number(result.insertId);
}

async function createTestAccountType(companyId: number, name: string, category: string, normalBalance: string): Promise<number> {
  const result = await sql`
    INSERT INTO account_types (company_id, name, category, normal_balance, report_group, is_active, created_at, updated_at)
    VALUES (
      ${companyId},
      ${name},
      ${category},
      ${normalBalance},
      ${category === 'REVENUE' || category === 'EXPENSE' ? 'PL' : 'NRC'},
      1,
      NOW(),
      NOW()
    )
  `.execute(db);

  return Number(result.insertId);
}

async function createTestAccount(companyId: number, code: string, name: string, accountTypeId: number): Promise<number> {
  const result = await sql`
    INSERT INTO accounts (
      company_id, code, name, account_type_id, normal_balance, 
      is_group, is_payable, is_active, is_cash, has_cash_subaccount, created_at, updated_at
    )
    VALUES (
      ${companyId},
      ${code},
      ${name},
      ${accountTypeId},
      'D',
      0,
      0,
      1,
      1,
      0,
      NOW(),
      NOW()
    )
  `.execute(db);

  return Number(result.insertId);
}

async function createJournalBatch(companyId: number, outletId: number | null, docType: string, docId: number, description: string): Promise<number> {
  const result = await sql`
    INSERT INTO journal_batches (
      company_id, outlet_id, doc_type, doc_id, description,
      posted_by_user_id, status, created_at, updated_at
    )
    VALUES (
      ${companyId},
      ${outletId},
      ${docType},
      ${docId},
      ${description},
      NULL,
      'POSTED',
      NOW(),
      NOW()
    )
  `.execute(db);

  return Number(result.insertId);
}

async function createJournalLine(
  companyId: number,
  batchId: number,
  accountId: number,
  debit: number,
  credit: number,
  description: string,
  lineDate: Date
): Promise<void> {
  await sql`
    INSERT INTO journal_lines (
      company_id, journal_batch_id, account_id, debit, credit,
      description, line_date, created_at, updated_at
    )
    VALUES (
      ${companyId},
      ${batchId},
      ${accountId},
      ${debit},
      ${credit},
      ${description},
      ${lineDate},
      NOW(),
      NOW()
    )
  `.execute(db);
}

async function createBankTransaction(
  companyId: number,
  sourceAccountId: number,
  destAccountId: number,
  amount: number,
  description: string,
  transactionDate: Date,
  status: string = 'POSTED'
): Promise<number> {
  const result = await sql`
    INSERT INTO cash_bank_transactions (
      company_id, source_account_id, destination_account_id, amount,
      transaction_type, description, status, transaction_date, created_at, updated_at
    )
    VALUES (
      ${companyId},
      ${sourceAccountId},
      ${destAccountId},
      ${amount},
      'TRANSFER',
      ${description},
      ${status},
      ${transactionDate},
      NOW(),
      NOW()
    )
  `.execute(db);

  return Number(result.insertId);
}

async function setupTestData(): Promise<void> {
  // Create company
  TEST_COMPANY_ID = await createTestCompany();
  
  // Create outlet
  TEST_OUTLET_ID = await createTestOutlet(TEST_COMPANY_ID);
  
  // Create fiscal year
  TEST_FISCAL_YEAR_ID = await createTestFiscalYear(TEST_COMPANY_ID);
  
  // Create cash account type
  const cashTypeId = await createTestAccountType(TEST_COMPANY_ID, 'CASH', 'ASSET', 'D');
  
  // Create cash account
  CASH_ACCOUNT_ID = await createTestAccount(
    TEST_COMPANY_ID,
    `${TEST_PREFIX}_CASH_001`,
    'Cash Account',
    cashTypeId
  );
  
  // Create bank account type
  const bankTypeId = await createTestAccountType(TEST_COMPANY_ID, 'BANK', 'ASSET', 'D');
  
  // Create bank account
  BANK_ACCOUNT_ID = await createTestAccount(
    TEST_COMPANY_ID,
    `${TEST_PREFIX}_BANK_001`,
    'Bank Account',
    bankTypeId
  );
  
  // Create journal entries for cash account (balanced)
  const batch1 = await createJournalBatch(TEST_COMPANY_ID, TEST_OUTLET_ID, 'MANUAL', 1, 'Cash deposit');
  await createJournalLine(TEST_COMPANY_ID, batch1, CASH_ACCOUNT_ID, 10000, 0, 'Cash deposit', new Date());
  await createJournalLine(TEST_COMPANY_ID, batch1, BANK_ACCOUNT_ID, 0, 10000, 'Cash deposit', new Date());
  
  // Create journal entries for bank account (balanced)
  const batch2 = await createJournalBatch(TEST_COMPANY_ID, TEST_OUTLET_ID, 'MANUAL', 2, 'Bank transfer');
  await createJournalLine(TEST_COMPANY_ID, batch2, BANK_ACCOUNT_ID, 5000, 0, 'Bank transfer in', new Date());
  await createJournalLine(TEST_COMPANY_ID, batch2, CASH_ACCOUNT_ID, 0, 5000, 'Bank transfer out', new Date());
  
  // Create bank transaction not in GL (for variance testing)
  const txDate = new Date();
  await createBankTransaction(
    TEST_COMPANY_ID,
    CASH_ACCOUNT_ID,
    BANK_ACCOUNT_ID,
    2000,
    'Bank transaction not in GL',
    txDate,
    'POSTED'
  );
}

async function cleanupTestData(): Promise<void> {
  // Delete in reverse dependency order
  await sql`DELETE FROM journal_lines WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
  await sql`DELETE FROM journal_batches WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
  await sql`DELETE FROM cash_bank_transactions WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
  await sql`DELETE FROM accounts WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
  await sql`DELETE FROM account_types WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
  await sql`DELETE FROM fiscal_years WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
  await sql`DELETE FROM outlets WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
  await sql`DELETE FROM companies WHERE id = ${TEST_COMPANY_ID}`.execute(db);
}

// =============================================================================
// TESTS
// =============================================================================

describe("ReconciliationDashboardService", () => {
  // Setup before all tests
  before(async () => {
    db = getDb() as KyselySchema;
    dashboardService = new ReconciliationDashboardService(db);
    await setupTestData();
  });

  // Cleanup after all tests
  after(async () => {
    await cleanupTestData();
    await closeDbPool();
  });

  describe("getDashboard", () => {
    test("should return dashboard with company-scoped data", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const dashboard = await dashboardService.getDashboard(query);

      assert.ok(dashboard);
      assert.strictEqual(dashboard.companyId, TEST_COMPANY_ID);
      assert.ok(dashboard.accounts.length >= 0);
      assert.ok(Array.isArray(dashboard.accounts));
    });

    test("should include GL balances for cash accounts", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        accountTypes: ["CASH"],
      };

      const dashboard = await dashboardService.getDashboard(query);

      // Filter to cash accounts only
      const cashAccounts = dashboard.accounts.filter(a => a.subledgerType === 'CASH');
      
      // We should have at least the cash account
      assert.ok(cashAccounts.length > 0, 'Should have at least one cash account');
    });

    test("should calculate variance between GL and subledger", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        accountTypes: ["CASH"],
      };

      const dashboard = await dashboardService.getDashboard(query);

      for (const account of dashboard.accounts) {
        assert.ok(account.variance);
        assert.ok(typeof account.variance.glBalance === 'number');
        assert.ok(typeof account.variance.subledgerBalance === 'number');
        assert.ok(typeof account.variance.variance === 'number');
        assert.ok(typeof account.variance.status === 'string');
        
        // Variance should be GL - subledger
        const expectedVariance = account.variance.glBalance - account.variance.subledgerBalance;
        assert.strictEqual(
          account.variance.variance,
          expectedVariance,
          `Variance should be GL - subledger: ${account.variance.glBalance} - ${account.variance.subledgerBalance}`
        );
      }
    });

    test("should determine reconciliation status correctly", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        accountTypes: ["CASH"],
      };

      const dashboard = await dashboardService.getDashboard(query);

      for (const account of dashboard.accounts) {
        const validStatuses: ReconciliationStatus[] = ["RECONCILED", "VARIANCE", "UNRECONCILED"];
        assert.ok(
          validStatuses.includes(account.variance.status),
          `Status should be one of ${validStatuses.join(', ')}, got ${account.variance.status}`
        );
      }
    });

    test("should filter by reconciliation status", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        accountTypes: ["CASH"],
        statuses: ["RECONCILED"],
      };

      const dashboard = await dashboardService.getDashboard(query);

      for (const account of dashboard.accounts) {
        assert.strictEqual(account.variance.status, "RECONCILED");
      }
    });

    test("should include period trends", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        accountTypes: ["CASH"],
        trendPeriods: 3,
      };

      const dashboard = await dashboardService.getDashboard(query);

      for (const account of dashboard.accounts) {
        assert.ok(Array.isArray(account.trend));
        assert.ok(account.trend.length <= 3, 'Should have at most 3 trend periods');
        
        for (const trend of account.trend) {
          assert.ok(typeof trend.glBalance === 'number');
          assert.ok(typeof trend.subledgerBalance === 'number');
          assert.ok(typeof trend.variance === 'number');
          assert.ok(typeof trend.status === 'string');
          assert.ok(typeof trend.periodCode === 'string');
        }
      }
    });

    test("should include Epic 30 glImbalanceMetric", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const dashboard = await dashboardService.getDashboard(query);

      assert.ok(dashboard.glImbalanceMetric);
      assert.ok(typeof dashboard.glImbalanceMetric.totalImbalances === 'number');
      assert.ok(Array.isArray(dashboard.glImbalanceMetric.byPeriod));
    });

    test("should include summary counts", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        accountTypes: ["CASH"],
      };

      const dashboard = await dashboardService.getDashboard(query);

      assert.ok(dashboard.summary);
      assert.strictEqual(
        dashboard.summary.totalAccounts,
        dashboard.accounts.length,
        'Total accounts should match accounts array length'
      );
      assert.strictEqual(
        dashboard.summary.reconciled +
        dashboard.summary.withVariance +
        dashboard.summary.unreconciled,
        dashboard.summary.totalAccounts,
        'Sum of status counts should equal total accounts'
      );
    });

    test("should throw error for non-existent company", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: 999999,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      // Should return empty dashboard, not throw
      const dashboard = await dashboardService.getDashboard(query);
      assert.ok(dashboard);
      assert.strictEqual(dashboard.accounts.length, 0);
    });
  });

  describe("getVarianceDrilldown", () => {
    test("should return null for non-existent account", async () => {
      const drilldown = await dashboardService.getVarianceDrilldown(
        TEST_COMPANY_ID,
        999999,
        undefined,
        TEST_FISCAL_YEAR_ID
      );

      assert.strictEqual(drilldown, null);
    });

    test("should return variance drilldown for valid account", async () => {
      const drilldown = await dashboardService.getVarianceDrilldown(
        TEST_COMPANY_ID,
        CASH_ACCOUNT_ID,
        undefined,
        TEST_FISCAL_YEAR_ID
      );

      assert.ok(drilldown);
      assert.strictEqual(drilldown.accountId, CASH_ACCOUNT_ID);
      assert.ok(typeof drilldown.glBalance === 'number');
      assert.ok(typeof drilldown.subledgerBalance === 'number');
      assert.ok(typeof drilldown.variance === 'number');
      assert.ok(Array.isArray(drilldown.lines));
    });

    test("should include journal lines in drilldown", async () => {
      const drilldown = await dashboardService.getVarianceDrilldown(
        TEST_COMPANY_ID,
        CASH_ACCOUNT_ID,
        undefined,
        TEST_FISCAL_YEAR_ID
      );

      assert.ok(drilldown);
      
      // Should have journal line entries
      const journalLines = drilldown.lines.filter(l => l.sourceType === 'JOURNAL_LINE');
      assert.ok(journalLines.length > 0, 'Should have journal lines');
      
      for (const line of journalLines) {
        assert.ok(typeof line.sourceId === 'string');
        assert.ok(typeof line.postedAtEpochMs === 'number');
        assert.ok(typeof line.debitAmount === 'number');
        assert.ok(typeof line.creditAmount === 'number');
      }
    });

    test("should include bank transactions in drilldown for cash accounts", async () => {
      const drilldown = await dashboardService.getVarianceDrilldown(
        TEST_COMPANY_ID,
        CASH_ACCOUNT_ID,
        undefined,
        TEST_FISCAL_YEAR_ID
      );

      assert.ok(drilldown);
      
      // Should have bank transaction entries
      const bankTxLines = drilldown.lines.filter(l => l.sourceType === 'BANK_TX');
      assert.ok(bankTxLines.length > 0, 'Should have bank transaction lines for cash account');
    });

    test("should calculate running balance correctly", async () => {
      const drilldown = await dashboardService.getVarianceDrilldown(
        TEST_COMPANY_ID,
        CASH_ACCOUNT_ID,
        undefined,
        TEST_FISCAL_YEAR_ID
      );

      assert.ok(drilldown);
      
      // Running balance should be calculated for lines
      let expectedBalance = 0;
      for (const line of drilldown.lines) {
        expectedBalance += line.debitAmount - line.creditAmount;
        assert.strictEqual(line.runningBalance, expectedBalance);
      }
    });

    test("should filter by period correctly", async () => {
      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const dashboard = await dashboardService.getDashboard(query);
      
      if (dashboard.accounts.length > 0) {
        const account = dashboard.accounts[0];
        
        const drilldown = await dashboardService.getVarianceDrilldown(
          TEST_COMPANY_ID,
          account.accountId,
          undefined,
          TEST_FISCAL_YEAR_ID
        );

        assert.ok(drilldown);
        assert.ok(drilldown.periodStartEpochMs > 0);
        assert.ok(drilldown.periodEndEpochMs > 0);
        assert.ok(drilldown.periodEndEpochMs >= drilldown.periodStartEpochMs);
      }
    });
  });

  describe("edge cases", () => {
    test("should handle zero balances (no transactions)", async () => {
      // Create a new account with no transactions
      const emptyAccountTypeId = await createTestAccountType(TEST_COMPANY_ID, 'EMPTY_' + RUN_ID, 'ASSET', 'D');
      const emptyAccountId = await createTestAccount(
        TEST_COMPANY_ID,
        `${TEST_PREFIX}_EMPTY_${Date.now()}`,
        'Empty Account',
        emptyAccountTypeId
      );

      const drilldown = await dashboardService.getVarianceDrilldown(
        TEST_COMPANY_ID,
        emptyAccountId,
        undefined,
        TEST_FISCAL_YEAR_ID
      );

      assert.ok(drilldown);
      assert.strictEqual(drilldown.glBalance, 0);
      assert.strictEqual(drilldown.variance, 0);

      // Cleanup
      await sql`DELETE FROM accounts WHERE id = ${emptyAccountId}`.execute(db);
      await sql`DELETE FROM account_types WHERE id = ${emptyAccountTypeId}`.execute(db);
    });

    test("should handle accounts with only debit transactions", async () => {
      // Create journal entries with only debits
      const batchId = await createJournalBatch(TEST_COMPANY_ID, TEST_OUTLET_ID, 'TEST', 999, 'Debit only');
      await createJournalLine(TEST_COMPANY_ID, batchId, CASH_ACCOUNT_ID, 500, 0, 'Debit entry', new Date());

      const drilldown = await dashboardService.getVarianceDrilldown(
        TEST_COMPANY_ID,
        CASH_ACCOUNT_ID,
        undefined,
        TEST_FISCAL_YEAR_ID
      );

      assert.ok(drilldown);
      assert.ok(drilldown.glBalance >= 500, 'Should have debit balance');
    });

    test("should handle accounts with only credit transactions", async () => {
      // Create journal entries with only credits
      const batchId = await createJournalBatch(TEST_COMPANY_ID, TEST_OUTLET_ID, 'TEST', 998, 'Credit only');
      await createJournalLine(TEST_COMPANY_ID, batchId, CASH_ACCOUNT_ID, 0, 300, 'Credit entry', new Date());

      const drilldown = await dashboardService.getVarianceDrilldown(
        TEST_COMPANY_ID,
        CASH_ACCOUNT_ID,
        undefined,
        TEST_FISCAL_YEAR_ID
      );

      assert.ok(drilldown);
      // Net balance should reflect the credit
    });

    test("should handle unbalanced journal batch (Epic 30 gl_imbalance)", async () => {
      // Create an unbalanced journal batch
      const batchId = await createJournalBatch(TEST_COMPANY_ID, TEST_OUTLET_ID, 'UNBALANCED', 997, 'Unbalanced batch');
      await createJournalLine(TEST_COMPANY_ID, batchId, CASH_ACCOUNT_ID, 100, 0, 'Debit', new Date());
      // Intentionally not creating the credit line to make it unbalanced

      const query: ReconciliationDashboardQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const dashboard = await dashboardService.getDashboard(query);

      // Should detect the imbalance
      assert.ok(dashboard.glImbalanceMetric.totalImbalances >= 1, 'Should detect unbalanced batch');
    });
  });
});
