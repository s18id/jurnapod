// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module - Types
 *
 * Type definitions for reservation management.
 */

import type { UnixMs } from "../time/timestamp.js";
import type { MutationAuditActor, ReservationStatus } from "../interfaces/shared.js";

/**
 * Input for creating a reservation
 */
export interface CreateReservationInput {
  companyId: number;
  outletId: number;
  tableId?: number;
  partySize: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  reservationStartTs: UnixMs;
  durationMinutes: number;
  notes?: string;
  createdBy: MutationAuditActor;
}

/**
 * Input for updating a reservation
 */
export interface UpdateReservationInput {
  tableId?: number;
  partySize?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  reservationStartTs?: UnixMs;
  durationMinutes?: number;
  notes?: string;
  updatedBy: MutationAuditActor;
}

/**
 * Input for updating reservation status
 */
export interface UpdateReservationStatusInput {
  status: ReservationStatus;
  tableId?: number;
  cancellationReason?: string;
  notes?: string;
  updatedBy: MutationAuditActor;
}

/**
 * Query parameters for listing reservations
 */
export interface ListReservationsParams {
  companyId: number;
  outletId: number;
  limit: number;
  offset: number;
  status?: ReservationStatus;
  tableId?: number;
  customerName?: string;
  fromDate?: UnixMs;
  toDate?: UnixMs;
  useOverlapFilter?: boolean;
}

/**
 * Reservation record returned by the service
 */
export interface ReservationRecord {
  id: number;
  companyId: number;
  outletId: number;
  tableId: number | null;
  reservationCode: string;
  status: ReservationStatus;
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
}

/**
 * Result of an overlap check
 */
export interface OverlapCheckResult {
  hasOverlap: boolean;
  conflictingReservationIds: number[];
}

// Database row types (internal)
export interface ReservationDbRow {
  id: number;
  company_id: number;
  outlet_id: number;
  table_id: number | null;
  reservation_code: string | null;
  status_id: number | null;
  status: string | null;
  guest_count: number;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  reservation_at: string | null;
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

export interface OccupancySnapshotRow {
  status_id: number;
  version: number;
  reservation_id: number | string | null;
}

// Constants
export const RESERVATION_DEFAULT_DURATION_KEY = "feature.reservation.default_duration_minutes" as const;
export const RESERVATION_DEFAULT_DURATION_FALLBACK = 90; // Default 90 minutes
export const MAX_CODE_GENERATION_RETRIES = 3;
