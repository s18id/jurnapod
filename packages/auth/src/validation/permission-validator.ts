/**
 * Permission Validator - Validates DB permissions match canonical constants
 * 
 * This module provides validation functions to ensure that permissions stored
 * in the database match the Epic 39 canonical permission bits:
 * - READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32
 * 
 * Use validateAllRoles() to check all system roles have correct permissions.
 */
import { MODULE_PERMISSION_BITS, ROLE_CODES, type RoleCode, type ModulePermission } from '../types.js';

// Canonical permission bits (from @jurnapod/shared)
const CANONICAL_BITS = {
  read: 1,
  create: 2,
  update: 4,
  delete: 8,
  analyze: 16,
  manage: 32
};

// Composite masks
const MASKS = {
  CRUD: 15,      // 1+2+4+8
  CRUDA: 31,     // +16
  CRUDAM: 63     // +32
};

export { CANONICAL_BITS, MASKS };

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

// Permission matrix from @jurnapod/modules-platform (canonical source)
const PERMISSION_MATRIX: Array<{ roleCode: RoleCode; module: string; resource: string; mask: number }> = [
  // SUPER_ADMIN - full CRUDAM to all
  { roleCode: "SUPER_ADMIN", module: "platform", resource: "companies", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "platform", resource: "users", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "platform", resource: "roles", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "platform", resource: "outlets", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "platform", resource: "settings", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "accounting", resource: "accounts", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "accounting", resource: "journals", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "accounting", resource: "fiscal_years", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "accounting", resource: "reports", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "treasury", resource: "transactions", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "treasury", resource: "accounts", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "sales", resource: "invoices", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "sales", resource: "orders", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "sales", resource: "payments", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "inventory", resource: "items", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "inventory", resource: "stock", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "inventory", resource: "costing", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "pos", resource: "transactions", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "pos", resource: "config", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "reservations", resource: "bookings", mask: MASKS.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "reservations", resource: "tables", mask: MASKS.CRUDAM },

  // OWNER - full CRUDAM to all
  { roleCode: "OWNER", module: "platform", resource: "companies", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "platform", resource: "users", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "platform", resource: "roles", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "platform", resource: "outlets", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "platform", resource: "settings", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "accounting", resource: "accounts", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "accounting", resource: "journals", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "accounting", resource: "fiscal_years", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "accounting", resource: "reports", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "treasury", resource: "transactions", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "treasury", resource: "accounts", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "sales", resource: "invoices", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "sales", resource: "orders", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "sales", resource: "payments", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "inventory", resource: "items", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "inventory", resource: "stock", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "inventory", resource: "costing", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "pos", resource: "transactions", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "pos", resource: "config", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "reservations", resource: "bookings", mask: MASKS.CRUDAM },
  { roleCode: "OWNER", module: "reservations", resource: "tables", mask: MASKS.CRUDAM },

  // COMPANY_ADMIN
  { roleCode: "COMPANY_ADMIN", module: "platform", resource: "companies", mask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "platform", resource: "users", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "platform", resource: "roles", mask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "platform", resource: "outlets", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "platform", resource: "settings", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "accounting", resource: "accounts", mask: CANONICAL_BITS.read | CANONICAL_BITS.manage },
  { roleCode: "COMPANY_ADMIN", module: "accounting", resource: "journals", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "accounting", resource: "fiscal_years", mask: CANONICAL_BITS.read | CANONICAL_BITS.manage },
  { roleCode: "COMPANY_ADMIN", module: "accounting", resource: "reports", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "treasury", resource: "transactions", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "treasury", resource: "accounts", mask: CANONICAL_BITS.read | CANONICAL_BITS.manage },
  { roleCode: "COMPANY_ADMIN", module: "sales", resource: "invoices", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "sales", resource: "orders", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "sales", resource: "payments", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "inventory", resource: "items", mask: MASKS.CRUD },
  { roleCode: "COMPANY_ADMIN", module: "inventory", resource: "stock", mask: MASKS.CRUD },
  { roleCode: "COMPANY_ADMIN", module: "inventory", resource: "costing", mask: CANONICAL_BITS.read | CANONICAL_BITS.manage },
  { roleCode: "COMPANY_ADMIN", module: "pos", resource: "transactions", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "pos", resource: "config", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "reservations", resource: "bookings", mask: MASKS.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "reservations", resource: "tables", mask: MASKS.CRUDA },

  // ADMIN
  { roleCode: "ADMIN", module: "platform", resource: "companies", mask: 0 },
  { roleCode: "ADMIN", module: "platform", resource: "users", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "platform", resource: "roles", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "platform", resource: "outlets", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "platform", resource: "settings", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "accounting", resource: "accounts", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "accounting", resource: "journals", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "accounting", resource: "fiscal_years", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "accounting", resource: "reports", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "treasury", resource: "transactions", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "treasury", resource: "accounts", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "sales", resource: "invoices", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "sales", resource: "orders", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "sales", resource: "payments", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "inventory", resource: "items", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "inventory", resource: "stock", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "inventory", resource: "costing", mask: CANONICAL_BITS.read },
  { roleCode: "ADMIN", module: "pos", resource: "transactions", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "pos", resource: "config", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "reservations", resource: "bookings", mask: MASKS.CRUDA },
  { roleCode: "ADMIN", module: "reservations", resource: "tables", mask: CANONICAL_BITS.read },

  // CASHIER
  { roleCode: "CASHIER", module: "platform", resource: "companies", mask: 0 },
  { roleCode: "CASHIER", module: "platform", resource: "users", mask: 0 },
  { roleCode: "CASHIER", module: "platform", resource: "roles", mask: 0 },
  { roleCode: "CASHIER", module: "platform", resource: "outlets", mask: CANONICAL_BITS.read },
  { roleCode: "CASHIER", module: "platform", resource: "settings", mask: 0 },
  { roleCode: "CASHIER", module: "accounting", resource: "accounts", mask: 0 },
  { roleCode: "CASHIER", module: "accounting", resource: "journals", mask: 0 },
  { roleCode: "CASHIER", module: "accounting", resource: "fiscal_years", mask: 0 },
  { roleCode: "CASHIER", module: "accounting", resource: "reports", mask: 0 },
  { roleCode: "CASHIER", module: "treasury", resource: "transactions", mask: 0 },
  { roleCode: "CASHIER", module: "treasury", resource: "accounts", mask: CANONICAL_BITS.read },
  { roleCode: "CASHIER", module: "sales", resource: "invoices", mask: MASKS.CRUDA },
  { roleCode: "CASHIER", module: "sales", resource: "orders", mask: MASKS.CRUDA },
  { roleCode: "CASHIER", module: "sales", resource: "payments", mask: MASKS.CRUDA },
  { roleCode: "CASHIER", module: "inventory", resource: "items", mask: CANONICAL_BITS.read },
  { roleCode: "CASHIER", module: "inventory", resource: "stock", mask: 0 },
  { roleCode: "CASHIER", module: "pos", resource: "transactions", mask: MASKS.CRUDA },
  { roleCode: "CASHIER", module: "pos", resource: "config", mask: 0 },
  { roleCode: "CASHIER", module: "reservations", resource: "bookings", mask: MASKS.CRUDA },
  { roleCode: "CASHIER", module: "reservations", resource: "tables", mask: MASKS.CRUDA },

  // ACCOUNTANT
  { roleCode: "ACCOUNTANT", module: "platform", resource: "companies", mask: 0 },
  { roleCode: "ACCOUNTANT", module: "platform", resource: "users", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "platform", resource: "roles", mask: 0 },
  { roleCode: "ACCOUNTANT", module: "platform", resource: "outlets", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "platform", resource: "settings", mask: 0 },
  { roleCode: "ACCOUNTANT", module: "accounting", resource: "accounts", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "accounting", resource: "journals", mask: MASKS.CRUDA },
  { roleCode: "ACCOUNTANT", module: "accounting", resource: "fiscal_years", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "accounting", resource: "reports", mask: MASKS.CRUDA },
  { roleCode: "ACCOUNTANT", module: "treasury", resource: "transactions", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "treasury", resource: "accounts", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "sales", resource: "invoices", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "sales", resource: "orders", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "sales", resource: "payments", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "inventory", resource: "items", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "inventory", resource: "stock", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "inventory", resource: "costing", mask: CANONICAL_BITS.read },
  { roleCode: "ACCOUNTANT", module: "pos", resource: "transactions", mask: 0 },
  { roleCode: "ACCOUNTANT", module: "pos", resource: "config", mask: 0 },
  { roleCode: "ACCOUNTANT", module: "reservations", resource: "bookings", mask: 0 },
  { roleCode: "ACCOUNTANT", module: "reservations", resource: "tables", mask: 0 }
];

