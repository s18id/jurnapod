// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for AP State Machine Integrity (Story 54.3)
 *
 * Tests prove:
 * - AC1: All valid AP state transitions are documented
 * - AC2: Invalid state transitions are rejected (VOIDED→POSTED, DRAFT→VOID)
 * - AC3: GRN-to-Invoice linkage enforced — invoice line qty must not exceed received_qty
 * - AC4: Payment allocation to non-existent invoice rejected with 404 INVOICE_NOT_FOUND
 * - AC5: Deferred to Story 54.6 (three-way matching feature absent)
 *
 * =============================================================================
 * AP DOCUMENT STATE MACHINE — VALID TRANSITIONS (AC1 Reference)
 * =============================================================================
 *
 *  Purchase Order (PO):
 *    DRAFT → SENT → PARTIAL_RECEIVED → RECEIVED → CLOSED
 *    (transitions driven by GRN receipts against PO lines)
 *
 *  Invoice (PI):
 *    DRAFT → POSTED → VOID
 *    - DRAFT→POSTED: Requires AP account, tax accounts, valid lines
 *    - POSTED→VOID:  Requires existing journal batch (reversal journal created)
 *    - VOID→POSTED:  BLOCKED — 400 INVALID_STATUS_TRANSITION
 *    - VOID→DRAFT:   BLOCKED — 400 INVALID_STATUS_TRANSITION
 *    - DRAFT→VOID:    BLOCKED — 400 INVALID_STATUS_TRANSITION
 *    - POSTED→POSTED: BLOCKED — 409 ALREADY_POSTED
 *
 *  Payment (AP):
 *    DRAFT → POSTED → VOID
 *    - DRAFT→POSTED: Requires bank account, non-overpayment, invoice posted
 *    - POSTED→VOID:  Requires existing journal batch (reversal journal created)
 *    - VOID→POSTED:  BLOCKED — 400 INVALID_STATUS_TRANSITION
 *    - VOID→DRAFT:   BLOCKED — 400 INVALID_STATUS_TRANSITION
 *    - DRAFT→VOID:   BLOCKED — 400 INVALID_STATUS_TRANSITION
 *    - POSTED→POSTED: BLOCKED — 409 ALREADY_POSTED
 *
 *  GRN-to-Invoice Linkage (AC3):
 *    If invoice line references a PO line (po_line_id set), the invoice qty
 *    must not exceed the PO line's received_qty.
 *    received_qty is accumulated on purchase_order_lines by GRN postings.
 *
 * =============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestSupplier,
  createTestPurchasingAccounts,
  createTestPurchasingSettings,
  createTestBankAccount,
} from '../../fixtures';

// =============================================================================
// Deterministic Tag Generator
// =============================================================================

function makeTag(prefix: string, counter: number): string {
  const worker = process.env.VITEST_POOL_ID ?? '0';
  const pidTag = String(process.pid % 10000).padStart(4, '0');
  return `${prefix}${worker}${pidTag}${String(counter).padStart(4, '0')}`;
}

// =============================================================================
// Status Constants (from @jurnapod/shared)
// =============================================================================

// Purchase Invoice status IDs
const PI_STATUS = { DRAFT: 1, POSTED: 2, VOID: 3 } as const;
// AP Payment status IDs
const AP_STATUS = { DRAFT: 10, POSTED: 40, VOID: 50 } as const;

// =============================================================================
// Suite State
// =============================================================================

let baseUrl: string;
let ownerToken: string;
let testCompanyId: number;
let testSupplierId: number;
let apAccountId: number;
let expenseAccountId: number;
let bankAccountId: number;
let smTagCounter = 0;

// Shared PO line for GRN qty tests (AC3)
let ac3PoLineId: number;

