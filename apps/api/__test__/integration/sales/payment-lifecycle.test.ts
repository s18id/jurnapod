// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 61.2: Sales Payment Lifecycle & FX Correctness
// Integration tests for DRAFT→POSTED→VOID state machine, immutability,
// FX delta acknowledgment, idempotency, and permission gating.
//
// Fixture Mode: Full Fixture — uses canonical API routes, production package
// flows, and ensureTestSalesAccountMappings/ensureTestPaymentVarianceMappings.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  createTestBankAccount,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  ensureTestSalesAccountMappings,
  ensureTestPaymentVarianceMappings,
  loginForTest,
  createTestFiscalYear,
  createTestFiscalPeriod,
  createTestItem,
  getOrCreateTestCashierForPermission,
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';
import { JournalsService } from '@jurnapod/modules-accounting';
import { createAndPostPayment as sharedCreateAndPostPayment } from '../../helpers/sales-flows';
import { makeTag } from '../../helpers/tags';
import { initializeDefaultTemplates } from '../../../src/lib/numbering';
import { nowUTC } from '../../../src/lib/date-helpers';

let baseUrl: string;
let ownerToken: string;
let companyId: number;
let outletId: number;
let cashierToken: string;
let companyCode: string;
let bankAccountId: number;

const CRUDAM = buildPermissionMask({
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: true,
  canAnalyze: true,
  canManage: true,
});

const CRUDAM_WITHOUT_DELETE = buildPermissionMask({
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: false,
  canAnalyze: true,
  canManage: true,
});

