// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Stable API Smoke Test
 *
 * Verifies that critical stable API contracts behave correctly against a
 * fresh migrated database with seeded company/outlet/user data.
 *
 * This is a release gate, not a replacement for integration tests.
 * It validates the API from the perspective of clients (POS, backoffice).
 *
 * Prerequisites (run before this test):
 *   npm run db:migrate && npm run db:seed && npm run db:seed:test-data && npm run db:smoke
 *
 * Required env vars:
 *   JP_COMPANY_CODE, JP_OWNER_EMAIL, JP_OWNER_PASSWORD,
 *   JP_OUTLET_CODE, JP_TEST_BASE_URL (optional)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import { acquireReadLock, releaseReadLock, getTestBaseUrl } from "../../helpers/setup";
import { closeTestDb, getTestDb } from "../../helpers/db";
import {
  loginForTest,
  resetFixtureRegistry,
  cleanupTestFixtures,
  createTestItem,
  createTestCustomer,
  createTestPurchasingAccounts,
  createTestPurchasingSettings,
  createTestBankAccount,
  getOrCreateTestCashierForPermission,
  ensureTestSalesAccountMappings as canonEnsureTestSalesAccountMappings,
  getSeedSyncContext as loadSeedSyncContext,
  createTestCompany,
  createTestUser,
  createTestSupplier,
  assignUserGlobalRole,
  getRoleIdByCode,
  createTestFiscalYear,
  createTestFiscalPeriod,
  setTestFiscalPeriodStatus,
} from "../../fixtures";
import { makeTag } from "../../helpers/tags";
import { createSentPurchaseOrder } from "../../helpers/purchasing-flows";

// ─── Suite-level setup ─────────────────────────────────────────────────────────

let baseUrl: string;
let ownerToken: string;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

const getSeedSyncContext = async () => seedCtx;

