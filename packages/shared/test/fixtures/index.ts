// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test Fixtures for @jurnapod/shared
 * 
 * Re-exports permission test fixtures and helpers.
 */

export {
  buildPermissionMask,
  buildPermissionMaskFromArray,
  getRoleIdByCode,
  getSystemRoleIds,
  createPermissionTestUser,
  createUserWithDefaultPermissions,
  cleanupTestUser,
  cleanupTestUsers,
  PERMISSION_TEST_HELPERS,
  type CreatePermissionUserOptions,
  type PermissionFlags,
  type PermissionUserResult,
  type RoleAssignmentFixture,
} from './permissions.js';

export { PERMISSION_BITS, PERMISSION_MASK, ROLE_CODES, MODULE_ROLE_DEFAULTS_API } from '../../src/constants/rbac.js';
export { MODULE_CODES, type ModuleCode } from '../../src/constants/modules.js';
