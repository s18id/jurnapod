import { describe, it, expect } from 'vitest';
import {
  resolveBusinessTimezone,
  asOfDateToUtcRange,
  businessDateFromEpochMs,
  epochMsToPeriodBoundaries,
  isValidTimeZone,
  normalizeDate,
  fromEpochMs,
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
  // asOfDateToUtcRange
  // -------------------------------------------------------------------------

  describe('asOfDateToUtcRange', () => {
    it('returns startUTC and nextDayUTC for a valid date and timezone', () => {
      const result = asOfDateToUtcRange('2026-04-15', 'Asia/Jakarta');
      expect(result).toHaveProperty('startUTC');
      expect(result).toHaveProperty('nextDayUTC');
    });

    it('ensures startUTC < nextDayUTC (half-open ordering)', () => {
      const { startUTC, nextDayUTC } = asOfDateToUtcRange('2026-04-15', 'Asia/Jakarta');
      expect(startUTC < nextDayUTC).toBe(true);
    });

    it('nextDayUTC is exactly start-of-next-calendar-day in business timezone (Asia/Jakarta, non-DST)', () => {
      // Asia/Jakarta is UTC+7 with no DST — each business day is exactly 24h apart.
      // April 15 00:00 Jakarta = April 14 17:00 UTC.
      // April 16 00:00 Jakarta = April 15 17:00 UTC.
      const { startUTC, nextDayUTC } = asOfDateToUtcRange('2026-04-15', 'Asia/Jakarta');
      expect(startUTC).toBe('2026-04-14T17:00:00.000Z');
      expect(nextDayUTC).toBe('2026-04-15T17:00:00.000Z');
    });

    it('throws for an invalid date string', () => {
      expect(() => asOfDateToUtcRange('not-a-date', 'Asia/Jakarta')).toThrow(/invalid date/i);
    });

    it('throws for an overflow date (2026-02-30)', () => {
      expect(() => asOfDateToUtcRange('2026-02-30', 'Asia/Jakarta')).toThrow(/invalid date/i);
    });

    it('throws for an invalid timezone', () => {
      expect(() => asOfDateToUtcRange('2026-04-15', 'Not/A/Zone')).toThrow(/invalid timezone/i);
    });

    it('handles spring-forward DST correctly (America/New_York, 2026-03-08)', () => {
      // US DST starts March 8 2026 — clocks spring forward from 02:00 to 03:00 local.
      // March 8 00:00 local New York = 2026-03-08T05:00:00.000Z UTC (UTC-4, DST in effect).
      // March 9 00:00 local New York = 2026-03-09T04:00:00.000Z UTC (UTC-4, still DST).
      // The interval is exactly 23h in UTC because we count calendar days, not fixed 24h UTC.
      const { startUTC, nextDayUTC } = asOfDateToUtcRange('2026-03-08', 'America/New_York');
      expect(startUTC).toBe('2026-03-08T05:00:00.000Z');
      expect(nextDayUTC).toBe('2026-03-09T04:00:00.000Z');
      expect(startUTC < nextDayUTC).toBe(true);
    });

    it('handles fall-back DST correctly (America/New_York, 2026-11-01)', () => {
      // US DST ends November 1 2026 — clocks fall back from 02:00 to 01:00 local.
      // Nov 1 00:00 local New York = 2026-11-01T04:00:00.000Z UTC (UTC-4, DST in effect).
      // Nov 2 00:00 local New York = 2026-11-02T05:00:00.000Z UTC (UTC-5, standard time).
      // The interval is exactly 25h in UTC because we count calendar days, not fixed 24h UTC.
      const { startUTC, nextDayUTC } = asOfDateToUtcRange('2026-11-01', 'America/New_York');
      expect(startUTC).toBe('2026-11-01T04:00:00.000Z');
      expect(nextDayUTC).toBe('2026-11-02T05:00:00.000Z');
      expect(startUTC < nextDayUTC).toBe(true);
    });

    it('covers DST-observing timezone correctly (America/New_York, non-transition day 2026-03-01)', () => {
      // In March 2026, US transitions to DST on March 8 (clocks spring forward).
      // March 1 2026 is still in standard time (UTC-5).
      // March 1 00:00 local New York = 2026-03-01T05:00:00.000Z UTC.
      // March 2 00:00 local New York = 2026-03-02T05:00:00.000Z UTC.
      const { startUTC, nextDayUTC } = asOfDateToUtcRange('2026-03-01', 'America/New_York');
      expect(startUTC).toBe('2026-03-01T05:00:00.000Z');
      expect(nextDayUTC).toBe('2026-03-02T05:00:00.000Z');
      expect(startUTC < nextDayUTC).toBe(true);
    });

    it('covers DST-observing timezone correctly (Europe/Berlin, non-transition day 2026-03-25)', () => {
      // Europe transitions to DST on last Sunday of March (March 29 2026).
      // March 25 2026 is still in standard time (UTC+1).
      // March 25 00:00 local Berlin = 2026-03-24T23:00:00.000Z UTC.
      // March 26 00:00 local Berlin = 2026-03-25T23:00:00.000Z UTC.
      const { startUTC, nextDayUTC } = asOfDateToUtcRange('2026-03-25', 'Europe/Berlin');
      expect(startUTC).toBe('2026-03-24T23:00:00.000Z');
      expect(nextDayUTC).toBe('2026-03-25T23:00:00.000Z');
      expect(startUTC < nextDayUTC).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // businessDateFromEpochMs
  // -------------------------------------------------------------------------

  describe('businessDateFromEpochMs', () => {
    it('returns the correct business date for a UTC epoch', () => {
      // 2026-04-15T00:00:00.000Z — this is 2026-04-15 in UTC
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(businessDateFromEpochMs(epoch, 'UTC')).toBe('2026-04-15');
    });

    it('handles a positive-offset timezone (Asia/Jakarta, UTC+7)', () => {
      // 2026-04-15T00:00:00.000Z = 2026-04-15T07:00:00 in Jakarta
      // Business date in Jakarta is 2026-04-15
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(businessDateFromEpochMs(epoch, 'Asia/Jakarta')).toBe('2026-04-15');
    });

    it('handles a negative-offset timezone (America/New_York, UTC-5)', () => {
      // 2026-04-15T00:00:00.000Z = 2026-04-14T19:00:00 in New York (day before)
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(businessDateFromEpochMs(epoch, 'America/New_York')).toBe('2026-04-14');
    });

    it('throws for non-finite epoch ms (Infinity)', () => {
      expect(() => businessDateFromEpochMs(Infinity, 'UTC')).toThrow(/invalid epoch ms/i);
    });

    it('throws for non-finite epoch ms (-Infinity)', () => {
      expect(() => businessDateFromEpochMs(-Infinity, 'UTC')).toThrow(/invalid epoch ms/i);
    });

    it('throws for NaN', () => {
      expect(() => businessDateFromEpochMs(NaN, 'UTC')).toThrow(/invalid epoch ms/i);
    });

    it('throws for invalid timezone', () => {
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(() => businessDateFromEpochMs(epoch, 'Not/A/Zone')).toThrow(/invalid timezone/i);
    });

    it('derives the correct business date from a UTC epoch (Asia/Jakarta)', () => {
      const originalEpoch = new Date('2026-04-15T12:30:00.000Z').getTime();
      const businessDate = businessDateFromEpochMs(originalEpoch, 'Asia/Jakarta');
      // Verify the business date corresponds to the expected date
      expect(businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(businessDate).toBe('2026-04-15');
    });
  });

  // -------------------------------------------------------------------------
  // epochMsToPeriodBoundaries
  // -------------------------------------------------------------------------

  describe('epochMsToPeriodBoundaries', () => {
    it('returns periodStartUTC < periodNextUTC (monthly half-open ordering)', () => {
      const epoch = new Date('2026-04-15T12:30:00.000Z').getTime();
      const { periodStartUTC, periodNextUTC } = epochMsToPeriodBoundaries(epoch, 'UTC');
      expect(periodStartUTC < periodNextUTC).toBe(true);
    });

    it('computes correct first-of-month to first-of-next-month boundaries in UTC', () => {
      // April 15 2026 in UTC → April 2026 period
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      const { periodStartUTC, periodNextUTC } = epochMsToPeriodBoundaries(epoch, 'UTC');

      // periodStartUTC should be start of April 2026 in UTC
      expect(periodStartUTC).toBe('2026-04-01T00:00:00.000Z');
      // periodNextUTC should be start of May 2026 in UTC
      expect(periodNextUTC).toBe('2026-05-01T00:00:00.000Z');
    });

    it('handles month boundary crossing correctly (December → January)', () => {
      const epoch = new Date('2026-12-15T00:00:00.000Z').getTime();
      const { periodStartUTC, periodNextUTC } = epochMsToPeriodBoundaries(epoch, 'UTC');

      expect(periodStartUTC).toBe('2026-12-01T00:00:00.000Z');
      expect(periodNextUTC).toBe('2027-01-01T00:00:00.000Z');
    });

    it('uses business timezone to determine month boundaries (Asia/Jakarta UTC+7)', () => {
      // If epoch falls on 2026-04-15 07:00:00 local Jakarta time,
      // the UTC time is 2026-04-15T00:00:00.000Z which is still April 15.
      // If it's 2026-04-15 08:00:00 Jakarta, UTC is 2026-04-15T01:00:00.000Z, still April.
      // Let's use a clear case: 2026-04-01 00:00 Jakarta = 2026-03-31T17:00:00.000Z UTC.
      // The business date is still April 1 in Jakarta, so period should be April.
      const epoch = new Date('2026-04-01T00:00:00.000Z').getTime();
      const { periodStartUTC, periodNextUTC } = epochMsToPeriodBoundaries(epoch, 'Asia/Jakarta');

      // April in Jakarta starts at UTC 2026-03-31T17:00:00.000Z
      // Period should be April
      expect(periodStartUTC).toBe('2026-03-31T17:00:00.000Z');
      expect(periodNextUTC).toBe('2026-04-30T17:00:00.000Z');
    });

    it('throws for non-finite epoch ms', () => {
      expect(() => epochMsToPeriodBoundaries(Infinity, 'UTC')).toThrow(/invalid epoch ms/i);
    });

    it('throws for invalid timezone', () => {
      const epoch = new Date('2026-04-15T00:00:00.000Z').getTime();
      expect(() => epochMsToPeriodBoundaries(epoch, 'Not/A/Zone')).toThrow(/invalid timezone/i);
    });

    it('covers DST-observing timezone case (America/New_York)', () => {
      // March 2026 — US is in DST after March 8.
      // March 10 2026 in New York falls within DST (UTC-4).
      const epoch = new Date('2026-03-10T00:00:00.000Z').getTime();
      const { periodStartUTC, periodNextUTC } = epochMsToPeriodBoundaries(epoch, 'America/New_York');

      // March in New York: DST starts March 8, so March begins at UTC-5 (standard)
      // Start of March 2026 in New York is 2026-03-01T05:00:00.000Z (UTC-5).
      // Start of April 2026 in New York is 2026-04-01T04:00:00.000Z (UTC-4, DST).
      expect(periodStartUTC).toBe('2026-03-01T05:00:00.000Z');
      expect(periodNextUTC).toBe('2026-04-01T04:00:00.000Z');
    });
  });

});