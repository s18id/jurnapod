// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservation Service Interface
 *
 * Defines the contract for reservation management operations.
 */

import type { UnixMs } from "../time/timestamp.js";
import type { MutationAuditActor, ReservationStatus } from "./shared.js";

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

/**
 * Reservation Service Interface
 *
 * This interface defines the contract for reservation management operations.
 * Implementations should handle:
 * - Reservation CRUD operations
 * - Overlap checking
 * - Status transitions
 * - Timezone resolution
 */
export interface IReservationService {
  /**
   * Create a new reservation
   */
  create(input: CreateReservationInput): Promise<ReservationRecord>;

  /**
   * Get a reservation by ID
   */
  getById(companyId: number, reservationId: number): Promise<ReservationRecord | null>;

  /**
   * List reservations with filtering
   */
  list(params: ListReservationsParams): Promise<ReservationRecord[]>;

  /**
   * Update a reservation
   */
  update(
    companyId: number,
    reservationId: number,
    input: UpdateReservationInput
  ): Promise<ReservationRecord>;

  /**
   * Update reservation status
   */
  updateStatus(
    companyId: number,
    reservationId: number,
    input: UpdateReservationStatusInput
  ): Promise<ReservationRecord>;

  /**
   * Check if a time range overlaps with existing reservations
   */
  checkOverlap(
    companyId: number,
    outletId: number,
    tableId: number | null,
    reservationStartTs: UnixMs,
    durationMinutes: number,
    excludeReservationId?: number
  ): Promise<OverlapCheckResult>;

  /**
   * Cancel a reservation
   */
  cancel(
    companyId: number,
    reservationId: number,
    cancellationReason: string,
    actor: MutationAuditActor
  ): Promise<ReservationRecord>;

  /**
   * Mark a reservation as no-show
   */
  markNoShow(
    companyId: number,
    reservationId: number,
    actor: MutationAuditActor
  ): Promise<ReservationRecord>;

  /**
   * Check in a reservation (mark as arrived)
   */
  checkIn(
    companyId: number,
    reservationId: number,
    actor: MutationAuditActor
  ): Promise<ReservationRecord>;

  /**
   * Complete a reservation (mark as finished)
   */
  complete(
    companyId: number,
    reservationId: number,
    actor: MutationAuditActor
  ): Promise<ReservationRecord>;
}
