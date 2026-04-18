// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect } from 'vitest';
import { needsReset, getISOWeek, isSameDayLocal, RESET_PERIODS } from '@/lib/numbering';

describe('numbering-reset', () => {
  describe('getISOWeek', () => {
    it('returns correct ISO week for date in first week of year', () => {
      // Jan 1, 2026 is a Thursday - should be week 1 of 2026
      const date = new Date('2026-01-01T00:00:00Z');
      const result = getISOWeek(date);
      expect(result.year).toBe(2026);
      expect(result.week).toBe(1);
    });

    it('returns correct ISO week for date in middle of year', () => {
      // July 15, 2026 is a Wednesday - should be week 29 of 2026
      const date = new Date('2026-07-15T00:00:00Z');
      const result = getISOWeek(date);
      expect(result.year).toBe(2026);
      expect(result.week).toBe(29);
    });

    it('handles year boundary correctly', () => {
      // Dec 31, 2024 is a Tuesday - ISO week 1 of 2025 (week spans years)
      const date = new Date('2024-12-31T00:00:00Z');
      const result = getISOWeek(date);
      expect(result.year).toBe(2025);
      expect(result.week).toBe(1);
    });

    it('handles week 52/53 boundary', () => {
      // Dec 29, 2020 is a Tuesday - ISO week 53 of 2020
      const date = new Date('2020-12-29T00:00:00Z');
      const result = getISOWeek(date);
      expect(result.year).toBe(2020);
      expect(result.week).toBe(53);
    });
  });

  describe('isSameDayLocal', () => {
    it('returns true for same calendar day', () => {
      const a = new Date('2026-04-15T10:00:00');
      const b = new Date('2026-04-15T22:30:00');
      expect(isSameDayLocal(a, b)).toBe(true);
    });

    it('returns false for different calendar days', () => {
      const a = new Date('2026-04-15T23:59:59');
      const b = new Date('2026-04-16T00:00:00');
      expect(isSameDayLocal(a, b)).toBe(false);
    });

    it('handles month boundary', () => {
      const a = new Date('2026-04-30T23:00:00');
      const b = new Date('2026-05-01T01:00:00');
      expect(isSameDayLocal(a, b)).toBe(false);
    });

    it('handles year boundary', () => {
      const a = new Date('2026-12-31T23:00:00');
      const b = new Date('2027-01-01T01:00:00');
      expect(isSameDayLocal(a, b)).toBe(false);
    });
  });

  describe('needsReset', () => {
    describe('NEVER', () => {
      it('returns false when lastReset is null', () => {
        const result = needsReset(null, RESET_PERIODS.NEVER, new Date());
        expect(result).toBe(false);
      });

      it('returns false when lastReset is provided', () => {
        const result = needsReset('2026-01-01T00:00:00Z', RESET_PERIODS.NEVER, new Date());
        expect(result).toBe(false);
      });
    });

    describe('YEARLY', () => {
      it('returns false when same year', () => {
        const lastReset = '2026-06-15T10:00:00';
        const now = new Date('2026-12-31T12:00:00');
        const result = needsReset(lastReset, RESET_PERIODS.YEARLY, now);
        expect(result).toBe(false);
      });

      it('returns true when different year', () => {
        const lastReset = '2025-06-15T10:00:00Z';
        const now = new Date('2026-01-01T00:00:00Z');
        const result = needsReset(lastReset, RESET_PERIODS.YEARLY, now);
        expect(result).toBe(true);
      });

      it('returns true when crossing year boundary', () => {
        const lastReset = '2025-12-31T12:00:00';
        const now = new Date('2026-01-01T12:00:00');
        const result = needsReset(lastReset, RESET_PERIODS.YEARLY, now);
        expect(result).toBe(true);
      });
    });

    describe('MONTHLY', () => {
      it('returns false when same month', () => {
        const lastReset = '2026-04-15T10:00:00';
        const now = new Date('2026-04-30T12:00:00');
        const result = needsReset(lastReset, RESET_PERIODS.MONTHLY, now);
        expect(result).toBe(false);
      });

      it('returns true when different month', () => {
        const lastReset = '2026-03-15T10:00:00Z';
        const now = new Date('2026-04-01T00:00:00Z');
        const result = needsReset(lastReset, RESET_PERIODS.MONTHLY, now);
        expect(result).toBe(true);
      });

      it('returns true when different year and month', () => {
        const lastReset = '2025-12-15T10:00:00Z';
        const now = new Date('2026-01-01T00:00:00Z');
        const result = needsReset(lastReset, RESET_PERIODS.MONTHLY, now);
        expect(result).toBe(true);
      });
    });

    describe('WEEKLY', () => {
      it('returns false when same ISO week', () => {
        // April 15, 2026 is Wednesday of week 16
        const lastReset = '2026-04-15T10:00:00Z';
        const now = new Date('2026-04-17T10:00:00Z'); // Same week (Fri)
        const result = needsReset(lastReset, RESET_PERIODS.WEEKLY, now);
        expect(result).toBe(false);
      });

      it('returns true when different ISO week', () => {
        // April 15, 2026 is Wednesday of week 16
        const lastReset = '2026-04-15T10:00:00Z';
        const now = new Date('2026-04-21T10:00:00Z'); // Next week (Tue)
        const result = needsReset(lastReset, RESET_PERIODS.WEEKLY, now);
        expect(result).toBe(true);
      });

      it('returns true when crossing ISO week boundary', () => {
        // Dec 29, 2020 is Tuesday of ISO week 53 of 2020
        // Jan 4, 2021 is Monday of ISO week 1 of 2021
        const lastReset = '2020-12-29T00:00:00Z';
        const now = new Date('2021-01-04T00:00:00Z'); // Different ISO week
        const result = needsReset(lastReset, RESET_PERIODS.WEEKLY, now);
        expect(result).toBe(true);
      });

      it('returns true when same week number but different year', () => {
        // Week 1 can exist in different years
        // Jan 1, 2026 is week 1 of 2026
        // Dec 31, 2024 is week 1 of 2025
        const lastReset = '2024-12-31T00:00:00Z';
        const now = new Date('2026-01-01T00:00:00Z');
        const result = needsReset(lastReset, RESET_PERIODS.WEEKLY, now);
        expect(result).toBe(true);
      });
    });

    describe('DAILY', () => {
      it('returns false when same calendar day', () => {
        const lastReset = '2026-04-15T10:00:00';
        const now = new Date('2026-04-15T23:59:59');
        const result = needsReset(lastReset, RESET_PERIODS.DAILY, now);
        expect(result).toBe(false);
      });

      it('returns true when different calendar day', () => {
        const lastReset = '2026-04-15T23:59:59';
        const now = new Date('2026-04-16T00:00:00');
        const result = needsReset(lastReset, RESET_PERIODS.DAILY, now);
        expect(result).toBe(true);
      });

      it('returns true when crossing month boundary', () => {
        const lastReset = '2026-04-30T23:59:59';
        const now = new Date('2026-05-01T00:00:00');
        const result = needsReset(lastReset, RESET_PERIODS.DAILY, now);
        expect(result).toBe(true);
      });

      it('returns true when crossing year boundary', () => {
        const lastReset = '2026-12-31T23:59:59';
        const now = new Date('2027-01-01T00:00:00');
        const result = needsReset(lastReset, RESET_PERIODS.DAILY, now);
        expect(result).toBe(true);
      });

      it('returns false for same local calendar day despite different times', () => {
        const lastReset = '2026-04-15T09:00:00';
        const now = new Date('2026-04-15T23:59:00');
        const result = needsReset(lastReset, RESET_PERIODS.DAILY, now);
        expect(result).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('returns false when lastReset is null for any period', () => {
        expect(needsReset(null, RESET_PERIODS.YEARLY, new Date())).toBe(false);
        expect(needsReset(null, RESET_PERIODS.MONTHLY, new Date())).toBe(false);
        expect(needsReset(null, RESET_PERIODS.WEEKLY, new Date())).toBe(false);
        expect(needsReset(null, RESET_PERIODS.DAILY, new Date())).toBe(false);
      });

      it('handles unknown reset period gracefully', () => {
        const lastReset = '2026-04-15T10:00:00Z';
        const now = new Date('2026-04-20T10:00:00Z');
        // Using 'UNKNOWN' as reset period should fall through to return false
        const result = needsReset(lastReset, 'UNKNOWN' as any, now);
        expect(result).toBe(false);
      });

      it('returns false when lastReset is an invalid date string', () => {
        const now = new Date('2026-04-20T10:00:00Z');
        const result = needsReset('not-a-date', RESET_PERIODS.DAILY, now);
        expect(result).toBe(false);
      });
    });
  });
});
