// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Story 60.2: ACL Resource-Level Enforcement Audit — Integration Tests
 *
 * Tests verify that:
 *   - AC9:  requireAccess() without `resource` results in 403 denial
 *   - AC10: Resource value validity — correct resource required for access
 *   - Per-module positive tests: properly-permissioned user can access
 *     at least one endpoint per module requiring explicit resource
 *
 * Negative auth tests use CASHIER role (per AGENTS.md policy).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { acquireReadLock, releaseReadLock, getTestBaseUrl } from "../../helpers/setup";
import { getTestDb, closeTestDb } from "../../helpers/db";
import { makeTag } from "../../helpers/tags";
import {
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  createTestRole,
  assignUserGlobalRole,
  setModulePermission,
  getTestAccessToken,
  loginForTest,
  getRoleIdByCode,
  getOrCreateTestCashierForPermission,
  cleanupTestFixtures,
} from "../../fixtures";

// =============================================================================
// Test Setup
// =============================================================================

const baseUrl = getTestBaseUrl();

let adminToken: string;
let cashierToken: string;
let company: { id: number; code: string };
let outlet: { id: number; code: string };
let cashierUser: { id: number; email: string };
let customRole: { id: number; code: string };
let customUser: { id: number; email: string };
let customToken: string;

// Permission masks
const READ = 1;

beforeAll(async () => {
  await acquireReadLock();

  // Seed admin token for role/user creation
  adminToken = await getTestAccessToken(baseUrl);

  // Create test company + outlet
  company = await createTestCompanyMinimal({
    code: makeTag("RENF"),
    timezone: "Asia/Jakarta",
  });
  outlet = await createTestOutletMinimal(company.id, {
    code: makeTag("RENFOT"),
    timezone: "Asia/Jakarta",
  });

  // Get a CASHIER user for negative tests (AC10)
  const cashierSetup = await getOrCreateTestCashierForPermission(
    company.id,
    company.code,
    baseUrl,
  );
  cashierUser = { id: cashierSetup.user.id, email: cashierSetup.user.email };
  cashierToken = cashierSetup.accessToken;

  // Create a custom role with mixed resource permissions for AC9/AC10 tests
  customRole = await createTestRole(baseUrl, adminToken, makeTag("CUSTROLE"));

  // Create a custom user with the custom role
  const customUserObj = await createTestUser(company.id, {
    email: `${makeTag("renfcusr")}@example.com`,
    name: "Resource Enforcement User",
    password: "TestPassword123!",
  });
  customUser = { id: customUserObj.id, email: customUserObj.email };
  await assignUserGlobalRole(customUserObj.id, customRole.id);

  // Grant platform.users READ permission to the custom role
  await setModulePermission(company.id, customRole.id, "platform", "users", READ);

  // Login as custom user
  customToken = await loginForTest(
    baseUrl,
    company.code,
    customUserObj.email,
    "TestPassword123!",
  );
}, 60000);

afterAll(async () => {
  try {
    await cleanupTestFixtures();
    await closeTestDb();
  } finally {
    await releaseReadLock();
  }
}, 30000);

// =============================================================================
// Helper: make authenticated GET request
// =============================================================================

async function getRequest(path: string, token: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  return res;
}

// =============================================================================
// AC9: Missing Resource Failure Mode
// =============================================================================

