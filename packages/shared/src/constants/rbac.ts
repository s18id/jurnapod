// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical permission bit definitions for RBAC.
 * ALL packages must use these constants — no local duplicates allowed.
 * 
 * Bit layout:
 * - 1  (0b00001): READ
 * - 2  (0b00010): CREATE
 * - 4  (0b00100): UPDATE
 * - 8  (0b01000): DELETE
 * - 16 (0b10000): ANALYZE
 * - 32 (0b100000): MANAGE
 */
export const PERMISSION_BITS = {
  READ:    1,    // 0b000001
  CREATE:  2,    // 0b000010
  UPDATE:  4,    // 0b000100
  DELETE:  8,    // 0b001000
  ANALYZE: 16,   // 0b010000 // (was REPORT)
  MANAGE:  32,   // 0b100000 - NEW
} as const;

export type PermissionBit = keyof typeof PERMISSION_BITS;

/**
 * Composite permission masks for common combinations.
 */
export const PERMISSION_MASK = {
  READ:    PERMISSION_BITS.READ,
  WRITE:   PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE,
  CRUD:    PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE,
  CRUDA:   PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE | PERMISSION_BITS.ANALYZE,
  CRUDAM:  PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE | PERMISSION_BITS.ANALYZE | PERMISSION_BITS.MANAGE, // 0b111111
} as const;

/**
 * Role codes enum
 */
export const ROLE_CODES = ['SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT'] as const;
export type RoleCode = typeof ROLE_CODES[number];

// Import JSON data synchronously
import roleDefaults from './roles.defaults.json';

/**
 * Role permission matrix - maps role × module.resource to permission mask.
 * SOURCE OF TRUTH: roles.defaults.json
 * 
 * Format: module.resource (e.g., "platform.users", "accounting.journals")
 */
function buildRolePermissionMatrix() {
  const result: { roleCode: string; moduleResource: string; permissionMask: number }[] = [];
  
  const roles = roleDefaults.roles as Record<string, Record<string, number>>;
  for (const [roleCode, permissions] of Object.entries(roles)) {
    for (const [moduleResource, permissionMask] of Object.entries(permissions)) {
      result.push({ roleCode, moduleResource, permissionMask });
    }
  }
  
  return result;
}

export const ROLE_PERMISSION_MATRIX: readonly {
  roleCode: string;
  moduleResource: string;
  permissionMask: number;
}[] = buildRolePermissionMatrix();

/**
 * Flat array format for MODULE_ROLE_DEFAULTS (backward compatible)
 * Format: module.resource (e.g., "platform.users")
 */
export const MODULE_ROLE_DEFAULTS: readonly {
  roleCode: string;
  module: string;
  permissionMask: number;
}[] = ROLE_PERMISSION_MATRIX.map(({ roleCode, moduleResource, permissionMask }) => {
  const [module] = moduleResource.split('.');
  return { roleCode, module, permissionMask };
});

/**
 * MODULE_ROLE_DEFAULTS with separate module and resource columns
 * For API consumption (insert into module_roles table)
 */
export const MODULE_ROLE_DEFAULTS_API: readonly {
  roleCode: string;
  module: string;
  resource: string;
  permissionMask: number;
}[] = ROLE_PERMISSION_MATRIX.map(({ roleCode, moduleResource, permissionMask }) => {
  const [module, resource] = moduleResource.split('.');
  return { roleCode, module, resource, permissionMask };
});

/**
 * Lookup map for fast permission check
 * Key: roleCode:module (e.g., "OWNER:platform.users")
 */
export const PERMISSION_MAP: ReadonlyMap<string, number> = new Map(
  MODULE_ROLE_DEFAULTS.map((r) => [`${r.roleCode}:${r.module}`, r.permissionMask])
);
