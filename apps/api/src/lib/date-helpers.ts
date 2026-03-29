// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Date and time utilities — re-exported from @jurnapod/shared
 *
 * This file re-exports all date/time helpers from the shared package.
 * The shared package is the canonical source for these utilities.
 *
 * ## Jurnapod Time Semantics
 *
 * | Suffix  | Meaning                          | Format          |
 * |---------|----------------------------------|-----------------|
 * | `*_at`  | UTC instant                      | UTC ISO string  |
 * | `*_date`| Business-local date              | YYYY-MM-DD      |
 * | `*_ts`  | UTC unix epoch milliseconds      | number          |
 *
 * For detailed documentation on each function, see:
 * @jurnapod/shared/src/schemas/datetime.ts
 */

// Re-export everything from shared datetime utilities
export {
  // Validation
  isValidTimeZone,
  isValidDateTime,
  isValidDate,
  // RFC 3339 / conversion
  toRfc3339,
  toRfc3339Required,
  toUtcInstant,
  toMysqlDateTime,
  toMysqlDateTimeFromDateLike,
  fromUtcInstant,
  // Epoch ms
  toEpochMs,
  fromEpochMs,
  // Business date
  toBusinessDate,
  normalizeDate,
  toDateTimeRangeWithTimezone,
  formatForDisplay,
  toDateOnly,
  // Event time
  resolveEventTime,
  resolveEventTimeDetails,
  // Fiscal year
  isInFiscalYear,
  // General
  nowUTC,
  addDays,
  compareDates,
} from "@jurnapod/shared";