/**
 * Validate permission bits match canonical values
 */
export function validatePermissionBits(): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  
  // Check MODULE_PERMISSION_BITS in types.ts matches canonical
  const expected = {
    read: 1,
    create: 2,
    update: 4,
    delete: 8,
    analyze: 16,
    manage: 32
  };
  
  for (const [perm, expectedBit] of Object.entries(expected)) {
    const actualBit = MODULE_PERMISSION_BITS[perm as ModulePermission];
    if (actualBit !== expectedBit) {
      mismatches.push(
        `MODULE_PERMISSION_BITS.${perm}: expected ${expectedBit}, got ${actualBit}`
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
  const expectedPermissions = PERMISSION_MATRIX.filter(p => p.roleCode === roleCode);
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
      valid: actualMask === expected.mask,
      roleCode,
      module: expected.module,
      resource: expected.resource,
      expectedMask: expected.mask,
      actualMask,
      issues: []
    };
    
    if (actualMask === null) {
      if (expected.mask > 0) {
        missingPermissions.push(key);
        result.issues.push(`Missing permission ${key} (expected mask ${expected.mask})`);
      }
    } else if (actualMask !== expected.mask) {
      invalidPermissions.push(`${key}: expected ${expected.mask}, got ${actualMask}`);
      result.issues.push(`Invalid mask: expected ${expected.mask}, got ${actualMask}`);
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
  
  lines.push('=' .repeat(70));
  lines.push('PERMISSION VALIDATION REPORT');
  lines.push('=' .repeat(70));
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
  
  lines.push('=' .repeat(70));
  lines.push(report.summary);
  lines.push('=' .repeat(70));
  
  return lines.join('\n');
}