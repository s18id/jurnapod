// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests: AP Exception Worklist (Story 47.4 WP-E)
 *
 * Validates:
 *  1. Auth/ACL — 401 without token, 200 via accounting.journals ANALYZE,
 *     200 via purchasing.suppliers ANALYZE (OR policy), 403 for CASHIER.
 *  2. Workflow — assign → ASSIGNED, resolve → RESOLVED (409 on invalid transition).
 *  3. Tenant isolation — cross-company assign/resolve returns 404; list is company-scoped.
 *  4. Detection idempotency (AC8) — repeated GET does not duplicate exception rows.
 *
 * FIX(47.4-WP-E): Real-DB integration tests; no mock DB per AGENTS.md policy.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { sql } from 'kysely';
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestUser,
  getTestAccessToken,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestRole,
  getOrCreateTestCashierForPermission,
  createTestAPException,
} from '../../fixtures';

// ---------------------------------------------------------------------------
// AP Exception int-enum constants (mirrors migration 0188 and test-fixtures.ts)
// FIX(47.4-WP-E): Defined locally to avoid shared-package import ambiguity in tests.
// ---------------------------------------------------------------------------
const AP_EXC_TYPE = { DISPUTE: 1, VARIANCE: 2, MISMATCH: 3, DUPLICATE: 4 } as const;
const AP_EXC_STATUS = { OPEN: 1, ASSIGNED: 2, RESOLVED: 3, DISMISSED: 4 } as const;

// Permission bits (Epic 39 canonical)
const ANALYZE = 16;
const UPDATE = 4;
const CRUDAM = 63; // READ+CREATE+UPDATE+DELETE+ANALYZE+MANAGE

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------
const WORKLIST_PATH = '/api/accounting/ap-exceptions/worklist';
const ASSIGN_PATH  = (id: number) => `/api/accounting/ap-exceptions/${id}/assign`;
const RESOLVE_PATH = (id: number) => `/api/accounting/ap-exceptions/${id}/resolve`;

// ---------------------------------------------------------------------------
// Suite-level state
// ---------------------------------------------------------------------------
let baseUrl: string;

/** Primary company */
let testCompanyId: number;
let testCompanyCode: string;

/** OWNER token — has CRUDAM on accounting.journals, so covers ANALYZE and UPDATE */
let ownerToken: string;
let ownerUserId: number;

/**
 * Token for a user whose ONLY permission is purchasing.suppliers ANALYZE.
 * No accounting.journals access. Used to validate the OR ACL path.
 * FIX(47.4-WP-E): separate custom role prevents mutation of system OWNER role.
 */
let suppliersAnalyzeToken: string;

/**
 * CASHIER token — has 0 for both accounting.journals and purchasing.suppliers.
 * Used to validate the 403 denial path.
 */
let cashierToken: string;

