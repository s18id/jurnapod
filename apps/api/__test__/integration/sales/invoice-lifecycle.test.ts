// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 61.1: Sales Invoice Lifecycle Correctness
// Integration tests for DRAFT→POSTED→VOID state machine, immutability, and audit trail.
//
// Fixture Mode: Full Fixture — uses ensureTestSalesAccountMappings (same production
// package path as posting code), canonical API routes, no decomposed domain parts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  createTestBankAccount,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  ensureTestSalesAccountMappings,
  loginForTest,
  createTestFiscalYear,
  createTestFiscalPeriod,
  getOrCreateTestCashierForPermission,
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';
import { createPostedInvoice as sharedCreatePostedInvoice } from '../../helpers/sales-flows';
import { sql } from 'kysely';
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

describe('sales.invoice-lifecycle - Story 61.1', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);

    // ── Create test company with fiscal year and account mappings ──
    const company = await createTestCompanyMinimal({
      code: `ILC${Date.now()}`.slice(0, 20),
      timezone: 'Asia/Jakarta',
    });
    companyId = company.id;
    companyCode = company.code;

    const outlet = await createTestOutletMinimal(companyId, {
      code: `OLC${Date.now()}`.slice(0, 20),
      timezone: 'Asia/Jakarta',
    });
    outletId = outlet.id;

    // Create owner user for this company
    const ownerRoleId = await getRoleIdByCode('OWNER');
    const user = await createTestUser(companyId, {
      email: `ilc-owner-${Date.now()}@example.com`,
      name: 'ILC Owner',
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

    // Initialize numbering templates (required for invoice number generation)
    await initializeDefaultTemplates(companyId);

    // Create bank account for payment tests
    bankAccountId = await createTestBankAccount(companyId, { typeName: 'BANK', isActive: true });

    // Create open fiscal year (required for invoice posting to GL)
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

  async function createDraftInvoice(
    token: string = ownerToken,
    draft: boolean = true
  ): Promise<{ id: number; invoice_no: string; status: string; grand_total: number }> {
    const payload = {
      outlet_id: outletId,
      invoice_date: '2026-05-01',
      draft,
      lines: [
        {
          description: `Lifecycle test item ${makeTag('LC', 16)}`,
          qty: 2,
          unit_price: 50000,
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
      throw new Error(`Failed to create draft invoice: ${JSON.stringify(body)}`);
    }
    return body.data;
  }

  async function postInvoice(
    invoiceId: number,
    token: string = ownerToken
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/post`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function voidInvoice(
    invoiceId: number,
    token: string = ownerToken
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/void`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function postPayment(
    paymentId: number,
    token: string = ownerToken
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function patchInvoice(
    invoiceId: number,
    payload: Record<string, unknown>,
    token: string = ownerToken
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
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

  async function getInvoice(
    invoiceId: number,
    token: string = ownerToken
  ): Promise<any> {
    const res = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json();
    return body;
  }

  async function getJournalBatchesForInvoice(invoiceId: number): Promise<any[]> {
    const db = getTestDb();
    return db
      .selectFrom('journal_batches as jb')
      .innerJoin('journal_lines as jl', 'jl.journal_batch_id', 'jb.id')
      .select([
        'jb.id',
        'jb.doc_type',
        'jb.posted_at',
        'jb.doc_id',
      ])
      .select(({ fn }) => [
        fn.sum('jl.debit').as('total_debit'),
        fn.sum('jl.credit').as('total_credit'),
      ])
      .where('jb.doc_id', '=', invoiceId)
      .where('jb.doc_type', 'in', ['SALES_INVOICE', 'SALES_INVOICE_VOID'])
      .groupBy(['jb.id', 'jb.doc_type', 'jb.posted_at', 'jb.doc_id'])
      .orderBy('jb.id')
      .execute();
  }

  async function getAuditLogsForInvoice(invoiceId: number): Promise<any[]> {
    const db = getTestDb();
    return db
      .selectFrom('audit_logs')
      .select([
        'action',
        'user_id',
        'result',
        'success',
        'created_at',
        'payload_json',
      ])
      .where('company_id', '=', companyId)
      .where('action', 'in', ['POST', 'VOID'])
      .where(
        sql`JSON_EXTRACT(payload_json, '$.entity_type')`,
        '=',
        'sales_invoice'
      )
      .where(
        sql`JSON_EXTRACT(payload_json, '$.entity_id')`,
        '=',
        invoiceId
      )
      .orderBy('created_at')
      .execute();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AC1: DRAFT→POSTED transition creates journal entries
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC1: DRAFT→POSTED with journal creation', () => {
    it('posts a draft invoice and creates journal entries', async () => {
      const draft = await createDraftInvoice();
      expect(draft.status).toBe('DRAFT');

      const { status, body } = await postInvoice(draft.id);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('POSTED');

      // Verify journal entries were created
      const batches = await getJournalBatchesForInvoice(draft.id);
      expect(batches.length).toBe(1);
      expect(batches[0].doc_type).toBe('SALES_INVOICE');
      // Journal must be balanced
      expect(Number(batches[0].total_debit)).toBe(Number(batches[0].total_credit));
      // Total should equal grand_total (= 2 * 50000 = 100000)
      expect(Number(batches[0].total_debit)).toBe(100000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC2: POSTED invoices reject field mutation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC2: POSTED invoice immutability', () => {
    it('rejects PATCH on posted invoice with 409', async () => {
      const draft = await createDraftInvoice();
      await postInvoice(draft.id);

      const { status, body } = await patchInvoice(draft.id, {
        invoice_date: '2026-06-01',
      });
      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('not editable');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC3: POSTED→VOID creates reversal journals
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC3: POSTED→VOID with reversal journals', () => {
    it('voids posted invoice and creates reversal journal entries', async () => {
      const draft = await createDraftInvoice();
      const { body: postedBody } = await postInvoice(draft.id);
      expect(postedBody.data.status).toBe('POSTED');

      const { status, body } = await voidInvoice(draft.id);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('VOID');

      // Verify both original and reversal journals exist
      const batches = await getJournalBatchesForInvoice(draft.id);
      expect(batches.length).toBe(2);

      const original = batches.find((b: any) => b.doc_type === 'SALES_INVOICE');
      const reversal = batches.find((b: any) => b.doc_type === 'SALES_INVOICE_VOID');

      expect(original).toBeDefined();
      expect(reversal).toBeDefined();

      // Original and reversal must both be balanced
      expect(Number(original.total_debit)).toBe(Number(original.total_credit));
      expect(Number(reversal.total_debit)).toBe(Number(reversal.total_credit));
      // Reversal amounts must match original
      expect(Number(reversal.total_debit)).toBe(Number(original.total_debit));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC4: Invoice with payments rejects void
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC4: Invoice with payments rejects void', () => {
    it('rejects void on invoice with payments', async () => {
      const draft = await createDraftInvoice();
      await postInvoice(draft.id);

      // Create and post a payment via the API
      const paymentPayload = {
        outlet_id: outletId,
        invoice_id: draft.id,
        payment_at: nowUTC(),
        account_id: bankAccountId,
        amount: 10000,
        method: 'CASH',
      };
      const payRes = await fetch(`${baseUrl}/api/sales/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentPayload),
      });
      const payBody = await payRes.json();
      expect(payBody.success).toBe(true);
      const paymentId = payBody.data.id;

      // Post the payment (required for it to affect invoice payment_status)
      const { status: postStatus, body: postBody } = await postPayment(paymentId);
      expect(postStatus).toBe(200);
      expect(postBody.success).toBe(true);

      const { status, body } = await voidInvoice(draft.id);
      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('Cannot void invoice with payments');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC5: DRAFT invoice rejects void
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC5: DRAFT invoice rejects void', () => {
    it('rejects void on draft invoice', async () => {
      const draft = await createDraftInvoice();
      expect(draft.status).toBe('DRAFT');

      const { status, body } = await voidInvoice(draft.id);
      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('Draft invoices cannot be voided');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC6: Void uses DELETE permission (403 for CASHIER)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC6: Void requires DELETE permission', () => {
    it('CASHIER cannot void a posted invoice (403)', async () => {
      const draft = await createDraftInvoice();
      const { body: postedBody } = await postInvoice(draft.id);
      expect(postedBody.data.status).toBe('POSTED');

      const { status, body } = await voidInvoice(draft.id, cashierToken);
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC7: Lifecycle audit trail
  // ═══════════════════════════════════════════════════════════════════════════

  describe('AC7: Lifecycle audit trail', () => {
    it('records audit logs for each lifecycle transition', async () => {
      const draft = await createDraftInvoice();
      await postInvoice(draft.id);
      await voidInvoice(draft.id);

      const auditLogs = await getAuditLogsForInvoice(draft.id);
      // Expected: POST entry + VOID entry
      const postLogs = auditLogs.filter((l: any) => l.action === 'POST');
      const voidLogs = auditLogs.filter((l: any) => l.action === 'VOID');

      expect(postLogs.length).toBeGreaterThanOrEqual(1);
      expect(voidLogs.length).toBeGreaterThanOrEqual(1);
      expect(postLogs[0].success).toBe(1);
      expect(voidLogs[0].success).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge case: Duplicate post on already-POSTED invoice
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Edge: Duplicate post', () => {
    it('returns 200 on duplicate post (idempotent)', async () => {
      const draft = await createDraftInvoice();
      const { status: firstStatus, body: firstBody } = await postInvoice(draft.id);
      expect(firstStatus).toBe(200);
      expect(firstBody.data.status).toBe('POSTED');

      // Post again — should be idempotent
      const { status: secondStatus, body: secondBody } = await postInvoice(draft.id);
      expect(secondStatus).toBe(200);
      expect(secondBody.data.status).toBe('POSTED');

      // Only one journal batch should exist
      const batches = await getJournalBatchesForInvoice(draft.id);
      const salesInvoices = batches.filter((b: any) => b.doc_type === 'SALES_INVOICE');
      expect(salesInvoices.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge case: Void already-voided invoice
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Edge: Void already-voided invoice', () => {
    it('rejects void on already-voided invoice', async () => {
      const draft = await createDraftInvoice();
      await postInvoice(draft.id);
      await voidInvoice(draft.id);

      const { status, body } = await voidInvoice(draft.id);
      expect(status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('already voided');
    });
  });
});
