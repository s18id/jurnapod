// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Permission matrix defining default module permissions per role.
 * Maps role × module.resource to permission mask (bitmask).
 *
 * Uses canonical PERMISSION_BITS and PERMISSION_MASK from @jurnapod/shared.
 *
 * Permission mask bits (CRUDAM):
 * - 1  (0b00001): READ
 * - 2  (0b00010): CREATE
 * - 4  (0b00100): UPDATE
 * - 8  (0b01000): DELETE
 * - 16 (0b10000): ANALYZE (was REPORT)
 * - 32 (0b100000): MANAGE
 *
 * Composite constants:
 * - CRUD   = 15 (0b01111)  — Read + Create + Update + Delete
 * - CRUDA  = 31 (0b11111)  — CRUD + Analyze
 * - CRUDAM = 63 (0b111111) — CRUDA + Manage
 */
import { PERMISSION_BITS, PERMISSION_MASK } from "@jurnapod/shared";

export { PERMISSION_BITS, PERMISSION_MASK };

export const MODULE_ROLE_DEFAULTS = [
  // SUPER_ADMIN has full access to everything
  { roleCode: "SUPER_ADMIN", module: "platform.companies", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "platform.users", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "platform.roles", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "platform.outlets", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "platform.settings", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "accounting.accounts", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "accounting.journals", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "accounting.fiscal_years", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "accounting.reports", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "treasury.transactions", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "treasury.accounts", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "sales.invoices", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "sales.orders", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "sales.payments", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "inventory.items", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "inventory.stock", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "inventory.costing", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "pos.transactions", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "pos.config", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "reservations.bookings", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "SUPER_ADMIN", module: "reservations.tables", permissionMask: PERMISSION_MASK.CRUDAM },

  // OWNER has full access to their company resources
  { roleCode: "OWNER", module: "platform.companies", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "platform.users", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "platform.roles", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "platform.outlets", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "platform.settings", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "accounting.accounts", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "accounting.journals", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "accounting.fiscal_years", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "accounting.reports", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "treasury.transactions", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "treasury.accounts", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "sales.invoices", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "sales.orders", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "sales.payments", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "inventory.items", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "inventory.stock", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "inventory.costing", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "pos.transactions", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "pos.config", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "reservations.bookings", permissionMask: PERMISSION_MASK.CRUDAM },
  { roleCode: "OWNER", module: "reservations.tables", permissionMask: PERMISSION_MASK.CRUDAM },

  // COMPANY_ADMIN has limited company-level access
  { roleCode: "COMPANY_ADMIN", module: "platform.companies", permissionMask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "platform.users", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "platform.roles", permissionMask: 0 },
  { roleCode: "COMPANY_ADMIN", module: "platform.outlets", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "platform.settings", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "accounting.accounts", permissionMask: PERMISSION_BITS.READ | PERMISSION_BITS.MANAGE }, // 33 - Structural: manage+read
  { roleCode: "COMPANY_ADMIN", module: "accounting.journals", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "accounting.fiscal_years", permissionMask: PERMISSION_BITS.READ | PERMISSION_BITS.MANAGE }, // 33 - Structural: manage+read
  { roleCode: "COMPANY_ADMIN", module: "accounting.reports", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "treasury.transactions", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "treasury.accounts", permissionMask: PERMISSION_BITS.READ | PERMISSION_BITS.MANAGE }, // 33 - Structural: manage+read
  { roleCode: "COMPANY_ADMIN", module: "sales.invoices", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "sales.orders", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "sales.payments", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "inventory.items", permissionMask: PERMISSION_MASK.CRUD },
  { roleCode: "COMPANY_ADMIN", module: "inventory.stock", permissionMask: PERMISSION_MASK.CRUD },
  { roleCode: "COMPANY_ADMIN", module: "inventory.costing", permissionMask: PERMISSION_BITS.READ | PERMISSION_BITS.MANAGE }, // 33 - Structural: manage+read
  { roleCode: "COMPANY_ADMIN", module: "pos.transactions", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "pos.config", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "reservations.bookings", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "COMPANY_ADMIN", module: "reservations.tables", permissionMask: PERMISSION_MASK.CRUDA },

  // ADMIN has moderate access
  { roleCode: "ADMIN", module: "platform.companies", permissionMask: 0 },
  { roleCode: "ADMIN", module: "platform.users", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ADMIN", module: "platform.roles", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ADMIN", module: "platform.outlets", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ADMIN", module: "platform.settings", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ADMIN", module: "accounting.accounts", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "ADMIN", module: "accounting.journals", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "accounting.fiscal_years", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "ADMIN", module: "accounting.reports", permissionMask: PERMISSION_MASK.READ }, // Analytical: read only
  { roleCode: "ADMIN", module: "treasury.transactions", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "treasury.accounts", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "ADMIN", module: "sales.invoices", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "sales.orders", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "sales.payments", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "inventory.items", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "inventory.stock", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "inventory.costing", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "ADMIN", module: "pos.transactions", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "pos.config", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "reservations.bookings", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ADMIN", module: "reservations.tables", permissionMask: PERMISSION_MASK.CRUDA },

  // CASHIER has minimal access (POS and reservations only)
  { roleCode: "CASHIER", module: "platform.companies", permissionMask: 0 },
  { roleCode: "CASHIER", module: "platform.users", permissionMask: 0 },
  { roleCode: "CASHIER", module: "platform.roles", permissionMask: 0 },
  { roleCode: "CASHIER", module: "platform.outlets", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "CASHIER", module: "platform.settings", permissionMask: 0 },
  { roleCode: "CASHIER", module: "accounting.accounts", permissionMask: 0 },
  { roleCode: "CASHIER", module: "accounting.journals", permissionMask: 0 },
  { roleCode: "CASHIER", module: "accounting.fiscal_years", permissionMask: 0 },
  { roleCode: "CASHIER", module: "accounting.reports", permissionMask: 0 },
  { roleCode: "CASHIER", module: "treasury.transactions", permissionMask: 0 },
  { roleCode: "CASHIER", module: "treasury.accounts", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "CASHIER", module: "sales.invoices", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "CASHIER", module: "sales.orders", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "CASHIER", module: "sales.payments", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "CASHIER", module: "inventory.items", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "CASHIER", module: "inventory.stock", permissionMask: 0 },
  { roleCode: "CASHIER", module: "pos.transactions", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "CASHIER", module: "pos.config", permissionMask: 0 },
  { roleCode: "CASHIER", module: "reservations.bookings", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "CASHIER", module: "reservations.tables", permissionMask: PERMISSION_MASK.CRUDA },

  // ACCOUNTANT has accounting-focused access
  { roleCode: "ACCOUNTANT", module: "platform.companies", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "platform.users", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "platform.roles", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "platform.outlets", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "platform.settings", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "accounting.accounts", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "ACCOUNTANT", module: "accounting.journals", permissionMask: PERMISSION_MASK.CRUDA },
  { roleCode: "ACCOUNTANT", module: "accounting.fiscal_years", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "ACCOUNTANT", module: "accounting.reports", permissionMask: PERMISSION_MASK.CRUDA }, // Analytical: analyze allowed
  { roleCode: "ACCOUNTANT", module: "treasury.transactions", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "treasury.accounts", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "ACCOUNTANT", module: "sales.invoices", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "sales.orders", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "sales.payments", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "inventory.items", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "inventory.stock", permissionMask: PERMISSION_MASK.READ },
  { roleCode: "ACCOUNTANT", module: "inventory.costing", permissionMask: PERMISSION_MASK.READ }, // Structural: read only
  { roleCode: "ACCOUNTANT", module: "pos.transactions", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "pos.config", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "reservations.bookings", permissionMask: 0 },
  { roleCode: "ACCOUNTANT", module: "reservations.tables", permissionMask: 0 }
] as const;

export type ModuleRoleDefault = (typeof MODULE_ROLE_DEFAULTS)[number];
