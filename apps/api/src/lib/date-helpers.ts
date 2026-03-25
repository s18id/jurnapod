// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Date and time utilities — public contract
 *
 * ## Jurnapod Time Semantics
 *
 * | Suffix  | Meaning                          | Format          |
 * |---------|----------------------------------|-----------------|
 * | `*_at`  | UTC instant                      | UTC ISO string  |
 * | `*_date`| Business-local date              | YYYY-MM-DD      |
 * | `*_ts`  | UTC unix epoch milliseconds      | number          |
 *
 * ## Design Rules
 *
 * - All public helpers return **primitive types only** (string, number, boolean, plain object).
 * - Raw `Temporal` objects are never exposed through the public API.
 * - Business logic should call these helpers instead of inline timezone logic.
 * - Callers migrating away from ad hoc `Date` usage should prefer the `*_at` (UTC instant)
 *   helpers for wall-clock representation and `*_ts` helpers for epoch-based comparisons.
 *
 * ## IANA Timezone Naming
 *
 * All timezone parameters accept canonical IANA names (e.g. `"Asia/Jakarta"`, `"America/New_York"`).
 * Use {@link isValidTimeZone} to validate before passing to other helpers.
 *
 * ## Implementation Notes
 *
 * Internally these helpers use `@js-temporal/polyfill` to handle DST transitions and
 * timezone arithmetic correctly — the wheel is not reinvented.
 */

import { Temporal } from "@js-temporal/polyfill";

export { toRfc3339, toRfc3339Required } from "@jurnapod/shared";

/**
 * Parse RFC 3339 datetime and convert to UTC ISO string
 * @deprecated Prefer {@link toUtcInstant} as the canonical public helper.
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
  // offset variants (GMT+8, EST-5) are rejected.
  if (/^(?:GMT|EST|EDT|CST|CDT|MST|PDT|PST)[+-]\d{1,2}(?::\d{2})?$/i.test(tz)) {
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
  // Reject ambiguous or locale-dependent formats by enforcing RFC 3339 shape first.
  // new Date() is lenient enough to accept formats we don't want to rely on.
  if (!isValidDateTime(input)) {
    throw new Error(`Cannot convert to UTC instant: ${input}`);
  }
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Cannot convert to UTC instant: ${input}`);
  }
  return date.toISOString();
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

/**
 * Resolve the canonical UTC instant for an event.
 *
 * This is the primary entry-point for business logic that receives an event
 * time in any format. It accepts:
 * - A UTC ISO instant (`*_at` field) — returned as-is.
 * - A `reservation_start_ts` / `reservation_end_ts` epoch value — converted to UTC ISO.
 * - A business-local date (`*_date`) + company timezone + optional hour/minute — converted to UTC ISO.
 *
 * @param event - Event time descriptor.
 * @param event.timezone - Company IANA timezone; required when deriving from `*_date`.
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
  return new Date(ts).toISOString();
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
 * Validate RFC 3339 datetime format.
 *
 * Uses `Temporal.Instant.from` to catch all date-rollover cases that `new Date()`
 * silently accepts (e.g. `"2026-02-30T10:30:00Z"` becomes March 2 in JS `Date` but
 * is correctly rejected by Temporal as an invalid instant).
 *
 * The regex enforces valid time-component ranges (hour 0–23, minute 0–59, second 0–59)
 * so obviously-invalid strings like `"2026-01-01T25:61:61Z"` are rejected fast without
 * entering the Temporal path.
 *
 * @param value - String to validate
 * @returns true if valid RFC 3339
 */
export function isValidDateTime(value: string): boolean {
  // Structural check: enforce valid time-component ranges.
  // hour: 00-23, minute: 00-59, second: 00-59, optional fractional, Z or ±HH:MM offset.
  const rfc3339Regex =
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
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
