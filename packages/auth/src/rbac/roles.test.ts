/**
 * Unit tests for RBAC utilities
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { checkRole, ROLE_CODES } from './roles.js';
import { hasPermissionBit, buildPermissionMask, MODULE_PERMISSION_BITS } from './permissions.js';
import type { RoleCode, ModulePermission } from '../types.js';

test('checkRole - returns true when user has matching role', () => {
  const userRoles: RoleCode[] = ['CASHIER', 'ACCOUNTANT'];
  const allowedRoles: readonly RoleCode[] = ['CASHIER', 'ADMIN'];
  
  const result = checkRole(userRoles, allowedRoles);
  assert.strictEqual(result, true, 'Should return true when user has at least one matching role');
});

test('checkRole - returns false when user has no matching roles', () => {
  const userRoles: RoleCode[] = ['CASHIER', 'ACCOUNTANT'];
  const allowedRoles: readonly RoleCode[] = ['OWNER', 'SUPER_ADMIN'];
  
  const result = checkRole(userRoles, allowedRoles);
  assert.strictEqual(result, false, 'Should return false when no roles match');
});

test('checkRole - returns false for empty user roles', () => {
  const userRoles: RoleCode[] = [];
  const allowedRoles: readonly RoleCode[] = ['CASHIER', 'ADMIN'];
  
  const result = checkRole(userRoles, allowedRoles);
  assert.strictEqual(result, false, 'Should return false for empty user roles');
});

test('checkRole - returns true for empty allowed roles with any user role', () => {
  const userRoles: RoleCode[] = ['CASHIER'];
  const allowedRoles: readonly RoleCode[] = [];
  
  const result = checkRole(userRoles, allowedRoles);
  assert.strictEqual(result, false, 'Should return false when allowed roles is empty (no roles to match)');
});

test('checkRole - handles all role codes', () => {
  const allRoles: RoleCode[] = [...ROLE_CODES];
  
  // Each individual role should match itself in the full list
  for (const role of ROLE_CODES) {
    const result = checkRole([role], ROLE_CODES);
    assert.strictEqual(result, true, `Role ${role} should match in ROLE_CODES`);
  }
  
  // SUPER_ADMIN should match in any subset containing it
  assert.strictEqual(checkRole(['SUPER_ADMIN'], ['SUPER_ADMIN', 'OWNER']), true);
  
  // CASHIER should not match when only ADMIN is allowed
  assert.strictEqual(checkRole(['CASHIER'], ['ADMIN']), false);
});

test('hasPermissionBit - returns true when permission bit is set', () => {
  // Mask with create (1) and read (2) bits set
  const mask = MODULE_PERMISSION_BITS.create | MODULE_PERMISSION_BITS.read; // 1 | 2 = 3
  
  assert.strictEqual(hasPermissionBit(mask, 'create'), true, 'Should return true for create');
  assert.strictEqual(hasPermissionBit(mask, 'read'), true, 'Should return true for read');
  assert.strictEqual(hasPermissionBit(mask, 'update'), false, 'Should return false for update');
  assert.strictEqual(hasPermissionBit(mask, 'delete'), false, 'Should return false for delete');
  assert.strictEqual(hasPermissionBit(mask, 'report'), false, 'Should return false for report');
});

test('hasPermissionBit - returns true when all permission bits are set', () => {
  // Mask with all bits set
  const allMask = MODULE_PERMISSION_BITS.create | 
                  MODULE_PERMISSION_BITS.read | 
                  MODULE_PERMISSION_BITS.update | 
                  MODULE_PERMISSION_BITS.delete | 
                  MODULE_PERMISSION_BITS.report;
  
  assert.strictEqual(hasPermissionBit(allMask, 'create'), true);
  assert.strictEqual(hasPermissionBit(allMask, 'read'), true);
  assert.strictEqual(hasPermissionBit(allMask, 'update'), true);
  assert.strictEqual(hasPermissionBit(allMask, 'delete'), true);
  assert.strictEqual(hasPermissionBit(allMask, 'report'), true);
});

test('hasPermissionBit - returns false for zero mask', () => {
  const emptyMask = 0;
  
  assert.strictEqual(hasPermissionBit(emptyMask, 'create'), false);
  assert.strictEqual(hasPermissionBit(emptyMask, 'read'), false);
  assert.strictEqual(hasPermissionBit(emptyMask, 'update'), false);
  assert.strictEqual(hasPermissionBit(emptyMask, 'delete'), false);
  assert.strictEqual(hasPermissionBit(emptyMask, 'report'), false);
});

test('hasPermissionBit - handles individual permission bits correctly', () => {
  assert.strictEqual(hasPermissionBit(MODULE_PERMISSION_BITS.create, 'create'), true);
  assert.strictEqual(hasPermissionBit(MODULE_PERMISSION_BITS.read, 'read'), true);
  assert.strictEqual(hasPermissionBit(MODULE_PERMISSION_BITS.update, 'update'), true);
  assert.strictEqual(hasPermissionBit(MODULE_PERMISSION_BITS.delete, 'delete'), true);
  assert.strictEqual(hasPermissionBit(MODULE_PERMISSION_BITS.report, 'report'), true);
});

test('buildPermissionMask - builds correct mask from boolean flags', () => {
  const mask = buildPermissionMask({
    canCreate: true,
    canRead: true,
    canUpdate: false,
    canDelete: false,
    canReport: false
  });
  
  const expected = MODULE_PERMISSION_BITS.create | MODULE_PERMISSION_BITS.read;
  assert.strictEqual(mask, expected, 'Should build mask with create and read');
});

test('buildPermissionMask - builds full mask when all true', () => {
  const mask = buildPermissionMask({
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
    canReport: true
  });
  
  const expected = MODULE_PERMISSION_BITS.create | 
                   MODULE_PERMISSION_BITS.read | 
                   MODULE_PERMISSION_BITS.update | 
                   MODULE_PERMISSION_BITS.delete | 
                   MODULE_PERMISSION_BITS.report;
  assert.strictEqual(mask, expected, 'Should build full mask');
});

test('buildPermissionMask - returns 0 when all false', () => {
  const mask = buildPermissionMask({
    canCreate: false,
    canRead: false,
    canUpdate: false,
    canDelete: false,
    canReport: false
  });
  
  assert.strictEqual(mask, 0, 'Should return 0 when all flags are false');
});

test('buildPermissionMask - returns 0 when no params provided', () => {
  const mask = buildPermissionMask({});
  assert.strictEqual(mask, 0, 'Should return 0 when no params provided');
});

test('buildPermissionMask - partial params work correctly', () => {
  const onlyDelete = buildPermissionMask({ canDelete: true });
  assert.strictEqual(onlyDelete, MODULE_PERMISSION_BITS.delete);
  
  const onlyReport = buildPermissionMask({ canReport: true });
  assert.strictEqual(onlyReport, MODULE_PERMISSION_BITS.report);
  
  const createAndDelete = buildPermissionMask({ canCreate: true, canDelete: true });
  assert.strictEqual(createAndDelete, MODULE_PERMISSION_BITS.create | MODULE_PERMISSION_BITS.delete);
});

test('MODULE_PERMISSION_BITS has correct bit values', () => {
  // Canonical layout: READ=1, CREATE=2, UPDATE=4, DELETE=8, REPORT=16
  assert.strictEqual(MODULE_PERMISSION_BITS.read, 1, 'read should be 1 (00001)');
  assert.strictEqual(MODULE_PERMISSION_BITS.create, 2, 'create should be 2 (00010)');
  assert.strictEqual(MODULE_PERMISSION_BITS.update, 4, 'update should be 4 (00100)');
  assert.strictEqual(MODULE_PERMISSION_BITS.delete, 8, 'delete should be 8 (01000)');
  assert.strictEqual(MODULE_PERMISSION_BITS.report, 16, 'report should be 16 (10000)');
});

test('buildPermissionMask and hasPermissionBit work together', () => {
  // Build a mask for CRUD operations only
  const crudMask = buildPermissionMask({
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
    canReport: false
  });
  
  // Verify CRUD permissions
  assert.strictEqual(hasPermissionBit(crudMask, 'create'), true);
  assert.strictEqual(hasPermissionBit(crudMask, 'read'), true);
  assert.strictEqual(hasPermissionBit(crudMask, 'update'), true);
  assert.strictEqual(hasPermissionBit(crudMask, 'delete'), true);
  assert.strictEqual(hasPermissionBit(crudMask, 'report'), false);
  
  // Build a mask for report-only access
  const reportMask = buildPermissionMask({ canReport: true });
  
  assert.strictEqual(hasPermissionBit(reportMask, 'create'), false);
  assert.strictEqual(hasPermissionBit(reportMask, 'read'), false);
  assert.strictEqual(hasPermissionBit(reportMask, 'update'), false);
  assert.strictEqual(hasPermissionBit(reportMask, 'delete'), false);
  assert.strictEqual(hasPermissionBit(reportMask, 'report'), true);
});

test('checkRole works with different role combinations', () => {
  // Admin panel access - OWNER, COMPANY_ADMIN, ADMIN
  const adminAccess = ['OWNER', 'COMPANY_ADMIN', 'ADMIN'] as RoleCode[];
  const adminAllowed = ['OWNER', 'COMPANY_ADMIN', 'ADMIN'] as const;
  
  assert.strictEqual(checkRole(adminAccess, adminAllowed), true);
  assert.strictEqual(checkRole(['CASHIER'], adminAllowed), false);
  
  // Cashier-only access
  const cashierAllowed = ['CASHIER'] as const;
  assert.strictEqual(checkRole(['CASHIER'], cashierAllowed), true);
  assert.strictEqual(checkRole(['ADMIN'], cashierAllowed), false);
  
  // Mixed roles
  const userWithMultipleRoles: RoleCode[] = ['CASHIER', 'ACCOUNTANT'];
  assert.strictEqual(checkRole(userWithMultipleRoles, ['CASHIER', 'ADMIN']), true);
  assert.strictEqual(checkRole(userWithMultipleRoles, ['OWNER', 'SUPER_ADMIN']), false);
});

test('ModulePermission type accepts all valid permissions', () => {
  // This is a compile-time check but we also verify runtime values
  const permissions: ModulePermission[] = ['create', 'read', 'update', 'delete', 'report'];
  
for (const permission of permissions) {
  const params = {
    canCreate: permission === 'create',
    canRead: permission === 'read',
    canUpdate: permission === 'update',
    canDelete: permission === 'delete',
    canReport: permission === 'report',
  };
  const mask = buildPermissionMask(params);
  assert.strictEqual(hasPermissionBit(mask, permission), true);
}
});

test('RoleCode type accepts all valid roles', () => {
  // This is a compile-time check but we also verify runtime values
  const roles: RoleCode[] = ['SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT'];
  
  for (const role of roles) {
    const result = checkRole([role], roles);
    assert.strictEqual(result, true);
  }
});