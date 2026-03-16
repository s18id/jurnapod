// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Date utilities for UTC datetime handling
 * 
 * Standard: All datetimes stored as UTC ISO strings
 * - Datetime input: RFC 3339 format (with timezone offset)
 * - Date input: YYYY-MM-DD (parsed with company timezone)
 * - Storage: UTC ISO string
 * - Output: UTC ISO string
 */

/**
 * Parse RFC 3339 datetime and convert to UTC ISO string
 * @param rfc3339 - RFC 3339 datetime (e.g., "2026-03-16T17:30:00+07:00")
 * @returns UTC ISO string (e.g., "2026-03-16T10:30:00.000Z")
 */
export function normalizeDateTime(rfc3339: string): string {
  const date = new Date(rfc3339);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid RFC 3339 datetime: ${rfc3339}`);
  }
  return date.toISOString();
}

/**
 * Normalize MySQL or any datetime to RFC 3339 UTC ISO string
 * Use this when returning datetime values in API responses
 * @param value - MySQL datetime ("2026-03-16 17:16:16"), Date object, or ISO string
 * @returns UTC ISO string (e.g., "2026-03-16T10:16:16.000Z") or null if input is null/undefined
 */
export function toRfc3339(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return date.toISOString();
}

/**
 * Parse YYYY-MM-DD date with company timezone and convert to UTC
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timezone - Company timezone (e.g., "Asia/Jakarta")
 * @param boundary - 'start' (00:00:00) or 'end' (23:59:59.999)
 * @returns UTC ISO string
 */
export function normalizeDate(
  dateStr: string,
  timezone: string,
  boundary: 'start' | 'end'
): string {
  // Validate format
  if (!isValidDate(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}. Expected: YYYY-MM-DD`);
  }

  const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';

  // Parse the local date components
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const day = parseInt(dateStr.slice(8, 10), 10);
  const hour = parseInt(time.slice(0, 2), 10);
  const minute = parseInt(time.slice(3, 5), 10);
  const second = parseInt(time.slice(6, 8), 10);
  const millisecond = parseInt(time.slice(9, 12), 10);

  // Create a formatter for the target timezone
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    fractionalSecondDigits: 3
  });

  // We need to find the UTC time that corresponds to the local time in the target timezone
  // First, create a naive UTC date with the local components
  const naiveUTC = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  // Use binary search to find the correct UTC timestamp
  // The idea: for a given UTC candidate, format it in the target timezone
  // and compare with the desired local time
  let low = naiveUTC - 14 * 60 * 60 * 1000; // UTC-14 (minimum possible offset)
  let high = naiveUTC + 14 * 60 * 60 * 1000; // UTC+14 (maximum possible offset)

  // Helper to get timestamp components in target timezone
  const getTargetComponents = (utcTimestamp: number) => {
    const d = new Date(utcTimestamp);
    const parts = targetFormatter.formatToParts(d);
    return {
      year: parseInt(parts.find(p => p.type === 'year')?.value || '0', 10),
      month: parseInt(parts.find(p => p.type === 'month')?.value || '0', 10),
      day: parseInt(parts.find(p => p.type === 'day')?.value || '0', 10),
      hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10),
      minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10),
      second: parseInt(parts.find(p => p.type === 'second')?.value || '0', 10),
      millisecond: parseInt(parts.find(p => p.type === 'fractionalSecond')?.value || '0', 10)
    };
  };

  const desiredMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  // Binary search for the correct UTC timestamp
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const target = getTargetComponents(mid);
    const targetMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second, target.millisecond);

    if (targetMs < desiredMs) {
      low = mid;
    } else if (targetMs > desiredMs) {
      high = mid;
    } else {
      // Exact match found
      return new Date(mid).toISOString();
    }
  }

  // Check both bounds to find the closest match
  const lowTarget = getTargetComponents(low);
  const highTarget = getTargetComponents(high);

  const lowMs = Date.UTC(lowTarget.year, lowTarget.month - 1, lowTarget.day, lowTarget.hour, lowTarget.minute, lowTarget.second, lowTarget.millisecond);
  const highMs = Date.UTC(highTarget.year, highTarget.month - 1, highTarget.day, highTarget.hour, highTarget.minute, highTarget.second, highTarget.millisecond);

  if (lowMs === desiredMs) return new Date(low).toISOString();
  if (highMs === desiredMs) return new Date(high).toISOString();

  // Neither bound is exact, so we need to find which is closer and adjust
  const lowDiff = Math.abs(lowMs - desiredMs);
  const highDiff = Math.abs(highMs - desiredMs);

  if (lowDiff < highDiff) {
    // low is closer, but we need to adjust to get exact match
    return new Date(low + (desiredMs - lowMs)).toISOString();
  } else {
    // high is closer
    return new Date(high + (desiredMs - highMs)).toISOString();
  }
}

