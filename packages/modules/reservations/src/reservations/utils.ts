// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module - Utility Functions
 *
 * Single source of truth for all helper functions used across reservations sub-modules.
 */

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { Temporal } from "@js-temporal/polyfill";
import type { UnixMs } from "../time/timestamp.js";
import { fromUnixMs, toUnixMs, calculateEndTs } from "../time/timestamp.js";
import { reservationsOverlap } from "../time/overlap.js";
import type { ReservationDbRow } from "./types.js";
import { RESERVATION_DEFAULT_DURATION_FALLBACK, MAX_CODE_GENERATION_RETRIES } from "./types.js";
import { ReservationValidationError } from "./errors.js";

// Re-export from shared for convenience
export { isFinalStatus, canTransition, VALID_STATUS_TRANSITIONS } from "../interfaces/shared.js";

/**
 * Convert UTC ISO instant to MySQL DATETIME format
 */
export function toDbDateTime(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ReservationValidationError("Invalid reservation datetime value");
  }
  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Convert Date or string to unix milliseconds
 */
export function toUnixMsFromDate(value: Date | string): number {
  try {
    const iso = value instanceof Date ? value.toISOString() : value;
    return Temporal.Instant.from(iso).epochMilliseconds;
  } catch {
    throw new ReservationValidationError("Invalid reservation datetime value");
  }
}

/**
 * Convert unix milliseconds (or string) to number | null
 */
export function fromUnixMsToNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Map database row to ReservationRecord
 */
export function mapDbRowToReservation(row: ReservationDbRow): {
  id: number;
  companyId: number;
  outletId: number;
  tableId: number | null;
  reservationCode: string;
  status: number;
  partySize: number;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  reservationStartTs: UnixMs;
  reservationEndTs: UnixMs;
  notes: string | null;
  cancellationReason: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
} {
  const reservationStartTsRaw = fromUnixMsToNumber(row.reservation_start_ts);
  const reservationStartTs = reservationStartTsRaw !== null
    ? reservationStartTsRaw
    : toUnixMsFromDate(row.reservation_at);

  const reservationEndTsRaw = fromUnixMsToNumber(row.reservation_end_ts);
  const durationMinutes = row.duration_minutes ?? RESERVATION_DEFAULT_DURATION_FALLBACK;
  const reservationEndTs = reservationEndTsRaw !== null
    ? reservationEndTsRaw
    : reservationStartTs + durationMinutes * 60_000;

  // Map legacy status string to status ID
  let statusId: number;
  if (row.status_id !== null && row.status_id !== undefined) {
    statusId = row.status_id;
  } else if (row.status) {
    const statusMap: Record<string, number> = {
      'BOOKED': 1,
      'CONFIRMED': 2,
      'ARRIVED': 3,
      'SEATED': 3,
      'COMPLETED': 4,
      'CANCELLED': 5,
      'NO_SHOW': 6
    };
    statusId = statusMap[row.status.toUpperCase()] ?? 1;
  } else {
    statusId = 1; // PENDING
  }

  return {
    id: row.id,
    companyId: row.company_id,
    outletId: row.outlet_id,
    tableId: row.table_id,
    reservationCode: row.reservation_code ?? "",
    status: statusId,
    partySize: row.guest_count ?? 0,
    customerName: row.customer_name ?? "",
    customerPhone: row.customer_phone ?? null,
    customerEmail: row.customer_email ?? null,
    reservationStartTs,
    reservationEndTs,
    notes: row.notes ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    createdBy: row.created_by ?? "",
    updatedBy: row.updated_by ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Code generation
export async function generateReservationCodeWithConnection(
  db: KyselySchema,
  outletId: number
): Promise<string> {
  const hasReservationCodeCol = await columnExists(db, 'reservations', 'reservation_code');
  if (!hasReservationCodeCol) {
    return `RES-${generateRandomCode()}`;
  }

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_RETRIES; attempt++) {
    const code = `RES-${generateRandomCode()}`;
    try {
      const result = await sql`
        SELECT id FROM reservations WHERE reservation_code = ${code} AND outlet_id = ${outletId} LIMIT 1
      `.execute(db);
      if (result.rows.length === 0) {
        return code;
      }
    } catch {
      return code;
    }
  }

  // Fallback: timestamp-based code
  const timestamp = Date.now().toString(36).toUpperCase();
  return `RES-${timestamp.slice(-6)}`;
}

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Column existence check
export async function columnExists(
  db: KyselySchema,
  table: string,
  column: string
): Promise<boolean> {
  try {
    const result = await sql`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
    `.execute(db);
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a time range overlaps with existing time ranges
 */
export function checkTimeOverlap(
  newStart: UnixMs,
  newEnd: UnixMs,
  existingRanges: Array<{ start: UnixMs; end: UnixMs }>
): boolean {
  return existingRanges.some((range) => reservationsOverlap(newStart, newEnd, range.start, range.end));
}
