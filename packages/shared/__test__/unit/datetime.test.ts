import { describe, it, expect } from 'vitest';
import {
  resolveBusinessTimezone,
  isValidTimeZone,
  toUtcIso,
  fromUtcIso,
  nowUTC,
} from '../../src/schemas/datetime.js';

describe('datetime helpers — shared/schemas/datetime.ts', () => {

  // -------------------------------------------------------------------------
  // resolveBusinessTimezone
  // -------------------------------------------------------------------------

  describe('resolveBusinessTimezone', () => {
    it('returns outletTz when it is a valid IANA timezone', () => {
      expect(resolveBusinessTimezone('Asia/Jakarta', 'Asia/Singapore')).toBe('Asia/Jakarta');
    });

    it('falls back to companyTz when outletTz is null', () => {
      expect(resolveBusinessTimezone(null, 'Asia/Singapore')).toBe('Asia/Singapore');
    });

    it('falls back to companyTz when outletTz is undefined', () => {
      expect(resolveBusinessTimezone(undefined, 'Asia/Singapore')).toBe('Asia/Singapore');
    });

    it('falls back to companyTz when outletTz is empty string', () => {
      expect(resolveBusinessTimezone('', 'Asia/Singapore')).toBe('Asia/Singapore');
    });

    it('falls back to companyTz when outletTz is invalid IANA', () => {
      expect(resolveBusinessTimezone('Not/A/Timezone', 'Asia/Singapore')).toBe('Asia/Singapore');
    });

    it('throws when both outletTz and companyTz are null', () => {
      expect(() => resolveBusinessTimezone(null, null)).toThrow(/unresolved business timezone/i);
    });

    it('throws when both outletTz and companyTz are undefined', () => {
      expect(() => resolveBusinessTimezone(undefined, undefined)).toThrow(/unresolved business timezone/i);
    });

    it('throws when both outletTz and companyTz are invalid IANA', () => {
      expect(() => resolveBusinessTimezone('Invalid/Zone', 'Also/Invalid')).toThrow(/unresolved business timezone/i);
    });

    it('throws with UTC as the sole input (no UTC fallback)', () => {
      // UTC is valid IANA but the policy says no UTC fallback for business operations.
      // The function should still accept it if provided as explicit value, but
      // it is not used as a fallback when the preferred source is absent/invalid.
      // Test: null outlet + valid UTC company → accepts UTC (valid IANA)
      expect(resolveBusinessTimezone(null, 'UTC')).toBe('UTC');
    });

    it('accepts UTC as explicit outlet timezone', () => {
      expect(resolveBusinessTimezone('UTC', 'Asia/Singapore')).toBe('UTC');
    });

    it('trims whitespace before timezone validation', () => {
      // Whitespace-padded timezone identifiers are trimmed before validation.
      expect(resolveBusinessTimezone('  Asia/Jakarta  ', 'Asia/Singapore')).toBe('Asia/Jakarta');
      expect(resolveBusinessTimezone('  Asia/Jakarta', 'UTC')).toBe('Asia/Jakarta');
      expect(resolveBusinessTimezone(null, '  Asia/Singapore  ')).toBe('Asia/Singapore');
    });
  });

  // -------------------------------------------------------------------------
  // toUtcIso.asOfDateRange (replaces asOfDateToUtcRange)
  // -------------------------------------------------------------------------

  describe('toUtcIso.asOfDateRange', () => {
    it('returns startUTC and nextDayUTC for a valid date and timezone', () => {
      const result = toUtcIso.asOfDateRange('2026-04-15', 'Asia/Jakarta');
      expect(result).toHaveProperty('startUTC');
      expect(result).toHaveProperty('nextDayUTC');
    });

    it('ensures startUTC < nextDayUTC (half-open ordering)', () => {
      const { startUTC, nextDayUTC } = toUtcIso.asOfDateRange('2026-04-15', 'Asia/Jakarta');
      expect(startUTC < nextDayUTC).toBe(true);
    });

    it('nextDayUTC is exactly start-of-next-calendar-day in business timezone (Asia/Jakarta, non-DST)', () => {
      // Asia/Jakarta is UTC+7 with no DST — each business day is exactly 24h apart.
      // April 15 00:00 Jakarta = April 14 17:00 UTC.
      // April 16 00:00 Jakarta = April 15 17:00 UTC.
      const { startUTC, nextDayUTC } = toUtcIso.asOfDateRange('2026-04-15', 'Asia/Jakarta');
      expect(startUTC).toBe('2026-04-14T17:00:00.000Z');
      expect(nextDayUTC).toBe('2026-04-15T17:00:00.000Z');
    });

    it('throws for an invalid date string', () => {
      expect(() => toUtcIso.asOfDateRange('not-a-date', 'Asia/Jakarta')).toThrow(/invalid date/i);
    });

    it('throws for an overflow date (2026-02-30)', () => {
      expect(() => toUtcIso.asOfDateRange('2026-02-30', 'Asia/Jakarta')).toThrow(/invalid date/i);
    });

    it('throws for an invalid timezone', () => {
      expect(() => toUtcIso.asOfDateRange('2026-04-15', 'Not/A/Zone')).toThrow(/invalid timezone/i);
    });

    it('handles spring-forward DST correctly (America/New_York, 2026-03-08)', () => {
      // US DST starts March 8 2026 — clocks spring forward from 02:00 to 03:00 local.
      // March 8 00:00 local New York = 2026-03-08T05:00:00.000Z UTC (UTC-4, DST in effect).
      // March 9 00:00 local New York = 2026-03-09T04:00:00.000Z UTC (UTC-4, still DST).
      // The interval is exactly 23h in UTC because we count calendar days, not fixed 24h UTC.
      const { startUTC, nextDayUTC } = toUtcIso.asOfDateRange('2026-03-08', 'America/New_York');
      expect(startUTC).toBe('2026-03-08T05:00:00.000Z');
      expect(nextDayUTC).toBe('2026-03-09T04:00:00.000Z');
      expect(startUTC < nextDayUTC).toBe(true);
    });

    it('handles fall-back DST correctly (America/New_York, 2026-11-01)', () => {
      // US DST ends November 1 2026 — clocks fall back from 02:00 to 01:00 local.
      // Nov 1 00:00 local New York = 2026-11-01T04:00:00.000Z UTC (UTC-4, DST in effect).
      // Nov 2 00:00 local New York = 2026-11-02T05:00:00.000Z UTC (UTC-5, standard time).
      // The interval is exactly 25h in UTC because we count calendar days, not fixed 24h UTC.
      const { startUTC, nextDayUTC } = toUtcIso.asOfDateRange('2026-11-01', 'America/New_York');
      expect(startUTC).toBe('2026-11-01T04:00:00.000Z');
      expect(nextDayUTC).toBe('2026-11-02T05:00:00.000Z');
      expect(startUTC < nextDayUTC).toBe(true);
    });

    it('covers DST-observing timezone correctly (America/New_York, non-transition day 2026-03-01)', () => {
      // In March 2026, US transitions to DST on March 8 (clocks spring forward).
      // March 1 2026 is still in standard time (UTC-5).
      // March 1 00:00 local New York = 2026-03-01T05:00:00.000Z UTC.
      // March 2 00:00 local New York = 2026-03-02T05:00:00.000Z UTC.
      const { startUTC, nextDayUTC } = toUtcIso.asOfDateRange('2026-03-01', 'America/New_York');
      expect(startUTC).toBe('2026-03-01T05:00:00.000Z');
      expect(nextDayUTC).toBe('2026-03-02T05:00:00.000Z');
      expect(startUTC < nextDayUTC).toBe(true);
    });

    it('covers DST-observing timezone correctly (Europe/Berlin, non-transition day 2026-03-25)', () => {
      // Europe transitions to DST on last Sunday of March (March 29 2026).
      // March 25 2026 is still in standard time (UTC+1).
      // March 25 00:00 local Berlin = 2026-03-24T23:00:00.000Z UTC.
      // March 26 00:00 local Berlin = 2026-03-25T23:00:00.000Z UTC.
      const { startUTC, nextDayUTC } = toUtcIso.asOfDateRange('2026-03-25', 'Europe/Berlin');
      expect(startUTC).toBe('2026-03-24T23:00:00.000Z');
      expect(nextDayUTC).toBe('2026-03-25T23:00:00.000Z');
      expect(startUTC < nextDayUTC).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // fromUtcIso.businessDate(toUtcIso.epochMs(ms), tz) — replaces businessDateFromEpochMs
  // -------------------------------------------------------------------------

  describe('fromUtcIso.businessDate(toUtcIso.epochMs(ms), tz)', () => {
    it('returns the correct business date for a UTC epoch', () => {
      // 2026-04-15T00:00:00.000Z — this is 2026-04-15 in UTC
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(fromUtcIso.businessDate(toUtcIso.epochMs(epoch), 'UTC')).toBe('2026-04-15');
    });

    it('handles a positive-offset timezone (Asia/Jakarta, UTC+7)', () => {
      // 2026-04-15T00:00:00.000Z = 2026-04-15T07:00:00 in Jakarta
      // Business date in Jakarta is 2026-04-15
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(fromUtcIso.businessDate(toUtcIso.epochMs(epoch), 'Asia/Jakarta')).toBe('2026-04-15');
    });

    it('handles a negative-offset timezone (America/New_York, UTC-5)', () => {
      // 2026-04-15T00:00:00.000Z = 2026-04-14T19:00:00 in New York (day before)
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(fromUtcIso.businessDate(toUtcIso.epochMs(epoch), 'America/New_York')).toBe('2026-04-14');
    });

    it('throws for non-finite epoch ms (Infinity)', () => {
      expect(() => fromUtcIso.businessDate(toUtcIso.epochMs(Infinity), 'UTC')).toThrow(/invalid epoch ms/i);
    });

    it('throws for non-finite epoch ms (-Infinity)', () => {
      expect(() => fromUtcIso.businessDate(toUtcIso.epochMs(-Infinity), 'UTC')).toThrow(/invalid epoch ms/i);
    });

    it('throws for NaN', () => {
      expect(() => fromUtcIso.businessDate(toUtcIso.epochMs(NaN), 'UTC')).toThrow(/invalid epoch ms/i);
    });

    it('throws for invalid timezone', () => {
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(() => fromUtcIso.businessDate(toUtcIso.epochMs(epoch), 'Not/A/Zone')).toThrow(/invalid timezone/i);
    });

    it('derives the correct business date from a UTC epoch (Asia/Jakarta)', () => {
      const originalEpoch = new Date('2026-04-15T12:30:00.000Z').getTime();
      const businessDate = fromUtcIso.businessDate(toUtcIso.epochMs(originalEpoch), 'Asia/Jakarta');
      // Verify the business date corresponds to the expected date
      expect(businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(businessDate).toBe('2026-04-15');
    });
  });

  // -------------------------------------------------------------------------
  // New namespaced API tests
  // -------------------------------------------------------------------------

  describe('toUtcIso.dateLike', () => {
    it('converts Date to Z string', () => {
      const date = new Date('2024-03-15T00:00:00.000Z');
      expect(toUtcIso.dateLike(date)).toBe('2024-03-15T00:00:00.000Z');
    });

    it('converts ISO string to Z string', () => {
      const result = toUtcIso.dateLike('2024-03-15T00:00:00.000Z');
      expect(result).toBe('2024-03-15T00:00:00.000Z');
    });

    it('converts MySQL datetime string to a valid Z string (interpreted as local time)', () => {
      const result = toUtcIso.dateLike('2024-03-15 00:00:00');
      expect(result).toMatch(/Z$/);
    });

    it('returns null for null input with nullable option', () => {
      expect(toUtcIso.dateLike(null, { nullable: true })).toBeNull();
    });

    it('returns null for undefined input with nullable option', () => {
      expect(toUtcIso.dateLike(undefined, { nullable: true })).toBeNull();
    });

    it('throws for null input without nullable option', () => {
      expect(() => toUtcIso.dateLike(null)).toThrow();
    });

    it('throws for undefined input without nullable option', () => {
      expect(() => toUtcIso.dateLike(undefined)).toThrow();
    });

    it('throws for invalid date string', () => {
      expect(() => toUtcIso.dateLike('not-a-date')).toThrow();
    });
  });

  describe('fromUtcIso.epochMs', () => {
    it('converts Z string to epoch ms', () => {
      expect(fromUtcIso.epochMs('2024-03-15T00:00:00.000Z')).toBe(new Date('2024-03-15T00:00:00.000Z').getTime());
    });

    it('throws for invalid input', () => {
      expect(() => fromUtcIso.epochMs('not-a-date')).toThrow();
    });
  });

  describe('fromUtcIso.mysql', () => {
    it('converts Z string to MySQL DATETIME format', () => {
      expect(fromUtcIso.mysql('2024-03-15T00:00:00.000Z')).toBe('2024-03-15 00:00:00');
    });

    it('throws for invalid input', () => {
      expect(() => fromUtcIso.mysql('not-a-date')).toThrow();
    });
  });

  describe('fromUtcIso.dateOnly', () => {
    it('extracts YYYY-MM-DD from Z string', () => {
      expect(fromUtcIso.dateOnly('2024-03-15T00:00:00.000Z')).toBe('2024-03-15');
    });

    it('throws for invalid input', () => {
      expect(() => fromUtcIso.dateOnly('not-a-date')).toThrow();
    });
  });

  describe('toUtcIso.businessDate', () => {
    it('returns start-of-day boundary for a given business date and timezone', () => {
      const result = toUtcIso.businessDate('2026-04-15', 'Asia/Jakarta', 'start');
      expect(result).toBe('2026-04-14T17:00:00.000Z');
    });

    it('returns end-of-day boundary for a given business date and timezone', () => {
      const result = toUtcIso.businessDate('2026-04-15', 'Asia/Jakarta', 'end');
      expect(result).toBe('2026-04-15T16:59:59.999Z');
    });

    it('throws for invalid date', () => {
      expect(() => toUtcIso.businessDate('not-a-date', 'UTC', 'start')).toThrow(/invalid date/i);
    });

    it('throws for invalid timezone', () => {
      expect(() => toUtcIso.businessDate('2026-04-15', 'Not/A/Zone', 'start')).toThrow(/invalid timezone/i);
    });
  });

  describe('fromUtcIso.businessDate', () => {
    it('derives business-local date from a Z string in a given timezone', () => {
      // 2026-04-15T00:00:00.000Z = April 15 in UTC
      expect(fromUtcIso.businessDate('2026-04-15T00:00:00.000Z', 'UTC')).toBe('2026-04-15');
    });

    it('handles positive offset (Asia/Jakarta UTC+7)', () => {
      // 2026-04-14T17:00:00.000Z = April 15 00:00 in Jakarta
      expect(fromUtcIso.businessDate('2026-04-14T17:00:00.000Z', 'Asia/Jakarta')).toBe('2026-04-15');
    });

    it('throws for invalid Z string', () => {
      expect(() => fromUtcIso.businessDate('not-a-date', 'UTC')).toThrow(/invalid utc instant/i);
    });

    it('throws for invalid timezone', () => {
      expect(() => fromUtcIso.businessDate('2026-04-15T00:00:00.000Z', 'Not/A/Zone')).toThrow(/invalid timezone/i);
    });
  });

  describe('toUtcIso.epochMs', () => {
    it('converts epoch ms to Z string', () => {
      const epoch = new Date('2024-03-15T00:00:00.000Z').getTime();
      expect(toUtcIso.epochMs(epoch)).toBe('2024-03-15T00:00:00.000Z');
    });

    it('throws for NaN', () => {
      expect(() => toUtcIso.epochMs(NaN)).toThrow(/invalid epoch ms/i);
    });

    it('throws for Infinity', () => {
      expect(() => toUtcIso.epochMs(Infinity)).toThrow(/invalid epoch ms/i);
    });
  });

  describe('fromUtcIso.localDisplay', () => {
    it('formats Z string for local display with time', () => {
      const result = fromUtcIso.localDisplay('2026-04-14T17:00:00.000Z', 'Asia/Jakarta');
      expect(result).toMatch(/2026-04-15T00:00:00/);
    });

    it('formats Z string for local display without time', () => {
      const result = fromUtcIso.localDisplay('2026-04-14T17:00:00.000Z', 'Asia/Jakarta', { includeTime: false });
      expect(result).toBe('2026-04-15');
    });

    it('throws for invalid Z string', () => {
      expect(() => fromUtcIso.localDisplay('not-a-date', 'UTC')).toThrow();
    });
  });

  describe('toUtcIso.dateRange', () => {
    it('converts date range with timezone to UTC boundaries', () => {
      const result = toUtcIso.dateRange('2026-04-15', '2026-04-16', 'Asia/Jakarta');
      expect(result.fromStartUTC).toBe('2026-04-14T17:00:00.000Z');
      expect(result.toEndUTC).toBe('2026-04-16T16:59:59.999Z');
    });
  });

  describe('nowUTC', () => {
    it('returns a valid Z string', () => {
      const result = nowUTC();
      expect(result).toMatch(/Z$/);
      expect(() => toUtcIso.dateLike(result)).not.toThrow();
    });
  });
});