// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Report Query Helpers
 * 
 * Utility functions for building report queries.
 */

import { sql } from "kysely";
import { toDateTimeRangeWithTimezone, normalizeDate, toMysqlDateTime } from "@jurnapod/shared";

/**
 * Convert value to number, handling string representations from SQL
 */
export function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

/**
 * Build outlet IN clause predicate
 */
export function buildOutletPredicate(
  column: string,
  outletIds: readonly number[],
  includeUnassignedOutlet: boolean
): { sql: string; values: number[] } {
  if (outletIds.length === 0) {
    return { sql: "FALSE", values: [] };
  }

  const placeholders = outletIds.map(() => "?").join(", ");
  const clause = includeUnassignedOutlet
    ? `(${column} IS NULL OR ${column} IN (${placeholders}))`
    : `${column} IN (${placeholders})`;
  return { sql: clause, values: [...outletIds] };
}

/**
 * Convert Date or string to ISO datetime string
 */
export function toIsoDateTime(value: Date | string): string {
  return new Date(value).toISOString();
}

/**
 * Convert Date or string to ISO date string (YYYY-MM-DD)
 */
export function toIsoDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * Convert MySQL datetime string to UTC Date
 */
export function mysqlDateTimeToUtcDate(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}

/**
 * Get MySQL DATETIME or current time if conversion fails
 */
export function toMysqlDateTimeOrNow(value: string): string {
  try {
    return toMysqlDateTime(value);
  } catch {
    return toMysqlDateTime(new Date().toISOString());
  }
}

/**
 * Get datetime range boundaries for queries
 */
export function toDateTimeRange(
  dateFrom: string,
  dateTo: string,
  timezone?: string
): { fromStart: string; nextDayStart: string } {
  if (timezone && timezone !== 'UTC') {
    // Use timezone-aware boundaries
    const range = toDateTimeRangeWithTimezone(dateFrom, dateTo, timezone);
    // Convert to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
    const fromStart = range.fromStartUTC.slice(0, 19).replace("T", " ");
    // For end boundary, add 1ms to get the start of the next day in UTC
    const endDate = new Date(range.toEndUTC);
    endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() + 1);
    // Use the full UTC datetime, not just the date portion
    const nextDayStart = endDate.toISOString().slice(0, 19).replace("T", " ");
    return { fromStart, nextDayStart };
  }

  // Fallback to original UTC behavior
  const fromStart = `${dateFrom} 00:00:00`;
  const [year, month, day] = dateTo.split("-").map((value) => Number(value));
  const nextDay = new Date(Date.UTC(year, month - 1, day));
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return {
    fromStart,
    nextDayStart: `${nextDay.toISOString().slice(0, 10)} 00:00:00`
  };
}

/**
 * Check if daily sales view error should trigger fallback
 */
export function shouldFallbackDailySalesView(error: unknown): boolean {
  const maybeMysqlError = error as { errno?: number };
  return maybeMysqlError.errno === 1146 || maybeMysqlError.errno === 1356;
}

/**
 * Build outlet IN clause for POS transactions
 */
export function buildOutletInClause(outletIds: readonly number[]): { sql: string; values: number[] } {
  if (outletIds.length === 0) {
    return {
      sql: " AND 1 = 0",
      values: []
    };
  }

  const placeholders = outletIds.map(() => "?").join(", ");
  return {
    sql: ` AND pt.outlet_id IN (${placeholders})`,
    values: [...outletIds]
  };
}

/**
 * Build outlet IN clause for journal queries
 */
export function buildOutletInClauseForJournals(
  outletIds: readonly number[],
  includeUnassignedOutlet: boolean
): { sql: string; values: number[] } {
  if (outletIds.length === 0) {
    return {
      sql: " AND 1 = 0",
      values: []
    };
  }

  const placeholders = outletIds.map(() => "?").join(", ");
  return {
    sql: includeUnassignedOutlet
      ? ` AND (jb.outlet_id IS NULL OR jb.outlet_id IN (${placeholders}))`
      : ` AND jb.outlet_id IN (${placeholders})`,
    values: [...outletIds]
  };
}

/**
 * Build outlet IN clause using SQL join for parameterized queries
 */
export function buildOutletInClauseSqlJoin<T extends number>(
  outletIds: readonly T[],
  columnPrefix: string = "jl"
): { sql: string } {
  if (outletIds.length === 0) {
    return { sql: " AND 1 = 0" };
  }
  const joined = sql.join(outletIds.map(id => sql`${id}`));
  return { sql: ` AND ${columnPrefix}.outlet_id IN (${joined})` };
}