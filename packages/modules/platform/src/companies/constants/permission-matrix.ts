// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Permission matrix defining default module permissions per role.
 * Maps role × module.resource to permission mask (bitmask).
 *
 * SOURCE OF TRUTH: roles.defaults.json
 * This file imports from JSON and re-exports with TypeScript types.
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
import roleDefaultsJson from "./roles.defaults.json";

export { PERMISSION_BITS, PERMISSION_MASK };

// Re-export JSON data with TypeScript types
export type { default as ROLE_DEFAULTS_JSON } from "./roles.defaults.json";

/**
 * Flat array format for MODULE_ROLE_DEFAULTS (backward compatible)
 * Derived from roles.defaults.json
 * Format: module.resource (e.g., "platform.users")
 */
export const MODULE_ROLE_DEFAULTS: readonly {
  roleCode: string;
  module: string;
  permissionMask: number;
}[] = (() => {
  const result: { roleCode: string; module: string; permissionMask: number }[] = [];
  const roles = roleDefaultsJson.roles as Record<string, Record<string, number>>;
  
  for (const [roleCode, permissions] of Object.entries(roles)) {
    for (const [module, permissionMask] of Object.entries(permissions)) {
      result.push({ roleCode, module, permissionMask });
    }
  }
  
  return result;
})();

export type ModuleRoleDefault = (typeof MODULE_ROLE_DEFAULTS)[number];

/**
 * MODULE_ROLE_DEFAULTS with separate module and resource columns
 * For API consumption (insert into module_roles table)
 */
export const MODULE_ROLE_DEFAULTS_API: readonly {
  roleCode: string;
  module: string;
  resource: string;
  permissionMask: number;
}[] = MODULE_ROLE_DEFAULTS.map(({ roleCode, module, permissionMask }) => {
  const [mod, res] = module.split(".");
  return { roleCode, module: mod, resource: res, permissionMask };
});

/**
 * Lookup map for fast permission check
 */
export const PERMISSION_MAP: ReadonlyMap<string, number> = new Map(
  MODULE_ROLE_DEFAULTS.map((r) => [`${r.roleCode}:${r.module}`, r.permissionMask])
);