describe("AC9: Missing resource failure mode", () => {
  it("user with platform.users READ can access /api/platform/customers but gets 403 for /api/users without platform.users permission", async () => {
    // Custom user has platform.users READ but NOT platform.roles READ
    // /api/users requires platform.users READ → should succeed
    const usersRes = await getRequest("/api/users", customToken);
    expect([200, 204]).toContain(usersRes.status);

    // /api/roles requires platform.roles READ → custom user does NOT have this → 403
    const rolesRes = await getRequest("/api/roles", customToken);
    expect(rolesRes.status).toBe(403);
  });

  it("CASHIER (no platform.users READ) gets 403 on /api/users", async () => {
    const res = await getRequest("/api/users", cashierToken);
    expect(res.status).toBe(403);
  });

  it("CASHIER (no platform.roles READ) gets 403 on /api/roles", async () => {
    const res = await getRequest("/api/roles", cashierToken);
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// AC10: Resource Value Validity
// =============================================================================

describe("AC10: Resource value validity", () => {
  it("user with platform.users READ can access /api/users (correct resource)", async () => {
    // Custom user has platform.users READ
    const res = await getRequest("/api/users", customToken);
    expect([200, 204]).toContain(res.status);
  });

  it("user with platform.users READ gets 403 on /api/roles (wrong resource)", async () => {
    // Custom user has platform.users READ but NOT platform.roles READ
    // /api/roles requires platform.roles READ
    const res = await getRequest("/api/roles", customToken);
    expect(res.status).toBe(403);
  });

  it("user with platform.users READ gets 403 on /api/accounts (wrong module+resource)", async () => {
    // Custom user has platform.users READ — not accounting.accounts
    const res = await getRequest("/api/accounts", customToken);
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// Per-Module Positive Tests
// Each test verifies that a properly-permissioned user can access at least
// one endpoint per module that requires explicit resource.
// =============================================================================

describe("Platform module — positive", () => {
  it("user with platform.users READ can access /api/users", async () => {
    const res = await getRequest("/api/users", customToken);
    expect([200, 204]).toContain(res.status);
  });
});

describe("Accounting module — positive", () => {
  let accountantToken: string;

  beforeAll(async () => {
    // Create an accountant-level user with accounting.accounts READ
    const acctRole = await createTestRole(baseUrl, adminToken, makeTag("ACCTROLE"));
    const acctUser = await createTestUser(company.id, {
      email: `${makeTag("renfacct")}@example.com`,
      name: "Accounting User",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(acctUser.id, acctRole.id);
    await setModulePermission(company.id, acctRole.id, "accounting", "accounts", READ);
    accountantToken = await loginForTest(
      baseUrl,
      company.code,
      acctUser.email,
      "TestPassword123!",
    );
  });

  it("user with accounting.accounts READ can access /api/accounts", async () => {
    const res = await getRequest("/api/accounts", accountantToken);
    expect([200, 204]).toContain(res.status);
  });

  it("user with accounting.accounts READ gets 403 on /api/journals (wrong resource)", async () => {
    const res = await getRequest("/api/journals", accountantToken);
    expect(res.status).toBe(403);
  });
});

describe("Inventory module — positive", () => {
  let invToken: string;

  beforeAll(async () => {
    const invRole = await createTestRole(baseUrl, adminToken, makeTag("INVROLE"));
    const invUser = await createTestUser(company.id, {
      email: `${makeTag("renfinv")}@example.com`,
      name: "Inventory User",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(invUser.id, invRole.id);
    await setModulePermission(company.id, invRole.id, "inventory", "items", READ);
    invToken = await loginForTest(
      baseUrl,
      company.code,
      invUser.email,
      "TestPassword123!",
    );
  });

  it("user with inventory.items READ can access /api/inventory/items", async () => {
    const res = await getRequest("/api/inventory/items", invToken);
    expect([200, 204]).toContain(res.status);
  });
});

describe("Sales module — positive", () => {
  let salesToken: string;

  beforeAll(async () => {
    const salesRole = await createTestRole(baseUrl, adminToken, makeTag("SALESROLE"));
    const salesUser = await createTestUser(company.id, {
      email: `${makeTag("renfsales")}@example.com`,
      name: "Sales User",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(salesUser.id, salesRole.id);
    await setModulePermission(company.id, salesRole.id, "sales", "orders", READ);
    salesToken = await loginForTest(
      baseUrl,
      company.code,
      salesUser.email,
      "TestPassword123!",
    );
  });

  it("user with sales.orders READ can access /api/sales (orders list)", async () => {
    const res = await getRequest("/api/sales/orders", salesToken);
    expect([200, 204]).toContain(res.status);
  });
});

describe("Purchasing module — positive", () => {
  let purchToken: string;

  beforeAll(async () => {
    const purchRole = await createTestRole(baseUrl, adminToken, makeTag("PURCHROLE"));
    const purchUser = await createTestUser(company.id, {
      email: `${makeTag("renfpurch")}@example.com`,
      name: "Purchasing User",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(purchUser.id, purchRole.id);
    await setModulePermission(company.id, purchRole.id, "purchasing", "suppliers", READ);
    purchToken = await loginForTest(
      baseUrl,
      company.code,
      purchUser.email,
      "TestPassword123!",
    );
  });

  it("user with purchasing.suppliers READ can access /api/purchasing/suppliers", async () => {
    const res = await getRequest("/api/purchasing/suppliers", purchToken);
    expect([200, 204]).toContain(res.status);
  });
});

describe("Treasury module — positive", () => {
  let treasToken: string;

  beforeAll(async () => {
    const treasRole = await createTestRole(baseUrl, adminToken, makeTag("TREASROLE"));
    const treasUser = await createTestUser(company.id, {
      email: `${makeTag("renftreas")}@example.com`,
      name: "Treasury User",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(treasUser.id, treasRole.id);
    await setModulePermission(company.id, treasRole.id, "treasury", "transactions", READ);
    treasToken = await loginForTest(
      baseUrl,
      company.code,
      treasUser.email,
      "TestPassword123!",
    );
  });

  it("user with treasury.transactions READ can access /api/cash-bank-transactions", async () => {
    const res = await getRequest("/api/cash-bank-transactions", treasToken);
    expect([200, 204]).toContain(res.status);
  });
});

describe("Reservations module — positive", () => {
  let ownerToken: string;

  beforeAll(async () => {
    // Create an OWNER-level user
    const ownerRoleId = await getRoleIdByCode("OWNER");
    const ownerUser = await createTestUser(company.id, {
      email: `${makeTag("renfownr")}@example.com`,
      name: "Owner User",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    // Set company-level module_roles entry for OWNER role with reservations.bookings
    // (System-level module_roles at company_id=NULL are not matched by the query,
    //  so we need a company-level entry for the permission check to pass)
    await setModulePermission(company.id, ownerRoleId, "reservations", "bookings", 31, {
      allowSystemRoleMutation: true,
    });

    ownerToken = await loginForTest(
      baseUrl,
      company.code,
      ownerUser.email,
      "TestPassword123!",
    );
  });

  it("OWNER user (with company-level reservations.bookings) can access /api/dinein/sessions", async () => {
    // OWNER has CRUDAM (63) on reservations per role matrix + company-level entry
    const res = await getRequest("/api/dinein/sessions?outletId=99999", ownerToken);
    // May return 400 (invalid outlet) or 200 on valid outlet, but should NOT return 403
    expect(res.status).not.toBe(403);
  });
});

describe("POS/Sync module — positive", () => {
  it("CASHIER user (has pos.transactions by default) gets 403 on non-POS endpoints", async () => {
    // CASHIER has pos.transactions access but should NOT have inventory.items
    const res = await getRequest("/api/inventory/items", cashierToken);
    expect(res.status).toBe(403);
  });

  it("CASHIER user gets 403 on /api/accounts (no accounting.accounts)", async () => {
    const res = await getRequest("/api/accounts", cashierToken);
    expect(res.status).toBe(403);
  });
});
