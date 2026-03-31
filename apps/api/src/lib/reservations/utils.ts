// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// /**
//  * Reservations Domain Module - Shared Utilities
//  *
//  * Single source of truth for all helper functions used across reservations sub-modules.
//  * This file should be imported by crud.ts, availability.ts, and status.ts.
//  * 
//  * Part of Story 6.5c (Reservations Domain Extraction).
//  */

import { sql } from "kysely";
import type { KyselySchema } from "../db";
import {
  ReservationStatusV2,
  type ReservationStatus,
} from "@jurnapod/shared";
import { toEpochMs, fromEpochMs, toUtcInstant } from "../date-helpers";
import { getSetting } from "../settings";

// Import types from local types module
import type {
  ReservationDbRow,
  OccupancySnapshotRow,
  Reservation,
} from "./types";
import {
  ReservationValidationError,
  RESERVATION_DEFAULT_DURATION_KEY,
} from "./types";

// ============================================================================
// DATE CONVERSION HELPERS
// ============================================================================

/**
 * Convert Date or string to ISO string format
 * Uses Date parsing because MySQL DATETIME columns return 'YYYY-MM-DD HH:MM:SS' format
 */
export function toIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Convert Date or string to MySQL DATETIME format
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
export function toUnixMs(value: Date | string): number {
  try {
    const iso = value instanceof Date ? value.toISOString() : value;
    return toEpochMs(iso);
  } catch {
    throw new ReservationValidationError("Invalid reservation datetime value");
  }
}

/**
 * Convert unix milliseconds (or string) to number | null
 */
