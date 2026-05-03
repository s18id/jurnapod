// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

/**
 * Jurnapod Datetime Canonical API
 *
 * Two namespaces representing the conversion trunk:
 *   toUtcIso   — "I want our canonical Z string. Here's what I have:"
 *   fromUtcIso — "I have our canonical Z string. Here's what I want:"
 *
 * Canonical internal + API format: UTC ISO Z string (e.g. "2026-03-16T10:30:00.000Z")
 * Rejects offset datetime at validation boundary. No {offset: true} anywhere.
 *
 * Standalone utilities (unchanged):
 *   nowUTC()                                  — current time as Z string
 *   isValidTimeZone(tz)                        — IANA validation
 *   resolveBusinessTimezone(outlet?, company?)  — outlet→company→error
 *   resolveEventTime({at?, ts?, date?, ...})   — flexible router
 *
 * ToUtcIso namespace (produce Z string):
 *   .dateLike(value, opts?)     — Date|string → Z string (replaces toRfc3339/toRfc3339Required/toUtcInstant)
 *   .epochMs(ms)                — number → Z string (replaces fromEpochMs)
 *   .businessDate(date, tz, b)  — YYYY-MM-DD + boundary → Z string (replaces normalizeDate)
 *   .asOfDateRange(date, tz)    — YYYY-MM-DD → {startUTC, nextDayUTC} (replaces asOfDateToUtcRange)
 *   .dateRange(from, to, tz)    — date range → {fromStartUTC, toEndUTC} (replaces toDateTimeRangeWithTimezone)
 *
 * FromUtcIso namespace (consume Z string):
 *   .epochMs(iso)               — Z string → number (replaces toEpochMs)
 *   .mysql(iso)                 — Z string → YYYY-MM-DD HH:mm:ss (replaces toMysqlDateTime)
 *   .businessDate(iso, tz)      — Z string → YYYY-MM-DD (replaces toBusinessDate)
 *   .localDisplay(iso, tz, op?) — Z string → local display (replaces fromUtcInstant/formatForDisplay)
 *   .dateOnly(iso)              — Z string → YYYY-MM-DD (replaces toDateOnly)
 *
 * @see _bmad-output/planning-artifacts/datetime-api-consolidation-plan.md
 */

// ---------------------------------------------------------------------------
// Canonical schemas
// ---------------------------------------------------------------------------

/**
 * UTC ISO Z string — the canonical datetime format.
 * Accepts only Z-suffix instants (no offset). Use for all `*_at` API fields.
 * Format: 2026-03-16T10:30:00.000Z
 */
export const UtcIsoSchema = z.string().datetime();

/**
 * Date-only format YYYY-MM-DD
 * Use for: date boundaries, fiscal periods, due-date rules, reporting ranges
 * Interpretation: calendar date in company/business timezone context
 * Format: 2026-03-16
 *
 * Important:
 * - This is not a timestamp and carries no timezone or hour/minute component.
 * - Convert to a UTC instant only when you also know the business timezone.
 */
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Timezone identifier (IANA format)
 * Examples: "Asia/Jakarta", "UTC", "America/New_York"
 */
export const TimezoneSchema = z.string().trim().max(64);

/**
 * Date range query parameters
 * Use for: report/list filtering where boundaries are business dates.
 * `date_from` and `date_to` should be interpreted in company timezone.
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
export type UtcIso = z.infer<typeof UtcIsoSchema>;
export type DateOnly = z.infer<typeof DateOnlySchema>;
export type Timezone = z.infer<typeof TimezoneSchema>;
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;
export type DateRangeWithTimezone = z.infer<typeof DateRangeWithTimezoneSchema>;

// ---------------------------------------------------------------------------
// Timezone validation
// ---------------------------------------------------------------------------

/**
 * Validate an IANA timezone identifier.
 *
 * Uses `Intl.DateTimeFormat` lookup to avoid the performance cost of actually
 * formatting a date when only validation is needed.
 *
 * Also rejects known non-IANA patterns that `Intl.DateTimeFormat` might accept
 * in some environments (e.g. `"GMT+08:00"`, `"UTC+8"`).
 *
 * @param tz - IANA timezone string (e.g. `"Asia/Jakarta"`, `"UTC"`)
 * @returns `true` when `tz` is a recognised canonical IANA timezone name.
 *
 * @example
 * isValidTimeZone("Asia/Jakarta")  // true
 * isValidTimeZone("America/New_York")  // true
 * isValidTimeZone("Not/A_Timezone")  // false
 */
