// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Deterministic primitive helpers for test fixtures.
 *
 * PURPOSE:
 * Provides reproducibility for test fixtures by replacing `Date.now()` and `Math.random()`
 * with deterministic alternatives based on a run context.
 *
 * SCOPE:
 * These are LOW-LEVEL PRIMITIVES only. They carry no domain semantics.
 * Domain fixture logic (company creation, outlet creation, user creation) stays in the
 * package that owns the invariant (e.g., @jurnapod/modules-platform for company bootstrap).
 *
 * USAGE:
 * ```typescript
 * import { CANONICAL_TIMESTAMPS, generateDeterministicCode } from '@jurnapod/db/test-fixtures';
 *
 * // Instead of: Date.now() (non-deterministic)
 * // Use fixed canonical timestamp:
 * const asOfDate = CANONICAL_TIMESTAMPS.FISCAL_CLOSE_2040; // 2208969600000
 *
 * // Instead of: `${prefix}-${Date.now().toString(36)}` (non-deterministic)
 * // Use deterministic code:
 * const code = generateDeterministicCode('CO', 'test-company-fy-close');
 * ```
 */

import { createHash } from "node:crypto";

/**
 * Canonical fixed timestamps used across test fixtures.
 * All values are Unix milliseconds in UTC.
 *
 * Convention: suffixed with year for disambiguation.
 * These are intentionally far in the future to avoid collision with seed data.
 */
export const CANONICAL_TIMESTAMPS = {
  /**
   * 2040-12-31 00:00:00 UTC - used for fiscal close test scenarios
   * Corresponds to the fiscal-year-close.test.ts fixture anchor date.
   */
  FISCAL_CLOSE_2040: new Date("2040-12-31T00:00:00.000Z").getTime(),

  /**
   * 2041-12-31 00:00:00 UTC
   */
  FISCAL_CLOSE_2041: new Date("2041-12-31T00:00:00.000Z").getTime(),

  /**
   * 2042-12-31 00:00:00 UTC
   */
  FISCAL_CLOSE_2042: new Date("2042-12-31T00:00:00.000Z").getTime(),

  /**
   * 2043-12-31 00:00:00 UTC
   */
  FISCAL_CLOSE_2043: new Date("2043-12-31T00:00:00.000Z").getTime(),

  /**
   * 2044-12-31 00:00:00 UTC
   */
  FISCAL_CLOSE_2044: new Date("2044-12-31T00:00:00.000Z").getTime(),

  /**
   * 2045-12-31 00:00:00 UTC
   */
  FISCAL_CLOSE_2045: new Date("2045-12-31T00:00:00.000Z").getTime(),

  /**
   * 2026-04-21 00:00:00 UTC - canonical "today" for test anchoring
   */
  CANONICAL_TODAY: new Date("2026-04-21T00:00:00.000Z").getTime(),

  /**
   * Far-past timestamp for tests needing pre-2020 anchors
   */
  FAR_PAST: new Date("2020-01-01T00:00:00.000Z").getTime(),

  /**
   * Far-future timestamp for tests needing post-2100 anchors
   */
  FAR_FUTURE: new Date("2100-01-01T00:00:00.000Z").getTime(),
} as const;

/**
 * Options for deterministic run ID generation.
 */
export type DeterministicRunIdOptions = {
  /**
   * Prefix for the generated ID (e.g., 'CO', 'OL', 'US')
   */
  prefix?: string;
  /**
   * Additional entropy source (e.g., test name, company code)
   */
  entropy?: string;
  /**
   * Maximum length for the resulting string
   */
  maxLength?: number;
};

/**
 * Generate a deterministic run ID suitable for test fixture codes.
 *
 * Uses SHA256 to derive deterministic bytes from the entropy string,
 * making reruns reproducible when the same entropy is used.
 *
 * @example
 * const runId = generateDeterministicRunId({ prefix: 'CO', entropy: 'my-test' });
 * // Returns: 'CO-A1B2C3D4' (prefix + 8 hex chars from SHA256 of entropy)
 */
export function generateDeterministicRunId(options: DeterministicRunIdOptions = {}): string {
  const { prefix = "", entropy = "", maxLength = 20 } = options;

  const hash = createHash("sha256");
  hash.update(entropy || "default-entropy");
  const digest = hash.digest("hex").slice(0, 8).toUpperCase();

  const raw = prefix ? `${prefix}-${digest}` : digest;
  return raw.length > maxLength ? raw.slice(0, maxLength) : raw;
}

/**
 * Generate a deterministic test code with a prefix.
 * Used for company codes, outlet codes, etc.
 *
 * @example
 * const code = generateDeterministicCode('CO', 'test-company-fy-close');
 * // Returns: 'CO-<entropy-slice>'
 */
export function generateDeterministicCode(prefix: string, entropy: string, maxLength = 20): string {
  const hash = createHash("sha256");
  hash.update(entropy);
  const digest = hash.digest("hex").slice(0, 8).toUpperCase();

  // Derive a more readable code segment from digest
  const readable = digest
    .split("")
    .map((c, i) => (i % 2 === 0 ? c : c.toLowerCase()))
    .join("")
    .slice(0, 8);

  const raw = `${prefix}-${readable}`;
  return raw.length > maxLength ? raw.slice(0, maxLength) : raw;
}
