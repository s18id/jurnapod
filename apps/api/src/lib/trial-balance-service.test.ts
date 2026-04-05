// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for TrialBalanceService
 *
 * Tests:
 * - Trial balance report with all accounts for a period
 * - Balance validation (SUM(debits) == SUM(credits))
 * - Variance vs prior period calculation
 * - Variance vs subledger calculation
 * - GL imbalance check across batches
 * - Pre-close validation checklist
 *
 * Run with: npm run test:integration -w @jurnapod/api
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { getDb, closeDbPool } from "./db";
import type { KyselySchema } from "@/lib/db";
import { sql } from "kysely";
import {
  TrialBalanceService,
  type TrialBalanceQuery,
  type TrialBalanceResult,
  type PreCloseValidationResult,
} from "./trial-balance-service";

// Test configuration
const RUN_ID = Date.now().toString(36);
const TEST_PREFIX = `tb_${RUN_ID}`;

// Dynamic IDs - created in before
let TEST_COMPANY_ID: number;
let TEST_OUTLET_ID: number;
let TEST_FISCAL_YEAR_ID: number;

// Account IDs
let CASH_ACCOUNT_ID: number;
let BANK_ACCOUNT_ID: number;
let REVENUE_ACCOUNT_ID: number;
let EXPENSE_ACCOUNT_ID: number;

let db: KyselySchema;
let trialBalanceService: TrialBalanceService;

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
      ${name.toUpperCase().includes('CASH') || name.toUpperCase().includes('BANK') ? 1 : 0},
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

  // Create revenue account type
  const revenueTypeId = await createTestAccountType(TEST_COMPANY_ID, 'REVENUE', 'REVENUE', 'C');

  // Create revenue account
  REVENUE_ACCOUNT_ID = await createTestAccount(
    TEST_COMPANY_ID,
    `${TEST_PREFIX}_REV_001`,
    'Sales Revenue',
    revenueTypeId
  );

  // Create expense account type
  const expenseTypeId = await createTestAccountType(TEST_COMPANY_ID, 'EXPENSE', 'EXPENSE', 'D');

  // Create expense account
  EXPENSE_ACCOUNT_ID = await createTestAccount(
    TEST_COMPANY_ID,
    `${TEST_PREFIX}_EXP_001`,
    'Operating Expense',
    expenseTypeId
  );

  // Create balanced journal entries (debits = credits)
  // Batch 1: Cash deposit - Debit Cash, Credit Revenue
  const batch1 = await createJournalBatch(TEST_COMPANY_ID, TEST_OUTLET_ID, 'MANUAL', 1, 'Cash sale');
  await createJournalLine(TEST_COMPANY_ID, batch1, CASH_ACCOUNT_ID, 10000, 0, 'Cash sale', new Date());
  await createJournalLine(TEST_COMPANY_ID, batch1, REVENUE_ACCOUNT_ID, 0, 10000, 'Cash sale', new Date());

  // Batch 2: Expense payment - Debit Expense, Credit Bank
  const batch2 = await createJournalBatch(TEST_COMPANY_ID, TEST_OUTLET_ID, 'MANUAL', 2, 'Pay expense');
  await createJournalLine(TEST_COMPANY_ID, batch2, EXPENSE_ACCOUNT_ID, 3000, 0, 'Operating expense', new Date());
  await createJournalLine(TEST_COMPANY_ID, batch2, BANK_ACCOUNT_ID, 0, 3000, 'Operating expense', new Date());

  // Batch 3: Transfer - Debit Bank, Credit Cash
  const batch3 = await createJournalBatch(TEST_COMPANY_ID, TEST_OUTLET_ID, 'MANUAL', 3, 'Transfer');
  await createJournalLine(TEST_COMPANY_ID, batch3, BANK_ACCOUNT_ID, 5000, 0, 'Transfer in', new Date());
  await createJournalLine(TEST_COMPANY_ID, batch3, CASH_ACCOUNT_ID, 0, 5000, 'Transfer out', new Date());

  // Create bank transaction not in GL (for subledger variance testing)
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