/**
 * Convert date range to UTC boundaries using company timezone
 * @param dateFrom - Start date in YYYY-MM-DD format
 * @param dateTo - End date in YYYY-MM-DD format
 * @param timezone - Company timezone (e.g., "Asia/Jakarta")
 * @returns Object with UTC start and end datetimes
 */
export function toDateTimeRangeWithTimezone(
  dateFrom: string,
  dateTo: string,
  timezone: string
): { fromStartUTC: string; toEndUTC: string } {
  return {
    fromStartUTC: normalizeDate(dateFrom, timezone, 'start'),
    toEndUTC: normalizeDate(dateTo, timezone, 'end')
  };
}

/**
 * Validate RFC 3339 datetime format
 * @param value - String to validate
 * @returns true if valid RFC 3339
 */
export function isValidDateTime(value: string): boolean {
  const rfc3339Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  if (!rfc3339Regex.test(value)) return false;
  return !isNaN(new Date(value).getTime());
}

/**
 * Validate YYYY-MM-DD date format
 * @param value - String to validate
 * @returns true if valid date
 */
export function isValidDate(value: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  
  const date = new Date(value);
  if (isNaN(date.getTime())) return false;
  
  // Ensure it's actually that date (not an overflow)
  const parts = value.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  return date.getUTCFullYear() === year &&
         date.getUTCMonth() + 1 === month &&
         date.getUTCDate() === day;
}

/**
 * Format UTC ISO string for display in company timezone
 * @param utcISO - UTC ISO string
 * @param timezone - Target timezone
 * @param includeTime - Include time in output
 * @returns Formatted string for display
 */
export function formatForDisplay(
  utcISO: string,
  timezone: string,
  includeTime: boolean = true
): string {
  const date = new Date(utcISO);
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.second = '2-digit';
  }
  
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

/**
 * Extract date portion (YYYY-MM-DD) from UTC ISO string
 * @param utcISO - UTC ISO string
 * @returns Date string
 */
export function toDateOnly(utcISO: string): string {
  return utcISO.slice(0, 10);
}

/**
 * Check if a UTC transaction date falls within fiscal year boundaries
 * @param transactionUTC - Transaction timestamp in UTC
 * @param fyStartUTC - Fiscal year start in UTC
 * @param fyEndUTC - Fiscal year end in UTC
 * @returns true if within fiscal year
 */
export function isInFiscalYear(
  transactionUTC: string,
  fyStartUTC: string,
  fyEndUTC: string
): boolean {
  return transactionUTC >= fyStartUTC && transactionUTC <= fyEndUTC;
}

/**
 * Get current UTC timestamp as ISO string
 */
export function nowUTC(): string {
  return new Date().toISOString();
}

/**
 * Add days to a UTC date
 * @param utcISO - UTC ISO string
 * @param days - Number of days to add (can be negative)
 * @returns New UTC ISO string
 */
export function addDays(utcISO: string, days: number): string {
  const date = new Date(utcISO);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/**
 * Compare two UTC dates
 * @param a - First UTC ISO string
 * @param b - Second UTC ISO string
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
