// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared Test Fixtures Library
 * 
 * Provides reusable test fixtures for integration tests.
 * All fixtures are:
 * - Self-contained and order-independent
 * - Idempotent (can run multiple times safely)
 * - Support both success and failure cases
 * - Clean up after themselves (but see cleanup policy below)
 * 
 * =============================================================================
 * HYBRID CLEANUP POLICY (Default: Option 1 - Unique-per-test data)
 * =============================================================================
 * 
 * Option 1 (DEFAULT): Unique-per-test data, no destructive cleanup
 * ---------------------------------------------------------------
 * Tests create unique data per run using timestamp-based codes.
 * Cleanup is handled by resetting the registry without DELETING records.
 * This allows data to cascade naturally and avoids FK constraint issues.
 * 
 * ```typescript
 * import { createTestCompany, resetFixtureRegistry } from "@/lib/test-fixtures";
 * 
 * test("my test", async () => {
 *   const company = await createTestCompany();
 *   const outlet = await createTestOutlet(company.id);
 *   // ... test code (records remain but are not tracked)
 * });
 * 
 * afterAll(async () => {
 *   resetFixtureRegistry();  // Option 1: Just reset registry (no deletes)
 *   await closeTestDb();
 * });
 * ```
 * 
 * Option 2 (OPT-IN): Strict scoped cleanup with destructive deletes
 * ------------------------------------------------------------------
 * Use when tests must immediately free resources or prevent data reuse.
 * Explicitly opt-in by calling cleanupTestFixtures() instead.
 * 
 * ```typescript
 * import { createTestCompany, cleanupTestFixtures } from "@/lib/test-fixtures";
 * 
 * test("my test", async () => {
 *   const company = await createTestCompany();
 *   // ... test code
 * });
 * 
 * afterAll(async () => {
 *   await cleanupTestFixtures();  // Option 2: Explicitly delete records
 *   await closeTestDb();
 * });
 * ```
 * 
 * =============================================================================
 * When to use which:
 * - Option 1 (default): Most integration tests, especially read-heavy or 
 *   tests that don't modify shared state
 * - Option 2: Tests that create heavy data, need immediate cleanup, or
 *   must prevent data reuse across test files
 */

import { getDb } from "./db";
import { sql } from "kysely";
import { withTransactionRetry } from "@jurnapod/db";
import { getAppEnv } from "./env";
import { hashPassword } from "./password-hash";
import { createCompanyBasic, CompanyCodeExistsError } from "./companies";
import { createOutletBasic, OutletCodeExistsError } from "./outlets";
import { createUserBasic, UserEmailExistsError } from "./users";
import { createItem } from "./items/index.js";
import { itemPricesAdapter } from "./item-prices/adapter.js";
import { DatabaseConflictError } from "./master-data-errors.js";
import { createVariantAttribute } from "./item-variants";
import { adjustStock } from "./stock.js";
import { MODULE_PERMISSION_BITS, buildPermissionMask, type ModulePermission } from "@jurnapod/auth";

// ============================================================================
// Types
// ============================================================================

export type CompanyFixture = {
  id: number;
  code: string;
  name: string;
};

export type OutletFixture = {
  id: number;
  company_id: number;
  code: string;
  name: string;
};

export type UserFixture = {
  id: number;
  company_id: number;
  email: string;
  password_hash?: string;
};

export type ItemFixture = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
};

export type VariantFixture = {
  id: number;
  item_id: number;
  company_id: number;
  sku: string;
  variant_name: string;
};

export type PriceFixture = {
  id: number;
  item_id: number;
  outlet_id: number | null;
  variant_id: number | null;
  price: number;
  is_active: boolean;
};

export type StockFixture = {
  company_id: number;
  outlet_id: number | null;
  product_id: number;
  quantity: number;
};

export type TestFixtures = {
  companies: CompanyFixture[];
  outlets: OutletFixture[];
  users: UserFixture[];
  items: ItemFixture[];
  variants: VariantFixture[];
  prices: PriceFixture[];
};

type RegisteredCleanupTask = {
  name: string;
  fn: () => Promise<void> | void;
};

// ============================================================================
// Global Fixture Registry (for cleanup)
// ============================================================================

const createdFixtures: TestFixtures = {
  companies: [],
  outlets: [],
  users: [],
  items: [],
  variants: [],
  prices: []
};

const registeredCleanupTasks: RegisteredCleanupTask[] = [];

const tokenCache = new Map<string, string>();
const tokenInFlight = new Map<string, Promise<string>>();

function buildTokenCacheKey(
  baseUrl: string,
  companyCode: string,
  email: string,
  password: string
): string {
  return `${baseUrl}::${companyCode}::${email.toLowerCase()}::${password}`;
}

async function requestLoginToken(
  baseUrl: string,
  companyCode: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyCode, email, password })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to login: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.data.access_token;
}

async function resetUserPasswordForTests(userId: number, password: string): Promise<void> {
  const db = getDb();
  const env = getAppEnv();
  const passwordHash = await hashPassword(password, {
    defaultAlgorithm: env.auth.password.defaultAlgorithm,
    bcryptRounds: env.auth.password.bcryptRounds,
    argon2MemoryKb: env.auth.password.argon2MemoryKb,
    argon2TimeCost: env.auth.password.argon2TimeCost,
    argon2Parallelism: env.auth.password.argon2Parallelism
  });

  await db
    .updateTable("users")
    .set({
      password_hash: passwordHash,
      is_active: 1,
      updated_at: new Date()
    })
    .where("id", "=", userId)
    .execute();
}

async function isTokenStillValid(baseUrl: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    // 401 means token is invalid/expired.
    // Other statuses are treated as usable token for auth purposes.
    return res.status !== 401;
  } catch {
    // If probe fails due to network/transient issues, keep cached token.
    // Request path will still surface real failures in test assertions.
    return true;
  }
}

/**
 * Register additional cleanup work for test data not created via fixture helpers.
 *
 * Tasks run during cleanupTestFixtures() in reverse registration order (LIFO),
 * before fixture-registry deletes.
 */
export function registerFixtureCleanup(
  name: string,
  fn: () => Promise<void> | void
): void {
  registeredCleanupTasks.push({ name, fn });
}

// ============================================================================
// Company Fixtures
// ============================================================================

/**
 * Create a minimal company (just the row, no bootstrap).
 * Use this when you need a company for FK references but don't need full setup.
 * 
 * @param options - Partial company options
 * @returns Company fixture with id, code, name
 */