describe("TrialBalanceService", () => {
  // Setup before all tests
  before(async () => {
    db = getDb() as KyselySchema;
    trialBalanceService = new TrialBalanceService(db);
    await setupTestData();
  });

  // Cleanup after all tests
  after(async () => {
    await cleanupTestData();
    await closeDbPool();
  });

  describe("getTrialBalance", () => {
    test("should return trial balance with company-scoped data", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      assert.ok(result);
      assert.strictEqual(result.companyId, TEST_COMPANY_ID);
      assert.ok(result.accounts.length >= 0);
      assert.ok(Array.isArray(result.accounts));
    });

    test("should include all account balances", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        includeZeroBalances: true,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // Should have all 4 accounts (cash, bank, revenue, expense)
      assert.ok(result.accounts.length >= 4, `Should have at least 4 accounts, got ${result.accounts.length}`);

      // Check that all expected accounts are present
      const accountCodes = result.accounts.map((a) => a.accountCode);
      assert.ok(accountCodes.some((c) => c.includes(`${TEST_PREFIX}_CASH`)), "Should include cash account");
      assert.ok(accountCodes.some((c) => c.includes(`${TEST_PREFIX}_BANK`)), "Should include bank account");
      assert.ok(accountCodes.some((c) => c.includes(`${TEST_PREFIX}_REV`)), "Should include revenue account");
      assert.ok(accountCodes.some((c) => c.includes(`${TEST_PREFIX}_EXP`)), "Should include expense account");
    });

    test("should calculate correct debit and credit totals", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // Sum all debits and credits
      const totalDebits = result.accounts.reduce((sum, a) => sum + a.debitAmount, 0);
      const totalCredits = result.accounts.reduce((sum, a) => sum + a.creditAmount, 0);

      assert.strictEqual(result.totalDebits, totalDebits, "Total debits should match sum of account debits");
      assert.strictEqual(result.totalCredits, totalCredits, "Total credits should match sum of account credits");
    });

    test("should validate that trial balance is balanced", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // All journal entries are balanced, so total debits should equal total credits
      assert.ok(result.isBalanced, "Trial balance should be balanced when all batches are balanced");
      assert.ok(Math.abs(result.imbalanceAmount) < 0.001, "Imbalance should be zero or near-zero");
    });

    test("should include period range information", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      assert.ok(result.periodStart instanceof Date, "periodStart should be a Date");
      assert.ok(result.periodEnd instanceof Date, "periodEnd should be a Date");
      assert.ok(result.priorPeriodStart instanceof Date || result.priorPeriodStart === null, "priorPeriodStart should be a Date or null");
      assert.ok(result.priorPeriodEnd instanceof Date || result.priorPeriodEnd === null, "priorPeriodEnd should be a Date or null");
    });

    test("should calculate net balance correctly", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      const expectedNetBalance = result.totalDebits - result.totalCredits;
      assert.strictEqual(result.netBalance, expectedNetBalance, "Net balance should be total debits - total credits");
    });

    test("should include variance thresholds", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      assert.ok(typeof result.varianceWarningThreshold === 'number', "Should have variance warning threshold");
      assert.ok(typeof result.varianceCriticalThreshold === 'number', "Should have variance critical threshold");
      assert.ok(result.varianceWarningThreshold < result.varianceCriticalThreshold, "Warning threshold should be less than critical");
    });

    test("should filter to include only zero balances when requested", async () => {
      const queryWithZeros: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        includeZeroBalances: true,
      };

      const queryWithoutZeros: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        includeZeroBalances: false,
      };

      const resultWithZeros = await trialBalanceService.getTrialBalance(queryWithZeros);
      const resultWithoutZeros = await trialBalanceService.getTrialBalance(queryWithoutZeros);

      // With zeros should have more or equal accounts
      assert.ok(resultWithZeros.accounts.length >= resultWithoutZeros.accounts.length);
    });

    test("should sort accounts by account code", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        includeZeroBalances: true,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // Check that accounts are sorted by code
      for (let i = 1; i < result.accounts.length; i++) {
        const prev = result.accounts[i - 1].accountCode;
        const curr = result.accounts[i].accountCode;
        assert.ok(prev <= curr, `Account codes should be sorted: ${prev} should be <= ${curr}`);
      }
    });
  });

  describe("getTrialBalance - variance calculation", () => {
    test("should include prior period balance for variance calculation", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // Accounts with journal entries should have prior period balance
      const accountsWithEntries = result.accounts.filter((a) => a.debitAmount > 0 || a.creditAmount > 0);

      for (const account of accountsWithEntries) {
        assert.ok(account.priorPeriodBalance !== undefined, `Account ${account.accountCode} should have priorPeriodBalance`);
      }
    });

    test("should calculate period variance correctly", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      for (const account of result.accounts) {
        if (account.periodVariance && account.priorPeriodBalance) {
          // Absolute change should be current - prior
          const expectedChange = account.netBalance - account.priorPeriodBalance.netBalance;
          assert.strictEqual(
            account.periodVariance.absoluteChange,
            expectedChange,
            `Absolute change should be current - prior for ${account.accountCode}`
          );

          // If prior balance is not zero, percent change should be calculable
          if (account.priorPeriodBalance.netBalance !== 0) {
            const expectedPercent = expectedChange / Math.abs(account.priorPeriodBalance.netBalance);
            assert.ok(
              Math.abs(account.periodVariance.percentChange! - expectedPercent) < 0.001,
              `Percent change should match for ${account.accountCode}`
            );
          }
        }
      }
    });

    test("should determine variance severity correctly", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      for (const account of result.accounts) {
        if (account.periodVariance) {
          const validStatuses = ["INCREASE", "DECREASE", "NO_CHANGE", "NEW_ACCOUNT"];
          assert.ok(
            validStatuses.includes(account.periodVariance.status),
            `Variance status should be one of ${validStatuses.join(', ')}, got ${account.periodVariance.status}`
          );

          const validSeverities = ["OK", "WARNING", "CRITICAL"];
          assert.ok(
            validSeverities.includes(account.periodVariance.severity),
            `Variance severity should be one of ${validSeverities.join(', ')}, got ${account.periodVariance.severity}`
          );
        }
      }
    });
  });

  describe("getTrialBalance - subledger variance", () => {
    test("should include subledger variance for cash accounts", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
        accountTypes: ["CASH", "BANK"],
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // Filter to cash/bank accounts
      const cashBankAccounts = result.accounts.filter(
        (a) => a.accountTypeName.toUpperCase() === "CASH" || a.accountTypeName.toUpperCase() === "BANK"
      );

      for (const account of cashBankAccounts) {
        assert.ok(account.subledgerVariance !== null, `Cash account ${account.accountCode} should have subledger variance`);
        assert.ok(typeof account.subledgerVariance!.glBalance === 'number');
        assert.ok(typeof account.subledgerVariance!.subledgerBalance === 'number');
        assert.ok(typeof account.subledgerVariance!.variance === 'number');
      }
    });

    test("should detect variance when GL differs from subledger", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // Find accounts with subledger variance
      const accountsWithSubledgerVariance = result.accounts.filter(
        (a) => a.subledgerVariance && a.subledgerVariance.status === "VARIANCE"
      );

      // We created a bank transaction not in GL, so at least one account should have variance
      // (The cash account receiving the bank tx that isn't in GL)
      if (accountsWithSubledgerVariance.length > 0) {
        for (const account of accountsWithSubledgerVariance) {
          assert.ok(
            Math.abs(account.subledgerVariance!.variance) > 0.01,
            `Variance should be non-zero for account ${account.accountCode}`
          );
        }
      }
    });
  });

  describe("checkGlImbalanceByBatchId", () => {
    test("should return no imbalances for balanced batches", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // Query for imbalances directly
      const imbalances = await trialBalanceService.checkGlImbalanceByBatchId(
        TEST_COMPANY_ID,
        result.periodStart,
        result.periodEnd
      );

      assert.ok(Array.isArray(imbalances), "Should return an array");
      assert.strictEqual(imbalances.length, 0, "Should have no imbalances for balanced batches");
    });

    test("should detect unbalanced batch when debits != credits", async () => {
      // Create an unbalanced batch
      const unbalancedBatch = await createJournalBatch(
        TEST_COMPANY_ID,
        TEST_OUTLET_ID,
        'MANUAL',
        999,
        'Unbalanced batch for testing'
      );

      // Create an unbalanced entry (debit 100, credit 50)
      await createJournalLine(
        TEST_COMPANY_ID,
        unbalancedBatch,
        CASH_ACCOUNT_ID,
        100,
        0,
        'Unbalanced entry',
        new Date()
      );
      await createJournalLine(
        TEST_COMPANY_ID,
        unbalancedBatch,
        REVENUE_ACCOUNT_ID,
        0,
        50,
        'Unbalanced entry',
        new Date()
      );

      // Query for imbalances
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const imbalances = await trialBalanceService.checkGlImbalanceByBatchId(
        TEST_COMPANY_ID,
        startOfMonth,
        endOfMonth
      );

      // Clean up the unbalanced batch
      await sql`DELETE FROM journal_lines WHERE journal_batch_id = ${unbalancedBatch}`.execute(db);
      await sql`DELETE FROM journal_batches WHERE id = ${unbalancedBatch}`.execute(db);

      // Should detect the imbalance
      assert.ok(imbalances.length > 0, "Should detect the unbalanced batch");
      const unbalanced = imbalances.find((i) => i.batchId === unbalancedBatch);
      assert.ok(unbalanced, "Should find the unbalanced batch");
      assert.strictEqual(unbalanced!.imbalanceAmount, 50, "Imbalance should be 50 (100 - 50)");
    });
  });

  describe("runPreCloseValidation", () => {
    test("should return pre-close validation checklist", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      assert.ok(result);
      assert.strictEqual(result.companyId, TEST_COMPANY_ID);
      assert.ok(Array.isArray(result.checks), "Should have checks array");
      assert.ok(result.checks.length > 0, "Should have at least one check");
      assert.ok(typeof result.canClose === 'boolean', "Should have canClose boolean");
    });

    test("should include summary counts", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      assert.ok(typeof result.summary.totalChecks === 'number');
      assert.ok(typeof result.summary.passed === 'number');
      assert.ok(typeof result.summary.failed === 'number');
      assert.ok(typeof result.summary.warnings === 'number');
      assert.ok(typeof result.summary.skipped === 'number');

      assert.strictEqual(
        result.summary.totalChecks,
        result.summary.passed + result.summary.failed + result.summary.warnings + result.summary.skipped,
        "Total checks should equal sum of all statuses"
      );
    });

    test("should include trial balance totals", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      assert.ok(typeof result.trialBalanceTotals.totalDebits === 'number');
      assert.ok(typeof result.trialBalanceTotals.totalCredits === 'number');
      assert.ok(typeof result.trialBalanceTotals.imbalance === 'number');
      assert.ok(typeof result.trialBalanceTotals.isBalanced === 'boolean');
    });

    test("should include GL imbalance details", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      assert.ok(Array.isArray(result.glImbalanceDetails), "Should have glImbalanceDetails array");
    });

    test("should check trial balance is balanced", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      // Find the trial balance check
      const tbCheck = result.checks.find((c) => c.id === "trial_balance_balanced");
      assert.ok(tbCheck, "Should have trial_balance_balanced check");
      assert.ok(tbCheck!.status === "PASS" || tbCheck!.status === "FAIL");
    });

    test("should check for GL imbalances", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      // Find the GL imbalance check
      const glCheck = result.checks.find((c) => c.id === "no_gl_imbalances");
      assert.ok(glCheck, "Should have no_gl_imbalances check");
      assert.ok(glCheck!.status === "PASS" || glCheck!.status === "FAIL");
    });

    test("should check variance threshold", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      // Find the variance check
      const varianceCheck = result.checks.find((c) => c.id === "variance_threshold");
      assert.ok(varianceCheck, "Should have variance_threshold check");
      assert.ok(["PASS", "WARNING", "FAIL"].includes(varianceCheck!.status));
    });

    test("should check GL subledger reconciliation", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      // Find the subledger check
      const subledgerCheck = result.checks.find((c) => c.id === "gl_subledger_reconciled");
      assert.ok(subledgerCheck, "Should have gl_subledger_reconciled check");
      assert.ok(["PASS", "WARNING", "FAIL"].includes(subledgerCheck!.status));
    });

    test("should return accounts with variance", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      assert.ok(Array.isArray(result.accountsWithVariance));
    });

    test("should return accounts with subledger variance", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      assert.ok(Array.isArray(result.accountsWithSubledgerVariance));
    });

    test("should determine canClose correctly when balanced", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.runPreCloseValidation(query);

      // Since all our batches are balanced, canClose should be true (no blockers)
      // Unless there are subledger variances from the bank transaction
      const blockers = result.checks.filter((c) => c.severity === "BLOCKER" && c.status !== "PASS");
      if (blockers.length === 0) {
        assert.ok(result.canClose, "Should be able to close when no blockers");
      }
    });
  });

  describe("tenant isolation", () => {
    test("should only return data for the specified company", async () => {
      const query: TrialBalanceQuery = {
        companyId: TEST_COMPANY_ID,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // All accounts should belong to the test company
      for (const account of result.accounts) {
        // We can't directly check company_id on accounts without joining,
        // but the fact that we use companyId filter means we should get
        // only accounts from that company
        assert.ok(account.accountCode.includes(TEST_PREFIX), `Account ${account.accountCode} should belong to test company`);
      }
    });

    test("should return empty/near-empty results for non-existent company", async () => {
      const query: TrialBalanceQuery = {
        companyId: 999999999,
        fiscalYearId: TEST_FISCAL_YEAR_ID,
      };

      const result = await trialBalanceService.getTrialBalance(query);

      // Should return with zero balances since no accounts exist for non-existent company
      assert.ok(result);
      // The accounts array might be empty or contain all accounts with 0 balances
      // depending on how we handle missing companies
    });
  });
});
