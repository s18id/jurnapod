/**
 * Resource-Level ACL Integration Tests
 *
 * Tests RBACManager with resource-level permission checks against a real database.
 * Requires AUTH_TEST_USE_DB=1 environment variable.
 *
 * Run with: AUTH_TEST_USE_DB=1 npm run test:single -w @jurnapod/auth __test__/integration/resource-level-acl.integration.test.ts
 */

import { test, describe, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert';

import { RBACManager } from '../../src/rbac/access-check.js';
import { createRealDbAdapter, closeTestPool } from '../../src/test-utils/real-adapter.js';
import { useRealDb, testConfig } from '../../src/test-utils/test-adapter.js';
import { createCompany, cleanupCompanies } from '../../src/test-utils/fixtures/companies.js';
import { createUser, cleanupUsers } from '../../src/test-utils/fixtures/users.js';
import { createOutlet, cleanupOutlets } from '../../src/test-utils/fixtures/outlets.js';
import { getRoleIdByCode, assignUserRole, cleanupRoleAssignments } from '../../src/test-utils/fixtures/roles.js';
import type { AuthDbAdapter } from '../../src/types.js';
import { MODULE_PERMISSION_BITS } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  await closeTestPool();
});

// ---------------------------------------------------------------------------
// Helper: Insert module_roles entry directly
// ---------------------------------------------------------------------------

async function insertModuleRole(
  adapter: AuthDbAdapter,
  params: {
    roleId: number;
    companyId: number;
    module: string;
    resource: string | null;
    permissionMask: number;
  }
): Promise<number> {
  const result = await adapter.db
    .insertInto('module_roles')
    .values({
      role_id: params.roleId,
      company_id: params.companyId,
      module: params.module,
      resource: params.resource,
      permission_mask: params.permissionMask,
    })
    .executeTakeFirst();

  return Number(result.insertId);
}

async function cleanupModuleRolesByRoleIds(adapter: AuthDbAdapter, roleIds: number[]): Promise<void> {
  if (roleIds.length === 0) return;
  await adapter.db
    .deleteFrom('module_roles')
    .where('role_id', 'in', roleIds)
    .execute();
}

// ---------------------------------------------------------------------------
// Test 1: User with platform.users permission CAN access platform module with resource: 'users'
// ---------------------------------------------------------------------------

test('user with platform.users permission CAN access platform module with resource "users"', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];
  let adminRoleId: number | undefined;

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'resource-acl-test1@example.com' }, testConfig);
    userIds.push(user.id);

    // Create outlet
    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);

    // Assign ADMIN role for this outlet
    adminRoleId = await getRoleIdByCode(adapter, 'ADMIN');
    assert.ok(adminRoleId, 'ADMIN role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: adminRoleId, companyId: company.id, outletId: outlet.id });

    // Grant READ permission (bit 1) for platform.users
    const readBit = MODULE_PERMISSION_BITS.read;
    await insertModuleRole(adapter, {
      roleId: adminRoleId,
      companyId: company.id,
      module: 'platform',
      resource: 'users',
      permissionMask: readBit,
    });

    const rbac = new RBACManager(adapter, testConfig);
    const result = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'users',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result, 'Should return access result');
    assert.strictEqual(result!.hasPermission, true, 'Should have READ permission for platform.users');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    if (adminRoleId) await cleanupModuleRolesByRoleIds(adapter, [adminRoleId]);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 2: User with platform.users permission CANNOT access platform module with resource: 'roles'
// ---------------------------------------------------------------------------

test('user with platform.users permission CANNOT access platform module with resource "roles"', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];
  let adminRoleId: number | undefined;

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'resource-acl-test2@example.com' }, testConfig);
    userIds.push(user.id);

    // Create outlet
    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);

    // Assign ADMIN role for this outlet
    adminRoleId = await getRoleIdByCode(adapter, 'ADMIN');
    assert.ok(adminRoleId, 'ADMIN role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: adminRoleId, companyId: company.id, outletId: outlet.id });

    // Grant READ permission (bit 1) for platform.users ONLY
    const readBit = MODULE_PERMISSION_BITS.read;
    await insertModuleRole(adapter, {
      roleId: adminRoleId,
      companyId: company.id,
      module: 'platform',
      resource: 'users',
      permissionMask: readBit,
    });

    const rbac = new RBACManager(adapter, testConfig);
    
    // Try to access platform.roles (should fail - no permission for this resource)
    const result = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'roles',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result, 'Should return access result');
    assert.strictEqual(result!.hasPermission, false, 'Should NOT have READ permission for platform.roles');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    if (adminRoleId) await cleanupModuleRolesByRoleIds(adapter, [adminRoleId]);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 3: User with module-level platform permission (resource=NULL) can access ALL platform resources
// ---------------------------------------------------------------------------

