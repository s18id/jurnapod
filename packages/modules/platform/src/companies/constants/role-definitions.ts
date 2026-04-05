// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Role definitions for the platform.
 * These define the available roles and their properties.
 */
export const ROLE_DEFINITIONS = [
  { code: "SUPER_ADMIN", name: "Super Admin", isGlobal: true, roleLevel: 100 },
  { code: "OWNER", name: "Owner", isGlobal: true, roleLevel: 90 },
  { code: "COMPANY_ADMIN", name: "Company Admin", isGlobal: true, roleLevel: 80 },
  { code: "ADMIN", name: "Admin", isGlobal: false, roleLevel: 60 },
  { code: "ACCOUNTANT", name: "Accountant", isGlobal: false, roleLevel: 40 },
  { code: "CASHIER", name: "Cashier", isGlobal: false, roleLevel: 20 }
] as const;

export type RoleCode = (typeof ROLE_DEFINITIONS)[number]["code"];

export function isValidRoleCode(code: string): code is RoleCode {
  return ROLE_DEFINITIONS.some(r => r.code === code);
}

export function getRoleByCode(code: RoleCode) {
  return ROLE_DEFINITIONS.find(r => r.code === code);
}
