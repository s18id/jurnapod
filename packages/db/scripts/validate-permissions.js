/**
 * Permission Validation CLI
 * 
 * Validates that database permissions match canonical Epic 39 constants.
 * 
 * Usage:
 *   npm run validate:permissions -w @jurnapod/db
 * 
 * Exit codes:
 *   0 - All permissions valid
 *   1 - Validation failed (mismatches found)
 */

import './load-env.mjs';
import mysql from 'mysql2/promise';

// Canonical role codes
const ROLE_CODES = ['SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT'];

// Permission masks (Epic 39 canonical)
const MASKS = {
  CRUD: 15,
  CRUDA: 31,
  CRUDAM: 63
};

const CANONICAL_BITS = {
  read: 1,
  create: 2,
  update: 4,
  delete: 8,
  analyze: 16,
  manage: 32
};

// Permission matrix (canonical source from @jurnapod/modules-platform)
const PERMISSION_MATRIX = [
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

function dbConfigFromEnv() {
  const port = Number(process.env.DB_PORT ?? '3306');
  if (Number.isNaN(port)) {
    throw new Error('DB_PORT must be a number');
  }

  return {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port,
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'jurnapod'
  };
}

async function fetchDbPermissions(connection) {
  const [rows] = await connection.execute(`
    SELECT r.code as role_code, mr.module, mr.resource, mr.permission_mask
    FROM module_roles mr
    JOIN roles r ON r.id = mr.role_id
    WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT')
      AND r.company_id IS NULL
    ORDER BY r.code, mr.module, mr.resource
  `);
  return rows;
}

function validateRolePermissions(roleCode, dbPermissions) {
  const expectedPermissions = PERMISSION_MATRIX.filter(p => p.roleCode === roleCode);
  const missingPermissions = [];
  const invalidPermissions = [];

  // Build a map of actual DB permissions
  const dbPermMap = new Map();
  for (const dbPerm of dbPermissions) {
    const key = `${dbPerm.module}:${dbPerm.resource ?? 'null'}`;
    dbPermMap.set(key, Number(dbPerm.permission_mask));
  }

  // Check each expected permission
  for (const expected of expectedPermissions) {
    const key = `${expected.module}:${expected.resource}`;
    const actualMask = dbPermMap.get(key) ?? null;

    if (actualMask === null) {
      if (expected.mask > 0) {
        missingPermissions.push(key);
      }
    } else if (actualMask !== expected.mask) {
      invalidPermissions.push(`${key}: expected ${expected.mask}, got ${actualMask}`);
    }
  }

  return {
    roleCode,
    isValid: missingPermissions.length === 0 && invalidPermissions.length === 0,
    missingPermissions,
    invalidPermissions
  };
}

function validateAllRoles(dbPermissions) {
  const roleResults = [];
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

  return {
    isValid: invalidRoles === 0,
    totalRoles: ROLE_CODES.length,
    validRoles,
    invalidRoles,
    roleResults
  };
}

function formatReport(report) {
  const lines = [];

  lines.push('='.repeat(70));
  lines.push('PERMISSION VALIDATION REPORT');
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
  const summary = report.isValid
    ? `All ${ROLE_CODES.length} roles have correct permissions`
    : `${report.invalidRoles} of ${ROLE_CODES.length} roles have incorrect permissions`;
  lines.push(summary);
  lines.push('='.repeat(70));

  return lines.join('\n');
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);

    // Fetch permissions from database
    const dbPermissions = await fetchDbPermissions(connection);

    if (dbPermissions.length === 0) {
      console.log('✗ No module_roles entries found for system roles');
      console.log('  Run seed script first: npm run db:seed -w @jurnapod/db');
      process.exit(1);
    }

    // Validate all roles
    const report = validateAllRoles(dbPermissions);

    // Format and output report
    console.log(formatReport(report));

    // Exit with appropriate code
    process.exit(report.isValid ? 0 : 1);

  } catch (error) {
    console.error('Validation error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();