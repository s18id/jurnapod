// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

/**
 * Datetime and Date validation schemas
 *
 * Standards:
 * - RFC 3339 datetime with timezone offset: 2026-03-16T17:30:00+07:00
 * - Date-only format for boundaries: YYYY-MM-DD (interpreted in company timezone)
 *
 * Quick selection guide:
 * - Use `DateOnlySchema` for business dates without time (invoice_date, posting period boundaries).
 * - Use `RfcDateTimeSchema` for exact instants with offset (`*_at` API fields).
 * - Use `toUtcInstant()` when converting external RFC3339 datetime input to canonical UTC ISO.
 * - Use `toMysqlDateTime()` when persisting strict RFC3339 input into MySQL DATETIME text.
 * - Use `toMysqlDateTimeFromDateLike()` only for internal/legacy Date-like values.
 * - Use `resolveEventTime()` for flexible inputs (`at`, `ts`, or `date+timezone`) in domain logic.
 *
 * Date-only vs datetime:
 * - Date-only means "calendar day in business timezone", not an instant.
 * - Datetime means "exact instant in time", usually normalized to UTC for storage/transport.
 * - Never treat a date-only string as UTC midnight unless that is explicitly your business rule.
 */

/**
 * RFC 3339 datetime with timezone offset
 * Use for: precise timestamps, transaction times, audit logs, API `*_at` fields
 * Format: 2026-03-16T17:30:00+07:00
 *
 * Example accepted values:
 * - 2026-03-16T17:30:00Z
 * - 2026-03-16T17:30:00+07:00
 */
export const RfcDateTimeSchema = z.string().datetime({ offset: true });

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
export type RfcDateTime = z.infer<typeof RfcDateTimeSchema>;
export type DateOnly = z.infer<typeof DateOnlySchema>;
export type Timezone = z.infer<typeof TimezoneSchema>;
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;
export type DateRangeWithTimezone = z.infer<typeof DateRangeWithTimezoneSchema>;

/**
 * Normalize MySQL or any datetime to RFC 3339 UTC ISO string
 * Use this when returning datetime values in API responses.
 * Nullable-safe variant: returns `null` for `null`/`undefined` input.
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
// UTC instant helpers  (*_at = UTC ISO string)
// ---------------------------------------------------------------------------

/**
 * Validate RFC 3339 datetime format.
 *
 * Uses `Temporal.Instant.from` to catch all date-rollover cases that `new Date()`
 * silently accepts (e.g. `"2026-02-30T10:30:00Z"` becomes March 2 in JS `Date` but
 * is correctly rejected by Temporal as an invalid instant).
 *
 * The regex enforces valid time-component ranges (hour 0–23, minute 0–59, second 0–59,
 * no leap-second 60) so obviously-invalid strings like `"2026-01-01T25:61:61Z"` are
 * rejected fast without entering the Temporal path. Leap seconds (ss=60) are explicitly
 * rejected — Temporal would silently normalize them to ss=59, which could cause
 * subtle off-by-one-second audit discrepancies in financial systems.
 *
 * @param value - String to validate
 * @returns true if valid RFC 3339
 */