/** Second company for tenant isolation tests */
let otherCompanyId: number;
let otherOwnerToken: string;
let otherOwnerUserId: number;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('accounting.ap-exceptions (Story 47.4)', { timeout: 60000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    // FIX(47.4-WP-E-GUARDRAIL): Use seed token for role management APIs.
    // Avoid mutating canonical OWNER permissions just to create custom roles.
    const seedToken = await getTestAccessToken(baseUrl);

    // ---- Primary test company ----
    const company = await createTestCompanyMinimal();
    testCompanyId = company.id;
    testCompanyCode = company.code;

    // Owner user: OWNER role → CRUDAM on accounting.journals (covers ANALYZE + UPDATE).
    const ownerEmail = `ap-exc-owner-${Date.now()}@example.com`;
    const ownerUser = await createTestUser(testCompanyId, {
      email: ownerEmail,
      name: 'AP Exc Owner',
      password: 'TestPass123!',
    });
    const ownerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    // FIX(47.4-WP-E-GUARDRAIL): Do NOT mutate canonical system-role ACL rows.
    // Rely on seeded OWNER baseline permissions and use custom roles for mutation-heavy ACL paths.
    // FIX(47.4-WP-E-GUARDRAIL): Attach a custom role for explicit accounting.journals UPDATE path
    // used by assign/resolve tests, without touching system role ACL rows.
    const workflowRole = await createTestRole(baseUrl, seedToken, 'AP Exc Workflow');
    await assignUserGlobalRole(ownerUser.id, workflowRole.id);
    await setModulePermission(testCompanyId, workflowRole.id, 'accounting', 'journals', CRUDAM);

    ownerToken = await loginForTest(baseUrl, testCompanyCode, ownerEmail, 'TestPass123!');

    // Fetch owner user ID (used for assign payload)
    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const meBody = await meRes.json();
    ownerUserId = meBody.data.id;

    // ---- purchasing.suppliers ANALYZE user (OR path) ----
    // FIX(47.4-WP-E): Create a custom non-system role with ONLY purchasing.suppliers ANALYZE.
    // This validates the OR ACL branch independently.
    const suppliersEmail = `ap-exc-sup-${Date.now()}@example.com`;
    const suppliersUser = await createTestUser(testCompanyId, {
      email: suppliersEmail,
      name: 'AP Exc Suppliers Analyst',
      password: 'TestPass123!',
    });

    const suppliersRole = await createTestRole(baseUrl, seedToken, 'AP Exc Suppliers Analyst');
    await assignUserGlobalRole(suppliersUser.id, suppliersRole.id);

    // Grant ONLY purchasing.suppliers ANALYZE (16) — do NOT grant accounting.journals.
    await setModulePermission(testCompanyId, suppliersRole.id, 'purchasing', 'suppliers', ANALYZE);

    // Explicitly deny accounting.journals for this role so OR check hits the second path only.
    await setModulePermission(testCompanyId, suppliersRole.id, 'accounting', 'journals', 0);

    suppliersAnalyzeToken = await loginForTest(baseUrl, testCompanyCode, suppliersEmail, 'TestPass123!');

    // ---- CASHIER (should be denied — has 0 for both module paths) ----
    // FIX(47.4-WP-E): CASHIER is the canonical low-privilege role; its purchasing.suppliers mask
    // is seeded as 0 by createTestCompanyMinimal. Both OR paths fail → 403.
    const cashier = await getOrCreateTestCashierForPermission(
      testCompanyId,
      testCompanyCode,
      baseUrl
    );
    cashierToken = cashier.accessToken;

    // ---- Secondary (other) company for tenant isolation ----
    const otherCompany = await createTestCompanyMinimal();
    otherCompanyId = otherCompany.id;

    const otherOwnerEmail = `ap-exc-other-${Date.now()}@example.com`;
    const otherOwnerUser = await createTestUser(otherCompanyId, {
      email: otherOwnerEmail,
      name: 'Other Company Owner',
      password: 'TestPass123!',
    });
    const otherOwnerRoleId = await getRoleIdByCode('OWNER');
    await assignUserGlobalRole(otherOwnerUser.id, otherOwnerRoleId);
    // FIX(47.4-WP-E-GUARDRAIL): Keep canonical OWNER ACL immutable in secondary company as well.

    // FIX(47.4-WP-E-GUARDRAIL): Use custom role for explicit update permission in other company.
    const otherWorkflowRole = await createTestRole(baseUrl, seedToken, 'AP Exc Workflow Other');
    await assignUserGlobalRole(otherOwnerUser.id, otherWorkflowRole.id);
    await setModulePermission(otherCompanyId, otherWorkflowRole.id, 'accounting', 'journals', CRUDAM);

    otherOwnerToken = await loginForTest(baseUrl, otherCompany.code, otherOwnerEmail, 'TestPass123!');

    const otherMeRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${otherOwnerToken}` },
    });
    const otherMeBody = await otherMeRes.json();
    otherOwnerUserId = otherMeBody.data.id;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // ==========================================================================
  // 1. Auth / ACL
  // ==========================================================================

  describe('Auth / ACL', () => {
    it('returns 401 without token', async () => {
      // FIX(47.4-WP-E): No auth header → auth middleware must reject with 401.
      const res = await fetch(`${baseUrl}${WORKLIST_PATH}`);
      expect(res.status).toBe(401);
    });

    it('returns 200 with accounting.journals ANALYZE (OWNER role)', async () => {
      // FIX(47.4-WP-E): OWNER has CRUDAM (63) on accounting.journals which includes ANALYZE (16).
      const res = await fetch(`${baseUrl}${WORKLIST_PATH}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveProperty('exceptions');
      expect(Array.isArray(body.data.exceptions)).toBe(true);
    });

    it('returns 200 with purchasing.suppliers ANALYZE only (OR ACL path)', async () => {
      // FIX(47.4-WP-E): This user has purchasing.suppliers ANALYZE (16) but accounting.journals = 0.
      // The OR policy should allow access via the second path.
      const res = await fetch(`${baseUrl}${WORKLIST_PATH}`, {
        headers: { Authorization: `Bearer ${suppliersAnalyzeToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveProperty('exceptions');
      expect(Array.isArray(body.data.exceptions)).toBe(true);
    });

    it('returns 403 for CASHIER (no ANALYZE on either accounting.journals or purchasing.suppliers)', async () => {
      // FIX(47.4-WP-E): CASHIER has permission_mask=0 for both purchasing.suppliers and
      // accounting.journals in this company → both OR paths fail → 403.
      const res = await fetch(`${baseUrl}${WORKLIST_PATH}`, {
        headers: { Authorization: `Bearer ${cashierToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // 2. Workflow: assign → resolve
  // ==========================================================================

  describe('Workflow', () => {
    let workflowExcId: number;

    beforeAll(async () => {
      // FIX(47.4-WP-E): Create a canonical OPEN exception via createTestAPException.
      // No ad-hoc SQL; all setup via fixture library.
      const exc = await createTestAPException(testCompanyId, {
        exceptionKey: `WF-EXC-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: AP_EXC_TYPE.VARIANCE,
        sourceType: 'INVOICE',
        sourceId: 1001,
        varianceAmount: '500.0000',
        currencyCode: 'IDR',
        status: AP_EXC_STATUS.OPEN,
      });
      workflowExcId = exc.id;
    });

    it('assign endpoint updates status to ASSIGNED and sets assigned_to_user_id', async () => {
      // FIX(47.4-WP-E): OWNER has accounting.journals UPDATE (4 in CRUDAM 63).
      // Assign from OPEN → ASSIGNED; verify response fields.
      const res = await fetch(`${baseUrl}${ASSIGN_PATH(workflowExcId)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assigned_to_user_id: ownerUserId }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('ASSIGNED');
      expect(body.data.assigned_to_user_id).toBe(ownerUserId);
      expect(body.data.assigned_at).toBeTruthy();
    });

    it('resolve endpoint with note updates to RESOLVED and sets resolved fields', async () => {
      // FIX(47.4-WP-E): Exception is now ASSIGNED (from previous test).
      // ASSIGNED → RESOLVED is a valid transition. Resolution note is required.
      const resolveNote = 'Variance confirmed and recorded in reconciliation journal.';

      const res = await fetch(`${baseUrl}${RESOLVE_PATH(workflowExcId)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'RESOLVED', resolution_note: resolveNote }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('RESOLVED');
      expect(body.data.resolution_note).toBe(resolveNote);
      expect(body.data.resolved_at).toBeTruthy();
      expect(body.data.resolved_by_user_id).toBe(ownerUserId);
    });

    it('resolve endpoint rejects invalid transition (OPEN → RESOLVED) with 409', async () => {
      // FIX(47.4-WP-E): resolveException requires ASSIGNED status.
      // An OPEN exception that has never been assigned must yield 409 INVALID_TRANSITION.
      const freshExc = await createTestAPException(testCompanyId, {
        exceptionKey: `WF-409-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: AP_EXC_TYPE.MISMATCH,
        sourceType: 'INVOICE',
        sourceId: 1002,
        varianceAmount: '100.0000',
        currencyCode: 'IDR',
        status: AP_EXC_STATUS.OPEN,
      });

      const res = await fetch(`${baseUrl}${RESOLVE_PATH(freshExc.id)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'RESOLVED',
          resolution_note: 'Attempt to resolve without assign — should be 409',
        }),
      });

      // FIX(47.4-WP-E): Service throws APExceptionInvalidTransitionError when current
      // status != ASSIGNED; route maps this to HTTP 409.
      expect(res.status).toBe(409);
    });
  });

  // ==========================================================================
  // 3. Tenant Isolation
  // ==========================================================================

  describe('Tenant isolation', () => {
    let otherExcId: number;

    beforeAll(async () => {
      // FIX(47.4-WP-E): Create an AP exception belonging to the OTHER company.
      // Primary company owner must NOT be able to operate on it.
      const exc = await createTestAPException(otherCompanyId, {
        exceptionKey: `TENANT-ISO-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: AP_EXC_TYPE.VARIANCE,
        sourceType: 'INVOICE',
        sourceId: 9001,
        varianceAmount: '1000.0000',
        currencyCode: 'IDR',
        status: AP_EXC_STATUS.OPEN,
      });
      otherExcId = exc.id;
    });

    it('assign on exception from another company returns 404', async () => {
      // FIX(47.4-WP-E): getException is company-scoped (WHERE company_id = ...).
      // Attempting cross-company assign should surface as 404 NOT_FOUND.
      const res = await fetch(`${baseUrl}${ASSIGN_PATH(otherExcId)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assigned_to_user_id: ownerUserId }),
      });

      expect(res.status).toBe(404);
    });

    it('resolve on exception from another company returns 404', async () => {
      // FIX(47.4-WP-E): First, legitimately assign the other company exception using the other
      // company's owner, so it becomes ASSIGNED (valid resolve pre-condition).
      await fetch(`${baseUrl}${ASSIGN_PATH(otherExcId)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${otherOwnerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assigned_to_user_id: otherOwnerUserId }),
      });

      // Now try to resolve it from the primary company's owner — should be 404 (not 409).
      const res = await fetch(`${baseUrl}${RESOLVE_PATH(otherExcId)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'RESOLVED',
          resolution_note: 'Cross-company resolve attempt — must fail',
        }),
      });

      expect(res.status).toBe(404);
    });

    it('worklist only returns exceptions scoped to the authenticated company', async () => {
      // FIX(47.4-WP-E): Create a known OPEN exception in primary company so the list is non-empty.
      await createTestAPException(testCompanyId, {
        exceptionKey: `LIST-SCOPE-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: AP_EXC_TYPE.DISPUTE,
        sourceType: 'INVOICE',
        sourceId: 3001,
        varianceAmount: '200.0000',
        currencyCode: 'IDR',
        status: AP_EXC_STATUS.OPEN,
      });

      const res = await fetch(`${baseUrl}${WORKLIST_PATH}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const exceptions: Record<string, unknown>[] = body.data.exceptions;

      // Every returned exception must belong to the primary company.
      for (const exc of exceptions) {
        expect(exc.company_id).toBe(testCompanyId);
      }

      // The other company's exception row must NOT appear in the primary list.
      const crossCompanyRows = exceptions.filter((e) => Number(e.company_id) === otherCompanyId);
      expect(crossCompanyRows.length).toBe(0);
    });
  });

  // ==========================================================================
  // 4. Detection idempotency (AC8)
  // ==========================================================================

  describe('Detection idempotency (AC8 on-demand)', () => {
    it('repeated GET worklist does not duplicate deterministic exception keys', async () => {
      // FIX(47.4-WP-E): AC8 triggers detection on every GET worklist call.
      // Detection uses INSERT … ON DUPLICATE KEY UPDATE (no-op) for idempotency.
      // Two consecutive GETs must not increase the ap_exceptions row count for this company.
      const db = getTestDb();

      // First GET — triggers on-demand detection pass 1.
      const res1 = await fetch(`${baseUrl}${WORKLIST_PATH}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(Array.isArray(body1.data.exceptions)).toBe(true);

      // Snapshot row count after first detection run.
      const countRes1 = await sql`
        SELECT COUNT(*) AS cnt FROM ap_exceptions WHERE company_id = ${testCompanyId}
      `.execute(db);
      const countAfterFirst = Number((countRes1.rows[0] as { cnt: number }).cnt);

      // Second GET — triggers on-demand detection pass 2 (idempotent).
      const res2 = await fetch(`${baseUrl}${WORKLIST_PATH}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(Array.isArray(body2.data.exceptions)).toBe(true);

      // Snapshot row count after second detection run.
      const countRes2 = await sql`
        SELECT COUNT(*) AS cnt FROM ap_exceptions WHERE company_id = ${testCompanyId}
      `.execute(db);
      const countAfterSecond = Number((countRes2.rows[0] as { cnt: number }).cnt);

      // FIX(47.4-WP-E): The upsert (ON DUPLICATE KEY UPDATE no-op) guarantees that
      // deterministic exception keys found in pass 1 are not re-inserted in pass 2.
      // Row count must be stable between the two detection passes.
      expect(countAfterSecond).toBe(countAfterFirst);
    });
  });
});
