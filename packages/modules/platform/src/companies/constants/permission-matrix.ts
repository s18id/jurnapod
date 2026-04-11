// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Permission matrix defining default module permissions per role.
 * Maps role × module to permission mask (bitmask).
 *
 * Uses canonical PERMISSION_BITS and PERMISSION_MASK from @jurnapod/shared.
 *
 * Permission mask bits (CRUDA):
 * - 1  (0b00001): READ
 * - 2  (0b00010): CREATE
 * - 4  (0b00100): UPDATE
 * - 8  (0b01000): DELETE
 * - 16 (0b10000): REPORT (formerly ANALYTIC)
 *
 * Composite constants:
 * - CRUD  = 15 (0b01111) — Read + Create + Update + Delete
 * - CRUDA = 31 (0b11111) — CRUD + Report
 */
import { PERMISSION_BITS, PERMISSION_MASK } from "@jurnapod/shared";

export { PERMISSION_BITS, PERMISSION_MASK };

export const MODULE_ROLE_DEFAULTS = [
  // SUPER_ADMIN has full access to everything
  { roleCode: "SUPER_ADMIN", module: "companies", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "users", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "roles", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "outlets", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "accounts", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "journals", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "cash_bank", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "sales", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "payments", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "purchasing", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "reports", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "settings", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "SUPER_ADMIN", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },

  // OWNER has read + update access to their company (create/delete reserved for SUPER_ADMIN)
  { roleCode: "OWNER", module: "companies", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.UPDATE },
  { roleCode: "OWNER", module: "users", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "roles", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "outlets", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "accounts", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "journals", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "cash_bank", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "sales", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "payments", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "purchasing", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "reports", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "settings", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "OWNER", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },

  // COMPANY_ADMIN has limited company-level access
  { roleCode: "COMPANY_ADMIN", module: "companies", permissionMask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "users", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "roles", permissionMask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "outlets", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "accounts", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "journals", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "cash_bank", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "sales", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "payments", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "purchasing", permissionMask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "reports", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "COMPANY_ADMIN", module: "settings", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "COMPANY_ADMIN", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },

  // ADMIN has moderate access
  { roleCode: "ADMIN", module: "companies", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "ADMIN", module: "users", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "roles", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "ADMIN", module: "outlets", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "accounts", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "journals", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "cash_bank", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "sales", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "payments", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "inventory", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "purchasing", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "reports", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ADMIN", module: "settings", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "ADMIN", module: "pos", permissionMask: PERMISSION_MASK.CRUDA },

  // CASHIER has minimal access
  { roleCode: "CASHIER", module: "companies", permissionMask: 0 },
  { roleCode: "CASHIER", module: "users", permissionMask: 0 },
  { roleCode: "CASHIER", module: "roles", permissionMask: 0 },
  { roleCode: "CASHIER", module: "outlets", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "CASHIER", module: "accounts", permissionMask: 0 },
  { roleCode: "CASHIER", module: "journals", permissionMask: 0 },
  { roleCode: "CASHIER", module: "cash_bank", permissionMask: 0 },
  { roleCode: "CASHIER", module: "sales", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "CASHIER", module: "payments", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "CASHIER", module: "inventory", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "CASHIER", module: "purchasing", permissionMask: 0 },
  { roleCode: "CASHIER", module: "reports", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "CASHIER", module: "settings", permissionMask: 0 },
  { roleCode: "CASHIER", module: "pos", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },

  // ACCOUNTANT has accounting-focused access
  { roleCode: "ACCOUNTANT", module: "companies", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "users", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "roles", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "outlets", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "accounts", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "journals", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "cash_bank", permissionMask: PERMISSION_MASK.READ | PERMISSION_BITS.CREATE },
  { roleCode: "ACCOUNTANT", module: "sales", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "payments", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "inventory", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "purchasing", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "reports", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "settings", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "pos", permissionMask: PERMISSION_MASK.READ }
] as const;

export type ModuleRoleDefault = (typeof MODULE_ROLE_DEFAULTS)[number];
