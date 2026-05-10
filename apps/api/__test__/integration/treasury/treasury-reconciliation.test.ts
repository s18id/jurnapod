// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 57.4: Treasury Handoff + Reconciliation Correctness
// Integration tests for AR payment treasury handoff and bank reconciliation.
// Real DB required (treasury balance, reconciliation queries).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { initializeDefaultTemplates } from '../../../src/lib/numbering';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  createTestCustomerForCompany,
  ensureTestSalesAccountMappings,
  loginForTest,
  createTestBankAccount,
  createTestFiscalYear,
  createTestFiscalPeriod,
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';
import { createPostedInvoice as sharedCreatePostedInvoice, createAndPostPayment as sharedCreateAndPostPayment } from '../../helpers/sales-flows';

let baseUrl: string;
let tokenA: string;
let companyAId: number;
let outletAId: number;

let tagCounter = 0;
function treTag(prefix: string): string {
  return `${prefix}${String(++tagCounter).padStart(4, '0')}`;
}

describe('treasury.treasury-reconciliation - Story 57.4', { timeout: 90000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    // Ensure seed login path is healthy before custom fixture login.
    await getTestAccessToken(baseUrl);

    const ownerRoleId = await getRoleIdByCode('OWNER');
    const CRUDAM = buildPermissionMask({
      canCreate: true,
      canRead: true,
      canUpdate: true,
      canDelete: true,
      canAnalyze: true,
      canManage: true,
    });

    const companyA = await createTestCompanyMinimal({
      code: `TRE57${Date.now()}`.slice(0, 15),
      timezone: 'Asia/Jakarta',
    });
    companyAId = companyA.id;

    const outletA = await createTestOutletMinimal(companyAId, {
      code: `TOUT57${Date.now()}`.slice(0, 15),
      timezone: 'Asia/Jakarta',
    });
    outletAId = outletA.id;

    const userA = await createTestUser(companyAId, {
      email: `tre57-${Date.now()}@example.com`,
      name: 'TRE 57.4 Owner',
      password: 'TestPassword123!',
    });

    await assignUserGlobalRole(userA.id, ownerRoleId);
    await setModulePermission(companyAId, ownerRoleId, 'platform', 'customers', CRUDAM, { allowSystemRoleMutation: true });
    await setModulePermission(companyAId, ownerRoleId, 'sales', 'invoices', CRUDAM, { allowSystemRoleMutation: true });
    await setModulePermission(companyAId, ownerRoleId, 'sales', 'payments', CRUDAM, { allowSystemRoleMutation: true });
    await setModulePermission(companyAId, ownerRoleId, 'treasury', 'transactions', CRUDAM, { allowSystemRoleMutation: true });

    await ensureTestSalesAccountMappings(companyAId, outletAId);
    await initializeDefaultTemplates(companyAId);
    const fiscalYear = await createTestFiscalYear(companyAId, {
      year: 2026,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'OPEN',
    });
    await createTestFiscalPeriod(fiscalYear.id);

    tokenA = await loginForTest(baseUrl, companyA.code, userA.email, 'TestPassword123!');
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // Helper: create customer
  async function createCustomerA(): Promise<number> {
    const code = `CUST57${Date.now()}`.slice(0, 20);
    return createTestCustomerForCompany(baseUrl, tokenA, companyAId, code, 'TRE 57.4 Customer');
  }

  // Helper: create POSTED invoice via API (delegates to shared helper)
  async function createPostedInvoice(amount: number, invoiceDate = '2026-05-20'): Promise<{ id: number; invoice_no: string }> {
    const customerId = await createCustomerA();
    const invoiceNo = treTag('INV');
    return sharedCreatePostedInvoice({
      baseUrl, token: tokenA, outletId: outletAId, customerId, amount,
      invoiceDate, invoiceNo, description: 'TRE57.4 Invoice',
    });
  }

  // Helper: create bank account (BANK type, active by default)
  async function createActiveBankAccount(): Promise<number> {
    const bankAccountId = await createTestBankAccount(companyAId, {
      code: treTag('BANK'),
      name: 'TRE57.4 Bank Account',
      typeName: 'BANK',
      isActive: true,
      isPayable: true,
    });
    return bankAccountId;
  }

  // Helper: create payment (DRAFT)
  async function createDraftPayment(
    invoiceId: number,
    accountId: number,
    amount: number,
    paymentDate = '2026-05-21'
  ): Promise<{ id: number; payment_no: string }> {
    const paymentNo = treTag('PAY');
    const res = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outlet_id: outletAId,
        invoice_id: invoiceId,
        client_ref: crypto.randomUUID(),
        payment_no: paymentNo,
        payment_at: paymentDate + 'T10:00:00Z',
        account_id: accountId,
        method: 'CASH',
        amount,
      }),
    });

    if (res.status !== 201) {
      throw new Error(`createAndPostPayment create expected 201, got ${res.status}: ${await res.text()}`);
    }
    const body = await res.json() as { data: { id: number; status: string } };
    expect(body.data.status).toBe('DRAFT');

    return { id: body.data.id, payment_no: paymentNo };
  }

  // Helper: post draft payment
  async function postPayment(paymentId: number): Promise<void> {
    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (postRes.status !== 200) {
      throw new Error(`createAndPostPayment post expected 200, got ${postRes.status}: ${await postRes.text()}`);
    }
    const postBody = await postRes.json() as { data: { id: number; status: string } };
    expect(postBody.data.status).toBe('POSTED');
  }

  // Helper: create + post payment (delegates to shared helper)
  async function createAndPostPayment(
    invoiceId: number,
    accountId: number,
    amount: number,
    paymentDate = '2026-05-21'
  ): Promise<{ id: number; payment_no: string }> {
    return sharedCreateAndPostPayment({
      baseUrl, token: tokenA, outletId: outletAId,
      invoiceId, accountId, amount,
      paymentAt: paymentDate + 'T10:00:00Z',
    });
  }

  // Query treasury sum for a given account
  async function getTreasurySum(accountId: number): Promise<number> {
    const db = getTestDb();
    const rows = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM cash_bank_transactions
      WHERE destination_account_id = ${accountId}
        AND company_id = ${companyAId}
        AND status = 'POSTED'
    `.execute(db);
    return Number((rows.rows[0] as { total: string }).total);
  }

  // Query cash_bank_transactions row by payment_no reference
  async function getCashBankTxByPaymentRef(paymentNo: string): Promise<{ id: number; amount: string; transaction_type: string; status: string; source_account_id: number; destination_account_id: number } | undefined> {
    const db = getTestDb();
    const rows = await sql`
      SELECT id, amount, transaction_type, status, source_account_id, destination_account_id
      FROM cash_bank_transactions
      WHERE company_id = ${companyAId}
        AND reference = ${paymentNo}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);
    return rows.rows[0] as { id: number; amount: string; transaction_type: string; status: string; source_account_id: number; destination_account_id: number } | undefined;
  }

  // Query journal lines for a given journal batch
  async function getJournalLinesForBatch(batchId: number): Promise<Array<{ account_id: number; debit: string; credit: string }>> {
    const db = getTestDb();
    const rows = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${batchId}
      ORDER BY id
    `.execute(db);
    return rows.rows as Array<{ account_id: number; debit: string; credit: string }>;
  }

  // Query journal batch for a given doc_type + doc_id
  async function getJournalBatch(companyId: number, docType: string, docId: number) {
    const db = getTestDb();
    const rows = await sql`
      SELECT id, doc_type, doc_id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND doc_type = ${docType}
        AND doc_id = ${docId}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);
    return rows.rows[0] as { id: number; doc_type: string; doc_id: number } | undefined;
  }

  // AC1: AR payment creates cash_bank_transactions row
  it('AC1: AR payment creates cash_bank_transactions row with correct account direction', async () => {
    const { id: invoiceId } = await createPostedInvoice(500000, '2026-05-22');
    const bankAccountId = await createActiveBankAccount();
    const { payment_no: paymentNo } = await createAndPostPayment(invoiceId, bankAccountId, 500000, '2026-05-22');

    // Verify cash_bank_transactions row exists
    const cbt = await getCashBankTxByPaymentRef(paymentNo);
    expect(cbt).toBeDefined();
    expect(cbt!.transaction_type).toBe('MUTATION');
    expect(cbt!.status).toBe('POSTED');
    expect(Number(cbt!.amount)).toBe(500000);
    expect(cbt!.destination_account_id).toBe(bankAccountId);
    expect(cbt!.source_account_id).toBeGreaterThan(0); // AR receivable account
  });

  // AC2: Treasury balance = SUM(cash_bank_transactions)
  it('AC2: Treasury balance equals SUM(cash_bank_transactions) for given account', async () => {
    const bankAccountId = await createActiveBankAccount();

    // Post 3 payments to the same bank account
    const { id: inv1 } = await createPostedInvoice(100000, '2026-05-23');
    await createAndPostPayment(inv1, bankAccountId, 100000, '2026-05-23');

    const { id: inv2 } = await createPostedInvoice(250000, '2026-05-24');
    await createAndPostPayment(inv2, bankAccountId, 250000, '2026-05-24');

    const { id: inv3 } = await createPostedInvoice(175000, '2026-05-25');
    await createAndPostPayment(inv3, bankAccountId, 175000, '2026-05-25');

    // Query SUM from cash_bank_transactions
    const treasurySum = await getTreasurySum(bankAccountId);
    expect(treasurySum).toBe(525000); // 100000 + 250000 + 175000
  });

  // AC3: AR payment handoff consistent (receivable debit = cash credit)
  it('AC3: AR payment receivable debit matches treasury cash credit', async () => {
    const { id: invoiceId } = await createPostedInvoice(300000, '2026-05-26');
    const bankAccountId = await createActiveBankAccount();
    const { id: paymentId, payment_no: paymentNo } = await createAndPostPayment(invoiceId, bankAccountId, 300000, '2026-05-26');

    // Doc type is defined in modules-accounting as SALES_PAYMENT_IN_DOC_TYPE = 'SALES_PAYMENT_IN'.
    const paymentJournalBatch = await getJournalBatch(companyAId, 'SALES_PAYMENT_IN', paymentId);
    expect(paymentJournalBatch).toBeDefined();

    // Get journal lines
    const lines = await getJournalLinesForBatch(paymentJournalBatch!.id);

    // AR payment posting must be balanced and include cash account movement
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(totalDebit).toBe(300000);
    expect(totalCredit).toBe(300000);

    const cashLine = lines.find((line) => line.account_id === bankAccountId);
    expect(cashLine).toBeDefined();
    expect(Number(cashLine!.debit)).toBe(300000);
    expect(Number(cashLine!.credit)).toBe(0);

    // Verify cash_bank_transactions row has matching amount
    const cbt = await getCashBankTxByPaymentRef(paymentNo);
    expect(cbt).toBeDefined();
    expect(Number(cbt!.amount)).toBe(300000);
    expect(cbt!.destination_account_id).toBe(bankAccountId);
  });

  // AC4: Concurrent draft creation + deterministic posting sequence
  // Concurrent INSERTS to payments/payment_lines under MySQL can deadlock.
  // Retry on transient 500 to make the test resilient under parallel suite load.
  it('AC4: Concurrent draft payments to same account reconcile to correct final balance', async () => {
    const bankAccountId = await createActiveBankAccount();

    // Create 2 separate invoices first
    const { id: inv1 } = await createPostedInvoice(150000, '2026-05-27');
    const { id: inv2 } = await createPostedInvoice(200000, '2026-05-27');

    // Retry helper for transient concurrent failures
    async function createDraftWithRetry(
      invoiceId: number, accountId: number, amount: number, date: string, maxRetries = 3
    ): Promise<{ id: number; payment_no: string }> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await createDraftPayment(invoiceId, accountId, amount, date);
        } catch (err) {
          if (attempt === maxRetries) throw err;
          await new Promise((r) => setTimeout(r, 200 * attempt));
        }
      }
      throw new Error('unreachable');
    }

    // Create draft payments concurrently with retry
    const [draft1, draft2] = await Promise.all([
      createDraftWithRetry(inv1, bankAccountId, 150000, '2026-05-27'),
      createDraftWithRetry(inv2, bankAccountId, 200000, '2026-05-27'),
    ]);

    await postPayment(draft1.id);
    await postPayment(draft2.id);

    // Both should succeed (payment IDs should be different)
    expect(draft1.id).not.toBe(draft2.id);

    // Treasury sum should equal sum of both payments
    const treasurySum = await getTreasurySum(bankAccountId);
    expect(treasurySum).toBe(350000); // 150000 + 200000
  });

  // AC5: Non-existent account → 400
  it('AC5: AR payment with non-existent account_id returns 400', async () => {
    const { id: invoiceId } = await createPostedInvoice(100000, '2026-05-28');

    const res = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outlet_id: outletAId,
        invoice_id: invoiceId,
        client_ref: crypto.randomUUID(),
        payment_no: treTag('PAYERR'),
        payment_at: '2026-05-28T10:00:00Z',
        account_id: 99999999, // non-existent
        method: 'CASH',
        amount: 100000,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error?: { message?: string } };
    expect(body.error?.message).toContain('Account not found or not a valid payment target account');
  });

  // AC6: Inactive account → 400
  it('AC6: AR payment with inactive treasury account returns 400', async () => {
    const { id: invoiceId } = await createPostedInvoice(100000, '2026-05-29');

    // Create inactive bank account
    const inactiveBankId = await createTestBankAccount(companyAId, {
      code: treTag('BNK'),
      name: 'TRE57.4 Inactive Bank',
      typeName: 'BANK',
      isActive: false,
      isPayable: true,
    });

    const res = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outlet_id: outletAId,
        invoice_id: invoiceId,
        client_ref: crypto.randomUUID(),
        payment_no: treTag('PAYERR'),
        payment_at: '2026-05-29T10:00:00Z',
        account_id: inactiveBankId,
        method: 'CASH',
        amount: 100000,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error?: { message?: string } };
    expect(body.error?.message).toContain('Account not found or not a valid payment target account');
  });

  // AC7: Bank reconciliation variance = 0
  it('AC7: SUM(cash_bank_transactions) equals GL cash account balance (variance = 0)', async () => {
    const bankAccountId = await createActiveBankAccount();

    const { id: inv1 } = await createPostedInvoice(180000, '2026-05-30');
    await createAndPostPayment(inv1, bankAccountId, 180000, '2026-05-30');

    const { id: inv2 } = await createPostedInvoice(220000, '2026-05-31');
    await createAndPostPayment(inv2, bankAccountId, 220000, '2026-05-31');

    // Treasury sum
    const treasurySum = await getTreasurySum(bankAccountId);
    expect(treasurySum).toBe(400000);

    // GL balance: SUM of journal_lines where account_id = bankAccountId
    const db = getTestDb();
    const glRows = await sql`
      SELECT
        COALESCE(SUM(CAST(debit AS DECIMAL(18,4))), 0) as gl_debit
      FROM journal_lines
      WHERE account_id = ${bankAccountId}
        AND company_id = ${companyAId}
    `.execute(db);

    const glDebit = Number((glRows.rows[0] as { gl_debit: string }).gl_debit);

    // Variance = 0 means treasury_sum matches GL movement on the same cash account.
    // In current posting implementation, AR payment debits cash/bank account.
    expect(glDebit).toBe(treasurySum);
    // Variance = 0
    expect(glDebit - treasurySum).toBe(0);
  });

  // AC8: Missing account_id → 400
  it('AC8: AR payment without account_id and without splits returns 400', async () => {
    const { id: invoiceId } = await createPostedInvoice(100000, '2026-06-01');

    // POST payment without account_id and without splits
    const res = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outlet_id: outletAId,
        invoice_id: invoiceId,
        client_ref: crypto.randomUUID(),
        payment_no: treTag('PAYNOCASH'),
        payment_at: '2026-06-01T10:00:00Z',
        // NO account_id
        // NO splits
        method: 'CASH',
        amount: 100000,
      }),
    });

    expect(res.status).toBe(400);
  });

  // AC9: Treasury void creates correction
  it('AC9: POST /cash-bank-transactions/{id}/void creates correction transaction (not mutation)', async () => {
    const { id: invoiceId } = await createPostedInvoice(250000, '2026-06-02');
    const bankAccountId = await createActiveBankAccount();
    const { payment_no: paymentNo } = await createAndPostPayment(invoiceId, bankAccountId, 250000, '2026-06-02');

    // Find the cash_bank_transaction ID
    const cbt = await getCashBankTxByPaymentRef(paymentNo);
    expect(cbt).toBeDefined();
    const cashBankTxId = cbt!.id;

    // Void the treasury transaction
    const voidRes = await fetch(`${baseUrl}/api/cash-bank-transactions/${cashBankTxId}/void`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(voidRes.status).toBe(200);
    const voidBody = await voidRes.json() as { data: { status: string } };
    expect(voidBody.data.status).toBe('VOID');

    // Verify original transaction status = VOID
    const db = getTestDb();
    const origRow = await sql`
      SELECT status FROM cash_bank_transactions
      WHERE id = ${cashBankTxId}
    `.execute(db);
    expect((origRow.rows[0] as { status: string }).status).toBe('VOID');

    // Doc type pattern comes from treasury service: `${DOC_TYPE_BY_TRANSACTION_TYPE['MUTATION']}_VOID`.
    // Verify journal batch for void exists: doc_type = 'CASH_BANK_MUTATION_VOID', doc_id = cashBankTxId
    const voidBatch = await getJournalBatch(companyAId, 'CASH_BANK_MUTATION_VOID', cashBankTxId);
    expect(voidBatch).toBeDefined();
    expect(voidBatch!.doc_type).toBe('CASH_BANK_MUTATION_VOID');
    expect(voidBatch!.doc_id).toBe(cashBankTxId);
  });

  // AC10: Code review GO — process gate, skip implementation
  it.skip('AC10: Code review GO required', async () => {
    // Process gate — reviewer must sign off before story is considered done.
    // This test is intentionally skipped; code review is the real validation.
  });
});