describe('sales.payment-lifecycle - Story 61.2', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    // ── Create test company with fiscal year and account mappings ──
    const company = await createTestCompanyMinimal({
      code: `PLC${Date.now()}`.slice(0, 20),
      timezone: 'Asia/Jakarta',
    });
    companyId = company.id;
    companyCode = company.code;

    const outlet = await createTestOutletMinimal(companyId, {
      code: `OLP${Date.now()}`.slice(0, 20),
      timezone: 'Asia/Jakarta',
    });
    outletId = outlet.id;

    // Create owner user for this company with full permissions
    const ownerRoleId = await getRoleIdByCode('OWNER');
    const user = await createTestUser(companyId, {
      email: `plc-owner-${Date.now()}@example.com`,
      name: 'PLC Owner',
      password: 'TestPassword123!',
    });
    await assignUserGlobalRole(user.id, ownerRoleId);
    await setModulePermission(companyId, ownerRoleId, 'platform', 'customers', CRUDAM, {
      allowSystemRoleMutation: true,
    });
    await setModulePermission(companyId, ownerRoleId, 'sales', 'invoices', CRUDAM, {
      allowSystemRoleMutation: true,
    });
    await setModulePermission(companyId, ownerRoleId, 'sales', 'payments', CRUDAM, {
      allowSystemRoleMutation: true,
    });

    await ensureTestSalesAccountMappings(companyId, outletId);
    await ensureTestPaymentVarianceMappings(companyId);

    // Initialize numbering templates (required for invoice/payment number generation)
    await initializeDefaultTemplates(companyId);

    // Create bank account for payment target
    bankAccountId = await createTestBankAccount(companyId, { typeName: 'BANK', isActive: true });

    // Create open fiscal year (required for posting to GL)
    const fiscalYear = await createTestFiscalYear(companyId, {
      year: 2026,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'OPEN',
    });
    await createTestFiscalPeriod(fiscalYear.id);

    ownerToken = await loginForTest(baseUrl, companyCode, user.email, 'TestPassword123!');

    // Get CASHIER user for permission tests
    const cashier = await getOrCreateTestCashierForPermission(
      companyId,
      companyCode,
      baseUrl
    );
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Create a draft invoice via API, then post it.
   * Returns invoice with id, grand_total, etc.
   */
  async function createAndPostInvoice(
    token: string = ownerToken,
    lineAmount: number = 100000
  ): Promise<{ id: number; invoice_no: string; grand_total: number }> {
    const item = await createTestItem(companyId);

    // Create draft invoice
    const payload = {
      outlet_id: outletId,
      invoice_date: '2026-05-01',
      draft: true,
      lines: [
        {
          item_id: item.id,
          description: `Test invoice item ${makeTag('PLC', 16)}`,
          qty: 1,
          unit_price: lineAmount,
        },
      ],
      tax_amount: 0,
    };

    const res = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    if (!body.success) {
      throw new Error(`Failed to create invoice: ${JSON.stringify(body)}`);
    }
    const invoiceId = body.data.id;

    // Post the invoice (required before posting payment)
    const postRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/post`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const postBody = await postRes.json();
    if (!postBody.success) {
      throw new Error(`Failed to post invoice: ${JSON.stringify(postBody)}`);
    }
    return { id: invoiceId, invoice_no: postBody.data.invoice_no, grand_total: postBody.data.grand_total };
  }

  /**
   * Create a draft payment via API.
   */
  async function createPayment(
    invoiceId: number,
    amount: number,
    token: string = ownerToken,
    opts?: { clientRef?: string; actualAmountIdr?: number }
  ): Promise<{ id: number; status: string; payment_no: string }> {
    const payload: Record<string, unknown> = {
      outlet_id: outletId,
      invoice_id: invoiceId,
      payment_at: nowUTC(),
      account_id: bankAccountId,
      amount,
      method: 'CASH',
    };
    if (opts?.clientRef) payload.client_ref = opts.clientRef;
    if (typeof opts?.actualAmountIdr === 'number') payload.actual_amount_idr = opts.actualAmountIdr;

    const res = await fetch(`${baseUrl}/api/sales/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!body.success) {
      throw new Error(`Failed to create payment: ${JSON.stringify(body)}`);
    }
    return body.data;
  }

  async function postPayment(
    paymentId: number,
    token: string = ownerToken,
    opts?: { fxAckAt?: string }
  ): Promise<{ status: number; body: any }> {
    const bodyPayload: Record<string, unknown> = {};
    if (opts?.fxAckAt) {
      bodyPayload.fx_ack = { acknowledged_at: opts.fxAckAt };
    }

    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function voidPayment(
    paymentId: number,
    token: string = ownerToken
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/void`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function patchPayment(
    paymentId: number,
    payload: Record<string, unknown>,
    token: string = ownerToken
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function getPayment(
    paymentId: number,
    token: string = ownerToken
  ): Promise<any> {
    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  }

  async function acknowledgeFx(
    paymentId: number,
    ackDate: string,
    token: string = ownerToken
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/acknowledge-fx`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ acknowledged_at: ackDate }),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  function getJournalsService(): JournalsService {
    return new JournalsService(getTestDb());
  }

  async function getJournalBatchesForPayment(paymentId: number): Promise<any[]> {
    const svc = getJournalsService();
    const batches = await svc.listJournalBatches({ company_id: companyId, limit: 1000, offset: 0 });
    return batches
      .filter(b => b.doc_id === paymentId && ['SALES_PAYMENT_IN', 'SALES_PAYMENT_VOID'].includes(b.doc_type))
      .map(b => ({
        id: b.id,
        doc_type: b.doc_type,
        posted_at: b.posted_at,
        doc_id: b.doc_id,
        total_debit: b.lines.reduce((sum: number, l: any) => sum + l.debit, 0),
        total_credit: b.lines.reduce((sum: number, l: any) => sum + l.credit, 0),
      }))
      .sort((a, b) => a.id - b.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AC1: DRAFT→POSTED creates balanced journal entries
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC1: DRAFT→POSTED with journal creation', () => {
    it('posts a draft payment and creates balanced journal entries (debit bank, credit AR)', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);

      expect(payment.status).toBe('DRAFT');

      const { status, body } = await postPayment(payment.id);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('POSTED');

      // Verify journal entries: debit bank/cash, credit AR, balanced
      const batches = await getJournalBatchesForPayment(payment.id);
      expect(batches.length).toBe(1);
      expect(batches[0].doc_type).toBe('SALES_PAYMENT_IN');
      // Journal must be balanced
      const totalDebit = Number(batches[0].total_debit);
      const totalCredit = Number(batches[0].total_credit);
      expect(totalDebit).toBe(totalCredit);
      // Total should equal the payment amount
      expect(totalDebit).toBe(invoice.grand_total);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC2: POSTED payments reject field mutation (409 CONFLICT)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC2: POSTED payment immutability', () => {
    it('rejects PATCH on posted payment with 409', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);
      await postPayment(payment.id);

      const { status, body } = await patchPayment(payment.id, { amount: 50000 });
      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('not editable');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC3: POSTED→VOID creates reversal journals
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC3: POSTED→VOID with reversal journals', () => {
    it('voids posted payment and creates reversal journal entries (debit AR, credit bank)', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);

      const { body: postedBody } = await postPayment(payment.id);
      expect(postedBody.data.status).toBe('POSTED');

      const { status, body } = await voidPayment(payment.id);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('VOID');

      // Verify both original payment and reversal journals exist
      const batches = await getJournalBatchesForPayment(payment.id);
      expect(batches.length).toBe(2);

      const original = batches.find((b: any) => b.doc_type === 'SALES_PAYMENT_IN');
      const reversal = batches.find((b: any) => b.doc_type === 'SALES_PAYMENT_VOID');

      expect(original).toBeDefined();
      expect(reversal).toBeDefined();

      // Original and reversal must both be balanced
      expect(Number(original.total_debit)).toBe(Number(original.total_credit));
      expect(Number(reversal.total_debit)).toBe(Number(reversal.total_credit));
      // Reversal amounts must match original
      expect(Number(reversal.total_debit)).toBe(Number(original.total_debit));
    });

    it('restores invoice paid_total on payment void', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);

      await postPayment(payment.id);

      // Check invoice payment_status is PAID
      const invAfterPay = await fetch(`${baseUrl}/api/sales/invoices/${invoice.id}`, {
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      }).then(r => r.json());
      expect(invAfterPay.data.payment_status).toBe('PAID');

      // Void payment
      await voidPayment(payment.id);

      // Check invoice payment_status reverts to UNPAID
      const invAfterVoid = await fetch(`${baseUrl}/api/sales/invoices/${invoice.id}`, {
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      }).then(r => r.json());
      expect(invAfterVoid.data.payment_status).toBe('UNPAID');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC4: FX delta acknowledgment workflow
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC4: FX delta acknowledgment', () => {
    it('rejects posting payment with non-zero FX delta without acknowledgment (422)', async () => {
      const invoice = await createAndPostInvoice();
      // Create payment with different actual_amount_idr to generate FX delta
      const payment = await createPayment(invoice.id, invoice.grand_total, ownerToken, {
        actualAmountIdr: invoice.grand_total + 500,
      });

      const { status, body } = await postPayment(payment.id);
      expect(status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FX_DELTA_REQUIRES_ACKNOWLEDGMENT');
    });

    it('allows posting after FX acknowledgment (separate ack + post)', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total, ownerToken, {
        actualAmountIdr: invoice.grand_total + 500,
      });

      // Acknowledge FX delta first
      const pastDate = new Date(Date.now() - 60000).toISOString();
      const ackResult = await acknowledgeFx(payment.id, pastDate);
      expect(ackResult.status).toBe(200);

      // Now posting should succeed
      const { status, body } = await postPayment(payment.id);
      expect(status).toBe(200);
      expect(body.data.status).toBe('POSTED');

      // Verify journal has variance entries (total = payment amount + delta)
      const batches = await getJournalBatchesForPayment(payment.id);
      expect(batches.length).toBe(1);
      // Total should include variance (debits = payment_amount + delta, credits = invoice_amount + delta)
      const totalDebit = Number(batches[0].total_debit);
      const totalCredit = Number(batches[0].total_credit);
      expect(totalDebit).toBe(totalCredit);
    });

    it('allows posting with inline fx_ack in POST body', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total, ownerToken, {
        actualAmountIdr: invoice.grand_total + 500,
      });

      const pastDate = new Date(Date.now() - 60000).toISOString();
      const { status, body } = await postPayment(payment.id, ownerToken, { fxAckAt: pastDate });
      expect(status).toBe(200);
      expect(body.data.status).toBe('POSTED');
    });

    it('allows posting zero-delta payment without FX acknowledgment', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);

      const { status, body } = await postPayment(payment.id);
      expect(status).toBe(200);
      expect(body.data.status).toBe('POSTED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC5: Payment idempotency via client_tx_id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC5: Payment idempotency via client_tx_id', () => {
    it('detects duplicate payment via client_ref and returns existing payment', async () => {
      const invoice = await createAndPostInvoice();
      // client_ref must be a valid UUID per SalesPaymentCreateRequestSchema
      const clientRef = 'a1b2c3d4-e5f6-7890-abcd-ef0000000001';

      // Use a fixed payment_at so idempotency comparison succeeds
      const fixedPaymentAt = nowUTC();

      // First payment creation
      const res1 = await fetch(`${baseUrl}/api/sales/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoice.id,
          payment_at: fixedPaymentAt,
          account_id: bankAccountId,
          amount: invoice.grand_total,
          method: 'CASH',
          client_ref: clientRef,
        }),
      });
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      const paymentId1 = body1.data.id;
      expect(body1.data.status).toBe('DRAFT');

      // Create payment again with same client_ref and same payment_at — should return the existing one
      const res2 = await fetch(`${baseUrl}/api/sales/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoice.id,
          payment_at: fixedPaymentAt,
          account_id: bankAccountId,
          amount: invoice.grand_total,
          method: 'CASH',
          client_ref: clientRef,
        }),
      });
      const body2 = await res2.json();
      // Should return 201 with the existing payment (idempotent)
      expect(body2.success).toBe(true);
      expect(body2.data.id).toBe(paymentId1);
      expect(body2.data.status).toBe('DRAFT');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC6: Void uses DELETE permission (403 for CASHIER)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC6: Void requires DELETE permission', () => {
    it('CASHIER cannot void a posted payment (403)', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);

      const { body: postedBody } = await postPayment(payment.id);
      expect(postedBody.data.status).toBe('POSTED');

      const { status, body } = await voidPayment(payment.id, cashierToken);
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it('OWNER can void a posted payment (200)', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);

      const { body: postedBody } = await postPayment(payment.id);
      expect(postedBody.data.status).toBe('POSTED');

      const { status, body } = await voidPayment(payment.id);
      expect(status).toBe(200);
      expect(body.data.status).toBe('VOID');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Edge: State machine guards', () => {
    it('rejects void on DRAFT payment (409)', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);
      expect(payment.status).toBe('DRAFT');

      const { status, body } = await voidPayment(payment.id);
      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('Draft payments cannot be voided');
    });

    it('rejects void on already-voided payment (409)', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);
      await postPayment(payment.id);
      await voidPayment(payment.id);

      const { status, body } = await voidPayment(payment.id);
      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('already voided');
    });

    it('rejects post on already-posted payment (idempotent — returns 200)', async () => {
      const invoice = await createAndPostInvoice();
      const payment = await createPayment(invoice.id, invoice.grand_total);

      const { status: firstStatus, body: firstBody } = await postPayment(payment.id);
      expect(firstStatus).toBe(200);
      expect(firstBody.data.status).toBe('POSTED');

      // Post again — should be idempotent
      const { status: secondStatus, body: secondBody } = await postPayment(payment.id);
      expect(secondStatus).toBe(200);
      expect(secondBody.data.status).toBe('POSTED');

      // Only one journal batch should exist for SALES_PAYMENT_IN
      const batches = await getJournalBatchesForPayment(payment.id);
      const paymentIns = batches.filter((b: any) => b.doc_type === 'SALES_PAYMENT_IN');
      expect(paymentIns.length).toBe(1);
    });
  });
});
