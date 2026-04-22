// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Shared deterministic tag generator (Story 49)
// Replaces per-file makeTag implementations across S49 test suite.

let _tagCounter = 0;
const _worker = process.env.VITEST_POOL_ID ?? '0';
const _pid = String(process.pid % 10000).padStart(4, '0');

/**
 * Generate a deterministic tag with the format: prefix + worker + pid + counter.
 *
 * @param prefix  - Tag prefix (e.g. "OC", "UPD", "ADM")
 * @param maxLen  - Maximum total length (default 20).
 *                   Length handling happens INSIDE the helper; the returned value is final.
 *                   Call sites MUST NOT apply .slice() on the output.
 *
 * @throws Error when prefix.length >= maxLen (guard clause)
 */
export function makeTag(prefix: string, maxLen = 20): string {
  if (prefix.length >= maxLen) {
    throw new Error(`makeTag: prefix "${prefix}" (len ${prefix.length}) >= maxLen ${maxLen}`);
  }
  const part = _worker + _pid + String(_tagCounter++).padStart(4, '0');
  return prefix + part.slice(0, maxLen - prefix.length);
}