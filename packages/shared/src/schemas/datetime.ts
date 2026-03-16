// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";

/**
 * Datetime and Date validation schemas
 * 
 * Standards:
 * - RFC 3339 datetime with timezone offset: 2026-03-16T17:30:00+07:00
 * - Date-only format for boundaries: YYYY-MM-DD (interpreted in company timezone)
 */

/**
 * RFC 3339 datetime with timezone offset
 * Use for: precise timestamps, transaction times, audit logs
 * Format: 2026-03-16T17:30:00+07:00
 */
export const RfcDateTimeSchema = z.string().datetime({ offset: true });

/**
 * Date-only format YYYY-MM-DD
 * Use for: date boundaries, fiscal periods, reporting ranges
 * Interpretation: Based on company timezone settings
 * Format: 2026-03-16
 */
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Timezone identifier (IANA format)
 * Examples: "Asia/Jakarta", "UTC", "America/New_York"
 */
export const TimezoneSchema = z.string().trim().max(64);

/**
 * Date range query parameters
 * Use for: report filtering, list queries with date boundaries
 */
export const DateRangeQuerySchema = z.object({
  date_from: DateOnlySchema.optional(),
  date_to: DateOnlySchema.optional()
});

/**
 * Date range with optional timezone override
 * Use when client wants to specify timezone explicitly
 */
export const DateRangeWithTimezoneSchema = DateRangeQuerySchema.extend({
  timezone: TimezoneSchema.optional()
});

// Type exports
export type RfcDateTime = z.infer<typeof RfcDateTimeSchema>;
export type DateOnly = z.infer<typeof DateOnlySchema>;
export type Timezone = z.infer<typeof TimezoneSchema>;
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;
export type DateRangeWithTimezone = z.infer<typeof DateRangeWithTimezoneSchema>;

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
 * Normalize MySQL or any datetime to RFC 3339 UTC ISO string (non-null version)
 * Use this for required datetime fields that are guaranteed to have values
 * @param value - MySQL datetime ("2026-03-16 17:16:16"), Date object, or ISO string
 * @returns UTC ISO string (e.g., "2026-03-16T10:16:16.000Z")
 * @throws Error if value is null, undefined, or invalid
 */
export function toRfc3339Required(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return date.toISOString();
}