export async function createTestCompanyMinimal(
  options?: Partial<{
    code: string;
    name: string;
    timezone: string;
    currency_code: string;
  }>
): Promise<CompanyFixture> {
  const db = getDb();
  const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  const code = options?.code ?? `TEST-CO-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Company ${runId}`;

  try {
    const company = await createCompanyBasic({
      code,
      name,
      timezone: options?.timezone ?? "Asia/Jakarta",
      currency_code: options?.currency_code ?? "IDR"
    });

    // Seed purchasing.suppliers and purchasing.exchange_rates ACL for new company
    // so integration tests with resource-level ACL don't fail with 403.
    // Only seed for system roles (SUPER_ADMIN, OWNER, COMPANY_ADMIN get CRUDAM=63,
    // ADMIN/ACCOUNTANT get CRUDA=31, CASHIER gets 0).
    // This mirrors migrations 0169 and 0171 but for companies created during tests.
    await sql`
      INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
      SELECT ${company.id} as company_id, r.id as role_id, 'purchasing',
        CASE
          WHEN ${true} THEN 'suppliers'
          ELSE 'suppliers'
        END as resource,
        CASE r.code
          WHEN 'SUPER_ADMIN' THEN 63
          WHEN 'OWNER' THEN 63
          WHEN 'COMPANY_ADMIN' THEN 63
          WHEN 'ADMIN' THEN 31
          WHEN 'ACCOUNTANT' THEN 31
          WHEN 'CASHIER' THEN 0
          ELSE 0
        END as permission_mask
      FROM roles r
      WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
    `.execute(db);

    // Also seed purchasing.exchange_rates ACL
    await sql`
      INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
      SELECT ${company.id} as company_id, r.id as role_id, 'purchasing', 'exchange_rates',
        CASE r.code
          WHEN 'SUPER_ADMIN' THEN 63
          WHEN 'OWNER' THEN 63
          WHEN 'COMPANY_ADMIN' THEN 63
          WHEN 'ADMIN' THEN 31
          WHEN 'ACCOUNTANT' THEN 31
          WHEN 'CASHIER' THEN 0
          ELSE 0
        END as permission_mask
      FROM roles r
      WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
    `.execute(db);

    // Also seed purchasing.orders ACL
    await sql`
      INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
      SELECT ${company.id} as company_id, r.id as role_id, 'purchasing', 'orders',
        CASE r.code
          WHEN 'SUPER_ADMIN' THEN 63
          WHEN 'OWNER' THEN 63
          WHEN 'COMPANY_ADMIN' THEN 63
          WHEN 'ADMIN' THEN 31
          WHEN 'ACCOUNTANT' THEN 31
          WHEN 'CASHIER' THEN 0
          ELSE 0
        END as permission_mask
      FROM roles r
      WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
    `.execute(db);

    // Also seed purchasing.receipts ACL
    await sql`
      INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
      SELECT ${company.id} as company_id, r.id as role_id, 'purchasing', 'receipts',
        CASE r.code
          WHEN 'SUPER_ADMIN' THEN 63
          WHEN 'OWNER' THEN 63
          WHEN 'COMPANY_ADMIN' THEN 63
          WHEN 'ADMIN' THEN 31
          WHEN 'ACCOUNTANT' THEN 31
          WHEN 'CASHIER' THEN 0
          ELSE 0
        END as permission_mask
      FROM roles r
      WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
    `.execute(db);

    // Also seed purchasing.invoices ACL
    await sql`
      INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
      SELECT ${company.id} as company_id, r.id as role_id, 'purchasing', 'invoices',
        CASE r.code
          WHEN 'SUPER_ADMIN' THEN 63
          WHEN 'OWNER' THEN 63
          WHEN 'COMPANY_ADMIN' THEN 63
          WHEN 'ADMIN' THEN 31
          WHEN 'ACCOUNTANT' THEN 31
          WHEN 'CASHIER' THEN 0
          ELSE 0
        END as permission_mask
      FROM roles r
      WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
    `.execute(db);

    // Also seed purchasing.payments ACL
    await sql`
      INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
      SELECT ${company.id} as company_id, r.id as role_id, 'purchasing', 'payments',
        CASE r.code
          WHEN 'SUPER_ADMIN' THEN 63
          WHEN 'OWNER' THEN 63
          WHEN 'COMPANY_ADMIN' THEN 63
          WHEN 'ADMIN' THEN 31
          WHEN 'ACCOUNTANT' THEN 31
          WHEN 'CASHIER' THEN 0
          ELSE 0
        END as permission_mask
      FROM roles r
      WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
    `.execute(db);

    // Also seed purchasing.credits ACL
    await sql`
      INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
      SELECT ${company.id} as company_id, r.id as role_id, 'purchasing', 'credits',
        CASE r.code
          WHEN 'SUPER_ADMIN' THEN 63
          WHEN 'OWNER' THEN 63
          WHEN 'COMPANY_ADMIN' THEN 63
          WHEN 'ADMIN' THEN 31
          WHEN 'ACCOUNTANT' THEN 31
          WHEN 'CASHIER' THEN 0
          ELSE 0
        END as permission_mask
      FROM roles r
      WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
    `.execute(db);

    // Also seed purchasing.reports ACL
    await sql`
      INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
      SELECT ${company.id} as company_id, r.id as role_id, 'purchasing', 'reports',
        CASE r.code
          WHEN 'SUPER_ADMIN' THEN 63
          WHEN 'OWNER' THEN 63
          WHEN 'COMPANY_ADMIN' THEN 63
          WHEN 'ADMIN' THEN 31
          WHEN 'ACCOUNTANT' THEN 31
          WHEN 'CASHIER' THEN 0
          ELSE 0
        END as permission_mask
      FROM roles r
      WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
    `.execute(db);

    createdFixtures.companies.push(company);
    return company;
  } catch (error: unknown) {
    if (error instanceof CompanyCodeExistsError) {
      // Company with this code already exists - fetch it instead
      const result = await sql`SELECT id, code, name FROM companies WHERE code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; code: string; name: string };
        const existing = {
          id: Number(row.id),
          code: row.code,
          name: row.name
        };
        return existing;
      }
    }
    throw error;
  }
}

/**
 * Create a test company with full bootstrap (roles, modules, settings, fiscal year).
 * For most tests, use createTestCompanyMinimal() instead to avoid unnecessary setup.
 * 
 * @param options - Partial company options
 * @returns Company fixture with id, code, name
 */
export async function createTestCompany(
  options?: Partial<{
    code: string;
    name: string;
    timezone: string;
    currency_code: string;
  }>
): Promise<CompanyFixture> {
  // For now, createTestCompany and createTestCompanyMinimal are the same
  // because createCompany with full bootstrap requires an actor user.
  // Tests should use createTestCompanyMinimal and manually add what they need.
  // 
  // TODO: Once we have a way to create a bootstrap actor, implement full bootstrap here.
  return createTestCompanyMinimal(options);
}

// ============================================================================
// Outlet Fixtures
// ============================================================================

/**
 * Create a minimal outlet (just the row, no audit).
 * 
 * @param companyId - Parent company ID
 * @param options - Partial outlet options
 * @returns Outlet fixture with id, company_id, code, name
 */
export async function createTestOutletMinimal(
  companyId: number,
  options?: Partial<{
    code: string;
    name: string;
    timezone: string;
  }>
): Promise<OutletFixture> {
  const db = getDb();
  const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  
  const code = options?.code ?? `TEST-OL-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Outlet ${runId}`;
  
  try {
    const outlet = await createOutletBasic({
      company_id: companyId,
      code,
      name,
      timezone: options?.timezone ?? "Asia/Jakarta"
    });
    
    createdFixtures.outlets.push(outlet);
    return outlet;
  } catch (error: unknown) {
    if (error instanceof OutletCodeExistsError) {
      // Outlet with this code already exists for this company - fetch it instead
      const result = await sql`SELECT id, company_id, code, name FROM outlets WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; company_id: number; code: string; name: string };
        const existing = {
          id: Number(row.id),
          company_id: Number(row.company_id),
          code: row.code,
          name: row.name
        };
        return existing;
      }
    }
    throw error;
  }
}

/**
 * Create a test outlet with full audit logging.
 * For most tests, use createTestOutletMinimal() instead.
 * 
 * @param companyId - Parent company ID
 * @param options - Partial outlet options
 * @returns Outlet fixture with id, company_id, code, name
 */
export async function createTestOutlet(
  companyId: number,
  options?: Partial<{
    code: string;
    name: string;
    timezone: string;
  }>
): Promise<OutletFixture> {
  // For now, createTestOutlet and createTestOutletMinimal are the same
  // because createOutlet with audit requires an actor user.
  // Tests should use createTestOutletMinimal and manually add what they need.
  return createTestOutletMinimal(companyId, options);
}

// ============================================================================
// User Fixtures
// ============================================================================

/**
 * Create a test user (just the row, no role assignments, no audit).
 * 
 * @param companyId - Parent company ID
 * @param options - Partial user options
 * @returns User fixture with id, company_id, email
 */
export async function createTestUser(
  companyId: number,
  options?: Partial<{
    email: string;
    name: string;
    password: string;
    isActive: boolean;
  }>
): Promise<UserFixture> {
  const db = getDb();
  const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  
  const email = options?.email ?? `test-user-${runId}@example.com`;
  
  try {
    const user = await createUserBasic({
      companyId,
      email,
      password: options?.password,
      name: options?.name,
      isActive: options?.isActive ?? true
    });
    
    // Get the full user record including password_hash for tests that need it
    const result = await sql`SELECT id, company_id, email, password_hash FROM users WHERE id = ${user.id} LIMIT 1`.execute(db);
    
    const row = result.rows[0] as { id: number; company_id: number; email: string; password_hash: string | null };
    const fullUser: UserFixture = {
      id: Number(row.id),
      company_id: Number(row.company_id),
      email: row.email,
      password_hash: row.password_hash ?? undefined
    };
    
    createdFixtures.users.push(fullUser);
    return fullUser;
  } catch (error: unknown) {
    if (error instanceof UserEmailExistsError) {
      // User with this email already exists - fetch it instead
      const result = await sql`SELECT id, company_id, email, password_hash FROM users WHERE company_id = ${companyId} AND email = ${email.toLowerCase()} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; company_id: number; email: string; password_hash: string | null };
        const existing: UserFixture = {
          id: Number(row.id),
          company_id: Number(row.company_id),
          email: row.email,
          password_hash: row.password_hash ?? undefined
        };
        return existing;
      }
    }
    // Handle MySQL duplicate key error (e.g., concurrent fixture creation across test files)
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, company_id, email, password_hash FROM users WHERE company_id = ${companyId} AND email = ${email.toLowerCase()} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; company_id: number; email: string; password_hash: string | null };
        return {
          id: Number(row.id),
          company_id: Number(row.company_id),
          email: row.email,
          password_hash: row.password_hash ?? undefined
        };
      }
    }
    throw error;
  }
}

// ============================================================================
// Customer Fixtures
// ============================================================================

/**
 * Create a test customer via API.
 * Uses the platform/customers endpoint so ACL and validation are respected.
 *
 * @param baseUrl - The base URL of the test server
 * @param accessToken - Valid access token for authentication
 * @param companyId - Company ID for the customer
 * @param code - Unique customer code (will be truncated to 32 chars)
 * @param displayName - Display name for the customer
 * @param options - Optional settings
 * @param options.type - Customer type (default: 'PERSON')
 * @param options.email - Email address
 * @param options.phone - Phone number
 * @returns Customer ID
 */
export async function createTestCustomer(
  baseUrl: string,
  accessToken: string,
  companyId: number,
  code: string,
  displayName: string,
  options?: Partial<{
    type: string;
    email: string;
    phone: string;
    companyName: string;
    taxId: string;
  }>
): Promise<number> {
  const normalizedCode = code.slice(0, 32);

  const res = await fetch(`${baseUrl}/api/platform/customers`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      company_id: companyId,
      code: normalizedCode,
      type: options?.type ?? "PERSON",
      display_name: displayName,
      email: options?.email ?? null,
      phone: options?.phone ?? null,
      company_name: options?.companyName ?? null,
      tax_id: options?.taxId ?? null
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to create customer: ${res.status} ${await res.text()}`);
  }

  const result = await res.json();
  return result.data.id;
}