export function isValidDateTime(value: string): boolean {
  // Structural check: enforce valid time-component ranges.
  // hour: 00-23, minute: 00-59, second: 00-59, optional fractional, Z or ±HH:MM offset.
  // Offset hour is also restricted to 00-23 to catch invalid offsets like +25:00 early.
  const rfc3339Regex =
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-]([01]\d|2[0-3]):\d{2})$/;
  if (!rfc3339Regex.test(value)) return false;

  // Semantic validation via Temporal — catches rolled dates (e.g. Feb 30 → Mar 2).
  try {
    Temporal.Instant.from(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate YYYY-MM-DD date format
 *
 * Use this to validate date-only user input before timezone-aware conversion.
 * This rejects overflow dates (e.g. 2026-02-30).
 *
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
 * Convert any value that can be parsed by the `Date` constructor into a
 * UTC ISO instant string.
 *
 * Use this when you have a local-wall-clock input (RFC 3339 offset, or even
 * a bare ISO string) and you need the canonical UTC representation.
 *
 * @param input - Any value `new Date()` accepts.
 * @returns UTC ISO string ending in `"Z"`.
 * @throws {Error} when `input` cannot be parsed.
 *
 * @example
 * toUtcInstant("2026-03-16T17:30:00+07:00")  // "2026-03-16T10:30:00.000Z"
 */
export function toUtcInstant(input: string): string {
  // isValidDateTime validates format (regex) and semantics (Temporal) before we convert.
  // After passing isValidDateTime, the Date path is guaranteed safe — no redundant check needed.
  if (!isValidDateTime(input)) {
    throw new Error(`Cannot convert to UTC instant: ${input}`);
  }
  return new Date(input).toISOString();
}

/**
 * Convert an RFC 3339 instant into canonical MySQL DATETIME text in UTC.
 *
 * Output format is always `YYYY-MM-DD HH:mm:ss` with millisecond precision truncated,
 * which matches the repository's current DATETIME persistence contract.
 *
 * This helper is intentionally strict: it accepts only valid RFC 3339/ISO instants that
 * pass {@link toUtcInstant}. Offsetless/local datetime strings are rejected to avoid
 * accidental dependence on server-local timezone parsing.
 *
 * @param input - RFC 3339 datetime with `Z` or explicit numeric offset.
 * @returns Canonical UTC MySQL DATETIME string.
 * @throws {Error} when `input` is malformed or not a valid instant.
 *
 * @example
 * toMysqlDateTime("2026-03-16T17:30:00+07:00")  // "2026-03-16 10:30:00"
 */
export function toMysqlDateTime(input: string): string {
  try {
    return toUtcInstant(input).slice(0, 19).replace("T", " ");
  } catch {
    throw new Error(`Cannot convert to MySQL datetime: ${input}`);
  }
}

/**
 * Convert a Date-like value into canonical MySQL DATETIME text in UTC.
 *
 * This helper exists for legacy/internal paths that already operate on database-returned
 * values or JavaScript `Date` instances, where strict RFC 3339 validation is not the
 * correct contract. It intentionally preserves the repository's existing `new Date(...)`
 * interpretation semantics for those internal compatibility paths.
 *
 * Do not use this for new API/client timestamp inputs. Prefer {@link toMysqlDateTime}
 * for strict RFC 3339/offset-aware input validation.
 *
 * @param input - JavaScript `Date` or date-like string accepted by `new Date(...)`.
 * @returns Canonical UTC MySQL DATETIME string.
 * @throws {Error} when `input` cannot be parsed into a valid date.
 */
export function toMysqlDateTimeFromDateLike(input: Date | string): string {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Cannot convert date-like value to MySQL datetime: ${String(input)}`);
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * The inverse of {@link toUtcInstant}: take a UTC ISO string and format it
 * in a target IANA timezone.
 *
 * @param utcAt - UTC ISO string (must end in Z or have an offset).
 * @param timezone - Target IANA timezone.
 * @remarks Output is truncated to millisecond precision per Jurnapod timestamp semantics.
 * @returns ISO datetime with timezone offset appended, e.g. `"2026-03-16T17:30:00.000+07:00"`.
 * @throws {Error} when `utcAt` is not a valid date string.
 *
 * @example
 * fromUtcInstant("2026-03-16T10:30:00.000Z", "Asia/Jakarta")  // "2026-03-16T17:30:00.000+07:00"
 */
export function fromUtcInstant(utcAt: string, timezone: string): string {
  let instant: Temporal.Instant;
  try {
    instant = Temporal.Instant.from(utcAt);
  } catch {
    throw new Error(`Invalid UTC instant: ${utcAt}`);
  }

  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  // Convert to the target timezone to get wall-clock components and offset.
  const zdt = instant.toZonedDateTimeISO(timezone);

  const year = String(zdt.year).padStart(4, "0");
  const month = String(zdt.month).padStart(2, "0");
  const day = String(zdt.day).padStart(2, "0");
  const hour = String(zdt.hour).padStart(2, "0");
  const minute = String(zdt.minute).padStart(2, "0");
  const second = String(zdt.second).padStart(2, "0");
  const frac = String(zdt.millisecond).padStart(3, "0");

  // zdt.offset is the UTC offset string for this instant in the target timezone,
  // e.g. "+07:00" or "-05:00". Use it directly — no manual arithmetic needed.
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${frac}${zdt.offset}`;
}

// ---------------------------------------------------------------------------
// Private helpers (needed by exported functions)
// ---------------------------------------------------------------------------

/**
 * Convert a business-local YYYY-MM-DD date in a given timezone to a UTC ISO
 * string at a specified hour and minute (business-local time).
 *
 * @param dateStr - Business-local date in YYYY-MM-DD format.
 * @param timezone - IANA timezone for the business.
 * @param hour - Hour in business-local time (0–23), default 0.
 * @param minute - Minute in business-local time (0–59), default 0.
 * @returns UTC ISO string.
 */
function normalizeDateWithTime(
  dateStr: string,
  timezone: string,
  hour: number,
  minute: number,
  second: number = 0,
  millisecond: number = 0
): string {
  // Validate format
  if (!isValidDate(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}. Expected: YYYY-MM-DD`);
  }

  // Pre-validate timezone for a consistent error message before Temporal throws.
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  // Validate local time component ranges
  if (!Number.isInteger(hour)) {
    throw new Error(`Invalid hour: ${hour}. Must be an integer.`);
  }
  if (!Number.isInteger(minute)) {
    throw new Error(`Invalid minute: ${minute}. Must be an integer.`);
  }
  if (!Number.isInteger(second)) {
    throw new Error(`Invalid second: ${second}. Must be an integer.`);
  }
  if (!Number.isInteger(millisecond)) {
    throw new Error(`Invalid millisecond: ${millisecond}. Must be an integer.`);
  }
  if (hour < 0 || hour > 23) {
    throw new Error(`Invalid hour: ${hour}. Expected: 0-23`);
  }
  if (minute < 0 || minute > 59) {
    throw new Error(`Invalid minute: ${minute}. Expected: 0-59`);
  }
  if (second < 0 || second > 59) {
    throw new Error(`Invalid second: ${second}. Expected: 0-59`);
  }
  if (millisecond < 0 || millisecond > 999) {
    throw new Error(`Invalid millisecond: ${millisecond}. Expected: 0-999`);
  }

  // Use Temporal to handle DST transitions correctly — no binary search needed.
  // ZonedDateTime.from() accepts a plain-date-time+timezone annotation.
  // disambiguation: 'reject' ensures invalid local times (e.g. 02:30 in a spring-forward gap)
  // throw instead of silently shifting, so callers are forced to handle DST boundaries explicitly.
  const plainDateTime = `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(millisecond).padStart(3, "0")}`;

  let zdt: Temporal.ZonedDateTime;
  try {
    zdt = Temporal.ZonedDateTime.from(`${plainDateTime}[${timezone}]`, {
      overflow: "reject",
      disambiguation: "reject"
    });
  } catch (err) {
    // Re-throw DST gap/ambiguity errors with a clear, consistent message.
    if (err instanceof RangeError) {
      throw new Error(
        `Invalid date-time: the local time ${dateStr} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} does not exist or is ambiguous in ${timezone} (DST transition)`
      );
    }
    throw err;
  }

  // Format via Date to always produce the canonical YYYY-MM-DDTHH:MM:SS.sssZ string.
  return new Date(zdt.epochMilliseconds).toISOString();
}

// ---------------------------------------------------------------------------
// Event time resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the canonical UTC instant for an event.
 *
 * This is the primary entry-point for business logic that receives an event
 * time in any format. It accepts:
 * - A UTC ISO instant (`*_at` field) — returned as-is.
 * - A `reservation_start_ts` / `reservation_end_ts` epoch value — converted to UTC ISO.
 * - A business-local date (`*_date`) + company timezone + optional hour/minute — converted to UTC ISO.
 *
 * **DST Ambiguity Policy**: When resolving from `date` + `timezone`, nonexistent local times
 * (spring-forward gaps) and ambiguous local times (fall-back overlaps) are **rejected by default**
 * via `disambiguation: 'reject'`. This prevents silent coercion to the wrong instant, which
 * could misplace reservations or billing events by ±1 hour. See module-level DST policy docs.
 *
 * @param event - Event time descriptor.
 * @param event.timezone - Company IANA timezone; required when deriving from `*_date`.
 *
 * Recommended usage:
 * - If your input is `*_at` (exact timestamp), pass `at`.
 * - If your input is epoch milliseconds, pass `ts`.
 * - If your input is a date-only business field, pass `date + timezone` (+ optional hour/minute).
 *
 * @returns UTC ISO string.
 *
 * @example
 * // From UTC instant
 * resolveEventTime({ at: "2026-03-16T10:30:00.000Z" })
 * // From epoch ms
 * resolveEventTime({ ts: 1710587400000 })
 * // From business-local date
 * resolveEventTime({ date: "2026-03-16", timezone: "Asia/Jakarta", hour: 9, minute: 0 })
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
    return toUtcInstant(event.at);
  }
  if (event.ts !== undefined) {
    if (!Number.isFinite(event.ts)) {
      throw new Error(`Invalid epoch ms: ${event.ts} is not a finite number`);
    }
    return fromEpochMs(event.ts);
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
 * Resolve the full event-time details: UTC instant, epoch ms, business date, and timezone.
 *
 * Returns an aligned object from a single input form. This is useful for business logic
 * that needs all four values simultaneously (e.g. logging, event emission, or
 * cross-system timestamp propagation).
 *
 * - From `at`: `businessDate` is derived from the given `timezone`.
 * - From `ts`: `businessDate` is derived from the given `timezone`.
 * - From `date` + `timezone`: `atUtc` is computed via {@link normalizeDateWithTime},
 *   then `businessDate` is derived from it.
 *
 * DST Ambiguity Policy: same as {@link resolveEventTime} — nonexistent and ambiguous
 * local times are rejected by default via `disambiguation: 'reject'`.
 *
 * @param event - Event time descriptor.
 * @param event.timezone - Company IANA timezone; required for all input forms.
 * @returns Aligned event-time object with `atUtc`, `ts`, `businessDate`, and `timezone`.
 *
 * @example
 * resolveEventTimeDetails({ at: "2026-03-16T10:30:00.000Z" }, "Asia/Jakarta")
 * // { atUtc: "2026-03-16T10:30:00.000Z", ts: 1710587400000, businessDate: "2026-03-16", timezone: "Asia/Jakarta" }
 */
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
    atUtc = toUtcInstant(event.at);
  } else if (event.ts !== undefined) {
    if (!Number.isFinite(event.ts)) {
      throw new Error(`Invalid epoch ms: ${event.ts} is not a finite number`);
    }
    atUtc = fromEpochMs(event.ts);
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
    ts: toEpochMs(atUtc),
    businessDate: toBusinessDate(atUtc, timezone),
    timezone
  };
}

// ---------------------------------------------------------------------------
// Epoch ms helpers  (*_ts = UTC unix epoch milliseconds)
// ---------------------------------------------------------------------------

/**
 * Convert a UTC ISO string to a unix epoch in milliseconds.
 *
 * @param utcAt - UTC ISO string (e.g. `"2026-03-16T10:30:00.000Z"`).
 * @returns Unix epoch milliseconds.
 * @throws {Error} when `utcAt` cannot be parsed.
 *
 * @example
 * toEpochMs("2026-03-16T10:30:00.000Z")  // 1710587400000
 */
export function toEpochMs(utcAt: string): number {
  const date = new Date(utcAt);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid UTC instant: ${utcAt}`);
  }
  return date.getTime();
}

