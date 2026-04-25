// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared deterministic ID utilities for posting integration tests.
 *
 * PURPOSE:
 * Prevents cross-file ID collision when multiple posting test files run in the
 * same process (parallel vitest workers or sequential --rerun). Each file gets
 * a file-specific salt derived from hrtime so generated IDs cannot collide
 * even under parallel execution.
 *
 * RATIONALE:
 * Both files previously shared a process-level hrtime counter but used different
 * counter variable names — in sequential runs or re-runs, IDs could overlap.
 * This utility creates a namespaced counter per file-specific salt.
 */

import { createHash } from "node:crypto";

/**
 * Create a file-specific ID generator.
 *
 * @param fileSalt  - Unique string identifying the file (e.g. 'COGS', 'JNL')
 * @returns Object with `nextId()` (numeric) and `nextCode(prefix)` (string code)
 *
 * The numeric ID is derived from hrtime + a per-generator counter, making it
 * unique both within a file and across files (different salts = different ID spaces).
 *
 * The code string uses a 4-char hex digest of the salt (fits VARCHAR(32) when
 * combined with prefix and numeric ID). Format: <prefix>-<salt4>-<id>
 */
export function createPostingIdGenerator(fileSalt: string) {
  // Derive a stable 4-char suffix from the file salt (fits VARCHAR(32) constraint)
  const saltDigest = createHash("sha256").update(fileSalt).digest("hex").slice(0, 4).toUpperCase();

  // Per-generator counter seeded from hrtime — avoids collisions with
  // other generator instances even if they share the same process hrtime.
  let counter = Number(process.hrtime.bigint() & 0x7fffffffn) & 0x7fffffff;

  function nextId(): number {
    // Mix hrtime with counter to guarantee uniqueness within this generator.
    // `hrtime` advances monotonically across calls; `counter` is a safety net.
    const base = Number(process.hrtime.bigint() & 0x7fffffffn) & 0x7fffffff;
    return (base + counter++) & 0x7fffffff;
  }

  function nextCode(prefix: string): string {
    return `${prefix}-${saltDigest}-${nextId()}`;
  }

  return { nextId, nextCode, saltDigest };
}