export function isValidTimeZone(tz: string): boolean {
  // Reject known non-IANA patterns that Intl.DateTimeFormat may accept
  // in some environments but are not valid IANA identifiers.
  // Bare "GMT" and "UTC" are accepted as valid legacy identifiers;
  // offset variants (GMT+8, EST-5, AST-4) are rejected.
  // Also reject other abbreviations that may be accepted by Intl but are not IANA.
  if (/^(?:GMT|EST|EDT|CST|CDT|MST|PDT|PST|AST|HST|AKST)[+-]\d{1,2}(?::\d{2})?$/i.test(tz)) {
    return false;
  }
  if (/^[+-]\d{1,2}:\d{2}$/.test(tz)) {
    return false;
  }
  // Reject "UTC+offset" / "UTC-offset" legacy forms; bare "UTC" is valid IANA.
  if (tz !== "UTC" && tz.startsWith("UTC") && tz.length > 3) {
    return false;
  }
  try {
    // `Intl.DateTimeFormat` throws on an invalid timezone in Node ≥20
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Private helpers (needed by exported functions)
// ---------------------------------------------------------------------------

function isValidDateTime(value: string): boolean {
  // Structural check: enforce valid time-component ranges.
  const rfc3339Regex =
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-]([01]\d|2[0-3]):\d{2})$/;
  if (!rfc3339Regex.test(value)) return false;

  try {
    Temporal.Instant.from(value);
    return true;
  } catch {
    return false;
  }
}

function isValidDate(value: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;

  const date = new Date(value);
  if (isNaN(date.getTime())) return false;

  const parts = value.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  return date.getUTCFullYear() === year &&
         date.getUTCMonth() + 1 === month &&
         date.getUTCDate() === day;
}

