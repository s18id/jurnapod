// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical AP exception constants for integration test fixtures.
 *
 * SCOPE:
 * These are domain-level constants (int enums) used in test fixture creation.
 * They mirror the migration 0188 schema (TINYINT columns for type/status).
 *
 * These live in @jurnapod/db/test-fixtures because:
 * 1. They are used by fixture helpers that write to the DB (createTestAPException)
 * 2. They are int-enum values (not string-label API contracts)
 * 3. @jurnapod/db has no @jurnapod/shared dependency, so they are defined here directly
 *
 * USAGE:
 * ```typescript
 * import { AP_EXCEPTION_TYPE, AP_EXCEPTION_STATUS } from '@jurnapod/db/test-fixtures';
 *
 * const exception = await createTestAPException(companyId, {
 *   type: AP_EXCEPTION_TYPE.VARIANCE,
 *   status: AP_EXCEPTION_STATUS.OPEN,
 * });
 * ```
 */

/**
 * AP exception type int-enum — mirrors migration 0188_ap_exceptions.type column.
 * DB storage: TINYINT UNSIGNED.
 */
export const AP_EXCEPTION_TYPE = {
  DISPUTE: 1,
  VARIANCE: 2,
  MISMATCH: 3,
  DUPLICATE: 4,
} as const;

export type APExceptionTypeKey = keyof typeof AP_EXCEPTION_TYPE;
export type APExceptionTypeValue = (typeof AP_EXCEPTION_TYPE)[APExceptionTypeKey];

/**
 * AP exception status int-enum — mirrors migration 0188_ap_exceptions.status column.
 * DB storage: TINYINT UNSIGNED.
 */
export const AP_EXCEPTION_STATUS = {
  OPEN: 1,
  ASSIGNED: 2,
  RESOLVED: 3,
  DISMISSED: 4,
} as const;

export type APExceptionStatusKey = keyof typeof AP_EXCEPTION_STATUS;
export type APExceptionStatusValue = (typeof AP_EXCEPTION_STATUS)[APExceptionStatusKey];