export function fromUnixMs(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ============================================================================
// ROW MAPPING HELPERS
// ============================================================================

/**
 * Map database row to ReservationRow (legacy API format)
 */
export function mapRow(row: ReservationDbRow) {
  const reservationStartTs = fromUnixMs(row.reservation_start_ts);
  const reservationAt =
    reservationStartTs !== null
      ? fromEpochMs(reservationStartTs)
      : toUtcInstant(row.reservation_at);
  const createdAt = toIso(row.created_at);
  const updatedAt = toIso(row.updated_at);
  if (!reservationAt || !createdAt || !updatedAt) {
    throw new ReservationValidationError("Invalid reservation datetime value");
  }

  let status: ReservationStatus = row.status as ReservationStatus ?? "BOOKED";
  if (!status && row.status_id) {
    const statusIdMap: Record<number, ReservationStatus> = {
      1: "BOOKED",
      2: "CONFIRMED",
      3: "ARRIVED",
      4: "SEATED",
      5: "CANCELLED",
      6: "COMPLETED",
      7: "NO_SHOW"
    };
    status = statusIdMap[row.status_id] ?? "BOOKED";
  }

  return {
    reservation_id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    table_id: row.table_id ? Number(row.table_id) : null,
    customer_name: String(row.customer_name),
    customer_phone: row.customer_phone,
    guest_count: Number(row.guest_count),
    reservation_at: reservationAt,
    duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    status: status,
    notes: row.notes,
    linked_order_id: row.linked_order_id,
    created_at: createdAt,
    updated_at: updatedAt,
    arrived_at: toIso(row.arrived_at),
    seated_at: toIso(row.seated_at),
    cancelled_at: toIso(row.cancelled_at)
  };
}

/**
 * Map database row to Reservation (Story 12.4 format)
 */
export function mapDbRowToReservation(row: ReservationDbRow): Reservation {
  let statusId: number;
  if (row.status_id !== null && row.status_id !== undefined) {
    statusId = row.status_id;
  } else if (row.status) {
    const statusMap: Record<string, number> = {
      'BOOKED': ReservationStatusV2.PENDING,
      'CONFIRMED': ReservationStatusV2.CONFIRMED,
      'ARRIVED': ReservationStatusV2.CHECKED_IN,
      'SEATED': ReservationStatusV2.CHECKED_IN,
      'COMPLETED': ReservationStatusV2.COMPLETED,
      'CANCELLED': ReservationStatusV2.CANCELLED,
      'NO_SHOW': ReservationStatusV2.NO_SHOW
    };
    statusId = statusMap[row.status.toUpperCase()] ?? ReservationStatusV2.PENDING;
  } else {
    statusId = ReservationStatusV2.PENDING;
  }

  const reservationStartTs = fromUnixMs(row.reservation_start_ts);
  const reservationTimeStr =
    reservationStartTs !== null
      ? new Date(reservationStartTs).toISOString()
      : toUtcInstant(row.reservation_at ?? "");
  const createdAtStr = toIso(row.created_at);
  const updatedAtStr = toIso(row.updated_at);

  return {
    id: BigInt(row.id),
    companyId: BigInt(row.company_id),
    outletId: BigInt(row.outlet_id),
    tableId: row.table_id ? BigInt(row.table_id) : null,
    tableCode: row.table_code ?? null,
    tableName: row.table_name ?? null,
    reservationCode: row.reservation_code ?? "",
    statusId,
    partySize: row.guest_count ?? 0,
    customerName: row.customer_name ?? "",
    customerPhone: row.customer_phone ?? null,
    customerEmail: row.customer_email ?? null,
    reservationTime: new Date(reservationTimeStr),
    durationMinutes: row.duration_minutes ?? 0,
    notes: row.notes ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    createdBy: row.created_by ?? "",
    updatedBy: row.updated_by ?? null,
    createdAt: createdAtStr ? new Date(createdAtStr) : new Date(),
    updatedAt: updatedAtStr ? new Date(updatedAtStr) : new Date(),
  };
}

// ============================================================================
// STATUS TRANSITION HELPERS
// ============================================================================

// Legacy status transition map (for backward compatibility)
const finalStatuses: ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

export function isFinalStatus(status: ReservationStatus): boolean {
  return finalStatuses.includes(status);
}

export function canTransition(fromStatus: ReservationStatus, toStatus: ReservationStatus): boolean {
  const transitions: Record<string, string[]> = {
    'PENDING': ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['CHECKED_IN', 'NO_SHOW', 'CANCELLED'],
    'CHECKED_IN': ['COMPLETED'],
    'NO_SHOW': [],
    'CANCELLED': [],
    'COMPLETED': []
  };
  return transitions[fromStatus]?.includes(toStatus) ?? false;
}

// ============================================================================
// CODE GENERATION
// ============================================================================

export const MAX_CODE_GENERATION_RETRIES = 3;

export async function generateReservationCodeWithConnection(
  db: KyselySchema,
  outletId: bigint
): Promise<string> {
  // Check if reservation_code column exists; if not, skip uniqueness check
  const hasReservationCodeCol = await checkColumnExists(db, 'reservations', 'reservation_code');
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
      // Collision detected, retry
    } catch {
      // Query failed — column may not exist; return code without uniqueness check
      return code;
    }
  }

  // Fallback: timestamp-based code
  const timestamp = Date.now().toString(36).toUpperCase();
  return `RES-${timestamp.slice(-6)}`;
}

async function checkColumnExists(
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

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================================
// COLUMN EXISTENCE CHECK
// ============================================================================

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

// ============================================================================
// DURATION RESOLUTION
// ============================================================================

/**
 * Resolve effective duration from input or company setting
 */
export async function resolveEffectiveDurationMinutes(
  companyId: number,
  durationMinutes: number | null | undefined
): Promise<number> {
  if (durationMinutes !== null && durationMinutes !== undefined) {
    return durationMinutes;
  }

  const setting = await getSetting({
    companyId,
    key: RESERVATION_DEFAULT_DURATION_KEY,
    outletId: null
  });

  if (setting?.value !== null && setting?.value !== undefined) {
    try {
      const parsed = Number(setting.value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch {
      // Fallback
    }
  }

  return 90;
}

// ============================================================================
// HELPERS FOR AVAILABILITY CHECKING
// ============================================================================

/**
 * Check if a reservation overlaps with a time range
 * Overlap rule: a_start < b_end && b_start < a_end
 */
export function reservationsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
