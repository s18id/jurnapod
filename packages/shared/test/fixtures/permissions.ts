// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical Test Fixtures for Permissions
 * 
 * Provides standardized ways to create test users with specific permission combinations
 * for the Epic 39 resource-level ACL model.
 * 
 * @example
 * ```typescript
 * import { createPermissionTestUser, PERMISSION_TEST_HELPERS } from '@jurnapod/shared/test/fixtures';
 * 
 * // Create a user with ADMIN-level accounting permissions
 * const user = await createPermissionTestUser(db, companyId, {
 *   role: 'ADMIN',
 *   module: 'accounting',
 *   permissions: { read: true, analyze: true }
 * });
 * ```
 */

import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { PERMISSION_BITS, PERMISSION_MASK, ROLE_CODES, MODULE_ROLE_DEFAULTS_API, type RoleCode } from '../../src/constants/rbac.js';
import { MODULE_CODES, type ModuleCode } from '../../src/constants/modules.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Individual permission flags
 */
export interface PermissionFlags {
  read?: boolean;
  create?: boolean;
  update?: boolean;
  delete?: boolean;
  analyze?: boolean;
  manage?: boolean;
}

/**
 * Options for creating a permission test user
 */
export interface CreatePermissionUserOptions {
  /** Role code (e.g., 'ADMIN', 'CASHIER', 'ACCOUNTANT') */
  role: RoleCode;
  /** Module code (e.g., 'accounting', 'sales', 'inventory') */
  module: ModuleCode | string;
  /** Permission flags - all default to false */
  permissions?: PermissionFlags;
  /** Optional resource for fine-grained permissions (e.g., 'users', 'journals') */
  resource?: string;
  /** Use global role assignment (default: true). If false, requires outletId */
  isGlobal?: boolean;
}

/**
 * Result of creating a permission test user
 */
export interface PermissionUserResult {
  userId: number;
  companyId: number;
  roleId: number;
  email: string;
  plainPassword: string;
  permissionMask: number;
}

/**
 * Test fixture for role assignment with permissions
 */
export interface RoleAssignmentFixture {
  roleId: number;
  roleCode: string;
  companyId: number;
  outletId: number | null;
  modulePermissions: Map<string, number>; // module.resource -> mask
}

// ---------------------------------------------------------------------------
// Permission Mask Builders
// ---------------------------------------------------------------------------

/**
 * Build a permission mask from individual flags.
 * 
 * @example
 * const mask = buildPermissionMask({ read: true, create: true }); // = 3
 */
export function buildPermissionMask(flags: PermissionFlags): number {
  let mask = 0;
  if (flags.read) mask |= PERMISSION_BITS.READ;
  if (flags.create) mask |= PERMISSION_BITS.CREATE;
  if (flags.update) mask |= PERMISSION_BITS.UPDATE;
  if (flags.delete) mask |= PERMISSION_BITS.DELETE;
  if (flags.analyze) mask |= PERMISSION_BITS.ANALYZE;
  if (flags.manage) mask |= PERMISSION_BITS.MANAGE;
  return mask;
}

/**
 * Build a permission mask from a string array of permission names.
 * 
 * @example
 * const mask = buildPermissionMaskFromArray(['read', 'create']); // = 3
 */
export function buildPermissionMaskFromArray(permissions: string[]): number {
  let mask = 0;
  for (const perm of permissions) {
    const bit = PERMISSION_BITS[perm.toUpperCase() as keyof typeof PERMISSION_BITS];
    if (bit !== undefined) {
      mask |= bit;
    }
  }
  return mask;
}

// ---------------------------------------------------------------------------
// Role Lookup Helpers
// ---------------------------------------------------------------------------

/**
 * Get the system role ID by code.
 * Returns null if role doesn't exist.
 */
