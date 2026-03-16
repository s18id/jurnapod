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
