// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Permission matrix defining default module permissions per role.
 * Maps role × module.resource to permission mask (bitmask).
 *
 * SOURCE OF TRUTH: @jurnapod/shared/constants/roles.defaults.json
 * This file re-exports from @jurnapod/shared for backward compatibility.
 *
 * Permission mask bits (CRUDAM):
 * - 1  (0b00001): READ
 * - 2  (0b00010): CREATE
 * - 4  (0b00100): UPDATE
 * - 8  (0b01000): DELETE
* - 16 (0b10000): ANALYZE // (was REPORT)
 * - 32 (0b100000): MANAGE
 *
 * Composite constants:
 * - CRUD   = 15 (0b01111)  — Read + Create + Update + Delete
 * - CRUDA  = 31 (0b11111)  — CRUD + Analyze
 * - CRUDAM = 63 (0b111111) — CRUDA + Manage
 */

// Re-export everything from @jurnapod/shared
// Note: RoleCode is exported from role-definitions.ts, not from here
export {
  PERMISSION_BITS,
  PERMISSION_MASK,
  ROLE_CODES,
  ROLE_PERMISSION_MATRIX,
  MODULE_ROLE_DEFAULTS,
  MODULE_ROLE_DEFAULTS_API,
  PERMISSION_MAP,
} from "@jurnapod/shared";