/**
 * Create a test customer in a specific company for cross-company scenarios.
 * Uses canonical fixture-library setup so test files avoid ad-hoc SQL.
 *
 * @param baseUrl - The base URL of the test server
 * @param accessToken - Valid access token (for the target company)
 * @param companyId - Company ID for the customer
 * @param code - Unique customer code
 * @param displayName - Display name for the customer
 * @param options - Optional settings
 * @returns Customer ID
 */
export async function createTestCustomerForCompany(
  _baseUrl: string,
  _accessToken: string,
  companyId: number,
  code: string,
  displayName: string,
  options?: Partial<{
    type: string;
    email: string;
    phone: string;
  }>
): Promise<number> {
  // Deterministic cross-company fixture path: create directly through canonical test fixture library
  // (tests should not do raw SQL themselves; fixture library centralizes setup invariants).
  const db = getDb();
  const normalizedCode = code.slice(0, 32);
  const now = new Date();

  const result = await db
    .insertInto("customers")
    .values({
      company_id: companyId,
      code: normalizedCode,
      type: options?.type === "BUSINESS" ? 2 : 1,
      display_name: displayName,
      company_name: null,
      tax_id: null,
      phone: options?.phone ?? null,
      email: options?.email ?? null,
      address_line1: null,
      address_line2: null,
      city: null,
      postal_code: null,
      notes: null,
      deleted_at: null,
      is_active: 1,
      created_by_user_id: null,
      updated_by_user_id: null,
      created_at: now,
      updated_at: now,
    })
    .executeTakeFirst();

  return Number(result.insertId);
}

// ============================================================================
// Supplier Fixtures
// ============================================================================

export type SupplierFixture = {
  id: number;
  company_id: number;
  code: string;
  name: string;
};

/**
 * Create a test supplier directly via DB (no API call needed).
 * Used for purchasing tests that need a valid supplier_id.
 *
 * @param companyId - Parent company ID
 * @param options - Partial supplier options
 * @returns Supplier fixture with id, company_id, code, name
 */
export async function createTestSupplier(
  companyId: number,
  options?: Partial<{
    code: string;
    name: string;
    currency: string;
    isActive: boolean;
    paymentTermsDays: number;
  }>
): Promise<SupplierFixture> {
  const db = getDb();
  const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  const code = options?.code ?? `TEST-SUP-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Supplier ${runId}`;
  const currency = options?.currency ?? "IDR";

  try {
    await sql`
      INSERT INTO suppliers (company_id, code, name, currency, payment_terms_days, is_active, created_at, updated_at)
      VALUES (${companyId}, ${code}, ${name}, ${currency}, ${options?.paymentTermsDays ?? null}, ${options?.isActive ?? 1}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, company_id, code, name FROM suppliers WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create supplier with code ${code}`);
    }
    const row = result.rows[0] as { id: number; company_id: number; code: string; name: string };
    const supplier: SupplierFixture = {
      id: Number(row.id),
      company_id: Number(row.company_id),
      code: row.code,
      name: row.name,
    };
    return supplier;
  } catch (error: unknown) {
    // Handle duplicate - fetch existing
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, company_id, code, name FROM suppliers WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; company_id: number; code: string; name: string };
        return {
          id: Number(row.id),
          company_id: Number(row.company_id),
          code: row.code,
          name: row.name,
        };
      }
    }
    throw error;
  }
}

/**
 * Create test accounts needed for purchasing (AP and expense).
 * Uses the accounts service to create proper account records.
 *
 * @param companyId - Parent company ID
 * @param options - Partial account options
 * @returns Object with ap_account_id and expense_account_id
 */
export async function createTestPurchasingAccounts(
  companyId: number,
  options?: Partial<{
    apAccountName: string;
    expenseAccountName: string;
  }>
): Promise<{ ap_account_id: number; expense_account_id: number }> {
  const db = getDb();
  const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  // Find the purchasing module id
  const purchasingModuleResult = await sql`SELECT id FROM modules WHERE code = 'purchasing' LIMIT 1`.execute(db);
  if (purchasingModuleResult.rows.length === 0) {
    throw new Error('Purchasing module not found');
  }
  const purchasingModuleId = Number((purchasingModuleResult.rows[0] as { id: number }).id);

  // Create AP account (creditor/payable type)
  const apAccountCode = `TEST-AP-${runId}`.slice(0, 20);
  const apAccountName = options?.apAccountName ?? `Test AP Account ${runId}`;

  const apResult = await sql`
    INSERT INTO accounts (company_id, code, name, type_name, is_active, is_payable, created_at, updated_at)
    VALUES (${companyId}, ${apAccountCode}, ${apAccountName}, 'CREDITOR', 1, 1, NOW(), NOW())
  `.execute(db);
  const apAccountId = Number((apResult as any).insertId);

  // Create Expense account
  const expenseAccountCode = `TEST-EXP-${runId}`.slice(0, 20);
  const expenseAccountName = options?.expenseAccountName ?? `Test Expense Account ${runId}`;

  const expenseResult = await sql`
    INSERT INTO accounts (company_id, code, name, type_name, is_active, is_payable, created_at, updated_at)
    VALUES (${companyId}, ${expenseAccountCode}, ${expenseAccountName}, 'EXPENSE', 1, 0, NOW(), NOW())
  `.execute(db);
  const expenseAccountId = Number((expenseResult as any).insertId);

  // Upsert company_modules entry for purchasing with the AP and expense accounts
  await sql`
    INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at,
      purchasing_default_ap_account_id, purchasing_default_expense_account_id)
    VALUES (${companyId}, ${purchasingModuleId}, 1, '{}', CURRENT_TIMESTAMP, ${apAccountId}, ${expenseAccountId})
    ON DUPLICATE KEY UPDATE
      purchasing_default_ap_account_id = ${apAccountId},
      purchasing_default_expense_account_id = ${expenseAccountId}
  `.execute(db);

  return { ap_account_id: apAccountId, expense_account_id: expenseAccountId };
}

/**
 * Configure purchasing module settings for a company.
 *
 * Sets `purchasing_default_ap_account_id` and `purchasing_default_expense_account_id`
 * on `company_modules` for the purchasing module.
 */
export async function createTestPurchasingSettings(
  companyId: number,
  apAccountId: number,
  expenseAccountId: number
): Promise<{ company_id: number; ap_account_id: number; expense_account_id: number }> {
  const db = getDb();

  const purchasingModuleResult = await sql`SELECT id FROM modules WHERE code = 'purchasing' LIMIT 1`.execute(db);
  if (purchasingModuleResult.rows.length === 0) {
    throw new Error('Purchasing module not found');
  }
  const purchasingModuleId = Number((purchasingModuleResult.rows[0] as { id: number }).id);

  await sql`
    INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at,
      purchasing_default_ap_account_id, purchasing_default_expense_account_id)
    VALUES (${companyId}, ${purchasingModuleId}, 1, '{}', CURRENT_TIMESTAMP, ${apAccountId}, ${expenseAccountId})
    ON DUPLICATE KEY UPDATE
      purchasing_default_ap_account_id = ${apAccountId},
      purchasing_default_expense_account_id = ${expenseAccountId}
  `.execute(db);

  return {
    company_id: companyId,
    ap_account_id: apAccountId,
    expense_account_id: expenseAccountId,
  };
}

/**
 * Create a test BANK/CASH account for AP payment scenarios.
 */
