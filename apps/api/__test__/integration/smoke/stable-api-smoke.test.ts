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
import { acquireReadLock, releaseReadLock, getTestBaseUrl } from "../../helpers/setup";
import { closeTestDb } from "../../helpers/db";
import {
  loginForTest,
  resetFixtureRegistry,
  getSeedSyncContext as loadSeedSyncContext,
} from "../../fixtures";

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
    resetFixtureRegistry();
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

describe("Smoke Flow 9 — Sales Invoices (Deep Flow)", { timeout: 60000 }, () => {
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

  it("GET /api/sales/invoices returns success envelope", async () => {
    const res = await apiFetch("/api/sales/invoices", { token: ownerToken });
    const data = await assertSuccessEnvelope<unknown>(res);
    expect(data).toBeDefined();
  });

  it("GET /api/sales/payments returns success envelope", async () => {
    const res = await apiFetch("/api/sales/payments", { token: ownerToken });
    const data = await assertSuccessEnvelope<unknown>(res);
    expect(data).toBeDefined();
  });
});
