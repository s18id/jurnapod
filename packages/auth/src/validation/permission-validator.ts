/**
 * Permission Validator - Validates DB permissions match canonical constants
 * 
 * This module provides validation functions to ensure that permissions stored
 * in the database match the Epic 39 canonical permission bits:
 * - READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32
 * 
 * SOURCE OF TRUTH: @jurnapod/shared/src/constants/roles.defaults.json
 * 
 * Use validateAllRoles() to check all system roles have correct permissions.
 */
import {
  PERMISSION_BITS,
  PERMISSION_MASK,
  ROLE_CODES,
  MODULE_ROLE_DEFAULTS_API,
  type RoleCode
} from '@jurnapod/shared';

// Re-export canonical bits and masks for backward compatibility
export const CANONICAL_BITS = {
  read: PERMISSION_BITS.READ,
  create: PERMISSION_BITS.CREATE,
  update: PERMISSION_BITS.UPDATE,
  delete: PERMISSION_BITS.DELETE,
  analyze: PERMISSION_BITS.ANALYZE,
  manage: PERMISSION_BITS.MANAGE,
} as const;

export { PERMISSION_MASK as MASKS };

export type { RoleCode };

/**
 * Validation result for a single permission check
 */
export interface PermissionValidationResult {
  valid: boolean;
  roleCode: RoleCode;
  module: string;
  resource: string | null;
  expectedMask: number;
  actualMask: number | null;
  issues: string[];
}

/**
 * Role permission validation result
 */
export interface RolePermissionValidationResult {
  roleCode: RoleCode;
  isValid: boolean;
  permissions: PermissionValidationResult[];
  missingPermissions: string[];
  invalidPermissions: string[];
}

/**
 * Full validation report
 */
export interface FullValidationReport {
  isValid: boolean;
  totalRoles: number;
  validRoles: number;
  invalidRoles: number;
  roleResults: RolePermissionValidationResult[];
  summary: string;
}

/**
 * Validate permission bits match canonical values
 */
export function validatePermissionBits(): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  
  // Check PERMISSION_BITS matches canonical values
  const expected = {
    read: 1,
    create: 2,
    update: 4,
    delete: 8,
    analyze: 16,
    manage: 32
  };
  
  for (const [perm, expectedBit] of Object.entries(expected)) {
    const actualBit = PERMISSION_BITS[perm.toUpperCase() as keyof typeof PERMISSION_BITS];
    if (actualBit !== expectedBit) {
      mismatches.push(
        `PERMISSION_BITS.${perm}: expected ${expectedBit}, got ${actualBit}`
      );
    }
  }
  
  return { valid: mismatches.length === 0, mismatches };
}

/**
 * Validate a specific role's permissions against expected matrix
 */
export function validateRolePermissions(
  roleCode: RoleCode,
  dbPermissions: Array<{ module: string; resource: string | null; permission_mask: number | string }>
): RolePermissionValidationResult {
  // MODULE_ROLE_DEFAULTS_API has separate module and resource fields
  const expectedPermissions = MODULE_ROLE_DEFAULTS_API.filter(p => p.roleCode === roleCode);
  const permissions: PermissionValidationResult[] = [];
  const missingPermissions: string[] = [];
  const invalidPermissions: string[] = [];
  
  // Build a map of actual DB permissions
  const dbPermMap = new Map<string, number>();
  for (const dbPerm of dbPermissions) {
    const key = `${dbPerm.module}:${dbPerm.resource ?? 'null'}`;
    dbPermMap.set(key, Number(dbPerm.permission_mask));
  }
  
  // Check each expected permission
  for (const expected of expectedPermissions) {
    const key = `${expected.module}:${expected.resource}`;
    const actualMask = dbPermMap.get(key) ?? null;
    
    const result: PermissionValidationResult = {
      valid: actualMask === expected.permissionMask,
      roleCode,
      module: expected.module,
      resource: expected.resource,
      expectedMask: expected.permissionMask,
      actualMask,
      issues: []
    };
    
    if (actualMask === null) {
      if (expected.permissionMask > 0) {
        missingPermissions.push(key);
        result.issues.push(`Missing permission ${key} (expected mask ${expected.permissionMask})`);
      }
    } else if (actualMask !== expected.permissionMask) {
      invalidPermissions.push(`${key}: expected ${expected.permissionMask}, got ${actualMask}`);
      result.issues.push(`Invalid mask: expected ${expected.permissionMask}, got ${actualMask}`);
    }
    
    permissions.push(result);
  }
  
  return {
    roleCode,
    isValid: missingPermissions.length === 0 && invalidPermissions.length === 0,
    permissions,
    missingPermissions,
    invalidPermissions
  };
}

/**
 * Validate all system roles have correct permissions
 * Returns a full validation report
 */
export function validateAllRoles(
  dbPermissions: Array<{
    role_code: string;
    module: string;
    resource: string | null;
    permission_mask: number | string
  }>
): FullValidationReport {
  const roleResults: RolePermissionValidationResult[] = [];
  let validRoles = 0;
  let invalidRoles = 0;
  
  for (const roleCode of ROLE_CODES) {
    const rolePerms = dbPermissions.filter(p => p.role_code === roleCode);
    const result = validateRolePermissions(roleCode, rolePerms);
    roleResults.push(result);
    
    if (result.isValid) {
      validRoles++;
    } else {
      invalidRoles++;
    }
  }
  
  const isValid = invalidRoles === 0;
  const summary = isValid
    ? `All ${ROLE_CODES.length} roles have correct permissions`
    : `${invalidRoles} of ${ROLE_CODES.length} roles have incorrect permissions`;
  
  return {
    isValid,
    totalRoles: ROLE_CODES.length,
    validRoles,
    invalidRoles,
    roleResults,
    summary
  };
}

/**
 * Format a validation report for console output
 */
export function formatValidationReport(report: FullValidationReport): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(70));
  lines.push('PERMISSION VALIDATION REPORT OUTPUT');
  lines.push('='.repeat(70));
  lines.push(`Overall: ${report.isValid ? '✓ VALID' : '✗ INVALID'}`);
  lines.push(`Roles: ${report.validRoles}/${report.totalRoles} valid`);
  lines.push('');
  
  for (const roleResult of report.roleResults) {
    const status = roleResult.isValid ? '✓' : '✗';
    lines.push(`${status} ${roleResult.roleCode}`);
    
    if (!roleResult.isValid) {
      if (roleResult.missingPermissions.length > 0) {
        lines.push(`  Missing: ${roleResult.missingPermissions.join(', ')}`);
      }
      if (roleResult.invalidPermissions.length > 0) {
        lines.push(`  Invalid: ${roleResult.invalidPermissions.join(', ')}`);
      }
    }
  }
  
  lines.push('='.repeat(70));
  lines.push(report.summary);
  lines.push('='.repeat(70));
  
  return lines.join('\n');
}
