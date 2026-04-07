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
 * - Clean up after themselves
 * 
 * Usage:
 * ```typescript
 * import { createTestCompany, createTestOutlet, cleanupTestFixtures } from "@/lib/test-fixtures";
 * 
 * test("my test", async () => {
 *   const company = await createTestCompany();
 *   const outlet = await createTestOutlet(company.id);
 *   // ... test code
 *   await cleanupTestFixtures();
 * });
 * ```
 */

import { getDb } from "./db";
import { sql } from "kysely";
import { createCompanyBasic, CompanyCodeExistsError } from "./companies";
import { createOutletBasic, OutletCodeExistsError } from "./outlets";
import { createUserBasic, UserEmailExistsError } from "./users";
import { createItem } from "./items/index.js";
import { DatabaseConflictError } from "./master-data-errors.js";
import { createVariantAttribute } from "./item-variants";
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

export type TestFixtures = {
  companies: CompanyFixture[];
  outlets: OutletFixture[];
  users: UserFixture[];
  items: ItemFixture[];
  variants: VariantFixture[];
};

// ============================================================================
// Global Fixture Registry (for cleanup)
// ============================================================================

const createdFixtures: TestFixtures = {
  companies: [],
  outlets: [],
  users: [],
  items: [],
  variants: []
};

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
    
    createdFixtures.companies.push(company);
    return company;
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
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
    throw error;
  }
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
  } catch (error: any) {
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
 * Set module-level permissions for a role in a company.
 * Use this for setting up test data with specific permission masks.
 * 
 * @param companyId - Company ID
 * @param roleId - Role ID
 * @param module - Module name (e.g., 'inventory', 'sales')
 * @param permissionMask - Permission mask (use MODULE_PERMISSION_BITS or buildPermissionMask)
 */
export async function setModulePermission(
  companyId: number,
  roleId: number,
  module: string,
  permissionMask: number
): Promise<void> {
  const db = getDb();
  // Use INSERT ... ON DUPLICATE KEY UPDATE for idempotency in tests
  await sql`INSERT INTO module_roles (company_id, role_id, module, permission_mask) VALUES (${companyId}, ${roleId}, ${module}, ${permissionMask}) ON DUPLICATE KEY UPDATE permission_mask = ${permissionMask}`.execute(db);
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
  
  await setModulePermission(params.companyId, roleId, params.module, mask);
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
  
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyCode, email, password })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get test access token: ${res.status} ${body}`);
  }

  const body = await res.json();
  return body.data.access_token;
}
