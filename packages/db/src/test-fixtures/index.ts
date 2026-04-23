// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/db/test-fixtures
 *
 * Deterministic primitive helpers and domain constants for integration test fixtures.
 * This package provides:
 * - Low-level primitives: timestamp generation, ID generation, deterministic code
 * - Domain constants: AP exception int-enums (type, status)
 *
 * NO business logic, NO database writes (other than via fixture helpers).
 * Domain fixture creation stays in the package that owns the invariant.
 */

export { CANONICAL_TIMESTAMPS, generateDeterministicRunId, generateDeterministicCode } from './primitives.js';
export type { DeterministicRunIdOptions } from './primitives.js';

export { AP_EXCEPTION_TYPE, AP_EXCEPTION_STATUS } from './constants.js';
export type {
  APExceptionTypeKey,
  APExceptionTypeValue,
  APExceptionStatusKey,
  APExceptionStatusValue,
} from './constants.js';