/**
 * Convert a unix epoch in milliseconds to a UTC ISO string.
 *
 * @param ts - Unix epoch milliseconds.
 * @returns UTC ISO string.
 *
 * @example
 * fromEpochMs(1710587400000)  // "2026-03-16T10:30:00.000Z"
 */
export function fromEpochMs(ts: number): string {
  if (!Number.isFinite(ts)) {
    throw new Error(`Invalid epoch ms: ${ts}`);
  }

  const date = new Date(ts);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid epoch ms: ${ts}`);
  }

  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Business-local date helpers  (*_date = YYYY-MM-DD)
// ---------------------------------------------------------------------------

/**
 * Derive the business-local date (YYYY-MM-DD) for a UTC instant in a given timezone.
 *
 * @param utcAt - UTC ISO string.
 * @param timezone - IANA timezone for the business.
 * @returns Business-local date string in YYYY-MM-DD format.
 *
 * @example
 * // March 16 2026 00:00 in Jakarta (UTC+7) is March 15 2026 in UTC
 * toBusinessDate("2026-03-15T17:00:00.000Z", "Asia/Jakarta")  // "2026-03-16"
 */
export function toBusinessDate(utcAt: string, timezone: string): string {
  let instant: Temporal.Instant;
  try {
    instant = Temporal.Instant.from(utcAt);
  } catch {
    throw new Error(`Invalid UTC instant: ${utcAt}`);
  }

  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  const zdt = instant.toZonedDateTimeISO(timezone);
  const year = String(zdt.year).padStart(4, "0");
  const month = String(zdt.month).padStart(2, "0");
  const day = String(zdt.day).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD business-local date with company timezone and convert to UTC.
 *
 * This is a convenience wrapper around {@link normalizeDateWithTime} for the common
 * `start` (00:00:00) and `end` (23:59:59.999) boundary cases.
 *
 * @param dateStr - Business-local date in YYYY-MM-DD format.
 * @param timezone - IANA timezone (e.g., "Asia/Jakarta").
 * @param boundary - `"start"` → 00:00:00.000 local; `"end"` → 23:59:59.999 local.
 * @returns UTC ISO string.
 */
export function normalizeDate(
  dateStr: string,
  timezone: string,
  boundary: "start" | "end"
): string {
  const hour = boundary === "start" ? 0 : 23;
  const minute = boundary === "start" ? 0 : 59;
  const second = boundary === "start" ? 0 : 59;
  const millisecond = boundary === "start" ? 0 : 999;
  return normalizeDateWithTime(dateStr, timezone, hour, minute, second, millisecond);
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
 * Format UTC ISO string for display in company timezone.
 *
 * Uses Jurnapod's canonical display shape:
 * - with time: YYYY-MM-DD HH:mm:ss
 * - date only: YYYY-MM-DD
 *
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
  let instant: Temporal.Instant;
  try {
    instant = Temporal.Instant.from(utcISO);
  } catch {
    throw new Error(`Invalid UTC instant: ${utcISO}`);
  }

  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  const zdt = instant.toZonedDateTimeISO(timezone);
  const year = String(zdt.year).padStart(4, '0');
  const month = String(zdt.month).padStart(2, '0');
  const day = String(zdt.day).padStart(2, '0');

  if (!includeTime) {
    return `${year}-${month}-${day}`;
  }

  const hour = String(zdt.hour).padStart(2, '0');
  const minute = String(zdt.minute).padStart(2, '0');
  const second = String(zdt.second).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Extract the UTC date portion (YYYY-MM-DD) from a UTC instant.
 * @param utcISO - UTC ISO string
 * @returns Date string
 */
export function toDateOnly(utcISO: string): string {
  return toUtcInstant(utcISO).slice(0, 10);
}

/**
 * Check if a UTC transaction date falls within fiscal year boundaries.
 *
 * Uses epoch-millisecond comparison to avoid lexicographic string comparison
 * pitfalls (e.g. `"2024-01-01T00:00:00Z"` vs `"2024-01-01T00:00:00.000Z"`).
 *
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
  const txMs = toEpochMs(toUtcInstant(transactionUTC));
  const startMs = toEpochMs(toUtcInstant(fyStartUTC));
  const endMs = toEpochMs(toUtcInstant(fyEndUTC));
  return txMs >= startMs && txMs <= endMs;
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
 * Compare two UTC dates.
 *
 * Uses epoch-millisecond comparison to avoid lexicographic string comparison
 * pitfalls (e.g. `"2024-01-01T00:00:00Z"` vs `"2024-01-01T00:00:00.000Z"`).
 *
 * @param a - First UTC ISO string
 * @param b - Second UTC ISO string
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDates(a: string, b: string): number {
  const aMs = toEpochMs(toUtcInstant(a));
  const bMs = toEpochMs(toUtcInstant(b));
  if (aMs < bMs) return -1;
  if (aMs > bMs) return 1;
  return 0;
}
