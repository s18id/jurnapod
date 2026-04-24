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
import { createCompanyBasic, createCompany, CompanyCodeExistsError } from "./companies";
import { createOutletBasic, OutletCodeExistsError } from "./outlets";
import { createUserBasic, UserEmailExistsError } from "./users";
import { createItem } from "./items/index.js";
import { itemPricesAdapter } from "./item-prices/adapter.js";
import { DatabaseConflictError } from "./master-data-errors.js";
import { createVariantAttribute } from "./item-variants";
import { adjustStock } from "./stock.js";
import { MODULE_PERMISSION_BITS, buildPermissionMask, type ModulePermission } from "@jurnapod/auth";
import {
  ensureSalesOutletMappings,
  ensurePaymentVarianceMappings
} from "@jurnapod/modules-accounting";


// ============================================================================
// Deterministic Run ID Helper
// ============================================================================

/**
 * Module-level counter for deterministic run-id generation.
 * Initialized from Date.now() at module load, then increments per call.
 * Ensures uniqueness within a test run without Math.random().
 */
let _runIdCounter = Date.now() & 0xFFFFFF; // 24-bit slice to keep numeric stable
function nextRunIdCounter(): number {
  return ++_runIdCounter;
}

/**
 * Generate a deterministic run-id suffix for fixture codes.
 * Format: base36-encoded counter — reproducible across test runs
 * within the same process, unique across different processes.
 *
 * NOT cryptographically random — do NOT use for security-sensitive values.
 * Intended ONLY for test fixture code/name generation.
 */
function makeRunId(): string {
  return nextRunIdCounter().toString(36);
}

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

/**
 * Create a test company with NULL timezone — for tests validating
 * fail-closed behavior when no outlet/company timezone is configured.
 *
 * Canonical helper so test files avoid ad-hoc SQL UPDATE that nullifies
 * timezone after company creation.
 *
 * @param options - Partial company options (timezone must NOT be set here)
 * @returns Company fixture with id, code, name, and null timezone
 */
export async function createTestCompanyWithoutTimezone(
  options?: Partial<{
    code: string;
    name: string;
    currency_code: string;
  }>
): Promise<CompanyFixture> {
  const db = getDb();
  const runId = makeRunId();

  const code = options?.code ?? `TEST-CO-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Company ${runId}`;

  try {
    // Insert company row directly with explicit NULL timezone.
    // No timezone: triggers the no-UTC-fallback code path in AP reconciliation.
    await sql`
      INSERT INTO companies (code, name, timezone, currency_code, created_at, updated_at)
      VALUES (${code}, ${name}, NULL, ${options?.currency_code ?? "IDR"}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, code, name, timezone FROM companies WHERE code = ${code} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create company without timezone: ${code}`);
    }
    const row = result.rows[0] as { id: number; code: string; name: string; timezone: string | null };
    const company: CompanyFixture = {
      id: Number(row.id),
      code: row.code,
      name: row.name,
    };
    createdFixtures.companies.push(company);
    return company;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, code, name, timezone FROM companies WHERE code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; code: string; name: string; timezone: string | null };
        return {
          id: Number(row.id),
          code: row.code,
          name: row.name,
        };
      }
    }
    throw error;
  }
}

/**
 * Create a test outlet with NULL timezone for a given company.
 * Use with createTestCompanyWithoutTimezone() to produce a company+outlet
 * pair that triggers the no-UTC-fallback error path.
 *
 * @param companyId - Parent company ID
 * @param options - Partial outlet options (timezone must NOT be set here)
 * @returns Outlet fixture with id, company_id, code, name, and null timezone
 */
