// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Domain Module - Types & Error Classes
 *
 * This file contains all TypeScript types and error classes for the reservations domain.
 * Part of Story 6.5a (Reservations Domain Extraction).
 */

import type { RowDataPacket } from "mysql2";
import {
  ReservationStatusV2,
  type ReservationStatusV2Type,
  type ReservationRow,
} from "@jurnapod/shared";

// Re-export ReservationStatusV2 for backward compatibility
export { ReservationStatusV2 };

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class ReservationNotFoundError extends Error {
  constructor(reservationId?: number | bigint | string) {
    super(reservationId !== undefined ? `Reservation ${reservationId} not found` : "Reservation not found");
  }
}

export class ReservationValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class ReservationConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(fromStatus: number | string, toStatus: number | string) {
    super(`Invalid status transition: ${fromStatus} -> ${toStatus}`);
  }
}

export class DuplicateReservationCodeError extends Error {
  constructor(code: string) {
    super(`Reservation code ${code} already exists`);
  }
}

// ============================================================================
// PUBLIC INTERFACES (API-facing)
// ============================================================================

export interface Reservation {
  id: bigint;
  companyId: bigint;
  outletId: bigint;
  tableId: bigint | null;
  tableCode: string | null;
  tableName: string | null;
  reservationCode: string;
  statusId: number;
  partySize: number;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  reservationTime: Date;
  durationMinutes: number;
  notes: string | null;
  cancellationReason: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReservationInput {
  companyId: bigint;
  outletId: bigint;
  partySize: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  reservationTime: Date;
  durationMinutes: number;
  tableId?: bigint;
  notes?: string;
  createdBy: string;
}

export interface ListReservationsParams {
  companyId: bigint;
  outletId: bigint;
  limit: number;
  offset: number;
  statusId?: number;
  tableId?: bigint;
  customerName?: string;
  fromDate?: Date;
  toDate?: Date;
  useOverlapFilter?: boolean; // Enables interval overlap for calendar views
}

export interface UpdateStatusInput {
  statusId: number;
  tableId?: bigint;
  cancellationReason?: string;
  notes?: string;
  updatedBy: string;
}

// ============================================================================
// DATABASE ROW TYPES (internal)
// ============================================================================

export interface ReservationDbRow extends RowDataPacket {
  id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  table_code: string | null;
  table_name: string | null;
  reservation_code: string | null;
  status_id: number | null;
  status: string | null;
  party_size: number | null;
  guest_count: number;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  reservation_time: string | null;
  reservation_at: string;
  reservation_start_ts: number | string | null;
  reservation_end_ts: number | string | null;
  duration_minutes: number | null;
  notes: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  arrived_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
  linked_order_id: string | null;
}

export interface LegacyOverlapRow extends RowDataPacket {
  reservation_start_ts: number | string | null;
  reservation_end_ts: number | string | null;
  reservation_at: string | null;
  duration_minutes: number | null;
}

export interface OccupancySnapshotRow extends RowDataPacket {
  status_id: number;
  version: number;
  reservation_id: number | string | null;
}

export type OutletTableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";

export type OutletTableRow = RowDataPacket & {
  id: number;
  status: OutletTableStatus;
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const VALID_TRANSITIONS: Record<number, number[]> = {
  [ReservationStatusV2.PENDING]: [ReservationStatusV2.CONFIRMED, ReservationStatusV2.CANCELLED],
  [ReservationStatusV2.CONFIRMED]: [ReservationStatusV2.CHECKED_IN, ReservationStatusV2.NO_SHOW, ReservationStatusV2.CANCELLED],
  [ReservationStatusV2.CHECKED_IN]: [ReservationStatusV2.COMPLETED],
  [ReservationStatusV2.NO_SHOW]: [],
  [ReservationStatusV2.CANCELLED]: [],
  [ReservationStatusV2.COMPLETED]: []
};

export const MAX_CODE_GENERATION_RETRIES = 3;
export const RESERVATION_DEFAULT_DURATION_KEY = "feature.reservation.default_duration_minutes" as const;
export const RESERVATION_DEFAULT_DURATION_FALLBACK = 90; // Default 90 minutes

// Legacy status transition map (for backward compatibility)
export const finalStatuses: Array<"COMPLETED" | "CANCELLED" | "NO_SHOW"> = ["COMPLETED", "CANCELLED", "NO_SHOW"];

// ============================================================================
// TYPE RE-EXPORTS FROM @jurnapod/shared
// ============================================================================

// Re-export ReservationRow from shared for convenience
export type { ReservationRow, ReservationStatusV2Type, ReservationStatusV2Type as ReservationStatusType } from "@jurnapod/shared";
