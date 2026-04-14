// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect } from 'vitest';
import { isDeadlockError } from '../../src/index.js';

describe('isDeadlockError', () => {
  it('returns true for ER_CHECKREAD code', () => {
    expect(isDeadlockError({ code: 'ER_CHECKREAD' })).toBe(true);
  });

  it('returns true for errno 1020 check-read conflict', () => {
    expect(isDeadlockError({ errno: 1020 })).toBe(true);
  });

  it('returns true for check-read conflict message', () => {
    expect(isDeadlockError({ message: "Record has changed since last read in table 'sync_versions'" })).toBe(true);
  });

  it('returns true when check-read error is wrapped in cause', () => {
    expect(
      isDeadlockError({
        message: 'outer error',
        cause: { errno: 1020 }
      })
    ).toBe(true);
  });

  it('returns false for non-retryable errors', () => {
    expect(isDeadlockError({ code: 'ER_PARSE_ERROR', errno: 1064 })).toBe(false);
  });
});