export async function createTestBankAccount(
  companyId: number,
  options?: Partial<{
    code: string;
    name: string;
    typeName: "BANK" | "CASH";
    isActive: boolean;
  }>
): Promise<number> {
  const db = getDb();
  const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const code = options?.code ?? `TEST-BA-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test ${options?.typeName ?? "BANK"} Account ${runId}`;

  const result = await sql`
    INSERT INTO accounts (company_id, code, name, type_name, is_active, is_payable, created_at, updated_at)
    VALUES (${companyId}, ${code}, ${name}, ${options?.typeName ?? "BANK"}, ${options?.isActive ?? true ? 1 : 0}, 0, NOW(), NOW())
  `.execute(db);

  const accountId = Number((result as { insertId?: number }).insertId ?? 0);
  if (!accountId) {
    throw new Error("Failed to create test bank account");
  }
  return accountId;
}

// ============================================================================
// Item Fixtures
// ============================================================================

/**
 * Create a test item.
 * 
 * @param companyId - Parent company ID
 * @param options - Partial item options
 * @returns Item fixture with id, company_id, sku, name, type
 */
export async function createTestItem(
  companyId: number,
  options?: Partial<{
    sku: string;
    name: string;
    type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
    isActive: boolean;
    trackStock: boolean;
  }>
): Promise<ItemFixture> {
  const db = getDb();
  const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  
  const sku = options?.sku ?? `TEST-SKU-${runId}`.slice(0, 30);
  const name = options?.name ?? `Test Item ${runId}`;
  const type = options?.type ?? "PRODUCT";
  
  try {
    const item = await createItem(companyId, {
      sku,
      name,
      type,
      is_active: options?.isActive ?? true,
      track_stock: options?.trackStock ?? true
    });
    
    createdFixtures.items.push(item);
    return item;
  } catch (error: unknown) {
    if (error instanceof DatabaseConflictError) {
      // Item with this SKU already exists - fetch it instead
      const result = await sql`SELECT id, company_id, sku, name, item_type FROM items WHERE company_id = ${companyId} AND sku = ${sku} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; company_id: number; sku: string | null; name: string; item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE" };
        const existing: ItemFixture = {
          id: Number(row.id),
          company_id: Number(row.company_id),
          sku: row.sku,
          name: row.name,
          type: row.item_type
        };
        return existing;
      }
    }
    throw error;
  }
}

// ============================================================================
// Variant Fixtures
// ============================================================================

/**
 * Create a test variant by creating a variant attribute and returning the first variant.
 * 
 * @param itemId - Parent item ID
 * @param options - Partial variant options
 * @returns Variant fixture with id, item_id, company_id, sku, variant_name
 */
export async function createTestVariant(
  itemId: number,
  options?: Partial<{
    attributeName: string;
    attributeValues: string[];
  }>
): Promise<VariantFixture> {
  const db = getDb();
  
  const attributeName = options?.attributeName ?? "Size";
  const attributeValues = options?.attributeValues ?? ["Default"];
  
  // Get company_id from item
  const itemResult = await sql`SELECT company_id FROM items WHERE id = ${itemId} LIMIT 1`.execute(db);
  
  if (itemResult.rows.length === 0) {
    throw new Error(`Item ${itemId} not found`);
  }
  
  const itemRow = itemResult.rows[0] as { company_id: number };
  const companyId = Number(itemRow.company_id);
  
  // Create variant attribute (this generates the variant)
  await createVariantAttribute(companyId, itemId, {
    attribute_name: attributeName,
    values: attributeValues
  });
  
  // Get the created variant
  const variantResult = await sql`SELECT id, item_id, company_id, sku, variant_name 
     FROM item_variants 
     WHERE item_id = ${itemId} 
     ORDER BY id ASC 
     LIMIT 1`.execute(db);
  
  if (variantResult.rows.length === 0) {
    throw new Error(`Variant not found after creating attribute for item ${itemId}`);
  }
  
  const row = variantResult.rows[0] as { id: number; item_id: number; company_id: number; sku: string; variant_name: string };
  const variant: VariantFixture = {
    id: Number(row.id),
    item_id: Number(row.item_id),
    company_id: Number(row.company_id),
    sku: row.sku,
    variant_name: row.variant_name
  };
  
  createdFixtures.variants.push(variant);
  return variant;
}

// ============================================================================
// Price Fixtures
// ============================================================================

/**
 * Create a test price using the canonical itemPriceService.
 * Requires a real userId for audit logging.
 */
export async function createTestPrice(
  companyId: number,
  itemId: number,
  userId: number,
  options?: Partial<{
    outletId: number | null;
    variantId: number | null;
    price: number;
    isActive: boolean;
  }>
): Promise<PriceFixture> {
  const actor = { userId, canManageCompanyDefaults: true };

  const price = await itemPricesAdapter.createItemPrice(companyId, {
    item_id: itemId,
    outlet_id: options?.outletId ?? null,
    variant_id: options?.variantId ?? null,
    price: options?.price ?? 10000,
    is_active: options?.isActive ?? true,
  }, actor);

  createdFixtures.prices.push(price);
  return price;
}

/**
 * Create test stock for an item at an outlet using adjustStock.
 * Uses the library function so stock records are created atomically
 * with proper inventory_transaction logging.
 *
 * Registers a cleanup task that resets stock to 0 (via adjustStock with negative
 * quantity) before item cleanup cascades via FK.
 *
 * @param companyId  - Tenant ID
 * @param itemId     - Item ID to set stock for
 * @param outletId   - Outlet ID (use null for company-level stock)
 * @param quantity   - Absolute stock quantity to set
 * @param userId     - User performing the setup (for audit)
 */
export async function createTestStock(
  companyId: number,
  itemId: number,
  outletId: number | null,
  quantity: number,
  userId: number
): Promise<StockFixture> {
  const result = await adjustStock({
    company_id: companyId,
    outlet_id: outletId,
    product_id: itemId,
    adjustment_quantity: quantity,
    reason: "TEST_SETUP",
    user_id: userId,
  });

  if (!result) {
    throw new Error(`Failed to create test stock for item ${itemId}`);
  }

  const fixture: StockFixture = {
    company_id: companyId,
    outlet_id: outletId,
    product_id: itemId,
    quantity,
  };

  // Register cleanup: reset stock to 0 before item deletion cascades
  registerFixtureCleanup(`stock_${itemId}_${outletId ?? 'global'}`, async () => {
    await adjustStock({
      company_id: companyId,
      outlet_id: outletId,
      product_id: itemId,
      adjustment_quantity: -quantity,
      reason: "TEST_TEARDOWN",
      user_id: userId,
    });
  });

  return fixture;
}

/**
 * Set low_stock_threshold for a test item.
 *
 * Canonical test helper so integration tests don't perform ad-hoc SQL UPDATE
 * in test files. Uses Kysely query builder for scoped update.
 */
export async function setTestItemLowStockThreshold(
  companyId: number,
  itemId: number,
  lowStockThreshold: number | null
): Promise<void> {
  const db = getDb();

  // Use transaction retry to handle deadlocks from parallel test fixtures
  await withTransactionRetry(db, async (trx) => {
    await trx
      .updateTable("items")
      .set({ low_stock_threshold: lowStockThreshold })
      .where("company_id", "=", companyId)
      .where("id", "=", itemId)
      .execute();
  });

  registerFixtureCleanup(`item_threshold_${itemId}`, async () => {
    const db = getDb();
    await withTransactionRetry(db, async (trx) => {
      await trx
        .updateTable("items")
        .set({ low_stock_threshold: null })
        .where("company_id", "=", companyId)
        .where("id", "=", itemId)
        .execute();
    });
  });
}

// ============================================================================
// Fiscal Year Fixtures (Epic 47 - AP Reconciliation)
// ============================================================================

export type FiscalYearFixture = {
  id: number;
  company_id: number;
  year: number;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
};

/**
 * Create a test fiscal year for Epic 47 (cutoff date handling, period close guardrails).
 * Story linkage: 47.1 (cutoff date handling), 47.5 (period close guardrails).
 *
 * @param companyId - Parent company ID
 * @param options - Fiscal year options
 * @param options.year - Fiscal year number (e.g., 2026)
 * @param options.startDate - Start date in 'YYYY-MM-DD' format
 * @param options.endDate - End date in 'YYYY-MM-DD' format
 * @param options.status - 'OPEN' | 'CLOSED' (default: 'OPEN')
 * @returns Fiscal year fixture with id, year, startDate, endDate, status
 */
export async function createTestFiscalYear(
  companyId: number,
  options?: Partial<{
    year: number;
    startDate: string;
    endDate: string;
    status: "OPEN" | "CLOSED";
  }>
): Promise<FiscalYearFixture> {
  const db = getDb();
  const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  const year = options?.year ?? new Date().getFullYear();
  const code = `FY${year}-${runId}`.slice(0, 32);
  const name = `Fiscal Year ${year}`;
  const startDate = options?.startDate ?? `${year}-01-01`;
  const endDate = options?.endDate ?? `${year}-12-31`;
  const status = options?.status ?? "OPEN";

  try {
    await sql`
      INSERT INTO fiscal_years (company_id, code, name, start_date, end_date, status, created_at, updated_at)
      VALUES (${companyId}, ${code}, ${name}, ${startDate}, ${endDate}, ${status}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, code, name, start_date, end_date, status FROM fiscal_years WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create fiscal year with code ${code}`);
    }
    const row = result.rows[0] as { id: number; code: string; name: string; start_date: Date; end_date: Date; status: string };
    const fixture: FiscalYearFixture = {
      id: Number(row.id),
      company_id: companyId,
      year,
      startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
      endDate: row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date),
      status: row.status as "OPEN" | "CLOSED",
    };
    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, code, name, start_date, end_date, status FROM fiscal_years WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; code: string; name: string; start_date: Date; end_date: Date; status: string };
        return {
          id: Number(row.id),
          company_id: companyId,
          year,
          startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
          endDate: row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date),
          status: row.status as "OPEN" | "CLOSED",
        };
      }
    }
    throw error;
  }
}

// ============================================================================
// Fiscal Period Fixtures (Epic 47)
// ============================================================================

export type FiscalPeriodFixture = {
  id: number;
  fiscalYearId: number;
  periodNumber: number;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
};

/**
 * Create a test fiscal period for Epic 47 (cutoff date handling, period close guardrails).
 * Story linkage: 47.1 (cutoff date handling), 47.5 (period close guardrails).
 *
 * NOTE: fiscal_periods table does not exist yet. This fixture will fail until migration 0180
 * (or similar) creates the table. Schema gap documented in Epic 47 story spec.
 *
 * @param fiscalYearId - Parent fiscal year ID
 * @param options - Period options
 * @param options.periodNumber - Period within fiscal year (1-12)
 * @param options.startDate - Start date in 'YYYY-MM-DD' format
 * @param options.endDate - End date in 'YYYY-MM-DD' format
 * @param options.status - 'OPEN' | 'CLOSED' (default: 'OPEN')
 * @returns Fiscal period fixture with id, fiscalYearId, periodNumber, startDate, endDate, status
 */
export async function createTestFiscalPeriod(
  fiscalYearId: number,
  options?: Partial<{
    periodNumber: number;
    startDate: string;
    endDate: string;
    status: "OPEN" | "CLOSED";
  }>
): Promise<FiscalPeriodFixture> {
  const db = getDb();

  // Check if fiscal_periods table exists before attempting insert
  const tableCheck = await sql`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'fiscal_periods'`.execute(db);
  const tableExists = Number((tableCheck.rows[0] as { cnt: number }).cnt) > 0;

  if (!tableExists) {
    throw new Error(
      "fiscal_periods table does not exist. Schema gap: Story 47.1/47.5 requires a fiscal_periods table " +
      "(typically: id, fiscal_year_id, period_number, start_date, end_date, status). " +
      "This fixture will work once migration 0180 (or similar) creates the table."
    );
  }

  const periodNumber = options?.periodNumber ?? 1;
  // Derive default dates from fiscal year if not provided
  const fyResult = await sql`SELECT start_date, end_date FROM fiscal_years WHERE id = ${fiscalYearId} LIMIT 1`.execute(db);
  let startDate = options?.startDate ?? "2026-01-01";
  let endDate = options?.endDate ?? "2026-01-31";

  if (fyResult.rows.length > 0) {
    const fyRow = fyResult.rows[0] as { start_date: Date; end_date: Date };
    if (!options?.startDate) {
      startDate = fyRow.start_date instanceof Date ? fyRow.start_date.toISOString().split("T")[0] : String(fyRow.start_date);
    }
    if (!options?.endDate) {
      endDate = fyRow.end_date instanceof Date ? fyRow.end_date.toISOString().split("T")[0] : String(fyRow.end_date);
    }
  }

  const status = options?.status ?? "OPEN";

  try {
    await sql`
      INSERT INTO fiscal_periods (fiscal_year_id, period_number, start_date, end_date, status, created_at, updated_at)
      VALUES (${fiscalYearId}, ${periodNumber}, ${startDate}, ${endDate}, ${status}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, fiscal_year_id, period_number, start_date, end_date, status FROM fiscal_periods WHERE fiscal_year_id = ${fiscalYearId} AND period_number = ${periodNumber} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create fiscal period for fiscal_year_id ${fiscalYearId}`);
    }
    const row = result.rows[0] as { id: number; fiscal_year_id: number; period_number: number; start_date: Date; end_date: Date; status: string };
    const fixture: FiscalPeriodFixture = {
      id: Number(row.id),
      fiscalYearId: Number(row.fiscal_year_id),
      periodNumber: Number(row.period_number),
      startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
      endDate: row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date),
      status: row.status as "OPEN" | "CLOSED",
    };
    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, fiscal_year_id, period_number, start_date, end_date, status FROM fiscal_periods WHERE fiscal_year_id = ${fiscalYearId} AND period_number = ${periodNumber} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; fiscal_year_id: number; period_number: number; start_date: Date; end_date: Date; status: string };
        return {
          id: Number(row.id),
          fiscalYearId: Number(row.fiscal_year_id),
          periodNumber: Number(row.period_number),
          startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
          endDate: row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date),
          status: row.status as "OPEN" | "CLOSED",
        };
      }
    }
    throw error;
  }
}

// ============================================================================
// AP Reconciliation Settings Fixtures (Epic 47.1)
// ============================================================================

export type APReconciliationSettingsFixture = {
  companyId: number;
  accountIds: number[];
};

/**
 * Create AP reconciliation account settings for Epic 47.1 (configurable AP control account set).
 * Story linkage: 47.1 AC1 - configurable AP control account set (not hardcoded single account).
 *
 * Implementation uses settings_strings table with JSON array storage.
 * Key: 'ap_reconciliation_account_ids', Value: JSON array of account IDs.
 * This approach supports multiple AP control accounts as required by the story spec.
 *
 * @param companyId - Company ID
 * @param accountIds - Array of GL account IDs that form the AP control account set
 * @param options - Optional settings
 * @param options.description - Optional description (stored in settings_strings as metadata)
 * @returns AP reconciliation settings fixture with companyId and accountIds
 */
export async function createTestAPReconciliationSettings(
  companyId: number,
  accountIds: number[],
  _options?: Partial<{
    description: string;
  }>
): Promise<APReconciliationSettingsFixture> {
  const db = getDb();
  const settingKey = "ap_reconciliation_account_ids";
  const settingValue = JSON.stringify(accountIds);

  // Upsert into settings_strings
  await sql`
    INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
    VALUES (${companyId}, NULL, ${settingKey}, ${settingValue}, NOW(), NOW())
    ON DUPLICATE KEY UPDATE setting_value = ${settingValue}, updated_at = NOW()
  `.execute(db);

  return {
    companyId,
    accountIds,
  };
}

// ============================================================================
// Supplier Statement Fixtures (Epic 47.3)
// ============================================================================

export type SupplierStatementFixture = {
  id: number;
  companyId: number;
  supplierId: number;
  statementDate: string;
  closingBalance: string;
  currencyCode: string;
};

/**
 * Create a test supplier statement for Epic 47.3 (manual supplier statement entry).
 * Story linkage: 47.3 - manual supplier statement entry.
 *
 * NOTE: supplier_statements table does not exist yet. This fixture will fail until
 * a migration creates the table. Schema gap documented in Epic 47 story spec.
 *
 * @param companyId - Company ID
 * @param supplierId - Supplier ID
 * @param options - Statement options
 * @param options.statementDate - Statement date in 'YYYY-MM-DD' format
 * @param options.closingBalance - Closing balance as string decimal (e.g., '1500.00')
 * @param options.currencyCode - ISO currency code (default: 'IDR')
 * @returns Supplier statement fixture with id, companyId, supplierId, statementDate, closingBalance, currencyCode
 */
export async function createTestSupplierStatement(
  companyId: number,
  supplierId: number,
  options?: Partial<{
    statementDate: string;
    closingBalance: string;
    currencyCode: string;
  }>
): Promise<SupplierStatementFixture> {
  const db = getDb();

  // Check if supplier_statements table exists before attempting insert
  const tableCheck = await sql`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'supplier_statements'`.execute(db);
  const tableExists = Number((tableCheck.rows[0] as { cnt: number }).cnt) > 0;

  if (!tableExists) {
    throw new Error(
      "supplier_statements table does not exist. Schema gap: Story 47.3 requires a supplier_statements table " +
      "(typically: id, company_id, supplier_id, statement_date, closing_balance, currency_code). " +
      "This fixture will work once a migration creates the table."
    );
  }

  const statementDate = options?.statementDate ?? new Date().toISOString().split("T")[0];
  const closingBalance = options?.closingBalance ?? "0.00";
  const currencyCode = options?.currencyCode ?? "IDR";

  try {
    await sql`
      INSERT INTO supplier_statements (company_id, supplier_id, statement_date, closing_balance, currency_code, created_at, updated_at)
      VALUES (${companyId}, ${supplierId}, ${statementDate}, ${closingBalance}, ${currencyCode}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, company_id, supplier_id, statement_date, closing_balance, currency_code FROM supplier_statements WHERE company_id = ${companyId} AND supplier_id = ${supplierId} ORDER BY id DESC LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create supplier statement for supplier ${supplierId}`);
    }
    const row = result.rows[0] as { id: number; company_id: number; supplier_id: number; statement_date: Date; closing_balance: string; currency_code: string };
    const fixture: SupplierStatementFixture = {
      id: Number(row.id),
      companyId: Number(row.company_id),
      supplierId: Number(row.supplier_id),
      statementDate: row.statement_date instanceof Date ? row.statement_date.toISOString().split("T")[0] : String(row.statement_date),
      closingBalance: String(row.closing_balance),
      currencyCode: String(row.currency_code),
    };
    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, company_id, supplier_id, statement_date, closing_balance, currency_code FROM supplier_statements WHERE company_id = ${companyId} AND supplier_id = ${supplierId} ORDER BY id DESC LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; company_id: number; supplier_id: number; statement_date: Date; closing_balance: string; currency_code: string };
        return {
          id: Number(row.id),
          companyId: Number(row.company_id),
          supplierId: Number(row.supplier_id),
          statementDate: row.statement_date instanceof Date ? row.statement_date.toISOString().split("T")[0] : String(row.statement_date),
          closingBalance: String(row.closing_balance),
          currencyCode: String(row.currency_code),
        };
      }
    }
    throw error;
  }
}

// ============================================================================
// AP Exception Fixtures (Epic 47.4)
// ============================================================================

export type APExceptionFixture = {
  id: number;
  companyId: number;
  supplierId: number | null;
  exceptionType: "MISMATCH" | "OVER_LIMIT" | "UNRECONCILED";
  amount: string;
  currency: string;
  status: "OPEN" | "RESOLVED";
};

/**
 * Create a test AP exception for Epic 47.4 (AP exception worklist).
 * Story linkage: 47.4 - AP exception worklist.
 *
 * NOTE: ap_exceptions table does not exist yet. This fixture will fail until
 * a migration creates the table. Schema gap documented in Epic 47 story spec.
 *
 * @param companyId - Company ID
 * @param options - Exception options
 * @param options.supplierId - Optional supplier ID
 * @param options.exceptionType - Exception type: 'MISMATCH' | 'OVER_LIMIT' | 'UNRECONCILED' (default: 'UNRECONCILED')
 * @param options.amount - Amount as string decimal
 * @param options.currency - ISO currency code (default: 'IDR')
 * @param options.status - 'OPEN' | 'RESOLVED' (default: 'OPEN')
 * @returns AP exception fixture with id, companyId, exceptionType, amount, status
 */
export async function createTestAPException(
  companyId: number,
  options?: Partial<{
    supplierId: number;
    exceptionType: "MISMATCH" | "OVER_LIMIT" | "UNRECONCILED";
    amount: string;
    currency: string;
    status: "OPEN" | "RESOLVED";
  }>
): Promise<APExceptionFixture> {
  const db = getDb();

  // Check if ap_exceptions table exists before attempting insert
  const tableCheck = await sql`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'ap_exceptions'`.execute(db);
  const tableExists = Number((tableCheck.rows[0] as { cnt: number }).cnt) > 0;

  if (!tableExists) {
    throw new Error(
      "ap_exceptions table does not exist. Schema gap: Story 47.4 requires an ap_exceptions table " +
      "(typically: id, company_id, supplier_id, exception_type, amount, currency, status). " +
      "This fixture will work once a migration creates the table."
    );
  }

  const supplierId = options?.supplierId ?? null;
  const exceptionType = options?.exceptionType ?? "UNRECONCILED";
  const amount = options?.amount ?? "0.00";
  const currency = options?.currency ?? "IDR";
  const status = options?.status ?? "OPEN";

  try {
    await sql`
      INSERT INTO ap_exceptions (company_id, supplier_id, exception_type, amount, currency, status, created_at, updated_at)
      VALUES (${companyId}, ${supplierId}, ${exceptionType}, ${amount}, ${currency}, ${status}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, company_id, supplier_id, exception_type, amount, currency, status FROM ap_exceptions WHERE company_id = ${companyId} ORDER BY id DESC LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create AP exception for company ${companyId}`);
    }
    const row = result.rows[0] as { id: number; company_id: number; supplier_id: number | null; exception_type: string; amount: string; currency: string; status: string };
    const fixture: APExceptionFixture = {
      id: Number(row.id),
      companyId: Number(row.company_id),
      supplierId: row.supplier_id !== null ? Number(row.supplier_id) : null,
      exceptionType: row.exception_type as "MISMATCH" | "OVER_LIMIT" | "UNRECONCILED",
      amount: String(row.amount),
      currency: String(row.currency),
      status: row.status as "OPEN" | "RESOLVED",
    };
    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, company_id, supplier_id, exception_type, amount, currency, status FROM ap_exceptions WHERE company_id = ${companyId} ORDER BY id DESC LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; company_id: number; supplier_id: number | null; exception_type: string; amount: string; currency: string; status: string };
        return {
          id: Number(row.id),
          companyId: Number(row.company_id),
          supplierId: row.supplier_id !== null ? Number(row.supplier_id) : null,
          exceptionType: row.exception_type as "MISMATCH" | "OVER_LIMIT" | "UNRECONCILED",
          amount: String(row.amount),
          currency: String(row.currency),
          status: row.status as "OPEN" | "RESOLVED",
        };
      }
    }
    throw error;
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up all fixtures created by this test session.
 * Call this in test.after() or finally block.
 * 
 * Cleanup order matters due to FK constraints:
 * 1. Variants (depend on items)
 * 2. Items (depend on companies)
 * 3. Users (depend on companies)
 * 4. Outlets (depend on companies)
 * 5. Companies (cleanup last, or let cascade handle it)
 */
export async function cleanupTestFixtures(): Promise<void> {
  const db = getDb();

  // 0. Run registered cleanup tasks first (for side-effects not tracked in fixture registry).
  for (let i = registeredCleanupTasks.length - 1; i >= 0; i--) {
    const task = registeredCleanupTasks[i];
    try {
      await task.fn();
    } catch (error) {
      console.warn(`Failed to run registered cleanup task '${task.name}':`, error);
    }
  }
  
  // Clean up in reverse dependency order
  // Note: MySQL FK constraints should handle most cascading deletes,
  // but we explicitly delete in order to be safe and avoid orphaned records.
  
  // 1. Variants - need to delete via attribute cleanup
  for (const variant of createdFixtures.variants) {
    try {
      // Delete via item_variant_attributes (cascades to combinations)
      await sql`DELETE FROM item_variant_attributes WHERE item_id IN (SELECT id FROM items WHERE id = ${variant.item_id})`.execute(db);
    } catch (error) {
      console.warn(`Failed to cleanup variant ${variant.id}:`, error);
    }
  }
  
  // 1b. Prices (depend on items)
  for (const price of createdFixtures.prices) {
    try {
      await sql`DELETE FROM item_prices WHERE id = ${price.id}`.execute(db);
    } catch (error) {
      console.warn(`Failed to cleanup price ${price.id}:`, error);
    }
  }
  
  // 2. Items
  for (const item of createdFixtures.items) {
    try {
      await sql`DELETE FROM items WHERE id = ${item.id}`.execute(db);
    } catch (error) {
      console.warn(`Failed to cleanup item ${item.id}:`, error);
    }
  }
  
  // 3. Users (and their role assignments - should cascade)
  for (const user of createdFixtures.users) {
    try {
      await sql`DELETE FROM users WHERE id = ${user.id}`.execute(db);
    } catch (error) {
      console.warn(`Failed to cleanup user ${user.id}:`, error);
    }
  }
  
  // 4. Outlets
  for (const outlet of createdFixtures.outlets) {
    try {
      await sql`DELETE FROM outlets WHERE id = ${outlet.id}`.execute(db);
    } catch (error) {
      console.warn(`Failed to cleanup outlet ${outlet.id}:`, error);
    }
  }
  
  // 5. Companies (soft delete via deleted_at)
  for (const company of createdFixtures.companies) {
    try {
      await sql`UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${company.id}`.execute(db);
    } catch (error) {
      console.warn(`Failed to cleanup company ${company.id}:`, error);
    }
  }
  
  // Reset the registry
  createdFixtures.companies = [];
  createdFixtures.outlets = [];
  createdFixtures.users = [];
  createdFixtures.items = [];
  createdFixtures.variants = [];
  registeredCleanupTasks.length = 0;
  seedSyncContextCache.clear();
  seedSyncContextInFlight.clear();
  tokenCache.clear();
  tokenInFlight.clear();
}

/**
 * Reset the fixture registry without actually deleting records.
 * Use this when you want to skip cleanup (e.g., let a test that succeeded cascade delete).
 */
export function resetFixtureRegistry(): void {
  createdFixtures.companies = [];
  createdFixtures.outlets = [];
  createdFixtures.users = [];
  createdFixtures.items = [];
  createdFixtures.variants = [];
  registeredCleanupTasks.length = 0;
}

// ============================================================================
// Convenience Factory Functions
// ============================================================================

/**
 * Create a complete test fixture set: company, outlet, and admin user.
 * This is the most common setup for integration tests.
 * 
 * @param options - Partial options for any of the fixtures
 * @returns Object with company, outlet, and user fixtures
 */
export async function createTestFixtureSet(options?: {
  company?: Partial<{ code: string; name: string; timezone: string; currency_code: string }>;
  outlet?: Partial<{ code: string; name: string; timezone: string }>;
  user?: Partial<{ email: string; name: string; password: string }>;
}): Promise<{
  company: CompanyFixture;
  outlet: OutletFixture;
  user: UserFixture;
}> {
  const company = await createTestCompanyMinimal(options?.company);
  const outlet = await createTestOutletMinimal(company.id, options?.outlet);
  const user = await createTestUser(company.id, options?.user);
  
  return { company, outlet, user };
}

/**
 * Create a fixture set with company, outlet, user, item, and variant.
 * Use this for tests that need the full stack.
 * 
 * @param options - Partial options for any of the fixtures
 * @returns Object with all fixtures
 */
export async function createFullTestFixtureSet(options?: {
  company?: Partial<{ code: string; name: string; timezone: string; currency_code: string }>;
  outlet?: Partial<{ code: string; name: string; timezone: string }>;
  user?: Partial<{ email: string; name: string; password: string }>;
  item?: Partial<{ sku: string; name: string; type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE" }>;
  variant?: Partial<{ attributeName: string; attributeValues: string[] }>;
}): Promise<{
  company: CompanyFixture;
  outlet: OutletFixture;
  user: UserFixture;
  item: ItemFixture;
  variant: VariantFixture;
}> {
  const company = await createTestCompanyMinimal(options?.company);
  const outlet = await createTestOutletMinimal(company.id, options?.outlet);
  const user = await createTestUser(company.id, options?.user);
  const item = await createTestItem(company.id, options?.item);
  const variant = await createTestVariant(item.id, options?.variant);
  
  return { company, outlet, user, item, variant };
}

// ============================================================================
// Permission Fixtures
// ============================================================================

/**
 * Get a role ID by its code (e.g., 'OWNER', 'ADMIN', 'CASHIER').
 * These are system-wide roles available in all companies.
 * 
 * @param roleCode - Role code to look up
 * @returns Role ID
 */
export async function getRoleIdByCode(roleCode: string): Promise<number> {
  const db = getDb();
  const result = await sql`SELECT id FROM roles WHERE code = ${roleCode} LIMIT 1`.execute(db);
  if (result.rows.length === 0) {
    throw new Error(`Role '${roleCode}' not found in database`);
  }
  const row = result.rows[0] as { id: number };
  return Number(row.id);
}

/**
 * Assign a global role to a user (outlet_id = NULL).
 * Use this for setting up test users with specific roles.
 * 
 * @param userId - User ID
 * @param roleId - Role ID
 */
export async function assignUserGlobalRole(
  userId: number,
  roleId: number
): Promise<void> {
  const db = getDb();
  // Get company_id from the user
  const userResult = await sql`SELECT company_id FROM users WHERE id = ${userId} LIMIT 1`.execute(db);
  if (userResult.rows.length === 0) {
    throw new Error(`User ${userId} not found`);
  }
  const companyId = Number((userResult.rows[0] as { company_id: number }).company_id);
  // Use INSERT IGNORE for idempotency in tests
  await sql`INSERT IGNORE INTO user_role_assignments (company_id, user_id, role_id, outlet_id) VALUES (${companyId}, ${userId}, ${roleId}, NULL)`.execute(db);
}

/**
 * Assign an outlet-scoped role to a user.
 * Use this for setting up test users with outlet-specific roles.
 * 
 * @param userId - User ID
 * @param roleId - Role ID
 * @param outletId - Outlet ID
 */
export async function assignUserOutletRole(
  userId: number,
  roleId: number,
  outletId: number
): Promise<void> {
  const db = getDb();
  // Get company_id from the outlet
  const outletResult = await sql`SELECT company_id FROM outlets WHERE id = ${outletId} LIMIT 1`.execute(db);
  if (outletResult.rows.length === 0) {
    throw new Error(`Outlet ${outletId} not found`);
  }
  const companyId = Number((outletResult.rows[0] as { company_id: number }).company_id);
  // Use INSERT IGNORE for idempotency in tests
  await sql`INSERT IGNORE INTO user_role_assignments (company_id, user_id, role_id, outlet_id) VALUES (${companyId}, ${userId}, ${roleId}, ${outletId})`.execute(db);
}

/**
 * Set resource-level permissions for a role in a company.
 * Use this for setting up test data with specific permission masks.
 * 
 * @param companyId - Company ID
 * @param roleId - Role ID
 * @param module - Module name (e.g., 'inventory', 'sales')
 * @param resource - Resource name (e.g., 'items', 'journals')
 * @param permissionMask - Permission mask (use MODULE_PERMISSION_BITS or buildPermissionMask)
 * @param options - Optional settings
 * @param options.allowSystemRoleMutation - Allow mutation of canonical system roles (default: false)
 */
export async function setModulePermission(
  companyId: number,
  roleId: number,
  module: string,
  resource: string,
  permissionMask: number,
  options?: { allowSystemRoleMutation?: boolean }
): Promise<void> {
  const db = getDb();

  // Reject missing/empty resource
  if (!resource || typeof resource !== 'string' || resource.trim() === '') {
    throw new Error(
      `setModulePermission: resource must be a non-empty string. ` +
      `Got: ${JSON.stringify(resource)}`
    );
  }

  const trimmedResource = resource.trim();

  // Guardrail: prevent mutation of canonical system roles in integration tests.
  // Tests should use custom roles for ACL mutation scenarios.
  if (!options?.allowSystemRoleMutation) {
    const roleResult = await sql`SELECT code, company_id FROM roles WHERE id = ${roleId} LIMIT 1`.execute(db);
    if (roleResult.rows.length > 0) {
      const roleRow = roleResult.rows[0] as { code: string; company_id: number | null };
      const CANONICAL_SYSTEM_ROLE_CODES = ['SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER'] as const;
      if (CANONICAL_SYSTEM_ROLE_CODES.includes(roleRow.code as typeof CANONICAL_SYSTEM_ROLE_CODES[number])) {
        throw new Error(
          `REFUSE to mutate canonical system role '${roleRow.code}'. ` +
          `This function cannot modify module_roles rows for system roles ` +
          `(SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT, CASHIER). ` +
          `Use a custom test role instead, or pass { allowSystemRoleMutation: true } to override.`
        );
      }
    }
  }

  // Use INSERT ... ON DUPLICATE KEY UPDATE for idempotency in tests
  await sql`INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask) VALUES (${companyId}, ${roleId}, ${module}, ${trimmedResource}, ${permissionMask}) ON DUPLICATE KEY UPDATE permission_mask = ${permissionMask}`.execute(db);
}

/**
 * Create a complete permission setup for testing canManageCompanyDefaults.
 * This combines: get role ID, assign role to user, set module permission.
 * 
 * @param params - Permission setup parameters
 * @returns void
 */
export async function setupUserPermission(params: {
  userId: number;
  companyId: number;
  roleCode: string;
  module: string;
  resource: string;
  permission: ModulePermission | "all";
  isGlobal?: boolean;
  outletId?: number;
}): Promise<void> {
  const roleId = await getRoleIdByCode(params.roleCode);
  
  if (params.isGlobal === false && params.outletId) {
    await assignUserOutletRole(params.userId, roleId, params.outletId);
  } else {
    await assignUserGlobalRole(params.userId, roleId);
  }
  
  const mask = params.permission === "all" 
    ? buildPermissionMask({ canCreate: true, canRead: true, canUpdate: true, canDelete: true })
    : MODULE_PERMISSION_BITS[params.permission];
  
  await setModulePermission(params.companyId, roleId, params.module, params.resource, mask);
}

export type SeedSyncContext = {
  companyId: number;
  outletId: number;
  cashierUserId: number;
};

const seedSyncContextCache = new Map<string, SeedSyncContext>();
const seedSyncContextInFlight = new Map<string, Promise<SeedSyncContext>>();

/**
 * Resolve seeded sync context and reuse an existing cashier when available.
 * Falls back to deterministic cashier creation per company when not found.
 */
export async function getSeedSyncContext(options?: {
  companyCode?: string;
  outletCode?: string;
}): Promise<SeedSyncContext> {
  const companyCode = options?.companyCode ?? process.env.JP_COMPANY_CODE;
  const outletCode = options?.outletCode ?? process.env.JP_OUTLET_CODE ?? "MAIN";

  if (!companyCode) {
    throw new Error("JP_COMPANY_CODE must be set for sync integration tests");
  }

  const cacheKey = `${companyCode}:${outletCode}`;
  const cached = seedSyncContextCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = seedSyncContextInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const resolvePromise = (async () => {
    const db = getDb();
    const companyOutlet = await db
      .selectFrom("companies as c")
      .innerJoin("outlets as o", "o.company_id", "c.id")
      .select(["c.id as company_id", "o.id as outlet_id"])
      .where("c.code", "=", companyCode)
      .where("o.code", "=", outletCode)
      .executeTakeFirst();

    if (!companyOutlet) {
      throw new Error(
        `Seed company/outlet not found for JP_COMPANY_CODE=${companyCode}, JP_OUTLET_CODE=${outletCode}`
      );
    }

    const companyId = Number(companyOutlet.company_id);
    const outletId = Number(companyOutlet.outlet_id);

    const existingCashier = await db
      .selectFrom("users as u")
      .innerJoin("user_role_assignments as ura", "ura.user_id", "u.id")
      .innerJoin("roles as r", "r.id", "ura.role_id")
      .select("u.id as user_id")
      .where("u.company_id", "=", companyId)
      .where("u.is_active", "=", 1)
      .where((eb) => eb.or([eb("r.code", "=", "CASHIER"), eb("r.name", "like", "%cashier%")]))
      .orderBy("u.id", "asc")
      .executeTakeFirst();

    if (existingCashier) {
      const resolved = {
        companyId,
        outletId,
        cashierUserId: Number(existingCashier.user_id)
      };
      seedSyncContextCache.set(cacheKey, resolved);
      return resolved;
    }

    const cashier = await createTestUser(companyId, {
      email: `sync-test-cashier+${companyId}@example.com`,
      name: "Sync Test Cashier"
    });

    // Keep this deterministic sync cashier reusable across test files.
    // It should not be removed by cleanupTestFixtures(), otherwise each file
    // will recreate it and we lose cross-suite reuse.
    createdFixtures.users = createdFixtures.users.filter((u) => u.id !== cashier.id);

    // Only assign CASHIER role. Do not mutate module_roles here,
    // because this helper is used broadly across integration tests.
    const cashierRoleId = await getRoleIdByCode("CASHIER");
    await assignUserGlobalRole(cashier.id, cashierRoleId);

    const resolved = {
      companyId,
      outletId,
      cashierUserId: cashier.id
    };
    seedSyncContextCache.set(cacheKey, resolved);
    return resolved;
  })();

  seedSyncContextInFlight.set(cacheKey, resolvePromise);
  try {
    return await resolvePromise;
  } finally {
    seedSyncContextInFlight.delete(cacheKey);
  }
}

/**
 * Get or create a CASHIER user for permission testing.
 * Uses a deterministic email to avoid flooding the database.
 * CASHIER has platform.users = 0 (no permission).
 * 
 * @param companyId - Company ID
 * @param companyCode - Company code for login
 * @param baseUrl - Base URL of the test server
 * @param password - Password for the user (default: test password)
 * @returns Object with user fixture and access token
 */
export async function getOrCreateTestCashierForPermission(
  companyId: number,
  companyCode: string,
  baseUrl: string,
  password: string = "TestCashier123!"
): Promise<{ user: UserFixture; accessToken: string }> {
  const db = getDb();
  const email = `perm-test-cashier+${companyId}@example.com`;
  const cashierRoleId = await getRoleIdByCode("CASHIER");

  // Check if user already exists
  const existing = await db
    .selectFrom("users as u")
    .innerJoin("user_role_assignments as ura", "ura.user_id", "u.id")
    .select(["u.id", "u.company_id", "u.email"])
    .where("u.email", "=", email.toLowerCase())
    .where("ura.role_id", "=", cashierRoleId)
    .executeTakeFirst();

  if (existing) {
    const user: UserFixture = {
      id: Number(existing.id),
      company_id: Number(existing.company_id),
      email: existing.email
    };
    let token: string;
    try {
      // Get token via login
      token = await loginForTest(baseUrl, companyCode, email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isInvalidCredentials =
        message.includes("Failed to login: 401") || message.includes("INVALID_CREDENTIALS");

      if (!isInvalidCredentials) {
        throw error;
      }

      // Existing deterministic user may have stale/unknown password from prior runs.
      // Reset to requested password, then force-refresh login once.
      await resetUserPasswordForTests(user.id, password);
      token = await loginForTest(baseUrl, companyCode, email, password, { forceRefresh: true });
    }

    return { user, accessToken: token };
  }

  // Create new CASHIER user
  const cashier = await createTestUser(companyId, {
    email,
    name: "Permission Test Cashier",
    password
  });

  // Assign CASHIER role
  await assignUserGlobalRole(cashier.id, cashierRoleId);

  // Don't track this user for cleanup - it's reusable
  createdFixtures.users = createdFixtures.users.filter((u) => u.id !== cashier.id);

  // Get token via login
  const token = await loginForTest(baseUrl, companyCode, email, password);

  return { user: cashier, accessToken: token };
}

/**
 * Login and get access token for any user.
 * 
 * @param baseUrl - The base URL of the test server
 * @param companyCode - Company code
 * @param email - User email
 * @param password - User password
 * @returns Access token string
 */
export async function loginForTest(
  baseUrl: string,
  companyCode: string,
  email: string,
  password: string,
  options?: { forceRefresh?: boolean; verifyCachedToken?: boolean }
): Promise<string> {
  const cacheKey = buildTokenCacheKey(baseUrl, companyCode, email, password);
  const verifyCachedToken = options?.verifyCachedToken ?? true;
  if (options?.forceRefresh !== true) {
    const cached = tokenCache.get(cacheKey);
    if (cached) {
      if (!verifyCachedToken) {
        return cached;
      }

      const stillValid = await isTokenStillValid(baseUrl, cached);
      if (stillValid) {
        return cached;
      }

      // Obsolete token: remove and continue to one-time relogin below.
      tokenCache.delete(cacheKey);
    }

    const inFlight = tokenInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const loginPromise = requestLoginToken(baseUrl, companyCode, email, password)
    .then((token) => {
      tokenCache.set(cacheKey, token);
      return token;
    })
    .finally(() => {
      tokenInFlight.delete(cacheKey);
    });

  tokenInFlight.set(cacheKey, loginPromise);
  return loginPromise;
}

// ============================================================================
// Role Creation Helpers
// ============================================================================

/**
 * Create a test role via API.
 * Uses a unique code based on timestamp to avoid conflicts.
 * 
 * @param baseUrl - The base URL of the test server
 * @param accessToken - Valid access token for authentication
 * @param name - Role name (code will be generated from this)
 * @returns Object with role ID
 */
export async function createTestRole(
  baseUrl: string,
  accessToken: string,
  name: string = "Test Role"
): Promise<{ id: number; code: string }> {
  const timestamp = Date.now();
  const code = `TEST_ROLE_${timestamp}`;

  const res = await fetch(`${baseUrl}/api/roles`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code,
      name: `${name} ${timestamp}`,
      role_level: 0
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to create test role: ${res.status} ${errorBody}`);
  }

  const data = await res.json();
  return { id: data.data.id, code };
}

// ============================================================================
// Authentication Helpers
// ============================================================================

/**
 * Get an access token for testing.
 * Uses the default test credentials from environment variables.
 * 
 * @param baseUrl - The base URL of the test server (must be running)
 * @returns Access token string
 * @throws Error if login fails
 */
export async function getTestAccessToken(baseUrl: string): Promise<string> {
  const companyCode = process.env.JP_COMPANY_CODE;
  const email = process.env.JP_OWNER_EMAIL;
  const password = process.env.JP_OWNER_PASSWORD;

  if (!companyCode || !email || !password) {
    throw new Error("Test credentials not configured: JP_COMPANY_CODE, JP_OWNER_EMAIL, JP_OWNER_PASSWORD must be set");
  }
  
  return loginForTest(baseUrl, companyCode, email, password);
}