export async function createTestOutletWithoutTimezone(
  companyId: number,
  options?: Partial<{
    code: string;
    name: string;
  }>
): Promise<OutletFixture> {
  const db = getDb();
  const runId = makeRunId();

  const code = options?.code ?? `TEST-OL-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Outlet ${runId}`;

  try {
    // Insert outlet row directly with explicit NULL timezone.
    await sql`
      INSERT INTO outlets (company_id, code, name, timezone, created_at, updated_at)
      VALUES (${companyId}, ${code}, ${name}, NULL, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, company_id, code, name, timezone FROM outlets WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create outlet without timezone for company ${companyId}`);
    }
    const row = result.rows[0] as { id: number; company_id: number; code: string; name: string; timezone: string | null };
    const outlet: OutletFixture = {
      id: Number(row.id),
      company_id: Number(row.company_id),
      code: row.code,
      name: row.name,
    };
    createdFixtures.outlets.push(outlet);
    return outlet;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, company_id, code, name, timezone FROM outlets WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; company_id: number; code: string; name: string; timezone: string | null };
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
 * PARTIAL FIXTURE MODE — EXCEPTION: This is a partial fixture path that only creates
 * the company row without full bootstrap. Use only when:
 * 1. Tests need a company FK reference without ACL/module_roles
 * 2. The test will manually add required setup
 * 3. A full bootstrap is too heavy for the test scenario
 *
 * RATIONALE FOR EXCEPTION: Company bootstrap (ensureRoles/ensureModules/ensureSettings/
 * ensureCompanyModuleRoles) is owned by @jurnapod/modules-platform. However, since
 * createTestCompany() now uses the full production path via createCompany(), tests
 * that need the full fixture should use createTestCompany() instead.
 *
 * This partial path is retained for backward compatibility and for tests that specifically
 * need a lightweight company without any bootstrap side effects.
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
  const runId = makeRunId();

  const code = options?.code ?? `TEST-CO-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Company ${runId}`;

  try {
    const company = await createCompanyBasic({
      code,
      name,
      timezone: options?.timezone ?? "Asia/Jakarta",
      currency_code: options?.currency_code ?? "IDR"
    });

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
 * Create a test company using FULL production company creation path.
 *
 * This function delegates to `createCompany()` from "./companies" which performs
 * full bootstrap including:
 * - Default MAIN outlet creation
 * - System role seeding (via ensureRoles)
 * - Module seeding (via ensureModules)
 * - Default settings (via ensureSettings)
 * - Default tax rate (via ensureDefaultTaxRate)
 * - Company module configs (via ensureCompanyModules)
 * - Module role permissions (via ensureCompanyModuleRoles) — ACL seed for all modules
 * - System accounts (via ensureSystemAccounts)
 *
 * Use this when tests need a fully bootstrapped company with proper ACL/module_roles.
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
  const db = getDb();
  const runId = makeRunId();

  const code = options?.code ?? `TEST-CO-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test Company ${runId}`;

  try {
    // Use production createCompany() path for full bootstrap.
    // Test actor: use a system placeholder userId (1) since audit is not required for test fixtures.
    // This actor satisfies the CompanyActor type requirement without needing a real user.
    const TEST_ACTOR = { userId: 1, outletId: null, ipAddress: null };

    const company = await createCompany({
      code,
      name,
      timezone: options?.timezone ?? "Asia/Jakarta",
      currency_code: options?.currency_code ?? "IDR",
      actor: TEST_ACTOR,
    });

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

// ============================================================================
// Outlet Fixtures
// ============================================================================

/**
 * Create a test outlet with PARTIAL (row-only) creation path.
 *
 * PARTIAL FIXTURE MODE — EXCEPTION: No package-level service exists for full outlet
 * creation with audit logging. This partial path creates only the row.
 *
 * TODO (Q49-001-Gate-B): When @jurnapod/modules-platform exports a createOutlet service,
 * update createTestOutlet to delegate to it for full bootstrap (audit, default settings).
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
  const runId = makeRunId();

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
 * TODO (Q49-001-Gate-B): When @jurnapod/modules-platform exports a createOutlet service,
 * update this function to delegate to it for full bootstrap.
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
  // TODO (Q49-001-Gate-B): Delegate to package-level createOutlet service
  // when available, instead of using createTestOutletMinimal.
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
  const runId = makeRunId();
  
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
  const runId = makeRunId();

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
  const runId = makeRunId();

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
  const apAccountId = Number((apResult as { insertId?: number }).insertId ?? 0);

  // Create Expense account
  const expenseAccountCode = `TEST-EXP-${runId}`.slice(0, 20);
  const expenseAccountName = options?.expenseAccountName ?? `Test Expense Account ${runId}`;

  const expenseResult = await sql`
    INSERT INTO accounts (company_id, code, name, type_name, is_active, is_payable, created_at, updated_at)
    VALUES (${companyId}, ${expenseAccountCode}, ${expenseAccountName}, 'EXPENSE', 1, 0, NOW(), NOW())
  `.execute(db);
  const expenseAccountId = Number((expenseResult as { insertId?: number }).insertId ?? 0);

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
 * Create canonical fiscal-close fixture data for integration tests:
 * - Retained earnings-like account (name contains "Retained")
 * - P&L account with non-zero current balance (ensures closing entries are generated)
 *
 * This helper prevents ad-hoc SQL setup from being duplicated across test suites.
 */
export async function createTestFiscalCloseBalanceFixture(
  companyId: number,
  options?: Partial<{
    retainedEarningsName: string;
    plAccountName: string;
    plBalance: string;
    plNormalBalance: "D" | "K";
    asOfDate: string;
  }>
): Promise<{ retained_earnings_account_id: number; pl_account_id: number }> {
  const db = getDb();
  const runId = makeRunId();

  const retainedEarningsName = options?.retainedEarningsName ?? `Retained Earnings ${runId}`;
  const retainedCode = `TEST-RE-${runId}`.slice(0, 20).toUpperCase();
  const retainedInsert = await sql`
    INSERT INTO accounts (
      company_id,
      code,
      name,
      type_name,
      is_active,
      is_payable,
      report_group,
      normal_balance,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      ${retainedCode},
      ${retainedEarningsName},
      'EQUITY',
      1,
      0,
      'EQ',
      'K',
      NOW(),
      NOW()
    )
  `.execute(db);

  const retainedEarningsAccountId = Number((retainedInsert as { insertId?: number }).insertId ?? 0);
  if (!retainedEarningsAccountId) {
    throw new Error("Failed to create retained earnings account for fiscal close fixture");
  }

  const plCode = `TEST-PL-${runId}`.slice(0, 20).toUpperCase();
  const plAccountName = options?.plAccountName ?? `Test Revenue ${runId}`;
  const plNormalBalance = options?.plNormalBalance ?? "K";
  const plBalance = options?.plBalance ?? "100.0000";
  const asOfDate = options?.asOfDate ?? "2099-12-31";
  const fixtureDocId = Number((Date.now() % 2_000_000_000) + (_runIdCounter % 1000));

  // Offset account for balanced fixture journal entry.
  const offsetCode = `TEST-OFF-${runId}`.slice(0, 20).toUpperCase();
  const offsetInsert = await sql`
    INSERT INTO accounts (
      company_id,
      code,
      name,
      type_name,
      is_active,
      is_payable,
      report_group,
      normal_balance,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      ${offsetCode},
      ${`Test Offset ${runId}`},
      'ASSET',
      1,
      0,
      'BS',
      'D',
      NOW(),
      NOW()
    )
  `.execute(db);

  const offsetAccountId = Number((offsetInsert as { insertId?: number }).insertId ?? 0);
  if (!offsetAccountId) {
    throw new Error("Failed to create offset account for fiscal close fixture");
  }

  const plAccountInsert = await sql`
    INSERT INTO accounts (
      company_id,
      code,
      name,
      type_name,
      is_active,
      is_payable,
      report_group,
      normal_balance,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      ${plCode},
      ${plAccountName},
      'REVENUE',
      1,
      0,
      'PL',
      ${plNormalBalance},
      NOW(),
      NOW()
    )
  `.execute(db);

  const plAccountId = Number((plAccountInsert as { insertId?: number }).insertId ?? 0);
  if (!plAccountId) {
    throw new Error("Failed to create test P&L account for fiscal close fixture");
  }

  // Seed a balanced manual journal entry in the fiscal-year window.
  // This ensures close preview derives non-zero PL balances from journal_lines.
  const journalBatchInsert = await sql`
    INSERT INTO journal_batches (
      company_id,
      outlet_id,
      doc_type,
      doc_id,
      posted_at,
      client_ref,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      NULL,
      'MANUAL',
      ${fixtureDocId},
      ${asOfDate},
      ${`FIXTURE-FY-CLOSE-${runId}`},
      NOW(),
      NOW()
    )
  `.execute(db);

  const journalBatchId = Number((journalBatchInsert as { insertId?: number }).insertId ?? 0);
  if (!journalBatchId) {
    throw new Error("Failed to create fixture journal batch for fiscal close fixture");
  }

  const debitAccountId = plNormalBalance === "D" ? plAccountId : offsetAccountId;
  const creditAccountId = plNormalBalance === "D" ? offsetAccountId : plAccountId;

  await sql`
    INSERT INTO journal_lines (
      company_id,
      outlet_id,
      journal_batch_id,
      account_id,
      line_date,
      debit,
      credit,
      description,
      created_at,
      updated_at
    )
    VALUES (
      ${companyId},
      NULL,
      ${journalBatchId},
      ${debitAccountId},
      ${asOfDate},
      ${plBalance},
      '0.0000',
      'Fiscal close fixture debit line',
      NOW(),
      NOW()
    ),
    (
      ${companyId},
      NULL,
      ${journalBatchId},
      ${creditAccountId},
      ${asOfDate},
      '0.0000',
      ${plBalance},
      'Fiscal close fixture credit line',
      NOW(),
      NOW()
    )
  `.execute(db);

  return {
    retained_earnings_account_id: retainedEarningsAccountId,
    pl_account_id: plAccountId,
  };
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
 * Create a test BANK/CASH account for payment target scenarios.
 * Use for sales payment disbursements and general cash/bank account fixtures.
 */
export async function createTestBankAccount(
  companyId: number,
  options?: Partial<{
    code: string;
    name: string;
    typeName: "BANK" | "CASH";
    isActive: boolean;
    isPayable: boolean;
  }>
): Promise<number> {
  const db = getDb();
  const runId = makeRunId();
  const code = options?.code ?? `TEST-BA-${runId}`.slice(0, 20).toUpperCase();
  const name = options?.name ?? `Test ${options?.typeName ?? "BANK"} Account ${runId}`;

  const result = await sql`
    INSERT INTO accounts (company_id, code, name, type_name, is_active, is_payable, created_at, updated_at)
    VALUES (${companyId}, ${code}, ${name}, ${options?.typeName ?? "BANK"}, ${options?.isActive ?? true ? 1 : 0}, ${options?.isPayable ?? false ? 1 : 0}, NOW(), NOW())
  `.execute(db);

  const accountId = Number((result as { insertId?: number }).insertId ?? 0);
  if (!accountId) {
    throw new Error("Failed to create test bank account");
  }
  return accountId;
}

/**
 * Update supplier active status for tests that validate posting safeguards.
 */
export async function setTestSupplierActive(
  companyId: number,
  supplierId: number,
  isActive: boolean
): Promise<void> {
  const db = getDb();
  await sql`
    UPDATE suppliers
    SET is_active = ${isActive ? 1 : 0}, updated_at = NOW()
    WHERE id = ${supplierId} AND company_id = ${companyId}
  `.execute(db);
}

/**
 * Update bank/cash account active status for payment posting tests.
 */
export async function setTestBankAccountActive(
  companyId: number,
  accountId: number,
  isActive: boolean
): Promise<void> {
  const db = getDb();
  await sql`
    UPDATE accounts
    SET is_active = ${isActive ? 1 : 0}, updated_at = NOW()
    WHERE id = ${accountId} AND company_id = ${companyId}
  `.execute(db);
}

/**
 * Override purchasing default AP account id for AP posting validation tests.
 */
export async function setTestPurchasingDefaultApAccount(
  companyId: number,
  accountId: number
): Promise<void> {
  const db = getDb();
  await sql`
    UPDATE company_modules cm
    INNER JOIN modules m ON m.id = cm.module_id
    SET cm.purchasing_default_ap_account_id = ${accountId}, cm.updated_at = NOW()
    WHERE cm.company_id = ${companyId}
      AND m.code = 'purchasing'
  `.execute(db);
}

// ============================================================================
// Sales Account Mapping Fixtures
// ============================================================================

/**
 * Ensure AR and SALES_REVENUE account mappings exist for an outlet.
 *
 * This is the canonical fixture for sales payment posting tests that need
 * outlet-scoped account mappings resolved during /post.
 *
 * Behavior:
 * 1) Reuse existing system accounts for the company (AR, SALES) if present
 * 2) If not present, create deterministic test accounts via fixture-safe SQL
 * 3) Upsert account_mappings rows for keys AR and SALES_REVENUE scoped to outlet
 *
 * Uses ACCOUNT_MAPPING_TYPE_ID_BY_CODE from @jurnapod/shared for type IDs.
 * Strict tenant/outlet scoping maintained throughout.
 */
export async function ensureTestSalesAccountMappings(
  companyId: number,
  outletId: number
): Promise<{ ar_account_id: number; sales_revenue_account_id: number }> {
  const db = getDb();

  const result = await ensureSalesOutletMappings(db, {
    companyId,
    outletId
  });

  return {
    ar_account_id: result.arAccountId,
    sales_revenue_account_id: result.salesRevenueAccountId
  };
}

/**
 * Ensure PAYMENT_VARIANCE_GAIN and PAYMENT_VARIANCE_LOSS account mappings exist
 * for a company (company-level mapping, outlet_id = NULL).
 */
export async function ensureTestPaymentVarianceMappings(
  companyId: number
): Promise<{ gain_account_id: number; loss_account_id: number }> {
  const db = getDb();

  const result = await ensurePaymentVarianceMappings(db, {
    companyId
  });

  return {
    gain_account_id: result.gainAccountId,
    loss_account_id: result.lossAccountId
  };
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
  const runId = makeRunId();

  // Always append a unique suffix to SKU to prevent cross-test pollution.
  // Even when caller provides an explicit SKU, append a run-unique suffix
  // so that each test gets its own item with isolated stock.
  const sku = options?.sku
    ? `${options.sku}-${runId}`.slice(0, 30)
    : `TEST-SKU-${runId}`.slice(0, 30);
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
 * Idempotent: if an active price already exists for the same item+outlet+variant
 * combination, returns the existing price instead of creating a duplicate.
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
  const db = getDb();
  const outletId = options?.outletId ?? null;
  const variantId = options?.variantId ?? null;
  const priceValue = options?.price ?? 10000;
  const isActive = options?.isActive ?? true;

  // Idempotent check: find existing price for same item+outlet+variant
  const existing = await sql`
    SELECT id, item_id, outlet_id, variant_id, price, is_active
    FROM item_prices
    WHERE item_id = ${itemId}
      AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
      AND variant_id ${variantId === null ? sql`IS NULL` : sql`= ${variantId}`}
    LIMIT 1
  `.execute(db);

  if (existing.rows.length > 0) {
    const row = existing.rows[0] as { id: number; item_id: number; outlet_id: number | null; variant_id: number | null; price: string; is_active: number };
    const fixture: PriceFixture = {
      id: Number(row.id),
      item_id: Number(row.item_id),
      outlet_id: row.outlet_id !== null ? Number(row.outlet_id) : null,
      variant_id: row.variant_id !== null ? Number(row.variant_id) : null,
      price: Number(row.price),
      is_active: Boolean(row.is_active),
    };
    // Track existing price to prevent orphaned cleanup
    createdFixtures.prices.push(fixture);
    return fixture;
  }

  // Create new price via canonical path
  const actor = { userId, canManageCompanyDefaults: true };

  const price = await itemPricesAdapter.createItemPrice(companyId, {
    item_id: itemId,
    outlet_id: outletId,
    variant_id: variantId,
    price: priceValue,
    is_active: isActive,
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
 * Create a test inventory_stock record for variant-level stock.
 *
 * PARTIAL FIXTURE MODE — EXCEPTION: This helper uses raw SQL INSERT for
 * inventory_stock because no canonical @jurnapod/modules-inventory service
 * exists for test-only fixture creation with variant_id scope.
 *
 * SCOPE: Variant-level stock only (not product-level). For product-level
 * stock, use createTestStock() which delegates to adjustStock.
 *
 * RATIONALE FOR EXCEPTION: The production stock domain lives in
 * @jurnapod/modules-inventory which does not expose a test-only fixture path.
 * Retaining raw SQL here is the pragmatic trade-off for Q49-001 fixture policy
 * compliance. This scope is narrow (inventory_stock INSERT only) and bounded
 * (variant_id + outlet_id + company_id composite key).
 *
 * OWNER: @jurnapod/modules-inventory (owns the inventory_stock domain invariant)
 *
 * Idempotent: If a row already exists for the same company_id+variant_id+outlet_id
 * composite key, updates the quantity instead of creating a duplicate.
 *
 * Used for POS cart-validate tests that need to verify stock availability
 * from the inventory_stock.available_quantity column (not item_variants.stock_quantity).
 *
 * @param companyId   - Tenant ID
 * @param itemId     - Item/product ID
 * @param variantId  - Variant ID (required — distinguishes from product-level stock)
 * @param outletId   - Outlet ID (use null for company-level stock)
 * @param quantity   - Quantity to set (maps to quantity, reserved_quantity, available_quantity)
 * @param options    - Partial options
 * @param options.reservedQuantity - Reserved quantity (default: 0)
 */
export async function createTestInventoryStock(
  companyId: number,
  itemId: number,
  variantId: number,
  outletId: number | null,
  quantity: number,
  options?: Partial<{
    reservedQuantity: number;
  }>
): Promise<void> {
  const db = getDb();
  const reservedQty = options?.reservedQuantity ?? 0;
  const availableQty = quantity - reservedQty;

  // Idempotent: check for existing row and update-or-insert
  const existing = await sql`
    SELECT id, quantity, reserved_quantity, available_quantity
    FROM inventory_stock
    WHERE company_id = ${companyId}
      AND variant_id = ${variantId}
      AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
    LIMIT 1
  `.execute(db);

  if (existing.rows.length > 0) {
    // Update existing row instead of duplicate insert
    await sql`
      UPDATE inventory_stock
      SET quantity = ${quantity},
          reserved_quantity = ${reservedQty},
          available_quantity = ${availableQty},
          updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ${companyId}
        AND variant_id = ${variantId}
        AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
    `.execute(db);
  } else {
    await sql`
      INSERT INTO inventory_stock (
        company_id,
        outlet_id,
        product_id,
        variant_id,
        quantity,
        reserved_quantity,
        available_quantity,
        created_at,
        updated_at
      )
      VALUES (
        ${companyId},
        ${outletId},
        ${itemId},
        ${variantId},
        ${quantity},
        ${reservedQty},
        ${availableQty},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `.execute(db);
  }

  registerFixtureCleanup(`inv-stock-${variantId}-${outletId ?? 'global'}`, async () => {
    await sql`DELETE FROM inventory_stock WHERE company_id = ${companyId} AND variant_id = ${variantId} AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}`.execute(db);
  });
}

// Re-export TransactionType for test fixture helpers
export { TransactionType } from "./stock.js";
import { TransactionType } from "./stock.js";

/**
 * Create a test inventory transaction using the canonical adjustStock path.
 *
 * Uses the same production-invariant flow as createTestStock but allows
 * creating additional transactions beyond the initial stock set.
 * Each call creates a new ADJUSTMENT transaction with a deterministic reference_id
 * so tests can filter/query specific transactions without raw SQL.
 *
 * For initial stock setup, use createTestStock() instead (it handles the
 * company+item+outlet cost-layer derivation internally).
 * This helper is for creating supplemental ADJUSTMENT transactions that need
 * to exist before querying stock/transactions endpoints.
 *
 * @param companyId   - Tenant ID
 * @param itemId      - Item ID
 * @param outletId    - Outlet ID (use null for company-level)
 * @param userId      - User performing the adjustment
 * @param quantityDelta - Positive or negative quantity delta
 * @param options     - Partial options
 * @param options.referenceId - Deterministic reference ID (auto-generated if not provided)
 */
export async function createTestInventoryTransaction(
  companyId: number,
  itemId: number,
  outletId: number | null,
  userId: number,
  quantityDelta: number,
  options?: Partial<{
    referenceId: string;
  }>
): Promise<{ transactionId: number; referenceId: string }> {
  const db = getDb();
  const refId = options?.referenceId ?? `TEST-ADJ-${Date.now().toString(36)}`;

  // Use adjustStock which creates the inventory_transactions record atomically
  const ok = await adjustStock({
    company_id: companyId,
    outlet_id: outletId,
    product_id: itemId,
    adjustment_quantity: quantityDelta,
    reason: "TEST_SETUP",
    reference_id: refId,
    user_id: userId,
  });

  if (!ok) {
    throw new Error(`Failed to create inventory transaction for item ${itemId}`);
  }

  // Retrieve the transaction ID using the deterministic reference_id
  const result = await sql`
    SELECT id FROM inventory_transactions
    WHERE company_id = ${companyId}
      AND product_id = ${itemId}
      AND reference_id = ${refId}
      AND transaction_type = ${TransactionType.ADJUSTMENT}
    LIMIT 1
  `.execute(db);

  if (result.rows.length === 0) {
    throw new Error(`Failed to retrieve transaction ID for reference ${refId}`);
  }

  return {
    transactionId: Number((result.rows[0] as { id: number }).id),
    referenceId: refId,
  };
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
  code: string;
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
  const runId = makeRunId();

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
      code: row.code,
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
          code: row.code,
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
 * Schema mapping:
 *  - fiscal_periods.period_no (not period_number)
 *  - status is tinyint: OPEN=1, CLOSED=2
 *
 * @param fiscalYearId - Parent fiscal year ID
 * @param options - Period options
 * @param options.periodNumber - Period within fiscal year (1-12) [internal field: period_no]
 * @param options.startDate - Start date in 'YYYY-MM-DD' format
 * @param options.endDate - End date in 'YYYY-MM-DD' format
 * @param options.status - 'OPEN' | 'CLOSED' (default: 'OPEN')
 * @returns Fiscal period fixture with id, fiscalYearId, periodNumber, startDate, endDate, status
 */
// FIX(47.5-WP-B): use period_no column and status tinyint mapping (OPEN=1, CLOSED=2)
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

  // Status tinyint mapping
  const STATUS_OPEN_INT = 1;
  const STATUS_CLOSED_INT = 2;

  // Check if fiscal_periods table exists before attempting insert
  const tableCheck = await sql`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'fiscal_periods'`.execute(db);
  const tableExists = Number((tableCheck.rows[0] as { cnt: number }).cnt) > 0;

  if (!tableExists) {
    throw new Error(
      "fiscal_periods table does not exist. Schema gap: Story 47.1/47.5 requires a fiscal_periods table " +
      "(typically: id, fiscal_year_id, period_no, start_date, end_date, status). " +
      "This fixture will work once migration 0180 (or similar) creates the table."
    );
  }

  const periodNo = options?.periodNumber ?? 1;
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

  const statusInput = options?.status ?? "OPEN";
  // Map label to tinyint
  const statusInt = statusInput === "OPEN" ? STATUS_OPEN_INT : STATUS_CLOSED_INT;

  try {
    // FIX(47.5-WP-B): Derive company_id from parent fiscal_year_id (fiscal_periods.company_id is NOT NULL)
    const fyCompanyResult = await sql`SELECT company_id FROM fiscal_years WHERE id = ${fiscalYearId} LIMIT 1`.execute(db);
    if (fyCompanyResult.rows.length === 0) {
      throw new Error(`Fiscal year ${fiscalYearId} not found — cannot derive company_id for fiscal period`);
    }
    const periodCompanyId = Number((fyCompanyResult.rows[0] as { company_id: number }).company_id);

    // FIX(47.5-WP-B): use period_no (not period_number), status as tinyint, and company_id from parent FY
    await sql`
      INSERT INTO fiscal_periods (fiscal_year_id, company_id, period_no, start_date, end_date, status, created_at, updated_at)
      VALUES (${fiscalYearId}, ${periodCompanyId}, ${periodNo}, ${startDate}, ${endDate}, ${statusInt}, NOW(), NOW())
    `.execute(db);

    const result = await sql`SELECT id, fiscal_year_id, period_no, start_date, end_date, status FROM fiscal_periods WHERE fiscal_year_id = ${fiscalYearId} AND period_no = ${periodNo} LIMIT 1`.execute(db);
    if (result.rows.length === 0) {
      throw new Error(`Failed to create fiscal period for fiscal_year_id ${fiscalYearId}`);
    }
    const row = result.rows[0] as { id: number; fiscal_year_id: number; period_no: number; start_date: Date; end_date: Date; status: number };
    // Map status tinyint back to label for ergonomics
    const fixture: FiscalPeriodFixture = {
      id: Number(row.id),
      fiscalYearId: Number(row.fiscal_year_id),
      periodNumber: Number(row.period_no),
      startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
      endDate: row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date),
      status: row.status === STATUS_OPEN_INT ? "OPEN" : "CLOSED",
    };
    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      const result = await sql`SELECT id, fiscal_year_id, period_no, start_date, end_date, status FROM fiscal_periods WHERE fiscal_year_id = ${fiscalYearId} AND period_no = ${periodNo} LIMIT 1`.execute(db);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: number; fiscal_year_id: number; period_no: number; start_date: Date; end_date: Date; status: number };
        return {
          id: Number(row.id),
          fiscalYearId: Number(row.fiscal_year_id),
          periodNumber: Number(row.period_no),
          startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
          endDate: row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date),
          status: row.status === STATUS_OPEN_INT ? "OPEN" : "CLOSED",
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

/**
 * Clear AP reconciliation settings and fallback AP account defaults for a company.
 *
 * This helper enforces the explicit "settings missing" state used by fail-closed
 * and warning-path tests.
 */
export async function clearTestAPReconciliationSettings(companyId: number): Promise<void> {
  const db = getDb();
  const settingKey = "ap_reconciliation_account_ids";

  await sql`
    DELETE FROM settings_strings
    WHERE company_id = ${companyId}
      AND outlet_id IS NULL
      AND setting_key = ${settingKey}
  `.execute(db);

  await sql`
    UPDATE company_modules cm
    INNER JOIN modules m ON m.id = cm.module_id
    SET cm.purchasing_default_ap_account_id = NULL
    WHERE cm.company_id = ${companyId}
      AND m.code = 'purchasing'
  `.execute(db);
}

// FIX(47.5-WP-D): Canonical helper for company-level string settings.
// Allows integration tests to avoid ad-hoc SQL for settings_strings rows.
export async function setTestCompanyStringSetting(
  companyId: number,
  settingKey: string,
  settingValue: string
): Promise<void> {
  const db = getDb();

  await sql`
    INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at)
    VALUES (${companyId}, NULL, ${settingKey}, ${settingValue}, NOW(), NOW())
    ON DUPLICATE KEY UPDATE setting_value = ${settingValue}, updated_at = NOW()
  `.execute(db);
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

// FIX(47.4-WP-B): Canonical int-enum values for ap_exceptions.type and .status.
// Migration 0188 uses TINYINT columns; string labels are for API compatibility only.
export const AP_EXCEPTION_TYPE = {
  DISPUTE: 1,
  VARIANCE: 2,
  MISMATCH: 3,
  DUPLICATE: 4,
} as const;
export type APExceptionTypeKey = keyof typeof AP_EXCEPTION_TYPE;
export type APExceptionTypeValue = (typeof AP_EXCEPTION_TYPE)[APExceptionTypeKey];

export const AP_EXCEPTION_STATUS = {
  OPEN: 1,
  ASSIGNED: 2,
  RESOLVED: 3,
  DISMISSED: 4,
} as const;
export type APExceptionStatusKey = keyof typeof AP_EXCEPTION_STATUS;
export type APExceptionStatusValue = (typeof AP_EXCEPTION_STATUS)[APExceptionStatusKey];

export type APExceptionFixture = {
  id: number;
  companyId: number;
  // FIX(47.4-WP-B): exception_key is required (unique per company, used for idempotent upsert)
  exceptionKey: string;
  // FIX(47.4-WP-B): type/status are now int enums matching migration 0188 schema
  type: APExceptionTypeValue;
  sourceType: string;
  sourceId: number;
  supplierId: number | null;
  // FIX(47.4-WP-B): column is variance_amount, not amount
  varianceAmount: string;
  // FIX(47.4-WP-B): column is currency_code, not currency
  currencyCode: string;
  detectedAt: string;
  dueDate: string | null;
  assignedToUserId: number | null;
  assignedAt: string | null;
  status: APExceptionStatusValue;
  resolvedAt: string | null;
  resolvedByUserId: number | null;
  resolutionNote: string | null;
};

/**
 * Create a test AP exception for Epic 47.4 (AP exception worklist).
 * Story linkage: 47.4 - AP exception worklist.
 *
 * FIX(47.4-WP-B): Aligns with migration 0188_ap_exceptions.sql schema.
 * Canonical internal representation uses int enums for type/status;
 * caller-facing options accept string labels for ergonomics.
 * Internal INSERT maps option fields to real DB column names
 * (variance_amount, currency_code, exception_key, source_type, source_id).
 *
 * @param companyId - Company ID
 * @param options - Exception options
 * @param options.exceptionKey - Deterministic idempotency key (e.g., SHA256 of source context)
 * @param options.type - Exception type enum value (AP_EXCEPTION_TYPE.DISPUTE|VARIANCE|MISMATCH|DUPLICATE)
 * @param options.sourceType - Source document type (e.g., 'INVOICE', 'PAYMENT')
 * @param options.sourceId - Source document ID
 * @param options.supplierId - Optional supplier ID
 * @param options.varianceAmount - Variance amount as string decimal (maps to variance_amount col)
 * @param options.currencyCode - ISO currency code (maps to currency_code col)
 * @param options.dueDate - Optional due date string ('YYYY-MM-DD')
 * @param options.status - Exception status enum value (AP_EXCEPTION_STATUS.OPEN|ASSIGNED|RESOLVED|DISMISSED)
 * @returns AP exception fixture with all schema-aligned fields
 */
export async function createTestAPException(
  companyId: number,
  options?: Partial<{
    exceptionKey: string;
    type: APExceptionTypeValue;
    sourceType: string;
    sourceId: number;
    supplierId: number;
    varianceAmount: string;
    currencyCode: string;
    dueDate: string;
    status: APExceptionStatusValue;
  }>
): Promise<APExceptionFixture> {
  const db = getDb();
  const runId = makeRunId();

  // FIX(47.4-WP-B): exception_key is required; auto-generate if not provided.
  // Pattern mirrors idempotency key design: use source context to derive deterministic key.
  const exceptionKey =
    options?.exceptionKey ?? `EXC-${runId}`;

  // FIX(47.4-WP-B): Map string-friendly options to int enums (migration 0188 canonical).
  const type = options?.type ?? AP_EXCEPTION_TYPE.VARIANCE;
  const sourceType = options?.sourceType ?? "INVOICE";
  const sourceId = options?.sourceId ?? 0;
  const supplierId = options?.supplierId ?? null;
  const varianceAmount = options?.varianceAmount ?? "0.0000";
  const currencyCode = options?.currencyCode ?? "IDR";
  const dueDate = options?.dueDate ?? null;
  const status = options?.status ?? AP_EXCEPTION_STATUS.OPEN;

  // Validate type is a known int enum value
  if (!Object.values(AP_EXCEPTION_TYPE).includes(type)) {
    throw new Error(`Invalid AP exception type: ${type}. Use AP_EXCEPTION_TYPE values.`);
  }

  // Validate status is a known int enum value
  if (!Object.values(AP_EXCEPTION_STATUS).includes(status)) {
    throw new Error(`Invalid AP exception status: ${status}. Use AP_EXCEPTION_STATUS values.`);
  }

  try {
    await sql`
      INSERT INTO ap_exceptions (
        company_id, exception_key, type, source_type, source_id, supplier_id,
        variance_amount, currency_code, due_date, status, created_at, updated_at
      )
      VALUES (
        ${companyId}, ${exceptionKey}, ${type}, ${sourceType}, ${sourceId}, ${supplierId},
        ${varianceAmount}, ${currencyCode}, ${dueDate}, ${status}, NOW(), NOW()
      )
    `.execute(db);

    const result = await sql`
      SELECT id, company_id, exception_key, type, source_type, source_id, supplier_id,
             variance_amount, currency_code, detected_at, due_date,
             assigned_to_user_id, assigned_at, status, resolved_at, resolved_by_user_id, resolution_note
      FROM ap_exceptions
      WHERE company_id = ${companyId} AND exception_key = ${exceptionKey}
      LIMIT 1
    `.execute(db);

    if (result.rows.length === 0) {
      throw new Error(`Failed to create AP exception for company ${companyId} with key ${exceptionKey}`);
    }

    const row = result.rows[0] as {
      id: number; company_id: number; exception_key: string; type: number;
      source_type: string; source_id: number; supplier_id: number | null;
      variance_amount: string; currency_code: string; detected_at: Date;
      due_date: Date | null; assigned_to_user_id: number | null; assigned_at: Date | null;
      status: number; resolved_at: Date | null; resolved_by_user_id: number | null; resolution_note: string | null;
    };

    const fixture: APExceptionFixture = {
      id: Number(row.id),
      companyId: Number(row.company_id),
      exceptionKey: row.exception_key,
      type: row.type as APExceptionTypeValue,
      sourceType: row.source_type,
      sourceId: Number(row.source_id),
      supplierId: row.supplier_id !== null ? Number(row.supplier_id) : null,
      varianceAmount: String(row.variance_amount),
      currencyCode: String(row.currency_code),
      detectedAt: row.detected_at instanceof Date ? row.detected_at.toISOString() : String(row.detected_at),
      dueDate: row.due_date
        ? (row.due_date instanceof Date ? row.due_date.toISOString().split("T")[0] : String(row.due_date))
        : null,
      assignedToUserId: row.assigned_to_user_id !== null ? Number(row.assigned_to_user_id) : null,
      assignedAt: row.assigned_at
        ? (row.assigned_at instanceof Date ? row.assigned_at.toISOString() : String(row.assigned_at))
        : null,
      status: row.status as APExceptionStatusValue,
      resolvedAt: row.resolved_at
        ? (row.resolved_at instanceof Date ? row.resolved_at.toISOString() : String(row.resolved_at))
        : null,
      resolvedByUserId: row.resolved_by_user_id !== null ? Number(row.resolved_by_user_id) : null,
      resolutionNote: row.resolution_note ?? null,
    };

    return fixture;
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr?.code === 'ER_DUP_ENTRY' || mysqlErr?.code === 'ER_DUP_KEY') {
      // Idempotent: fetch existing row for the same exception_key
      const result = await sql`
        SELECT id, company_id, exception_key, type, source_type, source_id, supplier_id,
               variance_amount, currency_code, detected_at, due_date,
               assigned_to_user_id, assigned_at, status, resolved_at, resolved_by_user_id, resolution_note
        FROM ap_exceptions
        WHERE company_id = ${companyId} AND exception_key = ${exceptionKey}
        LIMIT 1
      `.execute(db);

      if (result.rows.length > 0) {
        const row = result.rows[0] as {
          id: number; company_id: number; exception_key: string; type: number;
          source_type: string; source_id: number; supplier_id: number | null;
          variance_amount: string; currency_code: string; detected_at: Date;
          due_date: Date | null; assigned_to_user_id: number | null; assigned_at: Date | null;
          status: number; resolved_at: Date | null; resolved_by_user_id: number | null; resolution_note: string | null;
        };

        return {
          id: Number(row.id),
          companyId: Number(row.company_id),
          exceptionKey: row.exception_key,
          type: row.type as APExceptionTypeValue,
          sourceType: row.source_type,
          sourceId: Number(row.source_id),
          supplierId: row.supplier_id !== null ? Number(row.supplier_id) : null,
          varianceAmount: String(row.variance_amount),
          currencyCode: String(row.currency_code),
          detectedAt: row.detected_at instanceof Date ? row.detected_at.toISOString() : String(row.detected_at),
          dueDate: row.due_date
            ? (row.due_date instanceof Date ? row.due_date.toISOString().split("T")[0] : String(row.due_date))
            : null,
          assignedToUserId: row.assigned_to_user_id !== null ? Number(row.assigned_to_user_id) : null,
          assignedAt: row.assigned_at
            ? (row.assigned_at instanceof Date ? row.assigned_at.toISOString() : String(row.assigned_at))
            : null,
          status: row.status as APExceptionStatusValue,
          resolvedAt: row.resolved_at
            ? (row.resolved_at instanceof Date ? row.resolved_at.toISOString() : String(row.resolved_at))
            : null,
          resolvedByUserId: row.resolved_by_user_id !== null ? Number(row.resolved_by_user_id) : null,
          resolutionNote: row.resolution_note ?? null,
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

// ============================================================================
// Company/Outlet NULL Timezone Fixtures (Epic 47 - Timezone Resolution)
// ============================================================================

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

// ============================================================================
// Re-exports from @jurnapod/db/test-fixtures
// ============================================================================

// Re-export immutability helpers from @jurnapod/db/test-fixtures
export { expectImmutableTable } from '@jurnapod/db/test-fixtures';
export type { ImmutableTableOptions } from '@jurnapod/db/test-fixtures';