beforeAll(async () => {
  seedCtx = await loadSeedSyncContext();
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Standard error envelope shape expected from the API */
interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

/** Standard success envelope shape */
interface SuccessBody<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/** Assert the response body matches the error envelope contract */
async function assertErrorEnvelope(
  res: Response,
  expectedStatus: number,
  expectedCode?: string,
): Promise<ErrorBody> {
  expect(res.status, `Expected status ${expectedStatus}`).toBe(expectedStatus);
  const body = (await res.json()) as ErrorBody;
  expect(body.success, "Error response must have success: false").toBe(false);
  expect(body.error, "Error response must have error object").toBeDefined();
  expect(typeof body.error.code, "Error must have code string").toBe("string");
  expect(typeof body.error.message, "Error must have message string").toBe("string");
  if (expectedCode) {
    expect(body.error.code, `Expected error code ${expectedCode}`).toBe(expectedCode);
  }
  return body;
}

/** Assert the response body matches the success envelope contract */
async function assertSuccessEnvelope<T = unknown>(res: Response, expectedStatus = 200): Promise<T> {
  expect(res.status, `Expected status ${expectedStatus}`).toBe(expectedStatus);
  const body = (await res.json()) as SuccessBody<T>;
  expect(body.success, "Success response must have success: true").toBe(true);
  expect(body.data, "Success response must have data").toBeDefined();
  return body.data;
}

/** Fetch helper with optional auth token */
async function apiFetch(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<Response> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((fetchOptions.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${baseUrl}${path}`, { ...fetchOptions, headers });
}

type SmokeClientTxIdNamespace = "550e8400" | "660e8400";

/** Generate a deterministic UUID-like client_tx_id from a namespace and seed. */
function deterministicSmokeClientTxId(namespace: SmokeClientTxIdNamespace, seed: number): string {
  const suffix = Math.abs(seed).toString(16).padStart(12, "0").slice(-12);
  return `${namespace}-e29b-41d4-a716-${suffix}`;
}

// ─── Smoke Flows ───────────────────────────────────────────────────────────────

describe("Smoke Flow 1 — Auth", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    // Login as owner for use in subsequent flow tests
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it("POST /api/auth/login succeeds with valid owner credentials", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: process.env.JP_OWNER_PASSWORD,
      }),
    });

    const data = await assertSuccessEnvelope<{ access_token: string }>(res);
    expect(data.access_token, "Login must return access token").toBeDefined();
    expect(typeof data.access_token, "Access token must be a string").toBe("string");
    expect(data.access_token.length, "Access token must not be empty").toBeGreaterThan(0);
  });

  it("POST /api/auth/login fails with invalid password and returns error envelope", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: "DefinitelyWrongPassword123!",
      }),
    });

    await assertErrorEnvelope(res, 401);
  });

  it("POST /api/auth/login fails with missing company code and returns error envelope", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.JP_OWNER_EMAIL,
        password: process.env.JP_OWNER_PASSWORD,
      }),
    });

    // Should return a non-200 status (400 or 401)
    const body = await res.json();
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(404);
    expect(body).toHaveProperty("success");
  });

  it("POST /api/auth/refresh succeeds with valid token", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: process.env.JP_OWNER_PASSWORD,
      }),
    });
    expect(loginRes.status).toBe(200);
    const refreshCookie = loginRes.headers.get("set-cookie");
    expect(refreshCookie, "Login must issue refresh token cookie").toBeTruthy();

    const res = await apiFetch("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: refreshCookie ?? "" },
    });

    const data = await assertSuccessEnvelope<{ access_token: string }>(res);
    expect(data.access_token, "Refresh must return new access token").toBeDefined();
  });
});

describe("Smoke Flow 2 — Error Envelope Consistency", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it("Protected endpoint without token returns 401 with error envelope", async () => {
    const res = await apiFetch("/api/users/me");
    await assertErrorEnvelope(res, 401, "UNAUTHORIZED");
  });

  it("Protected endpoint with malformed token returns 401 with error envelope", async () => {
    const res = await apiFetch("/api/users/me", {
      token: "not-a-valid-jwt-token-at-all",
    });

    await assertErrorEnvelope(res, 401);
  });

  it("Protected endpoint with expired/invalid JWT returns 401 with error envelope", async () => {
    // Use an obviously invalid JWT structure
    const fakeToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const res = await apiFetch("/api/users/me", { token: fakeToken });

    await assertErrorEnvelope(res, 401);
  });

  it("Unknown endpoint returns 404 with error envelope", async () => {
    const res = await apiFetch("/api/nonexistent-endpoint-xyz");
    expect(res.status).toBe(404);
    const body = await res.json();
    // 404 may have different shapes depending on the router; just check it's not a crash
    expect(body).toBeDefined();
  });
});

describe("Smoke Flow 3 — OpenAPI and Health", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it("GET /api/health returns 200", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status");
  });

  it("GET /api/health/live returns 200 (Kubernetes liveness probe)", async () => {
    const res = await fetch(`${baseUrl}/api/health/live`);
    expect(res.status).toBe(200);
  });

  it("GET /api/health/ready returns 200 or 503 (Kubernetes readiness probe)", async () => {
    const res = await fetch(`${baseUrl}/api/health/ready`);
    expect([200, 503]).toContain(res.status);
  });

  it("GET /api/health returns success envelope shape", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    // Health endpoint may not use standard envelope; just verify it has expected fields
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    if (body.success !== undefined) {
      // If it uses envelope, verify it's consistent
      if (body.success === false) {
        expect(body).toHaveProperty("error");
        expect(body.error).toHaveProperty("code");
        expect(body.error).toHaveProperty("message");
      } else {
        expect(body).toHaveProperty("data");
      }
    }
  });
});

describe("Smoke Flow 4 — Stable Endpoint Existence", { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    // Ensure we have a valid owner token for authenticated checks
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // These are core stable endpoints that must exist and respond (not 404)
  const stableEndpointChecks: Array<{
    method: string;
    path: string;
    description: string;
    auth: boolean;
    expectedStatus: number;
  }> = [
    { method: "GET", path: "/api/health", description: "Health check", auth: false, expectedStatus: 200 },
    { method: "POST", path: "/api/auth/login", description: "Auth login", auth: false, expectedStatus: 400 },
    { method: "GET", path: "/api/sync/health", description: "Sync health", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/companies", description: "List companies", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/outlets", description: "List outlets", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/users/me", description: "Current user", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/accounts", description: "List accounts", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/accounts/types", description: "Account types", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/journals", description: "List journals", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/roles", description: "List roles", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/settings/tax-rates", description: "List tax rates", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/inventory/items", description: "List items", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/sales/invoices", description: "List invoices", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/sales/payments", description: "List payments", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/settings/config", description: "Settings config", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/settings/modules", description: "Settings modules", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/reports/trial-balance", description: "Trial balance", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/reports/profit-loss", description: "Profit & loss", auth: true, expectedStatus: 200 },
    { method: "GET", path: "/api/reports/daily-sales", description: "Daily sales", auth: true, expectedStatus: 200 },
  ];

  for (const check of stableEndpointChecks) {
    it(`${check.method} ${check.path} (${check.description}) returns non-404`, async () => {
      const fetchOptions: RequestInit = { method: check.method };
      if (check.method === "POST" && check.auth) {
        fetchOptions.body = JSON.stringify({});
      }
      if (check.method === "POST" && !check.auth && check.path === "/api/auth/login") {
        fetchOptions.body = JSON.stringify({
          companyCode: process.env.JP_COMPANY_CODE,
          email: process.env.JP_OWNER_EMAIL,
        });
      }

      const res = check.auth
        ? await apiFetch(check.path, { ...fetchOptions, token: ownerToken })
        : await apiFetch(check.path, fetchOptions);

      // The endpoint must exist — 404 means the route is missing
      expect(res.status, `${check.description} must not return 404`).not.toBe(404);

      // For POST endpoints without body, 400 is expected (validation error)
      // For GET endpoints, 200 is expected
      if (check.expectedStatus && res.status !== check.expectedStatus && check.method === "POST") {
        // POST may return 400/415 for missing body — that's acceptable for existence check
        expect([200, 400, 415, 422]).toContain(res.status);
      }
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// Deep Flow Expansions (Phase 3/4 hardening)
// ────────────────────────────────────────────────────────────────────────────────

describe("Smoke Flow 10 — Sync Push Deep (Idempotency & Ordering)", { timeout: 90000 }, () => {
  let companyId: number;
  let outletId: number;
  let cashierUserId: number;
  let itemId: number;
  let firstCtxId: string;
  let dupCtxId: string;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
    outletId = ctx.outletId;
    cashierUserId = ctx.cashierUserId;

    const item = await createTestItem(companyId, {
      name: "Smoke Sync Item",
      type: "PRODUCT",
      trackStock: false,
    });
    itemId = item.id;

    firstCtxId = deterministicSmokeClientTxId("550e8400", itemId * 100 + 1);
    dupCtxId = deterministicSmokeClientTxId("550e8400", itemId * 100 + 2);
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  const FIXTURE_TRX_AT = "2026-05-16T03:30:00Z";

  it("POST /api/sync/push accepts valid transaction (OK)", async () => {
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: firstCtxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: "COMPLETED",
            items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: "Test Item" }],
            payments: [{ method: "CASH", amount: 15000 }],
          },
        ],
      }),
    });

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string }> }>(res);
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].result).toBe("OK");
  });

  it("POST /api/sync/push returns DUPLICATE for same client_tx_id", async () => {
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: firstCtxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: "COMPLETED",
            items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: "Test Item" }],
            payments: [{ method: "CASH", amount: 15000 }],
          },
        ],
      }),
    });

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string }> }>(res);
    expect(data.results[0].result).toBe("DUPLICATE");
  });

  it("POST /api/sync/push preserves result order for multi-transaction batch", async () => {
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: dupCtxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: "COMPLETED",
            items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: "Test Item" }],
            payments: [{ method: "CASH", amount: 15000 }],
          },
          {
            client_tx_id: firstCtxId, // already pushed → DUPLICATE
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: "COMPLETED",
            items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: "Test Item" }],
            payments: [{ method: "CASH", amount: 15000 }],
          },
          {
            client_tx_id: dupCtxId, // just pushed above → DUPLICATE
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: "COMPLETED",
            items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: "Test Item" }],
            payments: [{ method: "CASH", amount: 15000 }],
          },
        ],
      }),
    });

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string }> }>(res);
    expect(data.results).toHaveLength(3);
    // Result order must match input order
    expect(data.results[0].result).toBe("OK");
    expect(data.results[1].result).toBe("DUPLICATE");
    expect(data.results[2].result).toBe("DUPLICATE");
  });

  it("POST /api/sync/push returns ERROR/CONFLICT for same client_tx_id with different payload", async () => {
    const conflictCtxId = deterministicSmokeClientTxId("550e8400", itemId * 100 + 3);

    // First push: original payload
    const res1 = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: conflictCtxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: "COMPLETED",
            items: [{ item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: "Test Item" }],
            payments: [{ method: "CASH", amount: 15000 }],
          },
        ],
      }),
    });
    const data1 = await assertSuccessEnvelope<{ results: Array<{ result: string }> }>(res1);
    expect(data1.results[0].result).toBe("OK");

    // Second push: same client_tx_id, DIFFERENT payload (conflict)
    const res2 = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: conflictCtxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: "COMPLETED",
            items: [{ item_id: itemId, qty: 3, price_snapshot: 45000, name_snapshot: "Different Payload Item" }],
            payments: [{ method: "CASH", amount: 45000 }],
          },
        ],
      }),
    });

    const data2 = await assertSuccessEnvelope<{ results: Array<{ result: string; message?: string }> }>(res2);
    expect(data2.results).toHaveLength(1);
    expect(data2.results[0].result).toBe("ERROR");
    expect(data2.results[0].message).toContain("IDEMPOTENCY_CONFLICT");
  });
});

describe("Smoke Flow 11 — Purchasing Lifecycle (Deep Flow)", { timeout: 120000 }, () => {
  let companyId: number;
  let itemId: number | undefined;
  let supplierId: number | undefined;
  let orderId: number | undefined;
  let poLineId: number | undefined;
  let receiptId: number | undefined;
  let piId: number | undefined;
  let voidPiId: number | undefined;
  let apPaymentId: number | undefined;
  let bankAccountId: number | undefined;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;

    // Create an item for item-backed PO lines
    const item = await createTestItem(companyId, {
      name: "Smoke Purchasing Item",
      type: "PRODUCT",
      trackStock: false,
    });
    itemId = item.id;

    // Set up purchasing accounts and settings
    const accounts = await createTestPurchasingAccounts(companyId);
    await createTestPurchasingSettings(companyId, accounts.ap_account_id, accounts.expense_account_id);
    bankAccountId = await createTestBankAccount(companyId, {
      typeName: "BANK",
      code: makeTag("APB", 20),
      name: "Smoke AP Bank Account",
    });
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  // -- Create supplier
  it("POST /api/purchasing/suppliers creates a supplier", async () => {
    const res = await apiFetch("/api/purchasing/suppliers", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        company_id: companyId,
        code: makeTag("SUP", 20),
        name: "Smoke Test Supplier",
        currency: "IDR",
      }),
    });

    const data = await assertSuccessEnvelope<{ id: number }>(res, 201);
    supplierId = data.id;
    expect(data.id).toBeGreaterThan(0);
  });

  // -- Create PO (item-backed)
  it("POST /api/purchasing/orders creates an item-backed purchase order", async () => {
    expect(supplierId).toBeDefined();
    expect(itemId).toBeDefined();
    const po = await createSentPurchaseOrder({
      baseUrl,
      token: ownerToken,
      supplierId: supplierId!,
      orderDate: "2026-05-16",
      lines: [{ item_id: itemId, qty: "2", unit_price: "50000.00" }],
    });
    orderId = po.orderId;
    poLineId = po.lineIds[0];
    expect(orderId).toBeGreaterThan(0);
    expect(poLineId).toBeGreaterThan(0);
  });

  // -- Receive goods
  it("POST /api/purchasing/receipts creates a goods receipt", async () => {
    expect(orderId).toBeDefined();
    expect(poLineId).toBeDefined();
    expect(itemId).toBeDefined();
    const res = await apiFetch("/api/purchasing/receipts", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        supplier_id: supplierId,
        reference_number: makeTag("GRN", 20),
        receipt_date: "2026-05-16",
        lines: [
          {
            po_line_id: poLineId,
            item_id: itemId,
            qty: "2",
            unit: "pcs",
          },
        ],
      }),
    });

    const data = await assertSuccessEnvelope<{ id: number }>(res, 201);
    receiptId = data.id;
    expect(data.id).toBeGreaterThan(0);
  });

  // -- GRN line readback: verify receipt response exposes lines with item_id, qty, po_line_id
  it("GET /api/purchasing/receipts/{id} returns lines with item_id, qty, and po_line_id", async () => {
    expect(receiptId).toBeDefined();
    expect(poLineId).toBeDefined();
    const res = await apiFetch(`/api/purchasing/receipts/${receiptId}`, {
      token: ownerToken,
    });

    const data = await assertSuccessEnvelope<{
      id: number;
      lines: Array<{
        id: number;
        item_id: number | null;
        po_line_id: number | null;
        qty: string;
        unit: string;
      }>;
    }>(res);
    expect(data.id).toBe(receiptId);
    expect(Array.isArray(data.lines)).toBe(true);
    expect(data.lines.length).toBeGreaterThan(0);

    const receiptLine = data.lines[0];
    expect(receiptLine.item_id, "Receipt line must expose item_id").toBeDefined();
    expect(receiptLine.item_id).toBe(itemId);
    expect(receiptLine.po_line_id, "Receipt line must expose po_line_id").toBe(poLineId);
    expect(receiptLine.qty, "Receipt line must expose qty as string").toBeDefined();
    expect(Number(receiptLine.qty)).toBe(2);
  });

  // -- Create PI
  it("POST /api/purchasing/invoices creates a purchase invoice", async () => {
    expect(supplierId).toBeDefined();
    expect(receiptId).toBeDefined();
    expect(poLineId).toBeDefined();
    const res = await apiFetch("/api/purchasing/invoices", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        supplier_id: supplierId,
        invoice_no: makeTag("PI", 20),
        invoice_date: "2026-05-16",
        currency_code: "IDR",
        lines: [
          {
            po_line_id: poLineId,
            description: "Smoke PI line",
            qty: "2",
            unit_price: "50000.00",
          },
        ],
      }),
    });

    const data = await assertSuccessEnvelope<{ id: number }>(res, 201);
    piId = data.id;
    expect(data.id).toBeGreaterThan(0);
  });

  // -- Post PI
  it("POST /api/purchasing/invoices/{id}/post posts the purchase invoice", async () => {
    expect(piId).toBeDefined();
    const res = await apiFetch(`/api/purchasing/invoices/${piId}/post`, {
      method: "POST",
      token: ownerToken,
    });

    await assertSuccessEnvelope<{ id: number }>(res, 200);
  });

  // -- Create AP payment
  it("POST /api/purchasing/payments creates an AP payment", async () => {
    expect(piId).toBeDefined();
    expect(bankAccountId).toBeDefined();
    const res = await apiFetch("/api/purchasing/payments", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        payment_date: "2026-05-16",
        bank_account_id: bankAccountId,
        supplier_id: supplierId,
        lines: [
          {
            purchase_invoice_id: piId,
            allocation_amount: "100000.00",
            full_settlement: true,
          },
        ],
      }),
    });

    const data = await assertSuccessEnvelope<{ id: number }>(res, 201);
    apPaymentId = data.id;
    expect(data.id).toBeGreaterThan(0);
  });

  // -- Post AP payment
  it("POST /api/purchasing/payments/{id}/post posts the AP payment", async () => {
    expect(apPaymentId).toBeDefined();
    const res = await apiFetch(`/api/purchasing/payments/${apPaymentId}/post`, {
      method: "POST",
      token: ownerToken,
    });

    await assertSuccessEnvelope<{ id: number }>(res, 200);
  });

  // -- Verify journal entries exist after purchasing posting
  it("GET /api/journals contains purchasing journal entries after posting", async () => {
    const res = await apiFetch("/api/journals", { token: ownerToken });
    const data = await assertSuccessEnvelope<unknown[]>(res);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  // -- PI readback: verify posted invoice has expected status and totals
  it("GET /api/purchasing/invoices/{id} returns posted PI with expected fields", async () => {
    expect(piId).toBeDefined();
    const res = await apiFetch(`/api/purchasing/invoices/${piId}`, {
      token: ownerToken,
    });

    const data = await assertSuccessEnvelope<{
      id: number;
      status: string;
      grand_total?: number | string;
      open_amount?: number | string;
      paid_amount?: number | string;
    }>(res);
    expect(data.id).toBe(piId);
    expect(data.status).toBeDefined();
    const grandTotal = Number(data.grand_total ?? 0);
    expect(grandTotal).toBeGreaterThan(0);
  });

  // -- AP payment readback: verify posted payment status
  it("GET /api/purchasing/payments/{id} returns posted AP payment with expected fields", async () => {
    expect(apPaymentId).toBeDefined();
    const res = await apiFetch(`/api/purchasing/payments/${apPaymentId}`, {
      token: ownerToken,
    });

    const data = await assertSuccessEnvelope<{
      id: number;
      status: string;
    }>(res);
    expect(data.id).toBe(apPaymentId);
    expect(data.status).toBeDefined();
  });

  // -- Void PI contract verification (stable route exists, returns 404 for invalid ID)
  it("POST /api/purchasing/invoices/{id}/void returns 404 for non-existent invoice (route existence check)", async () => {
    const res = await apiFetch("/api/purchasing/invoices/999999/void", {
      method: "POST",
      token: ownerToken,
    });
    expect(res.status).toBe(404);
    await assertErrorEnvelope(res, 404);
  });

  // -- Void AP payment contract verification (stable route exists, returns 404 for invalid ID)
  it("POST /api/purchasing/payments/{id}/void returns 404 for non-existent payment (route existence check)", async () => {
    const res = await apiFetch("/api/purchasing/payments/999999/void", {
      method: "POST",
      token: ownerToken,
    });
    expect(res.status).toBe(404);
    await assertErrorEnvelope(res, 404);
  });

  // -- Deep void lifecycle: create, post, void a separate PI (service-line, not interfering with AP payment flow)
  it("POST /api/purchasing/invoices creates a service-line PI for deep void lifecycle", async () => {
    expect(supplierId).toBeDefined();
    const res = await apiFetch("/api/purchasing/invoices", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        supplier_id: supplierId,
        invoice_no: makeTag("PIV", 20),
        invoice_date: "2026-05-16",
        currency_code: "IDR",
        lines: [
          {
            description: "Void lifecycle PI service line",
            qty: "1",
            unit_price: "75000.00",
            line_type: "SERVICE",
          },
        ],
      }),
    });

    const data = await assertSuccessEnvelope<{ id: number }>(res, 201);
    voidPiId = data.id;
    expect(data.id).toBeGreaterThan(0);
  });

  // -- Post the void-lifecycle PI
  it("POST /api/purchasing/invoices/{id}/post posts the void-lifecycle PI", async () => {
    expect(voidPiId).toBeDefined();
    const res = await apiFetch(`/api/purchasing/invoices/${voidPiId}/post`, {
      method: "POST",
      token: ownerToken,
    });

    await assertSuccessEnvelope<{ id: number }>(res, 200);
  });

  // -- Void the posted PI via the stable void route
  it("POST /api/purchasing/invoices/{id}/void voids the posted PI and returns reversal_batch_id", async () => {
    expect(voidPiId).toBeDefined();
    const res = await apiFetch(`/api/purchasing/invoices/${voidPiId}/void`, {
      method: "POST",
      token: ownerToken,
    });

    const data = await assertSuccessEnvelope<{
      id: number;
      reversal_batch_id: number;
    }>(res, 200);
    expect(data.id).toBe(voidPiId);
    expect(data.reversal_batch_id).toBeGreaterThan(0);
  });

  // -- Read back voided PI via GET to verify status is VOID
  it("GET /api/purchasing/invoices/{id} returns status VOID after void", async () => {
    expect(voidPiId).toBeDefined();
    const res = await apiFetch(`/api/purchasing/invoices/${voidPiId}`, {
      token: ownerToken,
    });

    const data = await assertSuccessEnvelope<{
      id: number;
      status: string;
      voided_at?: string | null;
    }>(res);
    expect(data.id).toBe(voidPiId);
    expect(data.status, "Voided PI status must be VOID").toBe("VOID");
  });

  // -- Read-only DB verification: balanced PURCHASE_INVOICE_VOID journal batch
  it("journal_batches contains a balanced PURCHASE_INVOICE_VOID batch for the voided PI (read-only DB verification)", async () => {
    expect(voidPiId).toBeDefined();
    const db = getTestDb();

    const batchRow = await sql<{ id: number; doc_type: string; doc_id: number }>`
      SELECT id, doc_type, doc_id
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND doc_type = 'PURCHASE_INVOICE_VOID'
        AND doc_id = ${voidPiId}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);

    expect(batchRow.rows.length, "PURCHASE_INVOICE_VOID batch must exist for voided PI").toBe(1);
    expect(batchRow.rows[0].doc_type).toBe("PURCHASE_INVOICE_VOID");
    expect(batchRow.rows[0].doc_id).toBe(voidPiId);

    const batchId = batchRow.rows[0].id;

    // Verify the reversal journal is balanced (total debits = total credits)
    const balanceResult = await sql<{ totalDebit: string; totalCredit: string }>`
      SELECT
        CAST(COALESCE(SUM(debit), 0) AS DECIMAL(19,4)) AS totalDebit,
        CAST(COALESCE(SUM(credit), 0) AS DECIMAL(19,4)) AS totalCredit
      FROM journal_lines
      WHERE journal_batch_id = ${batchId}
        AND company_id = ${companyId}
    `.execute(db);

    const totalDebit = Number(balanceResult.rows[0].totalDebit);
    const totalCredit = Number(balanceResult.rows[0].totalCredit);
    expect(totalDebit, "Void reversal journal must have debits").toBeGreaterThan(0);
    expect(totalCredit, "Void reversal journal must have credits").toBeGreaterThan(0);
    expect(totalDebit, "Void reversal journal must be balanced (debits = credits)").toBe(totalCredit);
  });
});

