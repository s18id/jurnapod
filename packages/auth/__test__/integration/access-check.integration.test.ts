/**
 * RBAC Access Check Integration Tests
 *
 * Tests RBACManager against a real database.
 * Requires AUTH_TEST_USE_DB=1 environment variable.
 *
 * Run with: AUTH_TEST_USE_DB=1 npm run test:single -w @jurnapod/auth src/rbac/access-check.integration.test.ts
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

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  await closeTestPool();
});

// ---------------------------------------------------------------------------
// Test 1: getUserWithRoles() returns full profile with SUPER_ADMIN role
// ---------------------------------------------------------------------------

test('getUserWithRoles() returns full profile with SUPER_ADMIN role', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'rbac-test@example.com' }, testConfig);
    userIds.push(user.id);

    // Assign SUPER_ADMIN role (global)
    const superAdminRoleId = await getRoleIdByCode(adapter, 'SUPER_ADMIN');
    assert.ok(superAdminRoleId, 'SUPER_ADMIN role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: superAdminRoleId, companyId: company.id });

    const rbac = new RBACManager(adapter, testConfig);
    const result = await rbac.getUserWithRoles(user.id, company.id);

    assert.ok(result, 'Should return user profile');
    assert.strictEqual(result!.id, user.id);
    assert.strictEqual(result!.company_id, company.id);
    assert.ok(result!.roles.includes('SUPER_ADMIN'), 'Roles should include SUPER_ADMIN');
  } finally {
    // Cleanup in reverse order (respecting foreign key constraints)
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 2: getUserWithRoles() with outlet assignments
// ---------------------------------------------------------------------------

test('getUserWithRoles() with outlet assignments', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'rbac-outlet@example.com' }, testConfig);
    userIds.push(user.id);

    // Create outlet
    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);

    // Assign CASHIER role for this outlet
    const cashierRoleId = await getRoleIdByCode(adapter, 'CASHIER');
    assert.ok(cashierRoleId, 'CASHIER role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: cashierRoleId, companyId: company.id, outletId: outlet.id });

    const rbac = new RBACManager(adapter, testConfig);
    const result = await rbac.getUserWithRoles(user.id, company.id);

    assert.ok(result, 'Should return user profile');
    assert.ok(result!.outlet_role_assignments.length > 0, 'Should have outlet role assignments');
    assert.ok(result!.outlets.length > 0, 'Should have outlets');

    const assignment = result!.outlet_role_assignments.find((a) => a.outlet_id === outlet.id);
    assert.ok(assignment, 'Should have assignment for the created outlet');
    assert.ok(assignment!.role_codes.includes('CASHIER'), 'Assignment should include CASHIER role');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 3: hasOutletAccess() returns true for SUPER_ADMIN
// ---------------------------------------------------------------------------

test('hasOutletAccess() returns true for SUPER_ADMIN', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'super-admin@example.com' }, testConfig);
    userIds.push(user.id);

    // Assign SUPER_ADMIN role (global)
    const superAdminRoleId = await getRoleIdByCode(adapter, 'SUPER_ADMIN');
    assert.ok(superAdminRoleId, 'SUPER_ADMIN role should exist in database');

    await assignUserRole(adapter, { userId: user.id, roleId: superAdminRoleId, companyId: company.id });

    // Create outlet
    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);

    const rbac = new RBACManager(adapter, testConfig);
    const hasAccess = await rbac.hasOutletAccess(user.id, company.id, outlet.id);

    assert.strictEqual(hasAccess, true, 'SUPER_ADMIN should have access to any outlet');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 4: hasOutletAccess() returns true for global role (OWNER)
// ---------------------------------------------------------------------------

test('hasOutletAccess() returns true for global role (OWNER)', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create new user with OWNER role (is_global=1)
    const ownerUser = await createUser(adapter, company.id, { email: 'owner-test@example.com' }, testConfig);
    userIds.push(ownerUser.id);

    const ownerRoleId = await getRoleIdByCode(adapter, 'OWNER');
    assert.ok(ownerRoleId, 'OWNER role should exist in database');

    await assignUserRole(adapter, { userId: ownerUser.id, companyId:company.id, roleId: ownerRoleId });

    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);
    const rbac = new RBACManager(adapter, testConfig);

    const hasAccess = await rbac.hasOutletAccess(ownerUser.id, company.id, outlet.id);

    assert.strictEqual(hasAccess, true, 'Global OWNER role should have outlet access');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 5: hasOutletAccess() returns true for outlet-specific assignment
// ---------------------------------------------------------------------------

test('hasOutletAccess() returns true for outlet-specific assignment', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create new user with only outlet-specific role
    const cashierUser = await createUser(adapter, company.id, { email: 'cashier-outlet-test@example.com' }, testConfig);
    userIds.push(cashierUser.id);

    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);
    const cashierRoleId = await getRoleIdByCode(adapter, 'CASHIER');
    assert.ok(cashierRoleId, 'CASHIER role should exist');

    // Assign CASHIER only for specific outlet
    await assignUserRole(adapter, { userId: cashierUser.id, roleId: cashierRoleId, companyId:company.id, outletId: outlet.id });

    const rbac = new RBACManager(adapter, testConfig);
    const hasAccess = await rbac.hasOutletAccess(cashierUser.id, company.id, outlet.id);

    assert.strictEqual(hasAccess, true, 'User with outlet-specific role should have access to that outlet');

    // Should NOT have access to a different outlet
    const otherOutlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(otherOutlet.id);
    const hasAccessToOther = await rbac.hasOutletAccess(cashierUser.id, company.id, otherOutlet.id);

    assert.strictEqual(hasAccessToOther, false, 'User should not have access to unassigned outlet');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 6: hasOutletAccess() returns false for user with no roles
// ---------------------------------------------------------------------------

test('hasOutletAccess() returns false for user with no roles', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create user with no roles
    const noRoleUser = await createUser(adapter, company.id, { email: 'norole-test@example.com' }, testConfig);
    userIds.push(noRoleUser.id);

    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);
    const rbac = new RBACManager(adapter, testConfig);

    const hasAccess = await rbac.hasOutletAccess(noRoleUser.id, company.id, outlet.id);

    assert.strictEqual(hasAccess, false, 'User with no roles should not have outlet access');
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 7: checkAccess() detects SUPER_ADMIN
// ---------------------------------------------------------------------------

test('checkAccess() detects SUPER_ADMIN', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user
    const user = await createUser(adapter, company.id, { email: 'checkaccess-super@example.com' }, testConfig);
    userIds.push(user.id);

    // Assign SUPER_ADMIN role
    const superAdminRoleId = await getRoleIdByCode(adapter, 'SUPER_ADMIN');
    assert.ok(superAdminRoleId, 'SUPER_ADMIN role should exist in database');

    await assignUserRole(adapter, { userId: user.id,companyId:company.id,  roleId: superAdminRoleId });

    const rbac = new RBACManager(adapter, testConfig);
    const result = await rbac.checkAccess({ userId: user.id, companyId: company.id });

    assert.ok(result, 'Should return access result');
    assert.strictEqual(result!.isSuperAdmin, true, 'Should be detected as SUPER_ADMIN');
    assert.strictEqual(result!.hasGlobalRole, true, 'Should have global role');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 7b: checkAccess() detects SUPER_ADMIN with NO company_id assignment
// ---------------------------------------------------------------------------

test('checkAccess() detects SUPER_ADMIN even when user_role_assignment has no company_id', { skip: !useRealDb }, async () => {
  // This tests that isSuperAdminUser() does a global lookup without company_id filter
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create test user with NO role assignment in user_role_assignments for this company
    // (simulating a platform-global SUPER_ADMIN)
    const user = await createUser(adapter, company.id, { email: 'global-super@example.com' }, testConfig);
    userIds.push(user.id);

    // Assign SUPER_ADMIN role for this company context
    const superAdminRoleId = await getRoleIdByCode(adapter, 'SUPER_ADMIN');
    assert.ok(superAdminRoleId, 'SUPER_ADMIN role should exist in database');

    // Assign with company_id (schema requires non-null)
    await adapter.db
      .insertInto('user_role_assignments')
      .values({
        user_id: user.id,
        role_id: superAdminRoleId,
        company_id: company.id,
        outlet_id: null
      })
      .execute();

    const rbac = new RBACManager(adapter, testConfig);
    const result = await rbac.checkAccess({ userId: user.id, companyId: company.id });

    assert.ok(result, 'Should return access result');
    assert.strictEqual(result!.isSuperAdmin, true, 'SUPER_ADMIN with null company_id should be detected globally');
    assert.strictEqual(result!.hasGlobalRole, true, 'Should have global role');
  } finally {
    await adapter.db.deleteFrom('user_role_assignments').where('user_id', 'in', userIds).execute();
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test: hasOutletAccess() returns true for globally-assigned SUPER_ADMIN
// ---------------------------------------------------------------------------

test('hasOutletAccess() returns true for SUPER_ADMIN with company-scoped assignment', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, { email: 'global-super-outlet@example.com' }, testConfig);
    userIds.push(user.id);

    const superAdminRoleId = await getRoleIdByCode(adapter, 'SUPER_ADMIN');

    // Company-scoped assignment (schema requires company_id)
    await adapter.db
      .insertInto('user_role_assignments')
      .values({ user_id: user.id, role_id: superAdminRoleId, company_id: company.id, outlet_id: null })
      .execute();

    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);

    const rbac = new RBACManager(adapter, testConfig);
    const hasAccess = await rbac.hasOutletAccess(user.id, company.id, outlet.id);

    assert.strictEqual(hasAccess, true, 'SUPER_ADMIN with global assignment should have outlet access');
  } finally {
    await adapter.db.deleteFrom('user_role_assignments').where('user_id', 'in', userIds).execute();
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test: canManageCompanyDefaults() returns true for globally-assigned SUPER_ADMIN
// ---------------------------------------------------------------------------

test('canManageCompanyDefaults() returns true for SUPER_ADMIN with company-scoped assignment', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, { email: 'global-super-defaults@example.com' }, testConfig);
    userIds.push(user.id);

    const superAdminRoleId = await getRoleIdByCode(adapter, 'SUPER_ADMIN');

    // Company-scoped assignment (schema requires company_id)
    await adapter.db
      .insertInto('user_role_assignments')
      .values({ user_id: user.id, role_id: superAdminRoleId, company_id: company.id, outlet_id: null })
      .execute();

    const rbac = new RBACManager(adapter, testConfig);
    const canManage = await rbac.canManageCompanyDefaults(user.id, company.id, 'companies', 'create');

    assert.strictEqual(canManage, true, 'SUPER_ADMIN with global assignment should be able to manage company defaults');
  } finally {
    await adapter.db.deleteFrom('user_role_assignments').where('user_id', 'in', userIds).execute();
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 8: checkAccess() validates allowedRoles correctly
// ---------------------------------------------------------------------------

test('checkAccess() validates allowedRoles correctly', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create new user with OWNER role
    const ownerUser = await createUser(adapter, company.id, { email: 'checkaccess-test@example.com' }, testConfig);
    userIds.push(ownerUser.id);

    const ownerRoleId = await getRoleIdByCode(adapter, 'OWNER');
    assert.ok(ownerRoleId, 'OWNER role should exist');

    await assignUserRole(adapter, { userId: ownerUser.id, companyId:company.id, roleId: ownerRoleId });

    const rbac = new RBACManager(adapter, testConfig);

    // Check with OWNER in allowedRoles (should pass)
    const result1 = await rbac.checkAccess({
      userId: ownerUser.id,
      companyId: company.id,
      allowedRoles: ['OWNER', 'ADMIN'],
    });

    assert.ok(result1, 'Should return access result');
    assert.strictEqual(result1!.hasRole, true, 'Should have OWNER role when allowed');

    // Check with different roles (should fail)
    const result2 = await rbac.checkAccess({
      userId: ownerUser.id,
      companyId: company.id,
      allowedRoles: ['ACCOUNTANT', 'CASHIER'],
    });

    assert.ok(result2, 'Should return access result');
    assert.strictEqual(result2!.hasRole, false, 'Should not have ACCOUNTANT or CASHIER role');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 9: listUserOutletIds() returns correct outlets
// ---------------------------------------------------------------------------

test('listUserOutletIds() returns correct outlets', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create new user with outlet assignments
    const multiOutletUser = await createUser(adapter, company.id, { email: 'multioutlet-test@example.com' }, testConfig);
    userIds.push(multiOutletUser.id);

    const outlet1 = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet1.id);
    const outlet2 = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet2.id);
    const cashierRoleId = await getRoleIdByCode(adapter, 'CASHIER');
    assert.ok(cashierRoleId, 'CASHIER role should exist');

    // Assign user to both outlets
    await assignUserRole(adapter, { userId: multiOutletUser.id,companyId:company.id,  roleId: cashierRoleId, outletId: outlet1.id });
    await assignUserRole(adapter, { userId: multiOutletUser.id,companyId:company.id,  roleId: cashierRoleId, outletId: outlet2.id });

    const rbac = new RBACManager(adapter, testConfig);
    const userOutletIds = await rbac.listUserOutletIds(multiOutletUser.id, company.id);

    assert.strictEqual(userOutletIds.length, 2, 'Should have 2 outlet IDs');
    assert.ok(userOutletIds.includes(outlet1.id), 'Should include first outlet ID');
    assert.ok(userOutletIds.includes(outlet2.id), 'Should include second outlet ID');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// Test 10: checkAccess() with outlet-specific role and outletId parameter
// ---------------------------------------------------------------------------

test('checkAccess() with outlet-specific role and outletId parameter', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const outletIdsToCleanup: number[] = [];

  try {
    // Create test company
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    // Create new user with ADMIN role for specific outlet
    const adminUser = await createUser(adapter, company.id, { email: 'admin-outlet-test@example.com' }, testConfig);
    userIds.push(adminUser.id);

    const outlet = await createOutlet(adapter, company.id);
    outletIdsToCleanup.push(outlet.id);
    const adminRoleId = await getRoleIdByCode(adapter, 'ADMIN');
    assert.ok(adminRoleId, 'ADMIN role should exist');

    await assignUserRole(adapter, { userId: adminUser.id,companyId:company.id,  roleId: adminRoleId, outletId: outlet.id });

    const rbac = new RBACManager(adapter, testConfig);

    // Check access WITH the outlet ID specified (should pass)
    const result1 = await rbac.checkAccess({
      userId: adminUser.id,
      companyId: company.id,
      outletId: outlet.id,
      allowedRoles: ['ADMIN'],
    });

    assert.ok(result1, 'Should return access result');
    assert.strictEqual(result1!.hasRole, true, 'Should have ADMIN role for this outlet');
    assert.strictEqual(result1!.hasOutletAccess, true, 'Should have outlet access');

    // Check access WITHOUT the outlet ID
    const result2 = await rbac.checkAccess({
      userId: adminUser.id,
      companyId: company.id,
      allowedRoles: ['ADMIN'],
    });

    assert.ok(result2, 'Should return access result');
  } finally {
    await cleanupRoleAssignments(adapter, userIds);
    await cleanupUsers(adapter, userIds);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, companyIds);
  }
});
