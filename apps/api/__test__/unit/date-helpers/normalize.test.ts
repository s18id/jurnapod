// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for date-helpers RFC3339 conversion functions
 * 
 * Pure function tests - no database required.
 */

import { describe, it, expect } from 'vitest';
import { toRfc3339, toRfc3339Required } from '../../../src/lib/date-helpers';

describe('date-helpers.rfc3339', () => {
  describe('toRfc3339', () => {
    it('converts Date to RFC3339 ISO string', () => {
      const date = new Date('2024-03-15T10:30:00Z');
      const result = toRfc3339(date);
      expect(result).toBe('2024-03-15T10:30:00.000Z');
    });

    it('handles ISO datetime string', () => {
      const result = toRfc3339('2024-03-15T10:30:00Z');
      expect(result).toMatch(/^2024-03-15T10:30:00/);
    });

    it('handles MySQL datetime format', () => {
      const result = toRfc3339('2024-03-15 10:30:00');
      expect(result).toMatch(/^2024-03-15/);
    });

    it('returns null for null input', () => {
      const result = toRfc3339(null);
      expect(result).toBeNull();
    });

    it('returns null for undefined input', () => {
      const result = toRfc3339(undefined);
      expect(result).toBeNull();
    });

    it('throws for invalid date string', () => {
      expect(() => toRfc3339('not-a-date' as any)).toThrow();
    });
  });

  describe('toRfc3339Required', () => {
    it('converts valid Date to ISO string', () => {
      const date = new Date('2024-03-15T10:30:00Z');
      const result = toRfc3339Required(date);
      expect(result).toBe('2024-03-15T10:30:00.000Z');
    });

    it('converts valid string to ISO string', () => {
      const result = toRfc3339Required('2024-03-15T10:30:00Z');
      expect(result).toBe('2024-03-15T10:30:00.000Z');
    });

    it('throws for null input', () => {
      // The function doesn't null-check first, so it throws from Date constructor
      expect(() => toRfc3339Required(null as any)).toThrow();
    });

    it('throws for undefined input', () => {
      // The function doesn't undefined-check first, so it throws from Date constructor
      expect(() => toRfc3339Required(undefined as any)).toThrow();
    });

    it('throws for invalid date', () => {
      expect(() => toRfc3339Required('invalid')).toThrow('Invalid datetime');
    });
  });
});