function normalizeDateWithTime(
  dateStr: string,
  timezone: string,
  hour: number,
  minute: number,
  second: number = 0,
  millisecond: number = 0
): string {
  if (!isValidDate(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}. Expected: YYYY-MM-DD`);
  }

  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  if (!Number.isInteger(hour)) throw new Error(`Invalid hour: ${hour}. Must be an integer.`);
  if (!Number.isInteger(minute)) throw new Error(`Invalid minute: ${minute}. Must be an integer.`);
  if (!Number.isInteger(second)) throw new Error(`Invalid second: ${second}. Must be an integer.`);
  if (!Number.isInteger(millisecond)) throw new Error(`Invalid millisecond: ${millisecond}. Must be an integer.`);
  if (hour < 0 || hour > 23) throw new Error(`Invalid hour: ${hour}. Expected: 0-23`);
  if (minute < 0 || minute > 59) throw new Error(`Invalid minute: ${minute}. Expected: 0-59`);
  if (second < 0 || second > 59) throw new Error(`Invalid second: ${second}. Expected: 0-59`);
  if (millisecond < 0 || millisecond > 999) throw new Error(`Invalid millisecond: ${millisecond}. Expected: 0-999`);

  const plainDateTime = `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(millisecond).padStart(3, "0")}`;

  let zdt: Temporal.ZonedDateTime;
  try {
    zdt = Temporal.ZonedDateTime.from(`${plainDateTime}[${timezone}]`, {
      overflow: "reject",
      disambiguation: "reject"
    });
  } catch (err) {
    if (err instanceof RangeError) {
      throw new Error(
        `Invalid date-time: the local time ${dateStr} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} does not exist or is ambiguous in ${timezone} (DST transition)`
      );
    }
    throw err;
  }

  return new Date(zdt.epochMilliseconds).toISOString();
}

function addCalendarDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const plainDate = Temporal.PlainDate.from({ year: y, month: m, day: d });
  const result = plainDate.add({ days });
  return `${result.year}-${String(result.month).padStart(2, '0')}-${String(result.day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Namespaced API: toUtcIso (produce Z string)
// ---------------------------------------------------------------------------

export const toUtcIso = {
  /**
   * Convert any Date-like value (Date object, MySQL datetime string, ISO string) to a UTC Z string.
   * With `{ nullable: true }`, returns null for null/undefined input instead of throwing.
   *
   * Replaces: `toRfc3339`, `toRfc3339Required`, `toUtcInstant`
   */
  dateLike(value: string | Date | null | undefined, opts?: { nullable?: boolean }): string | null {
    if (value === null || value === undefined) {
      if (opts?.nullable) return null;
      throw new Error('Invalid datetime: null/undefined');
    }
    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid datetime: ${value}`);
    }
    return date.toISOString();
  },

  /**
   * Convert epoch milliseconds to a UTC Z string.
   * Replaces: `fromEpochMs`
   */
  epochMs(ms: number): string {
    if (!Number.isFinite(ms)) {
      throw new Error(`Invalid epoch ms: ${ms}`);
    }
    const date = new Date(ms);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid epoch ms: ${ms}`);
    }
    return date.toISOString();
  },

  /**
   * Convert a YYYY-MM-DD business-local date + timezone to a UTC Z string at a day boundary.
   * Replaces: `normalizeDate`
   */
  businessDate(dateStr: string, timezone: string, boundary: 'start' | 'end'): string {
    const hour = boundary === 'start' ? 0 : 23;
    const minute = boundary === 'start' ? 0 : 59;
    const second = boundary === 'start' ? 0 : 59;
    const millisecond = boundary === 'start' ? 0 : 999;
    return normalizeDateWithTime(dateStr, timezone, hour, minute, second, millisecond);
  },

  /**
   * Convert a YYYY-MM-DD business date + timezone to a half-open UTC range.
   * Replaces: `asOfDateToUtcRange`
   */
  asOfDateRange(dateStr: string, timezone: string): { startUTC: string; nextDayUTC: string } {
    if (!isValidTimeZone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
    if (!isValidDate(dateStr)) {
      throw new Error(`Invalid date: ${dateStr}. Expected: YYYY-MM-DD format with a real calendar date.`);
    }
    const startUTC = normalizeDateWithTime(dateStr, timezone, 0, 0);
    const nextDateStr = addCalendarDaysToDateStr(dateStr, 1);
    const nextDayUTC = normalizeDateWithTime(nextDateStr, timezone, 0, 0);
    return { startUTC, nextDayUTC };
  },

  /**
   * Convert a YYYY-MM-DD date range + timezone to UTC boundaries.
   * Replaces: `toDateTimeRangeWithTimezone`
   */
  dateRange(dateFrom: string, dateTo: string, timezone: string): { fromStartUTC: string; toEndUTC: string } {
    return {
      fromStartUTC: toUtcIso.businessDate(dateFrom, timezone, 'start'),
      toEndUTC: toUtcIso.businessDate(dateTo, timezone, 'end')
    };
  }
};

// ---------------------------------------------------------------------------
// Namespaced API: fromUtcIso (consume Z string)
// ---------------------------------------------------------------------------

export const fromUtcIso = {
  /**
   * Convert a UTC Z string to epoch milliseconds.
   * Replaces: `toEpochMs`
   */
  epochMs(iso: string): number {
    const date = new Date(iso);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid UTC instant: ${iso}`);
    }
    return date.getTime();
  },

  /**
   * Convert a UTC Z string to MySQL DATETIME format (YYYY-MM-DD HH:mm:ss).
   * Replaces: `toMysqlDateTime`
   */
  mysql(iso: string): string {
    const date = new Date(iso);
    if (isNaN(date.getTime())) {
      throw new Error(`Cannot convert to MySQL datetime: ${iso}`);
    }
    return date.toISOString().slice(0, 19).replace("T", " ");
  },

  /**
   * Derive the business-local date (YYYY-MM-DD) for a UTC instant in a given timezone.
   * Replaces: `toBusinessDate`
   */
  businessDate(iso: string, timezone: string): string {
    let instant: Temporal.Instant;
    try {
      instant = Temporal.Instant.from(iso);
    } catch {
      throw new Error(`Invalid UTC instant: ${iso}`);
    }
    if (!isValidTimeZone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
    const zdt = instant.toZonedDateTimeISO(timezone);
    return `${String(zdt.year).padStart(4, "0")}-${String(zdt.month).padStart(2, "0")}-${String(zdt.day).padStart(2, "0")}`;
  },

  /**
   * Format a UTC Z string for display in a local timezone.
   * Replaces: `fromUtcInstant`, `formatForDisplay`
   */
  localDisplay(iso: string, timezone: string, opts?: { includeTime?: boolean }): string {
    let instant: Temporal.Instant;
    try {
      instant = Temporal.Instant.from(iso);
    } catch {
      throw new Error(`Invalid UTC instant: ${iso}`);
    }
    if (!isValidTimeZone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
    const zdt = instant.toZonedDateTimeISO(timezone);
    const year = String(zdt.year).padStart(4, '0');
    const month = String(zdt.month).padStart(2, '0');
    const day = String(zdt.day).padStart(2, '0');

    const includeTime = opts?.includeTime !== false;
    if (!includeTime) return `${year}-${month}-${day}`;

    const hour = String(zdt.hour).padStart(2, '0');
    const minute = String(zdt.minute).padStart(2, '0');
    const second = String(zdt.second).padStart(2, '0');
    const frac = String(zdt.millisecond).padStart(3, '0');
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${frac}${zdt.offset}`;
  },

  /**
   * Extract the YYYY-MM-DD date portion from a UTC Z string.
   * Replaces: `toDateOnly`
   */
  dateOnly(iso: string): string {
    const date = new Date(iso);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid UTC instant: ${iso}`);
    }
    return date.toISOString().slice(0, 10);
  }
};

// ---------------------------------------------------------------------------
// Standalone utilities (unchanged)
// ---------------------------------------------------------------------------

/**
 * Get current UTC timestamp as ISO string
 */
export function nowUTC(): string {
  return new Date().toISOString();
}

/**
 * Resolve the canonical UTC instant for an event.
 *
 * @param event - Event time descriptor.
 * @returns UTC ISO string.
 */
export function resolveEventTime(event: {
  at?: string;
  ts?: number;
  date?: string;
  timezone?: string;
  hour?: number;
  minute?: number;
}): string {
  if (event.at !== undefined) {
    if (!isValidDateTime(event.at)) {
      throw new Error(`Cannot convert to UTC instant: ${event.at}`);
    }
    return new Date(event.at).toISOString();
  }
  if (event.ts !== undefined) {
    if (!Number.isFinite(event.ts)) {
      throw new Error(`Invalid epoch ms: ${event.ts} is not a finite number`);
    }
    return toUtcIso.epochMs(event.ts);
  }
  if (event.date !== undefined && event.timezone !== undefined) {
    if (!isValidTimeZone(event.timezone)) {
      throw new Error(`Invalid timezone: ${event.timezone}`);
    }
    const hour = event.hour ?? 0;
    const minute = event.minute ?? 0;
    return normalizeDateWithTime(event.date, event.timezone, hour, minute);
  }
  throw new Error(
    "resolveEventTime requires one of: at (UTC ISO), ts (epoch ms), or date+timezone"
  );
}

/**
 * Resolve the canonical business timezone using dual-mode resolution.
 *
 * @param outletTz - IANA timezone of the outlet (may be null/undefined).
 * @param companyTz - IANA timezone of the company (may be null/undefined).
 * @returns The resolved IANA timezone string.
 * @throws {Error} when neither outlet nor company timezone is valid.
 */
export function resolveBusinessTimezone(
  outletTz?: string | null,
  companyTz?: string | null
): string {
  const outlet = outletTz == null || outletTz === "" ? undefined : String(outletTz).trim();
  const company = companyTz == null || companyTz === "" ? undefined : String(companyTz).trim();

  if (outlet !== undefined && isValidTimeZone(outlet)) return outlet;
  if (company !== undefined && isValidTimeZone(company)) return company;

  const provided = [outlet, company].filter(Boolean).join(", ") || "none";
  throw new Error(
    `Unresolved business timezone: outlet="${outlet ?? "null"}", company="${company ?? "null"}". ` +
    `At least one must be a valid IANA timezone. Provided: ${provided}`
  );
}

// ---------------------------------------------------------------------------
// Archived — removed in Epic 53 cleanup
// ---------------------------------------------------------------------------
// The following functions were removed in Epic 53 (story 53-6):
//   toRfc3339, toRfc3339Required, toUtcInstant, toMysqlDateTime,
//   toMysqlDateTimeFromDateLike, toEpochMs, fromEpochMs, toBusinessDate,
//   normalizeDate, fromUtcInstant, formatForDisplay, toDateOnly,
//   asOfDateToUtcRange, toDateTimeRangeWithTimezone, businessDateFromEpochMs,
//   epochMsToPeriodBoundaries, compareDates, addDays, isInFiscalYear,
//   resolveEventTimeDetails, RfcDateTimeSchema
// All replaced by toUtcIso / fromUtcIso namespaced API.