export async function getRoleIdByCode(
  db: Kysely<any>,
  roleCode: string
): Promise<number | null> {
  const row = await db
    .selectFrom('roles')
    .where('code', '=', roleCode)
    .where('company_id', 'is', null) // System roles have null company_id
    .select(['id'])
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * Get all system role IDs mapped by code.
 */
export async function getSystemRoleIds(
  db: Kysely<any>
): Promise<Map<RoleCode, number>> {
  const rows = await db
    .selectFrom('roles')
    .where('code', 'in', [...ROLE_CODES])
    .where('company_id', 'is', null)
    .select(['id', 'code'])
    .execute();

  const map = new Map<RoleCode, number>();
  for (const row of rows) {
    map.set(row.code as RoleCode, row.id);
  }
  return map;
}

// ---------------------------------------------------------------------------
// User Creation with Permissions
// ---------------------------------------------------------------------------

/**
 * Create a test user with specific role and permission setup.
 * 
 * This is the canonical way to create users for permission testing.
 * It handles:
 * 1. Creating the user with a hashed password
 * 2. Assigning the role globally or to a specific outlet
 * 3. Setting up module-level (or resource-level) permissions
 * 
 * @param db - Kysely database instance
 * @param companyId - Company ID for the user
 * @param options - Permission setup options
 * @param options.role - Role code ('ADMIN', 'CASHIER', etc.)
 * @param options.module - Module code ('accounting', 'sales', etc.)
 * @param options.permissions - Which permissions to grant
 * @param options.resource - Optional resource for fine-grained control
 * @param options.isGlobal - Whether to assign role globally (default: true)
 * @param outletId - Required if isGlobal is false
 * @param password - Plain text password for the user (optional, defaults to 'TestPass123!')
 * @returns User result with IDs and plain password
 */
export async function createPermissionTestUser(
  db: Kysely<any>,
  companyId: number,
  options: CreatePermissionUserOptions,
  outletId?: number,
  password: string = 'TestPass123!'
): Promise<PermissionUserResult> {
  const { role, module, permissions = {}, resource, isGlobal = true } = options;

  // 1. Get role ID
  const roleId = await getRoleIdByCode(db, role);
  if (!roleId) {
    throw new Error(`System role '${role}' not found. Ensure roles are seeded.`);
  }

  // 2. Hash password using bcrypt
  const passwordHash = await hashPassword(password);
  const email = `perm-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  // 3. Create user
  const userResult = await db
    .insertInto('users')
    .values({
      company_id: companyId,
      email,
      password_hash: passwordHash,
      is_active: 1,
    })
    .executeTakeFirst();

  const userId = Number(userResult.insertId);

  // 4. Assign role
  if (isGlobal) {
    await db
      .insertInto('user_role_assignments')
      .values({
        company_id: companyId,
        user_id: userId,
        role_id: roleId,
        outlet_id: null,
      })
      .execute();
  } else if (outletId !== undefined) {
    await db
      .insertInto('user_role_assignments')
      .values({
        company_id: companyId,
        user_id: userId,
        role_id: roleId,
        outlet_id: outletId,
      })
      .execute();
  } else {
    throw new Error('outletId is required when isGlobal is false');
  }

  // 5. Set module/resource permissions
  const permissionMask = buildPermissionMask(permissions);

  if (!resource || typeof resource !== 'string' || resource.trim() === '') {
    throw new Error(
      `createPermissionTestUser: resource must be a non-empty string. ` +
      `Got: ${JSON.stringify(resource)}`
    );
  }

  const trimmedResource = resource.trim();

  // Use raw SQL for module_roles with resource-level permission
  await sql`
    INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
    VALUES (${companyId}, ${roleId}, ${module}, ${trimmedResource}, ${permissionMask})
    ON DUPLICATE KEY UPDATE permission_mask = ${permissionMask}
  `.execute(db);

  return {
    userId,
    companyId,
    roleId,
    email,
    plainPassword: password,
    permissionMask,
  };
}

/**
 * Create a user with default permissions from the canonical role matrix.
 * 
 * @example
 * ```typescript
 * // Create an ADMIN user with default ADMIN permissions
 * const user = await createUserWithDefaultPermissions(db, companyId, 'ADMIN');
 * 
 * // Create a CASHIER user with default CASHIER permissions
 * const cashier = await createUserWithDefaultPermissions(db, companyId, 'CASHIER');
 * ```
 */
export async function createUserWithDefaultPermissions(
  db: Kysely<any>,
  companyId: number,
  roleCode: RoleCode,
  outletId?: number,
  password: string = 'TestPass123!'
): Promise<PermissionUserResult> {
  // Get role ID
  const roleId = await getRoleIdByCode(db, roleCode);
  if (!roleId) {
    throw new Error(`System role '${roleCode}' not found.`);
  }

  // Hash password
  const passwordHash = await hashPassword(password);
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  // Create user
  const userResult = await db
    .insertInto('users')
    .values({
      company_id: companyId,
      email,
      password_hash: passwordHash,
      is_active: 1,
    })
    .executeTakeFirst();

  const userId = Number(userResult.insertId);

  // Assign role
  await db
    .insertInto('user_role_assignments')
    .values({
      company_id: companyId,
      user_id: userId,
      role_id: roleId,
      outlet_id: outletId ?? null,
    })
    .execute();

  // Get default permissions from canonical matrix
  const defaultPerms = MODULE_ROLE_DEFAULTS_API.filter((r: typeof MODULE_ROLE_DEFAULTS_API[0]) => r.roleCode === roleCode);

  // Set all default module permissions
  for (const perm of defaultPerms) {
    await sql`
      INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
      VALUES (${companyId}, ${roleId}, ${perm.module}, ${perm.resource}, ${perm.permissionMask})
      ON DUPLICATE KEY UPDATE permission_mask = ${perm.permissionMask}
    `.execute(db);
  }

  return {
    userId,
    companyId,
    roleId,
    email,
    plainPassword: password,
    permissionMask: 0, // Not applicable for default permissions
  };
}

// ---------------------------------------------------------------------------
// Convenience Helpers for Common Permission Scenarios
// ---------------------------------------------------------------------------

/**
 * Helper functions for common permission test scenarios.
 * 
 * @example
 * ```typescript
 * // Create a user with read-only access to a module
 * const readonlyUser = await PERMISSION_TEST_HELPERS.createReadOnlyUser(db, companyId, 'inventory');
 * 
 * // Create a user with full CRUD access
 * const crudUser = await PERMISSION_TEST_HELPERS.createFullCRUDUser(db, companyId, 'sales');
 * 
 * // Create a user with analyze permission for reports
 * const analystUser = await PERMISSION_TEST_HELPERS.createAnalystUser(db, companyId, 'accounting');
 * ```
 */
export const PERMISSION_TEST_HELPERS = {
  /**
   * Create a user with READ-only permission on a module.
   */
  async createReadOnlyUser(
    db: Kysely<any>,
    companyId: number,
    module: string,
    resource: string,
    role: RoleCode = 'ADMIN',
    outletId?: number
  ) {
    return createPermissionTestUser(db, companyId, {
      role,
      module,
      resource,
      permissions: { read: true },
    }, outletId);
  },

  /**
   * Create a user with CRUD (Create, Read, Update, Delete) permissions.
   */
  async createFullCRUDUser(
    db: Kysely<any>,
    companyId: number,
    module: string,
    resource: string,
    role: RoleCode = 'ADMIN',
    outletId?: number
  ) {
    return createPermissionTestUser(db, companyId, {
      role,
      module,
      resource,
      permissions: { read: true, create: true, update: true, delete: true },
    }, outletId);
  },

  /**
   * Create a user with CRUDA (CRUD + Analyze) permissions.
   */
  async createCRUDAUser(
    db: Kysely<any>,
    companyId: number,
    module: string,
    resource: string,
    role: RoleCode = 'ADMIN',
    outletId?: number
  ) {
    return createPermissionTestUser(db, companyId, {
      role,
      module,
      resource,
      permissions: { read: true, create: true, update: true, delete: true, analyze: true },
    }, outletId);
  },

  /**
   * Create a user with CRUDAM (Full) permissions.
   */
  async createFullUser(
    db: Kysely<any>,
    companyId: number,
    module: string,
    resource: string,
    role: RoleCode = 'OWNER',
    outletId?: number
  ) {
    return createPermissionTestUser(db, companyId, {
      role,
      module,
      resource,
      permissions: { read: true, create: true, update: true, delete: true, analyze: true, manage: true },
    }, outletId);
  },

  /**
   * Create a user with ANALYZE permission for reporting.
   */
  async createAnalystUser(
    db: Kysely<any>,
    companyId: number,
    module: string,
    resource: string,
    role: RoleCode = 'ACCOUNTANT',
    outletId?: number
  ) {
    return createPermissionTestUser(db, companyId, {
      role,
      module,
      resource,
      permissions: { read: true, analyze: true },
    }, outletId);
  },

  /**
   * Create a user with MANAGE permission for administrative tasks.
   */
  async createManagerUser(
    db: Kysely<any>,
    companyId: number,
    module: string,
    resource: string,
    role: RoleCode = 'COMPANY_ADMIN',
    outletId?: number
  ) {
    return createPermissionTestUser(db, companyId, {
      role,
      module,
      resource,
      permissions: { read: true, manage: true },
    }, outletId);
  },

  /**
   * Create a user with WRITE (Create + Update) permissions.
   */
  async createWriteUser(
    db: Kysely<any>,
    companyId: number,
    module: string,
    resource: string,
    role: RoleCode = 'ADMIN',
    outletId?: number
  ) {
    return createPermissionTestUser(db, companyId, {
      role,
      module,
      resource,
      permissions: { read: true, create: true, update: true },
    }, outletId);
  },
};

// ---------------------------------------------------------------------------
// Cleanup Functions
// ---------------------------------------------------------------------------

/**
 * Clean up test user and related records.
 * Call this in test afterAll to prevent test pollution.
 */
export async function cleanupTestUser(
  db: Kysely<any>,
  userId: number
): Promise<void> {
  // Delete related tokens first (foreign key constraints)
  await db.deleteFrom('email_tokens').where('user_id', '=', userId).execute();
  await db.deleteFrom('auth_refresh_tokens').where('user_id', '=', userId).execute();
  // Delete role assignments
  await db.deleteFrom('user_role_assignments').where('user_id', '=', userId).execute();
  // Delete user
  await db.deleteFrom('users').where('id', '=', userId).execute();
}

/**
 * Clean up multiple test users.
 */
export async function cleanupTestUsers(
  db: Kysely<any>,
  userIds: number[]
): Promise<void> {
  if (userIds.length === 0) return;
  for (const userId of userIds) {
    await cleanupTestUser(db, userId);
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Hash a password using bcrypt.
 * Simple wrapper for test fixture use.
 */
async function hashPassword(plain: string): Promise<string> {
  // Use dynamic import for ESM bcrypt
  const bcrypt = await import('bcryptjs');
  return bcrypt.hashSync(plain, 10);
}

// ---------------------------------------------------------------------------
// Exports for Constants
// ---------------------------------------------------------------------------

export { PERMISSION_BITS, PERMISSION_MASK, ROLE_CODES, MODULE_ROLE_DEFAULTS_API };
export { MODULE_CODES };