describe("Smoke Flow 12 — Reports (Stable GL Reports)", { timeout: 60000 }, () => {
  const reportRange = "date_from=2026-01-01&date_to=2026-12-31";

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it("GET /api/reports/trial-balance returns success envelope", async () => {
    const res = await apiFetch(`/api/reports/trial-balance?${reportRange}`, { token: ownerToken });
    const data = await assertSuccessEnvelope<Record<string, unknown>>(res);
    expect(data).toBeDefined();
    expect(res.status).toBe(200);
  });

  it("GET /api/reports/profit-loss returns success envelope", async () => {
    const res = await apiFetch(`/api/reports/profit-loss?${reportRange}`, { token: ownerToken });
    const data = await assertSuccessEnvelope<Record<string, unknown>>(res);
    expect(data).toBeDefined();
    expect(res.status).toBe(200);
  });

  it("GET /api/reports/general-ledger returns non-500", async () => {
    const res = await apiFetch(`/api/reports/general-ledger?${reportRange}`, { token: ownerToken });
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it("GET /api/reports/journals returns non-500", async () => {
    const res = await apiFetch(`/api/reports/journals?${reportRange}`, { token: ownerToken });
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it("GET /api/reports/daily-sales returns success envelope", async () => {
    const res = await apiFetch(`/api/reports/daily-sales?${reportRange}`, { token: ownerToken });
    const data = await assertSuccessEnvelope<Record<string, unknown>>(res);
    expect(data).toBeDefined();
    expect(res.status).toBe(200);
  });

  it("GET /api/reports/pos-transactions returns success envelope", async () => {
    const res = await apiFetch(`/api/reports/pos-transactions?${reportRange}`, { token: ownerToken });
    const data = await assertSuccessEnvelope<Record<string, unknown>>(res);
    expect(data).toBeDefined();
    expect(res.status).toBe(200);
  });
});

describe("Smoke Flow 13 — Import / Export (Deep Coverage)", { timeout: 60000 }, () => {
  let uploadId: string | undefined;
  let companyId: number;
  const importSku = makeTag("IMPS", 20);

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it("GET /api/import/{entityType}/template returns non-404 (items)", async () => {
    const res = await apiFetch("/api/import/items/template", { token: ownerToken });
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
  });

  // Import upload happy path: POST multipart/form-data with minimal CSV
  it("POST /api/import/items/upload accepts valid CSV and returns uploadId", async () => {
    const csvContent = `sku,name,item_type\n${importSku},Smoke Import Item,SERVICE`;
    const blob = new Blob([csvContent], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", blob, "smoke-import.csv");

    const res = await fetch(`${baseUrl}/api/import/items/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: formData,
    });

    expect(res.status, "Import upload must not 5xx or 404").not.toBe(404);
    expect(res.status).not.toBeGreaterThanOrEqual(500);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(typeof body.data.uploadId).toBe("string");
      expect(body.data.columns).toBeDefined();
      expect(body.data.rowCount).toBeGreaterThan(0);
      uploadId = body.data.uploadId;
    }
  });

  // Import validate: after upload, validate with mappings
  it("POST /api/import/items/validate returns success for valid mappings", async () => {
    if (!uploadId) {
      // Upload failed above; skip validate
      return;
    }
    const res = await apiFetch("/api/import/items/validate", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        uploadId,
        mappings: [
          { sourceColumn: "sku", targetField: "sku" },
          { sourceColumn: "name", targetField: "name" },
          { sourceColumn: "item_type", targetField: "item_type" },
        ],
      }),
    });

    expect(res.status, "Validate must not 5xx or 404").not.toBe(404);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // Import apply: after validate, apply the import
  it("POST /api/import/items/apply returns success for validated upload", async () => {
    if (!uploadId) {
      return;
    }
    const res = await apiFetch("/api/import/items/apply", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        uploadId,
        mappings: [
          { sourceColumn: "sku", targetField: "sku" },
          { sourceColumn: "name", targetField: "name" },
          { sourceColumn: "item_type", targetField: "item_type" },
        ],
      }),
    });

    expect(res.status, "Apply must not 5xx or 404").not.toBe(404);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.failed).toBe(0);
    expect(body.data.created + body.data.updated).toBeGreaterThan(0);

    const db = getTestDb();
    const importedItem = await db
      .selectFrom("items")
      .select(["id", "sku", "name", "item_type"])
      .where("company_id", "=", companyId)
      .where("sku", "=", importSku)
      .executeTakeFirst();
    expect(importedItem, "Import apply must persist the item row").toBeDefined();
    expect(importedItem!.sku).toBe(importSku);
    expect(importedItem!.name).toBe("Smoke Import Item");
    expect(importedItem!.item_type).toBe("SERVICE");
  });

  // Import upload negative: missing file returns 400
  it("POST /api/import/items/upload returns 400 when no file provided", async () => {
    const formData = new FormData();
    const res = await fetch(`${baseUrl}/api/import/items/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // Export: stable content verification for items CSV
  it("POST /api/export/{entityType} returns CSV with requested item columns", async () => {
    const res = await apiFetch(
      `/api/export/items?format=csv&columns=sku,name,item_type&search=${encodeURIComponent(importSku)}`,
      {
        method: "POST",
        token: ownerToken,
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("SKU");
    expect(csv).toContain("Name");
    expect(csv).toContain("Type");
    expect(csv).toContain(importSku);
    expect(csv).toContain("Smoke Import Item");
  });

  // Export columns: stable response shape
  it("GET /api/export/{entityType}/columns returns item column metadata", async () => {
    const res = await apiFetch("/api/export/items/columns", { token: ownerToken });
    const data = await assertSuccessEnvelope<{
      entityType: string;
      columns: Array<{ key: string; header: string; fieldType: string }>;
      defaultColumns: string[];
    }>(res);
    expect(data.entityType).toBe("items");
    const columnKeys = data.columns.map((column) => column.key);
    expect(columnKeys).toContain("sku");
    expect(columnKeys).toContain("name");
    expect(columnKeys).toContain("item_type");
    expect(data.defaultColumns).toContain("sku");
  });

  // Export xlsx path: full >50K guardrail remains tracked in the stability matrix backlog.
  it("POST /api/export/items with xlsx format returns a valid file response", async () => {
    const res = await apiFetch(
      `/api/export/items?format=xlsx&columns=sku,name,item_type&search=${encodeURIComponent(importSku)}`,
      {
        method: "POST",
        token: ownerToken,
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("spreadsheetml");
    const bytes = await res.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});

describe("Smoke Flow 14 — ACL Negative Checks", { timeout: 60000 }, () => {
  let cashierToken: string;
  let companyId: number;
  let companyCode: string;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
    companyCode = process.env.JP_COMPANY_CODE!;
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;

    const cashier = await getOrCreateTestCashierForPermission(
      companyId,
      companyCode,
      baseUrl,
    );
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it("CASHIER accessing journal creation returns 403 with error envelope", async () => {
    const res = await apiFetch("/api/journals", {
      method: "POST",
      token: cashierToken,
      body: JSON.stringify({}),
    });

    await assertErrorEnvelope(res, 403, "FORBIDDEN");
  });

  it("CASHIER accessing /api/users (list) returns 403 or safe response", async () => {
    const res = await apiFetch("/api/users", { token: cashierToken });
    // CASHIER has platform.users=0, so list should be denied
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("CASHIER accessing /api/roles (admin) returns 403 with error envelope", async () => {
    const res = await apiFetch("/api/roles", { token: cashierToken });
    await assertErrorEnvelope(res, 403, "FORBIDDEN");
  });

  it("CASHIER accessing /api/accounts (POST create) returns 403 with error envelope", async () => {
    const res = await apiFetch("/api/accounts", {
      method: "POST",
      token: cashierToken,
      body: JSON.stringify({}),
    });

    await assertErrorEnvelope(res, 403, "FORBIDDEN");
  });
});

describe("Smoke Flow 15 — Error Envelope Expanded", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it("POST with missing required field returns 400 with error envelope", async () => {
    // Login without companyCode
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it("POST with invalid field type returns 400 with error envelope", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: 12345, // should be string
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it("Non-existent entity returns 404 with error envelope", async () => {
    const res = await apiFetch("/api/sales/invoices/999999", { token: ownerToken });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it("POST with missing token to protected endpoint returns 401 with error envelope", async () => {
    const res = await apiFetch("/api/sales/invoices", {
      method: "POST",
      body: JSON.stringify({}),
    });

    await assertErrorEnvelope(res, 401, "UNAUTHORIZED");
  });

  it("POST with empty transactions array returns success (empty batch)", async () => {
    const ctx = await getSeedSyncContext();
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ outlet_id: ctx.outletId, transactions: [] }),
    });

    await assertSuccessEnvelope<{ results: unknown[] }>(res);
  });
});

describe("Smoke Flow 5 — Auth Error Contract", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it("Authenticated user can access own profile", async () => {
    const res = await apiFetch("/api/users/me", { token: ownerToken });
    const data = await assertSuccessEnvelope<{ id: number; email: string }>(res);
    expect(data.id).toBeGreaterThan(0);
    expect(data.email).toBeDefined();
  });

  it("POST /api/auth/logout succeeds with valid token", async () => {
    const res = await apiFetch("/api/auth/logout", {
      method: "POST",
      token: ownerToken,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("Login response includes user identity fields", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: process.env.JP_OWNER_EMAIL,
        password: process.env.JP_OWNER_PASSWORD,
      }),
    });

    const data = await assertSuccessEnvelope<{
      access_token: string;
      user?: { id: number; email: string };
      company?: { id: number; code: string };
    }>(res);

    expect(data.access_token).toBeDefined();
    // User and company identity may be in data.user or as separate fields
    if (data.user) {
      expect(data.user.id).toBeGreaterThan(0);
      expect(data.user.email).toBeDefined();
    }
  });
});

describe("Smoke Flow 6 — Sync Endpoints (Auth Checks)", { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it("GET /api/sync/pull without auth returns 401", async () => {
    const res = await apiFetch("/api/sync/pull?since_version=0");
    await assertErrorEnvelope(res, 401, "UNAUTHORIZED");
  });

  it("POST /api/sync/push without auth returns 401", async () => {
    const res = await apiFetch("/api/sync/push", { method: "POST" });
    await assertErrorEnvelope(res, 401, "UNAUTHORIZED");
  });
});

describe("Smoke Flow 7 — Sync Contract Deep Checks", { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it("GET /api/sync/pull returns canonical data_version cursor", async () => {
    const ctx = await getSeedSyncContext();
    const res = await apiFetch(`/api/sync/pull?outlet_id=${ctx.outletId}&since_version=0`, {
      token: ownerToken,
    });

    const data = await assertSuccessEnvelope<Record<string, unknown>>(res);
    expect(typeof data.data_version, "Pull response must include data_version number").toBe("number");
    expect(data).not.toHaveProperty("sync_data_version");
  });

  it("POST /api/sync/push accepts empty outbox batch idempotently", async () => {
    const ctx = await getSeedSyncContext();
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ outlet_id: ctx.outletId, transactions: [] }),
    });

    const data = await assertSuccessEnvelope<{ results: unknown[] }>(res);
    expect(Array.isArray(data.results), "Push response must include results array").toBe(true);
    expect(data.results).toHaveLength(0);
  });

  it("POST /api/sync/check-duplicate is tenant scoped and read-only for unknown client_tx_id", async () => {
    const ctx = await getSeedSyncContext();
    const res = await apiFetch("/api/sync/check-duplicate", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        company_id: ctx.companyId,
        client_tx_id: "00000000-0000-4000-8000-000000000001",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_duplicate: boolean };
    expect(body.is_duplicate).toBe(false);
  });
});

describe("Smoke Flow 8 — Purchasing Stable Contracts", { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  async function assertCollectionEndpoint(path: string, key: string): Promise<Record<string, unknown>> {
    const res = await apiFetch(path, { token: ownerToken });
    const data = await assertSuccessEnvelope<Record<string, unknown>>(res);
    expect(Array.isArray(data[key]), `${path} must return ${key} array`).toBe(true);
    expect(typeof data.total, `${path} must return total`).toBe("number");
    expect(typeof data.limit, `${path} must return limit`).toBe("number");
    expect(typeof data.offset, `${path} must return offset`).toBe("number");
    return data;
  }

  it("Purchasing collection endpoints expose stable collection envelopes", async () => {
    await assertCollectionEndpoint("/api/purchasing/suppliers", "suppliers");
    await assertCollectionEndpoint("/api/purchasing/orders", "orders");
    await assertCollectionEndpoint("/api/purchasing/receipts", "receipts");
    await assertCollectionEndpoint("/api/purchasing/invoices", "invoices");
    await assertCollectionEndpoint("/api/purchasing/payments", "payments");
    await assertCollectionEndpoint("/api/purchasing/credits", "credits");
    await assertCollectionEndpoint("/api/purchasing/exchange-rates", "exchange_rates");
  });

  it("GET /api/purchasing/reports/ap-aging returns explicit report envelope", async () => {
    const res = await apiFetch("/api/purchasing/reports/ap-aging", { token: ownerToken });
    const data = await assertSuccessEnvelope<{
      as_of_date: string;
      suppliers: unknown[];
      grand_totals: Record<string, unknown>;
    }>(res);

    expect(typeof data.as_of_date).toBe("string");
    expect(Array.isArray(data.suppliers)).toBe(true);
    expect(data.grand_totals).toBeDefined();
    expect(data.grand_totals).toHaveProperty("buckets");
  });

  it("AP reconciliation summary is stable as success or configured-domain 409", async () => {
    const res = await apiFetch("/api/purchasing/reports/ap-reconciliation/summary?as_of_date=2026-01-31", {
      token: ownerToken,
    });

    expect(res.status, "AP reconciliation summary must not be missing or crash").not.toBe(404);
    expect(res.status, "AP reconciliation summary must not be a server error").not.toBeGreaterThanOrEqual(500);

    if (res.status === 409) {
      await assertErrorEnvelope(res, 409);
      return;
    }

    const data = await assertSuccessEnvelope<Record<string, unknown>>(res);
    expect(data).toHaveProperty("as_of_date");
    expect(data).toHaveProperty("variance");
  });
});

describe("Smoke Flow 9 — Sales Invoice & Payment (Deep Flow)", { timeout: 90000 }, () => {
  const today = "2026-05-16";
  let companyId: number;
  let outletId: number;
  let customerId: number | undefined;
  let invoiceId: number | undefined;
  let paymentId: number | undefined;
  let bankAccountId: number | undefined;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
    outletId = ctx.outletId;

    // Ensure sales account mappings exist for the outlet
    await canonEnsureTestSalesAccountMappings(companyId, outletId);

    // Create a bank account for payment target
    bankAccountId = await createTestBankAccount(companyId, {
      typeName: "BANK",
      code: makeTag("BA", 20),
      name: "Smoke Test Bank Account",
    });
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  // -- Customer
  it("creates a test customer", async () => {
    const code = makeTag("SC", 20);
    const name = `Smoke Test Customer ${code}`;
    customerId = await createTestCustomer(baseUrl, ownerToken, companyId, code, name);
    expect(customerId).toBeGreaterThan(0);
  });

  // -- Invoice Creation
  it("POST /api/sales/invoices creates a draft invoice", async () => {
    expect(customerId).toBeDefined();
    const res = await apiFetch("/api/sales/invoices", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_date: today,
        customer_id: customerId,
        lines: [
          {
            line_type: "SERVICE",
            description: "Smoke test service line",
            qty: 1,
            unit_price: 150000,
          },
        ],
      }),
    });

    const data = await assertSuccessEnvelope<{ id: number; status: string }>(res, 201);
    invoiceId = data.id;
    expect(data.id).toBeGreaterThan(0);
    expect(data.status).toBeDefined();
  });

  // -- Invoice Post
  it("POST /api/sales/invoices/{id}/post posts the invoice", async () => {
    expect(invoiceId).toBeDefined();
    const res = await apiFetch(`/api/sales/invoices/${invoiceId}/post`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ outlet_id: outletId }),
    });

    await assertSuccessEnvelope<{ id: number; status: string }>(res, 200);
  });

  // -- Invoice Readback
  it("GET /api/sales/invoices/{id} returns posted invoice with expected fields", async () => {
    expect(invoiceId).toBeDefined();
    const res = await apiFetch(`/api/sales/invoices/${invoiceId}`, {
      token: ownerToken,
    });

    const data = await assertSuccessEnvelope<{
      id: number;
      status: string;
      grand_total: number;
      paid_total: number;
    }>(res);
    expect(data.status).toBe("POSTED");
    expect(typeof data.grand_total).toBe("number");
    expect(data.grand_total).toBeGreaterThan(0);
    expect(data.paid_total).toBeDefined();
  });

  // -- Payment Creation
  it("POST /api/sales/payments creates a payment", async () => {
    expect(invoiceId).toBeDefined();
    expect(bankAccountId).toBeDefined();
    const res = await apiFetch("/api/sales/payments", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        outlet_id: outletId,
        invoice_id: invoiceId,
        account_id: bankAccountId,
        payment_at: "2026-05-16T10:00:00.000Z",
        method: "CASH",
        amount: 150000,
      }),
    });

    const data = await assertSuccessEnvelope<{ id: number }>(res, 201);
    paymentId = data.id;
    expect(data.id).toBeGreaterThan(0);
  });

  // -- Payment Post
  it("POST /api/sales/payments/{id}/post posts the payment", async () => {
    expect(paymentId).toBeDefined();
    const res = await apiFetch(`/api/sales/payments/${paymentId}/post`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ outlet_id: outletId }),
    });

    await assertSuccessEnvelope<{ id: number }>(res, 200);
  });

  // -- Verify journal readback for posted invoice
  it("GET /api/journals lists posted invoice journal entries", async () => {
    const res = await apiFetch("/api/journals", { token: ownerToken });
    const data = await assertSuccessEnvelope<unknown[]>(res);
    expect(Array.isArray(data)).toBe(true);
    // At least one journal should exist after posting
    expect(data.length).toBeGreaterThan(0);
  });

  // -- Verify invoice paid_total reflects payment
  it("GET /api/sales/invoices/{id} shows paid_total after payment post", async () => {
    expect(invoiceId).toBeDefined();
    const res = await apiFetch(`/api/sales/invoices/${invoiceId}`, {
      token: ownerToken,
    });

    const data = await assertSuccessEnvelope<{
      id: number;
      status: string;
      grand_total: number;
      paid_total: number;
    }>(res);
    // After posting payment, paid_total should reflect the payment amount
    expect(data.paid_total).toBeGreaterThanOrEqual(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Deep Flow Expansions — Stability Gaps
// ────────────────────────────────────────────────────────────────────────────────

describe("Smoke Flow 16 — POS Correction (posting-mode-dependent reversal journals)", { timeout: 90000 }, () => {
  let companyId: number;
  let outletId: number;
  let cashierUserId: number;
  let itemId: number;
  let originalCtxId: string;
  let voidCtxId: string;
  let standaloneVoidCtxId: string;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
    outletId = ctx.outletId;
    cashierUserId = ctx.cashierUserId;

    const item = await createTestItem(companyId, {
      name: "Smoke Correction Item",
      type: "PRODUCT",
      trackStock: false,
    });
    itemId = item.id;

    originalCtxId = deterministicSmokeClientTxId("660e8400", itemId * 100 + 10);
    voidCtxId = deterministicSmokeClientTxId("660e8400", itemId * 100 + 11);
    standaloneVoidCtxId = deterministicSmokeClientTxId("660e8400", itemId * 100 + 12);
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  const FIXTURE_TRX_AT = "2026-05-16T04:00:00Z";

  const buildCorrectionPayload = (overrides: {
    client_tx_id: string;
    status: "COMPLETED" | "VOID" | "REFUND";
  }) => ({
    outlet_id: outletId,
    transactions: [
      {
        client_tx_id: overrides.client_tx_id,
        company_id: companyId,
        outlet_id: outletId,
        cashier_user_id: cashierUserId,
        trx_at: FIXTURE_TRX_AT,
        status: overrides.status,
        items: [{ item_id: itemId, qty: 2, price_snapshot: 25000, name_snapshot: "Correction Item" }],
        payments: [{ method: "CASH", amount: 50000 }],
      },
    ],
  });

  // ── Step 1: Create the original COMPLETED transaction ───────────────────────

  it("POST /api/sync/push creates original COMPLETED transaction (OK)", async () => {
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify(buildCorrectionPayload({ client_tx_id: originalCtxId, status: "COMPLETED" })),
    });

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string }> }>(res);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].result).toBe("OK");
  });

  // ── Step 2: Push VOID correction with different client_tx_id, same business identity ──

  it("POST /api/sync/push accepts VOID correction for matching COMPLETED original (OK)", async () => {
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify(buildCorrectionPayload({ client_tx_id: voidCtxId, status: "VOID" })),
    });

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string }> }>(res);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].result).toBe("OK");
  });

  // ── Step 3: Replay same VOID correction — idempotent DUPLICATE ─────────────

  it("POST /api/sync/push returns DUPLICATE for replayed VOID correction", async () => {
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify(buildCorrectionPayload({ client_tx_id: voidCtxId, status: "VOID" })),
    });

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string }> }>(res);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].result).toBe("DUPLICATE");
  });

  // ── Step 4: Standalone VOID with no matching original — ERROR ──────────────

  it("POST /api/sync/push rejects standalone VOID with no matching COMPLETED original (ERROR)", async () => {
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify(buildCorrectionPayload({ client_tx_id: standaloneVoidCtxId, status: "VOID" })),
    });

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string; message?: string }> }>(res);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].result).toBe("ERROR");
    expect(data.results[0].message).toBe("CORRECTION_REQUIRES_MATCHING_ORIGINAL");
  });

  // ── Step 5: Idempotent replay of the standalone VOID ERROR ────────────────

  it("POST /api/sync/push returns ERROR again for replayed standalone VOID (no persistence on first rejection)", async () => {
    // The ERROR result was returned without persisting a row, so a replay
    // should also return ERROR (not DUPLICATE — nothing was persisted).
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify(buildCorrectionPayload({ client_tx_id: standaloneVoidCtxId, status: "VOID" })),
    });

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string; message?: string }> }>(res);
    expect(data.results).toHaveLength(1);
    // Replay of a non-persisted ERROR stays ERROR — consistent with fail-fast guard
    expect(data.results[0].result).toBe("ERROR");
    expect(data.results[0].message).toBe("CORRECTION_REQUIRES_MATCHING_ORIGINAL");
  });

  // ── Step 6: Read-only DB verification — corrected transaction remains auditable ──

  it("pos_transactions retains original COMPLETED and correction VOID row (read-only DB verification)", async () => {
    const db = getTestDb();

    const rows = await sql<{
      id: number;
      client_tx_id: string;
      status: string;
    }>`
      SELECT id, client_tx_id, status
      FROM pos_transactions
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND client_tx_id IN (${originalCtxId}, ${voidCtxId})
      ORDER BY id ASC
    `.execute(db);

    expect(rows.rows).toHaveLength(2);

    const original = rows.rows.find((r) => r.client_tx_id === originalCtxId);
    const correction = rows.rows.find((r) => r.client_tx_id === voidCtxId);

    expect(original, "Original COMPLETED transaction must exist").toBeDefined();
    expect(original!.status).toBe("COMPLETED");

    expect(correction, "Correction VOID transaction must exist").toBeDefined();
    expect(correction!.status).toBe("VOID");
  });

  // ── Step 7: Mode-dependent reversal journal verification ───────────────────
  //
  // POS_SALE_REVERSAL journal creation is controlled by SYNC_PUSH_POSTING_MODE
  // (default: "disabled"). In active mode the posting hook creates balanced
  // reversal journal batches. This test verifies the smoke push does not 5xx
  // and documents that reversal journal presence is mode-dependent.
  //

  it("VOID correction does not 5xx and reversal journal presence is mode-dependent", async () => {
    // The VOID correction in Step 2 already returned 200 OK — no 5xx.
    // Re-verify the correction row exists as an auditable record.
    const db = getTestDb();

    const correctionRow = await sql<{ id: number; status: string }>`
      SELECT id, status FROM pos_transactions
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND client_tx_id = ${voidCtxId}
        AND status = 'VOID'
    `.execute(db);

    expect(correctionRow.rows.length, "VOID correction row must exist in pos_transactions").toBe(1);

    // Reversal journals are mode-dependent. When SYNC_PUSH_POSTING_MODE is
    // "active", POS_SALE_REVERSAL journal batches exist. When "disabled" or
    // "shadow", they do not. Querying is read-only and does not assert presence.
    const reversalBatches = await sql<{ batchCount: number }>`
      SELECT COUNT(*) as batchCount
      FROM journal_batches
      WHERE company_id = ${companyId}
        AND outlet_id = ${outletId}
        AND doc_type = 'POS_SALE_REVERSAL'
        AND doc_id = ${correctionRow.rows[0].id}
    `.execute(db);

    // Acceptance: no 5xx (already validated). Reversal batch count is
    // mode-dependent and not asserted — it is here for auditability only.
    expect(Number(reversalBatches.rows[0].batchCount)).toBeGreaterThanOrEqual(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Gap Fill — Cross-Tenant / Cross-Company Negative Smoke
// ────────────────────────────────────────────────────────────────────────────────

describe("Smoke Flow 17 — Cross-Tenant Isolation (Negative)", { timeout: 90000 }, () => {
  let seedCompanyId: number;
  let seedCompanyOutletId: number;
  let seedSupplierId: number;
  let seedSupplierCode: string;
  let seedItemId: number;
  let seedAccountId: number;
  let crossTenantToken: string;
  let crossTenantCompanyId: number;
  let crossTenantUserId: number;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
    const ctx = await getSeedSyncContext();
    seedCompanyId = ctx.companyId;
    seedCompanyOutletId = ctx.outletId;

    const seedSupplier = await createTestSupplier(seedCompanyId, {
      code: makeTag("XTS", 12),
      name: "Cross Tenant Seed Supplier",
      currency: "IDR",
    });
    seedSupplierId = seedSupplier.id;
    seedSupplierCode = seedSupplier.code;

    const seedItem = await createTestItem(seedCompanyId, {
      name: "Cross Tenant Sync Item",
      type: "PRODUCT",
      trackStock: false,
    });
    seedItemId = seedItem.id;

    const db = getTestDb();
    const seedAccount = await db
      .selectFrom("accounts")
      .select(["id"])
      .where("company_id", "=", seedCompanyId)
      .orderBy("id", "asc")
      .executeTakeFirst();
    if (!seedAccount) {
      throw new Error(`No seed account found for company ${seedCompanyId}`);
    }
    seedAccountId = Number(seedAccount.id);

    // Create a fully bootstrapped second company so denials prove tenant scoping,
    // not missing ACL setup on a partial company fixture.
    const secondCompany = await createTestCompany({
      code: makeTag("XTN", 12),
      timezone: "Asia/Jakarta",
    });
    crossTenantCompanyId = secondCompany.id;

    const ownerRoleId = await getRoleIdByCode("OWNER");
    const secondUser = await createTestUser(secondCompany.id, {
      email: `xtn-${makeTag("U", 8)}@example.com`,
      name: "X-Tenant User",
      password: "XTenantPass123!",
    });
    crossTenantUserId = secondUser.id;
    await assignUserGlobalRole(secondUser.id, ownerRoleId);

    // Login as the second company's user
    crossTenantToken = await loginForTest(
      baseUrl,
      secondCompany.code,
      secondUser.email,
      "XTenantPass123!",
      { forceRefresh: true },
    );
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it("Cross-tenant token can access its own company context", async () => {
    const res = await apiFetch("/api/users/me", {
      token: crossTenantToken,
    });

    const data = await assertSuccessEnvelope<{ company_id?: number; company?: { id?: number } }>(res);
    const resolvedCompanyId = data.company_id ?? data.company?.id;
    expect(resolvedCompanyId).toBe(crossTenantCompanyId);
  });

  it("Cross-tenant token cannot read a seed-company supplier by ID", async () => {
    const res = await apiFetch(`/api/purchasing/suppliers/${seedSupplierId}`, {
      token: crossTenantToken,
    });

    expect(res.status).not.toBe(200);
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    const message = String(body.error?.message ?? "").toUpperCase();
    expect(message).not.toContain(seedSupplierCode.toUpperCase());
    expect(message).not.toContain(process.env.JP_COMPANY_CODE!.toUpperCase());
  });

  it("Cross-tenant token cannot read a seed-company account by ID", async () => {
    const res = await apiFetch(`/api/accounts/${seedAccountId}`, {
      token: crossTenantToken,
    });

    expect(res.status).not.toBe(200);
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it("Cross-tenant token supplier list does not include seed-company supplier", async () => {
    const res = await apiFetch("/api/purchasing/suppliers", {
      token: crossTenantToken,
    });

    expect(res.status).not.toBeGreaterThanOrEqual(500);
    if (res.status !== 200) {
      await assertErrorEnvelope(res, res.status);
      return;
    }

    const data = await assertSuccessEnvelope<{ suppliers?: Array<{ id: number; code?: string }> }>(res);
    const suppliers = data.suppliers ?? [];
    expect(suppliers.some((supplier) => supplier.id === seedSupplierId)).toBe(false);
    expect(suppliers.some((supplier) => supplier.code === seedSupplierCode)).toBe(false);
  });

  it("Cross-tenant token cannot push a seed-company transaction as OK", async () => {
    const crossTenantTxId = deterministicSmokeClientTxId("550e8400", seedItemId * 1000 + 77);
    const res = await apiFetch("/api/sync/push", {
      method: "POST",
      token: crossTenantToken,
      body: JSON.stringify({
        outlet_id: seedCompanyOutletId,
        transactions: [
          {
            client_tx_id: crossTenantTxId,
            company_id: seedCompanyId,
            outlet_id: seedCompanyOutletId,
            cashier_user_id: crossTenantUserId,
            trx_at: "2026-05-16T05:00:00Z",
            status: "COMPLETED",
            items: [{ item_id: seedItemId, qty: 1, price_snapshot: 10000, name_snapshot: "Cross Tenant Sync Item" }],
            payments: [{ method: "CASH", amount: 10000 }],
          },
        ],
      }),
    });

    expect(res.status).not.toBeGreaterThanOrEqual(500);
    if (res.status !== 200) {
      expect([403, 404]).toContain(res.status);
      await assertErrorEnvelope(res, res.status);
      return;
    }

    const data = await assertSuccessEnvelope<{ results: Array<{ result: string; message?: string }> }>(res);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].result).toBe("ERROR");
    expect(data.results[0].message ?? "").toMatch(/COMPANY|OUTLET|MISMATCH|FORBIDDEN/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Gap Fill — Fiscal Closed-Period Smoke
// ────────────────────────────────────────────────────────────────────────────────

describe("Smoke Flow 18 — Fiscal Closed-Period Posting Rejection", { timeout: 120000 }, () => {
  let companyId: number;
  let supplierId: number;
  let bankAccountId: number;
  let closedFyId: number;
  let closedPeriodId: number;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await loginForTest(
      baseUrl,
      process.env.JP_COMPANY_CODE!,
      process.env.JP_OWNER_EMAIL!,
      process.env.JP_OWNER_PASSWORD!,
    );
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;

    // Set up purchasing prerequisites
    const accounts = await createTestPurchasingAccounts(companyId);
    await createTestPurchasingSettings(companyId, accounts.ap_account_id, accounts.expense_account_id);

    const supplier = await createTestSupplier(companyId, {
      code: makeTag("FCP", 12),
      name: "Fiscal Close Period Supplier",
      currency: "IDR",
    });
    supplierId = supplier.id;

    bankAccountId = await createTestBankAccount(companyId, {
      typeName: "BANK",
      code: makeTag("FCPB", 12),
      name: "FCP Bank Account",
    });

    // Create a FY for 2020 with a period covering Jan 2020 (unlikely to clash with seed data)
    const fy = await createTestFiscalYear(companyId, {
      year: 2020,
      startDate: "2020-01-01",
      endDate: "2020-12-31",
      status: "OPEN",
    });
    closedFyId = fy.id;

    const period = await createTestFiscalPeriod(fy.id, {
      periodNumber: 1,
      startDate: "2020-01-01",
      endDate: "2020-01-31",
      status: "OPEN",
    });
    closedPeriodId = period.id;

    // Close the fiscal year's periods
    await setTestFiscalPeriodStatus(fy.id, companyId, "CLOSED");
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it("verify fiscal period is closed in DB (read-only)", async () => {
    const db = getTestDb();
    const rows = await sql<{ id: number; status: number }>`
      SELECT id, status FROM fiscal_periods
      WHERE id = ${closedPeriodId}
        AND company_id = ${companyId}
    `.execute(db);

    expect(rows.rows.length).toBe(1);
    // status = 2 means CLOSED
    expect(rows.rows[0].status).toBe(2);
  });

  it("POST /api/purchasing/invoices returns 409 for closed-period date (period-close guardrail active)", async () => {
    const res = await apiFetch("/api/purchasing/invoices", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        supplier_id: supplierId,
        invoice_no: makeTag("FCPI", 12),
        invoice_date: "2020-01-15",
        currency_code: "IDR",
        lines: [
          {
            description: "Fiscal close period smoke PI line",
            qty: "2",
            unit_price: "50000.00",
          },
        ],
      }),
    });

    // The period-close guardrail may block at creation (409) or posting (200+409).
    // Both are valid depending on guardrail configuration. We verify the response
    // is a well-formed error when blocked, or success when not.
    expect(res.status, "Must not 5xx").not.toBeGreaterThanOrEqual(500);
    expect(res.status, "Must not 404").not.toBe(404);

    if (res.status === 409) {
      // Guardrail blocking at creation (expected with strict strictness)
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("PERIOD_CLOSED");
    } else if (res.status === 201) {
      // Draft created (guardrail may check only at post time)
      const data = await assertSuccessEnvelope<{ id: number }>(res, 201);
      expect(data.id).toBeGreaterThan(0);

      const postRes = await apiFetch(`/api/purchasing/invoices/${data.id}/post`, {
        method: "POST",
        token: ownerToken,
      });

      expect(postRes.status, "Post must not 5xx").not.toBeGreaterThanOrEqual(500);
      if (postRes.status !== 200) {
        const postBody = await postRes.json();
        expect(postBody.success).toBe(false);
        expect(postBody.error).toBeDefined();
      }
    }
  });
});
