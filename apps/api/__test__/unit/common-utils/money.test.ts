// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for common-utils money functions
 * 
 * Pure function tests - no database required.
 */

import { describe, it, expect } from 'vitest';
import { normalizeMoney, sumMoney, hasMoreThanTwoDecimals } from '../../../src/lib/shared/common-utils';

describe('common-utils.money', () => {
  describe('normalizeMoney', () => {
    it('rounds to 2 decimal places', () => {
      expect(normalizeMoney(19.999)).toBe(20);
      expect(normalizeMoney(19.994)).toBe(19.99);
      expect(normalizeMoney(19.995)).toBe(20); // banker's rounding
    });

    it('handles whole numbers', () => {
      expect(normalizeMoney(100)).toBe(100);
      expect(normalizeMoney(0)).toBe(0);
    });

    it('handles negative numbers', () => {
      expect(normalizeMoney(-19.99)).toBe(-19.99);
      expect(normalizeMoney(-19.999)).toBe(-20);
    });

    it('handles floating point edge cases', () => {
      expect(normalizeMoney(0.1 + 0.2)).toBe(0.3); // 0.30000000000000004 -> 0.3
      expect(normalizeMoney(0.3)).toBe(0.3);
    });

    it('preserves 2 decimal precision', () => {
      expect(normalizeMoney(19.99)).toBe(19.99);
      expect(normalizeMoney(0.01)).toBe(0.01);
    });
  });

  describe('sumMoney', () => {
    it('sums multiple values', () => {
      expect(sumMoney([10, 20, 30])).toBe(60);
    });

    it('normalizes the result', () => {
      expect(sumMoney([0.1, 0.2])).toBe(0.3);
    });

    it('handles empty array', () => {
      expect(sumMoney([])).toBe(0);
    });

    it('handles single value', () => {
      expect(sumMoney([42])).toBe(42);
    });

    it('handles mixed positive and negative', () => {
      expect(sumMoney([100, -30, 20])).toBe(90);
    });

    it('handles readonly arrays', () => {
      const values: readonly number[] = [10, 20, 30];
      expect(sumMoney(values)).toBe(60);
    });
  });

  describe('hasMoreThanTwoDecimals', () => {
    it('returns false for 2 decimal places', () => {
      expect(hasMoreThanTwoDecimals(19.99)).toBe(false);
      expect(hasMoreThanTwoDecimals(0.01)).toBe(false);
      expect(hasMoreThanTwoDecimals(100)).toBe(false);
    });

    it('returns true for more than 2 decimal places', () => {
      expect(hasMoreThanTwoDecimals(19.999)).toBe(true);
      expect(hasMoreThanTwoDecimals(0.001)).toBe(true);
      expect(hasMoreThanTwoDecimals(19.9999)).toBe(true);
    });

    it('handles floating point edge cases', () => {
      // 0.1 + 0.2 = 0.30000000000000004 but toFixed(10) gives "0.3000000000"
      // with trailing zeros, so it returns false (no significant extra decimals)
      expect(hasMoreThanTwoDecimals(0.1 + 0.2)).toBe(false);
    });
  });
});