test('user with module-level platform permission (resource=NULL) can access ALL platform resources', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];
  let adminRoleId: number | undefined;

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'resource-acl-test3@example.com' }, testConfig);
    userIds.push(user.id);

    // Create outlet
    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);

    // Assign ADMIN role for this outlet
    adminRoleId = await getRoleIdByCode(adapter, 'ADMIN');
    assert.ok(adminRoleId, 'ADMIN role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: adminRoleId, companyId: company.id, outletId: outlet.id });

    // Grant READ permission (bit 1) for platform with NO specific resource (NULL = module-level)
    const readBit = MODULE_PERMISSION_BITS.read;
    await insertModuleRole(adapter, {
      roleId: adminRoleId,
      companyId: company.id,
      module: 'platform',
      resource: null, // Module-level permission
      permissionMask: readBit,
    });

    const rbac = new RBACManager(adapter, testConfig);

    // Access platform.users (should succeed - module-level grants access to all resources)
    const result1 = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'users',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result1, 'Should return access result');
    assert.strictEqual(result1!.hasPermission, true, 'Should have READ permission for platform.users via module-level');

    // Access platform.roles (should also succeed - module-level grants access to ALL resources)
    const result2 = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'roles',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result2, 'Should return access result');
    assert.strictEqual(result2!.hasPermission, true, 'Should have READ permission for platform.roles via module-level');

    // Access platform.companies (should also succeed)
    const result3 = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'companies',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result3, 'Should return access result');
    assert.strictEqual(result3!.hasPermission, true, 'Should have READ permission for platform.companies via module-level');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    if (adminRoleId) await cleanupModuleRolesByRoleIds(adapter, [adminRoleId]);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 4: SUPER_ADMIN bypasses resource checks
// ---------------------------------------------------------------------------

test('SUPER_ADMIN bypasses resource checks', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];
  let superAdminRoleId: number | undefined;

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'resource-acl-test4@example.com' }, testConfig);
    userIds.push(user.id);

    // Create outlet
    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);

    // Assign SUPER_ADMIN role with company_id (same as existing tests for global SUPER_ADMIN)
    superAdminRoleId = await getRoleIdByCode(adapter, 'SUPER_ADMIN');
    assert.ok(superAdminRoleId, 'SUPER_ADMIN role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: superAdminRoleId, companyId: company.id });

    const rbac = new RBACManager(adapter, testConfig);

    // Even without any module_roles entry, SUPER_ADMIN should have permission
    const result = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'any-resource',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result, 'Should return access result');
    assert.strictEqual(result!.isSuperAdmin, true, 'Should be detected as SUPER_ADMIN');
    assert.strictEqual(result!.hasPermission, true, 'SUPER_ADMIN should bypass resource checks');
  } finally {
    await adapter.db.deleteFrom('user_role_assignments').where('user_id', 'in', userIds).execute();
    if (superAdminRoleId) await cleanupModuleRolesByRoleIds(adapter, [superAdminRoleId]);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 5: User with multiple resource permissions
// ---------------------------------------------------------------------------

test('user with multiple resource permissions can access each granted resource', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];
  let adminRoleId: number | undefined;

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'resource-acl-test5@example.com' }, testConfig);
    userIds.push(user.id);

    // Create outlet
    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);

    // Assign ADMIN role for this outlet
    adminRoleId = await getRoleIdByCode(adapter, 'ADMIN');
    assert.ok(adminRoleId, 'ADMIN role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: adminRoleId, companyId: company.id, outletId: outlet.id });

    // Grant READ permission for both users and roles
    const readBit = MODULE_PERMISSION_BITS.read;
    await insertModuleRole(adapter, {
      roleId: adminRoleId,
      companyId: company.id,
      module: 'platform',
      resource: 'users',
      permissionMask: readBit,
    });
    await insertModuleRole(adapter, {
      roleId: adminRoleId,
      companyId: company.id,
      module: 'platform',
      resource: 'roles',
      permissionMask: readBit,
    });

    const rbac = new RBACManager(adapter, testConfig);

    // Access platform.users (should succeed)
    const result1 = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'users',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result1, 'Should return access result');
    assert.strictEqual(result1!.hasPermission, true, 'Should have READ permission for platform.users');

    // Access platform.roles (should succeed)
    const result2 = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'roles',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result2, 'Should return access result');
    assert.strictEqual(result2!.hasPermission, true, 'Should have READ permission for platform.roles');

    // Access platform.companies (should fail - no permission)
    const result3 = await rbac.checkAccess({
      userId: user.id,
      companyId: company.id,
      module: 'platform',
      resource: 'companies',
      permission: 'read',
      outletId: outlet.id,
    });

    assert.ok(result3, 'Should return access result');
    assert.strictEqual(result3!.hasPermission, false, 'Should NOT have READ permission for platform.companies');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    if (adminRoleId) await cleanupModuleRolesByRoleIds(adapter, [adminRoleId]);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 6: canManageCompanyDefaults respects resource parameter
// ---------------------------------------------------------------------------

test('canManageCompanyDefaults respects resource parameter', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];
  let ownerRoleId: number | undefined;

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'resource-acl-test6@example.com' }, testConfig);
    userIds.push(user.id);

    // Assign OWNER role (global)
    ownerRoleId = await getRoleIdByCode(adapter, 'OWNER');
    assert.ok(ownerRoleId, 'OWNER role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: ownerRoleId, companyId: company.id });

    // Grant MANAGE permission for platform.users only
    const manageBit = MODULE_PERMISSION_BITS.manage;
    await insertModuleRole(adapter, {
      roleId: ownerRoleId,
      companyId: company.id,
      module: 'platform',
      resource: 'users',
      permissionMask: manageBit,
    });

    const rbac = new RBACManager(adapter, testConfig);

    // Can manage platform.users defaults (should succeed)
    const result1 = await rbac.canManageCompanyDefaults(user.id, company.id, 'platform', 'manage', 'users');
    assert.strictEqual(result1, true, 'Should be able to manage platform.users defaults');

    // Cannot manage platform.companies defaults (should fail - no permission for that resource)
    const result2 = await rbac.canManageCompanyDefaults(user.id, company.id, 'platform', 'manage', 'companies');
    assert.strictEqual(result2, false, 'Should NOT be able to manage platform.companies defaults');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    if (ownerRoleId) await cleanupModuleRolesByRoleIds(adapter, [ownerRoleId]);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});
