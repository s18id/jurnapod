// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Canonical Timestamp Contract for Reservations
 *
 * This module defines the canonical timestamp types for reservation management.
 * Timestamps are stored as unix milliseconds in BIGINT columns.
 *
 * Standards:
 * - `reservation_start_ts`: Source of truth for reporting and date-range filtering
 * - `reservation_end_ts`: Source of truth for calendar windows and overlap checks
 * - API compatibility field `reservation_at` is derived from `reservation_start_ts`
 *
 * @see packages/db/src/kysely/schema.ts for database column definitions
 */

import { Temporal } from "@js-temporal/polyfill";
import { toUtcIso, fromUtcIso } from "@jurnapod/shared";

/**
 * Unix epoch milliseconds - canonical storage format for reservation timestamps
 * Database column type: BIGINT (signed 64-bit integer)
 */
export type UnixMs = number;

/**
 * UTC ISO instant string - for API responses and internal comparisons
 * Format: "2026-03-16T10:30:00.000Z"
 */
export type UtcInstant = string;

/**
 * Business-local date string - YYYY-MM-DD format
 * Interpretation is always timezone-dependent (see timezone resolution policy)
 */
export type BusinessDate = string;

/**
 * Reservation timestamp pair - canonical storage format
 */
export interface ReservationTimestamps {
  /** Start time in unix milliseconds (BIGINT in DB) */
  reservation_start_ts: UnixMs;
  /** End time in unix milliseconds (BIGINT in DB) */
  reservation_end_ts: UnixMs;
}

/**
 * Reservation timestamp pair with optional legacy support
 */
export interface ReservationTimestampsOrNull {
  reservation_start_ts: UnixMs | null;
  reservation_end_ts: UnixMs | null;
}

/**
 * Default reservation duration in minutes
 * Used when duration_minutes is not specified
 */
export const RESERVATION_DEFAULT_DURATION_MINUTES = 90;

/**
 * Minimum reservation duration in minutes
 */
export const RESERVATION_MIN_DURATION_MINUTES = 15;

/**
 * Convert UTC ISO instant to unix milliseconds
 * @throws Error if the instant string is not valid RFC3339 format with timezone offset
 */
export function toUnixMs(utcInstant: UtcInstant): UnixMs {
  return fromUtcIso.epochMs(utcInstant);
}

/**
 * Convert unix milliseconds to UTC ISO instant
 */
export function fromUnixMs(unixMs: UnixMs): UtcInstant {
  return toUtcIso.epochMs(unixMs);
}

/**
 * Check if a unix millisecond value is valid (finite number)
 */
export function isValidUnixMs(value: unknown): value is UnixMs {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Convert reservation timestamps to UTC ISO instants
 */
export function toUtcInstants(
  timestamps: ReservationTimestamps
): { reservation_start: UtcInstant; reservation_end: UtcInstant } {
  return {
    reservation_start: fromUnixMs(timestamps.reservation_start_ts),
    reservation_end: fromUnixMs(timestamps.reservation_end_ts),
  };
}

/**
 * Convert UTC ISO instants to reservation timestamps
 */
export function fromUtcInstants(instants: {
  reservation_start: UtcInstant;
  reservation_end: UtcInstant;
}): ReservationTimestamps {
  return {
    reservation_start_ts: toUnixMs(instants.reservation_start),
    reservation_end_ts: toUnixMs(instants.reservation_end),
  };
}

/**
 * Calculate end timestamp from start timestamp and duration
 * @param startTs - Start timestamp in unix milliseconds
 * @param durationMinutes - Duration in minutes
 * @returns End timestamp in unix milliseconds
 */
export function calculateEndTs(startTs: UnixMs, durationMinutes: number): UnixMs {
  return startTs + durationMinutes * 60_000;
}

/**
 * Calculate duration in minutes between two timestamps
 * @param startTs - Start timestamp in unix milliseconds
 * @param endTs - End timestamp in unix milliseconds
 * @returns Duration in minutes
 */
export function calculateDurationMinutes(startTs: UnixMs, endTs: UnixMs): number {
  return Math.round((endTs - startTs) / 60_000);
}
