/**
 * RBAC Access Check Integration Tests
 *
 * Tests RBACManager against a real database.
 * Requires AUTH_TEST_USE_DB=1 environment variable.
 *
 * Run with: AUTH_TEST_USE_DB=1 npm run test:single -w @jurnapod/auth src/rbac/access-check.integration.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert';

import { RBACManager } from './access-check.js';
import { createRealDbAdapter, closeTestPool } from '../test-utils/real-adapter.js';
import { useRealDb } from '../test-utils/test-adapter.js';
import { testConfig } from '../test-utils/mock-adapter.js';
import { createCompany, cleanupCompanies } from '../test-utils/fixtures/companies.js';
import { createUser, cleanupUsers } from '../test-utils/fixtures/users.js';
import { createOutlet, cleanupOutlets } from '../test-utils/fixtures/outlets.js';
import { getRoleIdByCode, assignUserRole, cleanupRoleAssignments } from '../test-utils/fixtures/roles.js';

// Skip all tests if real DB is not configured
const testAdapter = useRealDb ? createRealDbAdapter() : null;
const skipMessage = 'Requires AUTH_TEST_USE_DB=1';

test.describe('RBACManager Integration Tests', () => {
  let adapter: ReturnType<typeof createRealDbAdapter>;
  let companyId: number;
  let userId: number;
  const outletIdsToCleanup: number[] = [];

  test.before(async () => {
    if (!testAdapter) {
      throw new Error(skipMessage);
    }
    adapter = testAdapter;

    // Create test company
    const company = await createCompany(adapter);
    companyId = company.id;

    // Create test user
    const user = await createUser(adapter, companyId, { email: 'rbac-test@example.com' }, testConfig);
    userId = user.id;
  });

  test.after(async () => {
    if (!adapter) return;

    // Cleanup in reverse order (respecting foreign key constraints)
    await cleanupRoleAssignments(adapter, [userId]);
    await cleanupUsers(adapter, [userId]);
    await cleanupOutlets(adapter, outletIdsToCleanup);
    await cleanupCompanies(adapter, [companyId]);

    await closeTestPool();
  });

  test('getUserWithRoles() returns full profile with SUPER_ADMIN role', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // Assign SUPER_ADMIN role (global)
    const superAdminRoleId = await getRoleIdByCode(adapter, 'SUPER_ADMIN');
    assert.ok(superAdminRoleId, 'SUPER_ADMIN role should exist in database');

    await assignUserRole(adapter, { userId, roleId: superAdminRoleId });

    const rbac = new RBACManager(adapter, testConfig);
    const result = await rbac.getUserWithRoles(userId, companyId);

    assert.ok(result, 'Should return user profile');
    assert.strictEqual(result!.id, userId);
    assert.strictEqual(result!.company_id, companyId);
    assert.ok(result!.roles.includes('SUPER_ADMIN'), 'Roles should include SUPER_ADMIN');
  });

  test('getUserWithRoles() with outlet assignments', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // Create outlet
    const outlet = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(outlet.id);
    const outletId = outlet.id;

    // Assign CASHIER role for this outlet
    const cashierRoleId = await getRoleIdByCode(adapter, 'CASHIER');
    assert.ok(cashierRoleId, 'CASHIER role should exist in database');

    await assignUserRole(adapter, { userId, roleId: cashierRoleId, outletId });

    const rbac = new RBACManager(adapter, testConfig);
    const result = await rbac.getUserWithRoles(userId, companyId);

    assert.ok(result, 'Should return user profile');
    assert.ok(result!.outlet_role_assignments.length > 0, 'Should have outlet role assignments');
    assert.ok(result!.outlets.length > 0, 'Should have outlets');

    const assignment = result!.outlet_role_assignments.find((a) => a.outlet_id === outletId);
    assert.ok(assignment, 'Should have assignment for the created outlet');
    assert.ok(assignment!.role_codes.includes('CASHIER'), 'Assignment should include CASHIER role');
  });

  test('hasOutletAccess() returns true for SUPER_ADMIN', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // User already has SUPER_ADMIN from first test
    const outlet = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(outlet.id);

    const rbac = new RBACManager(adapter, testConfig);
    const hasAccess = await rbac.hasOutletAccess(userId, companyId, outlet.id);

    assert.strictEqual(hasAccess, true, 'SUPER_ADMIN should have access to any outlet');
  });

  test('hasOutletAccess() returns true for global role (OWNER)', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // Create new user with OWNER role (is_global=1)
    const ownerUser = await createUser(adapter, companyId, { email: 'owner-test@example.com' }, testConfig);
    const ownerUserId = ownerUser.id;

    const ownerRoleId = await getRoleIdByCode(adapter, 'OWNER');
    assert.ok(ownerRoleId, 'OWNER role should exist in database');

    await assignUserRole(adapter, { userId: ownerUserId, roleId: ownerRoleId });

    const outlet = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(outlet.id);
    const rbac = new RBACManager(adapter, testConfig);

    const hasAccess = await rbac.hasOutletAccess(ownerUserId, companyId, outlet.id);

    assert.strictEqual(hasAccess, true, 'Global OWNER role should have outlet access');

    // Cleanup
    await cleanupRoleAssignments(adapter, [ownerUserId]);
    await cleanupUsers(adapter, [ownerUserId]);
  });

  test('hasOutletAccess() returns true for outlet-specific assignment', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // Create new user with only outlet-specific role
    const cashierUser = await createUser(adapter, companyId, { email: 'cashier-outlet-test@example.com' }, testConfig);
    const cashierUserId = cashierUser.id;

    const outlet = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(outlet.id);
    const cashierRoleId = await getRoleIdByCode(adapter, 'CASHIER');
    assert.ok(cashierRoleId, 'CASHIER role should exist');

    // Assign CASHIER only for specific outlet
    await assignUserRole(adapter, { userId: cashierUserId, roleId: cashierRoleId, outletId: outlet.id });

    const rbac = new RBACManager(adapter, testConfig);
    const hasAccess = await rbac.hasOutletAccess(cashierUserId, companyId, outlet.id);

    assert.strictEqual(hasAccess, true, 'User with outlet-specific role should have access to that outlet');

    // Should NOT have access to a different outlet
    const otherOutlet = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(otherOutlet.id);
    const hasAccessToOther = await rbac.hasOutletAccess(cashierUserId, companyId, otherOutlet.id);

    assert.strictEqual(hasAccessToOther, false, 'User should not have access to unassigned outlet');

    // Cleanup
    await cleanupRoleAssignments(adapter, [cashierUserId]);
    await cleanupUsers(adapter, [cashierUserId]);
  });

  test('hasOutletAccess() returns false for user with no roles', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // Create user with no roles
    const noRoleUser = await createUser(adapter, companyId, { email: 'norole-test@example.com' }, testConfig);
    const noRoleUserId = noRoleUser.id;

    const outlet = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(outlet.id);
    const rbac = new RBACManager(adapter, testConfig);

    const hasAccess = await rbac.hasOutletAccess(noRoleUserId, companyId, outlet.id);

    assert.strictEqual(hasAccess, false, 'User with no roles should not have outlet access');

    // Cleanup
    await cleanupUsers(adapter, [noRoleUserId]);
  });

  test('checkAccess() detects SUPER_ADMIN', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    const rbac = new RBACManager(adapter, testConfig);
    const result = await rbac.checkAccess({ userId, companyId });

    assert.ok(result, 'Should return access result');
    assert.strictEqual(result!.isSuperAdmin, true, 'Should be detected as SUPER_ADMIN');
    assert.strictEqual(result!.hasGlobalRole, true, 'Should have global role');
  });

  test('checkAccess() validates allowedRoles correctly', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // Create new user with OWNER role
    const ownerUser = await createUser(adapter, companyId, { email: 'checkaccess-test@example.com' }, testConfig);
    const ownerUserId = ownerUser.id;

    const ownerRoleId = await getRoleIdByCode(adapter, 'OWNER');
    assert.ok(ownerRoleId, 'OWNER role should exist');

    await assignUserRole(adapter, { userId: ownerUserId, roleId: ownerRoleId });

    const rbac = new RBACManager(adapter, testConfig);

    // Check with OWNER in allowedRoles (should pass)
    const result1 = await rbac.checkAccess({
      userId: ownerUserId,
      companyId,
      allowedRoles: ['OWNER', 'ADMIN'],
    });

    assert.ok(result1, 'Should return access result');
    assert.strictEqual(result1!.hasRole, true, 'Should have OWNER role when allowed');

    // Check with different roles (should fail)
    const result2 = await rbac.checkAccess({
      userId: ownerUserId,
      companyId,
      allowedRoles: ['ACCOUNTANT', 'CASHIER'],
    });

    assert.ok(result2, 'Should return access result');
    assert.strictEqual(result2!.hasRole, false, 'Should not have ACCOUNTANT or CASHIER role');

    // Cleanup
    await cleanupRoleAssignments(adapter, [ownerUserId]);
    await cleanupUsers(adapter, [ownerUserId]);
  });

  test('listUserOutletIds() returns correct outlets', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // Create new user with outlet assignments
    const multiOutletUser = await createUser(adapter, companyId, { email: 'multioutlet-test@example.com' }, testConfig);
    const multiOutletUserId = multiOutletUser.id;

    const outlet1 = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(outlet1.id);
    const outlet2 = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(outlet2.id);
    const cashierRoleId = await getRoleIdByCode(adapter, 'CASHIER');
    assert.ok(cashierRoleId, 'CASHIER role should exist');

    // Assign user to both outlets
    await assignUserRole(adapter, { userId: multiOutletUserId, roleId: cashierRoleId, outletId: outlet1.id });
    await assignUserRole(adapter, { userId: multiOutletUserId, roleId: cashierRoleId, outletId: outlet2.id });

    const rbac = new RBACManager(adapter, testConfig);
    const userOutletIds = await rbac.listUserOutletIds(multiOutletUserId, companyId);

    assert.strictEqual(userOutletIds.length, 2, 'Should have 2 outlet IDs');
    assert.ok(userOutletIds.includes(outlet1.id), 'Should include first outlet ID');
    assert.ok(userOutletIds.includes(outlet2.id), 'Should include second outlet ID');

    // Cleanup
    await cleanupRoleAssignments(adapter, [multiOutletUserId]);
    await cleanupUsers(adapter, [multiOutletUserId]);
  });

  test('checkAccess() with outlet-specific role and outletId parameter', async (t) => {
    if (!adapter) {
      t.skip(skipMessage);
      return;
    }

    // Create new user with ADMIN role for specific outlet
    const adminUser = await createUser(adapter, companyId, { email: 'admin-outlet-test@example.com' }, testConfig);
    const adminUserId = adminUser.id;

    const outlet = await createOutlet(adapter, companyId);
    outletIdsToCleanup.push(outlet.id);
    const adminRoleId = await getRoleIdByCode(adapter, 'ADMIN');
    assert.ok(adminRoleId, 'ADMIN role should exist');

    await assignUserRole(adapter, { userId: adminUserId, roleId: adminRoleId, outletId: outlet.id });

    const rbac = new RBACManager(adapter, testConfig);

    // Check access WITH the outlet ID specified (should pass)
    const result1 = await rbac.checkAccess({
      userId: adminUserId,
      companyId,
      outletId: outlet.id,
      allowedRoles: ['ADMIN'],
    });

    assert.ok(result1, 'Should return access result');
    assert.strictEqual(result1!.hasRole, true, 'Should have ADMIN role for this outlet');
    assert.strictEqual(result1!.hasOutletAccess, true, 'Should have outlet access');

    // Check access WITHOUT the outlet ID
    const result2 = await rbac.checkAccess({
      userId: adminUserId,
      companyId,
      allowedRoles: ['ADMIN'],
    });

    assert.ok(result2, 'Should return access result');

    // Cleanup
    await cleanupRoleAssignments(adapter, [adminUserId]);
    await cleanupUsers(adapter, [adminUserId]);
  });
});