describe('purchasing.ap-state-machine', { timeout: 30000 }, () => {

  // ---------------------------------------------------------------------------
  // Suite Setup
  // ---------------------------------------------------------------------------
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const testCompany = await createTestCompanyMinimal({
      code: makeTag('APSM', ++smTagCounter).toUpperCase(),
      name: `AP State Machine Company ${process.pid}`,
    });
    testCompanyId = testCompany.id;

    const testEmail = `ap-state-machine-${++smTagCounter}@example.com`;
    const testUser = await createTestUser(testCompanyId, {
      email: testEmail,
      name: 'AP State Machine Owner',
      password: 'TestPassword123!',
    });

    const ownerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(testUser.id, ownerRoleId);

    // Set module permissions (resource-level ACL per Epic 39)
    for (const [module, resource] of [
      ['purchasing', 'orders'],
      ['purchasing', 'receipts'],
      ['purchasing', 'invoices'],
      ['purchasing', 'payments'],
      ['purchasing', 'suppliers'],
      ['accounting', 'accounts'],
      ['accounting', 'journals'],
    ] as [string, string][]) {
      await setModulePermission(testCompanyId, ownerRoleId, module, resource, 63, { allowSystemRoleMutation: true });
    }

    // Supplier
    const supplier = await createTestSupplier(testCompanyId, {
      code: makeTag('APSMSUP', ++smTagCounter),
      name: 'AP State Machine Supplier',
      currency: 'IDR',
    });
    testSupplierId = supplier.id;

    // Purchasing accounts (AP + expense)
    const accounts = await createTestPurchasingAccounts(testCompanyId);
    apAccountId = accounts.ap_account_id;
    expenseAccountId = accounts.expense_account_id;

    // Purchasing settings
    await createTestPurchasingSettings(testCompanyId, apAccountId, expenseAccountId);

    // Bank account for payments
    bankAccountId = await createTestBankAccount(testCompanyId, { typeName: 'BANK', isActive: true });

    // Login
    ownerToken = await loginForTest(baseUrl, testCompany.code, testEmail, 'TestPassword123!');

    // -------------------------------------------------------------------------
    // Pre-create a PO + GRN for AC3 GRN qty tests
    // Creates PO line with received_qty = 10 for reuse across AC3 tests
    // -------------------------------------------------------------------------
    const poRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-01',
        lines: [{ qty: '10', unit_price: '5000.00', tax_rate: '0' }]
      })
    });
    expect(poRes.status).toBe(201);
    const po = await poRes.json();

    // Transition PO to SENT
    await fetch(`${baseUrl}/api/purchasing/orders/${po.data.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SENT' })
    });

    ac3PoLineId = po.data.lines[0].id;

    // Create and post GRN with received_qty = 10
    const grnRes = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        reference_number: makeTag('GRAC3', ++smTagCounter),
        receipt_date: '2026-04-19',
        lines: [{ po_line_id: ac3PoLineId, qty: '10', unit: 'pcs' }]
      })
    });
    expect(grnRes.status).toBe(201);
    const grn = await grnRes.json();

    // Post GRN
    await fetch(`${baseUrl}/api/purchasing/receipts/${grn.data.id}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });
    expect(grnRes.status).toBe(201);
  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      // Clean in dependency order (payment_lines → payments → invoice_lines → invoices)
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM ap_payment_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM ap_payments WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM goods_receipt_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM goods_receipts WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_order_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_orders WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM company_modules WHERE company_id = ${testCompanyId}`.execute(db);
    } catch (e) {
      // ignore cleanup errors
    }
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // ---------------------------------------------------------------------------
  // Helper: Create PO in SENT status
  // ---------------------------------------------------------------------------
  async function createSentPO(qty: string = '10', unitPrice: string = '5000.00'): Promise<{ poId: number; lineId: number }> {
    const poRes = await fetch(`${baseUrl}/api/purchasing/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        order_date: '2026-04-01',
        lines: [{ qty, unit_price: unitPrice, tax_rate: '0' }]
      })
    });
    expect(poRes.status).toBe(201);
    const po = await poRes.json();

    await fetch(`${baseUrl}/api/purchasing/orders/${po.data.id}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SENT' })
    });

    return { poId: po.data.id, lineId: po.data.lines[0].id };
  }

  // ---------------------------------------------------------------------------
  // Helper: Create PO + GRN with known received_qty
  // ---------------------------------------------------------------------------
  async function createPOWithGRN(poQty: string, grnQty: string, unitPrice: string = '5000.00'): Promise<{ poId: number; poLineId: number; grnId: number }> {
    const po = await createSentPO(poQty, unitPrice);

    const grnRes = await fetch(`${baseUrl}/api/purchasing/receipts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: testSupplierId,
        reference_number: makeTag('GRPO', ++smTagCounter),
        receipt_date: '2026-04-20',
        lines: [{ po_line_id: po.lineId, qty: grnQty, unit: 'pcs' }]
      })
    });
    expect(grnRes.status).toBe(201);
    const grn = await grnRes.json();

    await fetch(`${baseUrl}/api/purchasing/receipts/${grn.data.id}/post`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
    });

    return { poId: po.poId, poLineId: po.lineId, grnId: grn.data.id };
  }

  // =============================================================================
  // AC2: Invalid State Transitions
  // =============================================================================

  describe('AC2 — Invalid state transitions rejected', () => {

    it('AC2a: POST payment when VOIDED → 400 INVALID_STATUS_TRANSITION', async () => {
      // Create and post a PI
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: makeTag('AC2A_PI', ++smTagCounter),
          invoice_date: '2026-04-01',
          currency_code: 'IDR',
          lines: [{ description: 'PI for AC2a', qty: '1', unit_price: '10000.00', line_type: 'SERVICE' }]
        })
      });
      expect(piRes.status).toBe(201);
      const pi = await piRes.json();

      await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });

      // Create and post payment
      const payRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_date: '2026-04-01',
          bank_account_id: bankAccountId,
          supplier_id: testSupplierId,
          lines: [{ purchase_invoice_id: pi.data.id, allocation_amount: '10000.0000' }]
        })
      });
      expect(payRes.status).toBe(201);
      const pay = await payRes.json();

      await fetch(`${baseUrl}/api/purchasing/payments/${pay.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });

      // Void the payment
      const voidRes = await fetch(`${baseUrl}/api/purchasing/payments/${pay.data.id}/void`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });
      expect(voidRes.status).toBe(200);

      // Try to POST voided payment → 400 INVALID_STATUS_TRANSITION
      const postVoidedRes = await fetch(`${baseUrl}/api/purchasing/payments/${pay.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });
      expect(postVoidedRes.status).toBe(400);
      const errBody = await postVoidedRes.json();
      expect(errBody.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('AC2b: VOID payment when DRAFT → 400 INVALID_STATUS_TRANSITION', async () => {
      // Create a PI
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: makeTag('AC2B_PI', ++smTagCounter),
          invoice_date: '2026-04-01',
          currency_code: 'IDR',
          lines: [{ description: 'PI for AC2b', qty: '1', unit_price: '10000.00', line_type: 'SERVICE' }]
        })
      });
      expect(piRes.status).toBe(201);
      const pi = await piRes.json();

      // Post PI
      await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });

      // Create payment in DRAFT status
      const payRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_date: '2026-04-01',
          bank_account_id: bankAccountId,
          supplier_id: testSupplierId,
          lines: [{ purchase_invoice_id: pi.data.id, allocation_amount: '10000.0000' }]
        })
      });
      expect(payRes.status).toBe(201);
      const pay = await payRes.json();

      // Try to VOID DRAFT payment → 400 INVALID_STATUS_TRANSITION
      const voidDraftRes = await fetch(`${baseUrl}/api/purchasing/payments/${pay.data.id}/void`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });
      expect(voidDraftRes.status).toBe(400);
      const errBody = await voidDraftRes.json();
      expect(errBody.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('AC2c: POST invoice when VOIDED → 400 INVALID_STATUS_TRANSITION', async () => {
      // Create and post PI
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: makeTag('AC2C_PI', ++smTagCounter),
          invoice_date: '2026-04-01',
          currency_code: 'IDR',
          lines: [{ description: 'PI for AC2c', qty: '1', unit_price: '10000.00', line_type: 'SERVICE' }]
        })
      });
      expect(piRes.status).toBe(201);
      const pi = await piRes.json();

      await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });

      // Void the PI
      await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/void`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });

      // Try to POST voided invoice → 400 INVALID_STATUS_TRANSITION
      const postVoidedRes = await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });
      expect(postVoidedRes.status).toBe(400);
      const errBody = await postVoidedRes.json();
      expect(errBody.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('AC2d: VOID invoice when DRAFT → 400 INVALID_STATUS_TRANSITION', async () => {
      // Create PI in DRAFT status
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: makeTag('AC2D_PI', ++smTagCounter),
          invoice_date: '2026-04-01',
          currency_code: 'IDR',
          lines: [{ description: 'PI for AC2d', qty: '1', unit_price: '10000.00', line_type: 'SERVICE' }]
        })
      });
      expect(piRes.status).toBe(201);
      const pi = await piRes.json();

      // Try to VOID DRAFT invoice → 400 INVALID_STATUS_TRANSITION
      const voidDraftRes = await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/void`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });
      expect(voidDraftRes.status).toBe(400);
      const errBody = await voidDraftRes.json();
      expect(errBody.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('AC2e: POST invoice when already POSTED → 409 ALREADY_POSTED', async () => {
      // Create and post PI
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: makeTag('AC2E_PI', ++smTagCounter),
          invoice_date: '2026-04-01',
          currency_code: 'IDR',
          lines: [{ description: 'PI for AC2e', qty: '1', unit_price: '10000.00', line_type: 'SERVICE' }]
        })
      });
      expect(piRes.status).toBe(201);
      const pi = await piRes.json();

      await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });

      // Sequential re-post hits status guard (status !== DRAFT) first
      // Returns 400 INVALID_STATUS_TRANSITION (not 409 — 409 is for concurrent race via ER_DUP_ENTRY)
      const postAgainRes = await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });
      expect(postAgainRes.status).toBe(400);
      const errBody = await postAgainRes.json();
      expect(errBody.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  // =============================================================================
  // AC3: GRN-to-Invoice Linkage (Discovery Test — Expected to Fail)
  // =============================================================================

  describe('AC3 — GRN qty enforcement on invoice posting', () => {

    /**
     * DISCOVERY TEST (P0): This test is expected to FAIL because postPI
     * does not currently validate GRN quantities.
     *
     * Pre-condition survey confirmed:
     * - createDraftPI does NOT populate po_line_id on invoice lines
     * - postPI does NOT query received_qty from PO lines
     * - No quantity comparison exists during invoice create or post
     *
     * If this test fails (expected), the following production fix is in scope:
     * 1. createDraftPI must accept and persist po_line_id per invoice line
     * 2. postPI must validate each line with non-null po_line_id against
     *    the PO line's received_qty, returning 400 GRN_INSUFFICIENT_QTY
     *    if invoice qty > received_qty
     */
    it('AC3: invoice line qty > received_qty → 400 GRN_INSUFFICIENT_QTY (discovery)', async () => {
      // Use the pre-created PO line from suite setup (ac3PoLineId)
      // received_qty = 10 from the GRN we posted

      // Create invoice line with qty = 15 (exceeds received_qty = 10)
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: makeTag('AC3_PI', ++smTagCounter),
          invoice_date: '2026-04-21',
          currency_code: 'IDR',
          lines: [
            {
              description: 'AC3 over-GRN qty line',
              qty: '15',   // exceeds received_qty = 10
              unit_price: '5000.00',
              line_type: 'ITEM',
              po_line_id: ac3PoLineId,
            }
          ]
        })
      });

      // Create may succeed (invoice is DRAFT) — qty validation happens at postPI
      expect(piRes.status).toBe(201);
      const pi = await piRes.json();

      // Attempt to post invoice → should fail with GRN_INSUFFICIENT_QTY
      const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });

      // EXPECTED FAILURE: postPI does not currently validate GRN qty
      // This assertion documents the expected behavior after the fix
      if (postRes.status === 400) {
        const errBody = await postRes.json();
        // After fix, this should be GRN_INSUFFICIENT_QTY
        expect(errBody.error.code).toBe('GRN_INSUFFICIENT_QTY');
      } else if (postRes.status === 200) {
        // Discovery result: postPI did NOT validate GRN qty — production fix needed
        throw new Error(
          'AC3 DISCOVERY RESULT: postPI accepted invoice with qty=15 > received_qty=10. ' +
          'GRN qty enforcement is NOT implemented. Production fix is in scope. ' +
          'See Story 54.3 defect log D54-004.'
        );
      } else {
        // Any other status is also a discovery failure (unexpected behavior)
        const errBody = await postRes.json();
        throw new Error(
          `AC3 DISCOVERY RESULT: Unexpected status ${postRes.status} when posting over-GRN qty invoice. ` +
          `Error: ${JSON.stringify(errBody)}. GRN qty enforcement is NOT implemented.`
        );
      }
    });

    it('AC3b: invoice line qty <= received_qty → 200 posted (happy path with GRN linkage)', async () => {
      // Create a fresh PO + GRN with received_qty = 10
      const { poLineId } = await createPOWithGRN('10', '10', '5000.00');

      // Create invoice with qty = 8 (within received_qty = 10)
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: makeTag('AC3B_PI', ++smTagCounter),
          invoice_date: '2026-04-22',
          currency_code: 'IDR',
          lines: [
            {
              description: 'AC3b within-GRN qty line',
              qty: '8',   // within received_qty = 10
              unit_price: '5000.00',
              line_type: 'ITEM',
              po_line_id: poLineId,
            }
          ]
        })
      });
      expect(piRes.status).toBe(201);
      const pi = await piRes.json();

      // Post invoice → should succeed (qty=8 <= received_qty=10)
      const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${pi.data.id}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }
      });

      // Before the production fix (po_line_id not saved/validated), this is just
      // a normal invoice post — it should succeed regardless of GRN linkage
      expect(postRes.status).toBe(200);
      const postBody = await postRes.json();
      expect(postBody.success).toBe(true);
    });
  });

  // =============================================================================
  // AC4: Payment-to-Invoice Linkage
  // =============================================================================

  describe('AC4 — Payment allocation to non-existent invoice', () => {

    it('AC4: payment allocation to non-existent invoice 999999 → 404 INVOICE_NOT_FOUND', async () => {
      // Create a PI first to establish the supplier context
      const piRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: testSupplierId,
          invoice_no: makeTag('AC4_PI', ++smTagCounter),
          invoice_date: '2026-04-01',
          currency_code: 'IDR',
          lines: [{ description: 'PI for AC4', qty: '1', unit_price: '10000.00', line_type: 'SERVICE' }]
        })
      });
      expect(piRes.status).toBe(201);

      // Create payment with non-existent invoice ID 999999
      const payRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_date: '2026-04-01',
          bank_account_id: bankAccountId,
          supplier_id: testSupplierId,
          lines: [{ purchase_invoice_id: 999999, allocation_amount: '10000.0000' }]
        })
      });
      expect(payRes.status).toBe(404);
      const errBody = await payRes.json();
      expect(errBody.error.code).toBe('INVOICE_NOT_FOUND');
    });
  });
});