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
 * - 16 (0b10000): REPORT
 */
export const PERMISSION_BITS = {
  READ:    1,    // 0b00001
  CREATE:  2,    // 0b00010
  UPDATE:  4,    // 0b00100
  DELETE:  8,   // 0b01000
  REPORT:  16,   // 0b10000
} as const;

export type PermissionBit = keyof typeof PERMISSION_BITS;

/**
 * Composite permission masks for common combinations.
 */
export const PERMISSION_MASK = {
  READ:    PERMISSION_BITS.READ,
  WRITE:   PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE,
  CRUD:    PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE,
  CRUDA:   PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE | PERMISSION_BITS.REPORT,
} as const;
