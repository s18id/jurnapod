// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

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
 * @deprecated Use `UtcIsoSchema` instead. Will be removed in Epic 53 cleanup.
 */
export const RfcDateTimeSchema = UtcIsoSchema;

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
export type RfcDateTime = z.infer<typeof UtcIsoSchema>;
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

/**
 * Convert a YYYY-MM-DD business date in a given timezone to a half-open UTC range.
 * @deprecated Use `toUtcIso.asOfDateRange(d, tz)` instead.
 */
export function asOfDateToUtcRange(
  dateStr: string,
  timezone: string
): { startUTC: string; nextDayUTC: string } {
  return toUtcIso.asOfDateRange(dateStr, timezone);
}

/**
 * Derive the business-local date (YYYY-MM-DD) from epoch ms in a given timezone.
 * @deprecated Compose: `fromUtcIso.businessDate(toUtcIso.epochMs(epochMs), tz)`
 */
export function businessDateFromEpochMs(epochMs: number, timezone: string): string {
  if (!Number.isFinite(epochMs)) {
    throw new Error(`Invalid epoch ms: ${epochMs} is not a finite number`);
  }
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  return fromUtcIso.businessDate(toUtcIso.epochMs(epochMs), timezone);
}

/**
 * Derive the monthly period boundaries from epoch ms in a given timezone.
 * @deprecated Move to `@jurnapod/modules-accounting` — this is domain logic.
 */
export function epochMsToPeriodBoundaries(
  epochMs: number,
  timezone: string
): { periodStartUTC: string; periodNextUTC: string } {
  if (!Number.isFinite(epochMs)) {
    throw new Error(`Invalid epoch ms: ${epochMs} is not a finite number`);
  }
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  const businessDate = businessDateFromEpochMs(epochMs, timezone);
  const year = parseInt(businessDate.slice(0, 4), 10);
  const month = parseInt(businessDate.slice(5, 7), 10);

  const periodStartDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const periodNextDate = `${String(nextMonthYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;

  return {
    periodStartUTC: toUtcIso.businessDate(periodStartDate, timezone, 'start'),
    periodNextUTC: toUtcIso.businessDate(periodNextDate, timezone, 'start')
  };
}

// ---------------------------------------------------------------------------
// Deprecated wrappers — kept for transition period (removed in Epic 53 cleanup)
// ---------------------------------------------------------------------------

/** @deprecated Use `toUtcIso.dateLike(value, { nullable: true })` */
export function toRfc3339(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return toUtcIso.dateLike(value);
}

/** @deprecated Use `toUtcIso.dateLike(value)` */
export function toRfc3339Required(value: string | Date): string {
  return toUtcIso.dateLike(value) as string;
}

/** @deprecated Use `toUtcIso.dateLike(input)` */
export function toUtcInstant(input: string): string {
  if (!isValidDateTime(input)) {
    throw new Error(`Cannot convert to UTC instant: ${input}`);
  }
  return new Date(input).toISOString();
}

/** @deprecated Use `fromUtcIso.mysql(input)` */
export function toMysqlDateTime(input: string): string {
  return fromUtcIso.mysql(input);
}

/** @deprecated Use `fromUtcIso.mysql(toUtcIso.dateLike(input))` */
export function toMysqlDateTimeFromDateLike(input: Date | string): string {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Cannot convert date-like value to MySQL datetime: ${String(input)}`);
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** @deprecated Use `fromUtcIso.localDisplay(utcAt, timezone)` */
export function fromUtcInstant(utcAt: string, timezone: string): string {
  return fromUtcIso.localDisplay(utcAt, timezone);
}

/** @deprecated Use `fromUtcIso.epochMs(utcAt)` */
export function toEpochMs(utcAt: string): number {
  return fromUtcIso.epochMs(utcAt);
}

/** @deprecated Use `toUtcIso.epochMs(ts)` */
export function fromEpochMs(ts: number): string {
  return toUtcIso.epochMs(ts);
}

/** @deprecated Use `fromUtcIso.businessDate(utcAt, timezone)` */
export function toBusinessDate(utcAt: string, timezone: string): string {
  return fromUtcIso.businessDate(utcAt, timezone);
}

/** @deprecated Use `toUtcIso.businessDate(dateStr, timezone, boundary)` */
export function normalizeDate(dateStr: string, timezone: string, boundary: 'start' | 'end'): string {
  return toUtcIso.businessDate(dateStr, timezone, boundary);
}

/** @deprecated Use `toUtcIso.dateRange(dateFrom, dateTo, timezone)` */
export function toDateTimeRangeWithTimezone(
  dateFrom: string,
  dateTo: string,
  timezone: string
): { fromStartUTC: string; toEndUTC: string } {
  return toUtcIso.dateRange(dateFrom, dateTo, timezone);
}

/** @deprecated Use `fromUtcIso.localDisplay(utcISO, timezone, { includeTime })` */
export function formatForDisplay(utcISO: string, timezone: string, includeTime: boolean = true): string {
  return fromUtcIso.localDisplay(utcISO, timezone, { includeTime });
}

/** @deprecated Use `fromUtcIso.dateOnly(utcISO)` */
export function toDateOnly(utcISO: string): string {
  return fromUtcIso.dateOnly(utcISO);
}

/** @deprecated No real consumers. Use `fromUtcIso.epochMs(a) - fromUtcIso.epochMs(b)` */
export function compareDates(a: string, b: string): number {
  const aMs = fromUtcIso.epochMs(a);
  const bMs = fromUtcIso.epochMs(b);
  if (aMs < bMs) return -1;
  if (aMs > bMs) return 1;
  return 0;
}

/** @deprecated No real consumers. Inline `new Date(s).setUTCDate(...)` */
export function addDays(utcISO: string, days: number): string {
  const date = new Date(utcISO);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/** @deprecated No real consumers. Compose epoch ms. */
export function isInFiscalYear(
  transactionUTC: string,
  fyStartUTC: string,
  fyEndUTC: string
): boolean {
  const txMs = fromUtcIso.epochMs(transactionUTC);
  const startMs = fromUtcIso.epochMs(fyStartUTC);
  const endMs = fromUtcIso.epochMs(fyEndUTC);
  return txMs >= startMs && txMs <= endMs;
}

/** @deprecated No real consumers. Use `resolveEventTime` + `fromUtcIso.businessDate`. */
export function resolveEventTimeDetails(
  event: {
    at?: string;
    ts?: number;
    date?: string;
    hour?: number;
    minute?: number;
  },
  timezone: string
): {
  atUtc: string;
  ts: number;
  businessDate: string;
  timezone: string;
} {
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  let atUtc: string;

  if (event.at !== undefined) {
    if (!isValidDateTime(event.at)) {
      throw new Error(`Cannot convert to UTC instant: ${event.at}`);
    }
    atUtc = new Date(event.at).toISOString();
  } else if (event.ts !== undefined) {
    if (!Number.isFinite(event.ts)) {
      throw new Error(`Invalid epoch ms: ${event.ts} is not a finite number`);
    }
    atUtc = toUtcIso.epochMs(event.ts);
  } else if (event.date !== undefined) {
    const hour = event.hour ?? 0;
    const minute = event.minute ?? 0;
    atUtc = normalizeDateWithTime(event.date, timezone, hour, minute);
  } else {
    throw new Error(
      "resolveEventTimeDetails requires one of: at (UTC ISO), ts (epoch ms), or date+timezone"
    );
  }

  return {
    atUtc,
    ts: fromUtcIso.epochMs(atUtc),
    businessDate: fromUtcIso.businessDate(atUtc, timezone),
    timezone
  };
}
