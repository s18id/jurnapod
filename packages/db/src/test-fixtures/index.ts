// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/db/test-fixtures
 *
 * Deterministic primitive helpers for integration test fixtures.
 * This package provides ONLY non-domain-invariant primitives:
 * - Timestamp generation
 * - ID generation
 * - Basic random primitives
 *
 * NO domain logic, NO business invariants, NO database writes.
 * Domain fixture creation stays in the package that owns the invariant.
 */

export { CANONICAL_TIMESTAMPS, generateDeterministicRunId, generateDeterministicCode } from './primitives.js';
export type { DeterministicRunIdOptions } from './primitives.js';
