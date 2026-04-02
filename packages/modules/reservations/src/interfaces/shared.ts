// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Shared types for reservations module.
 */

/**
 * Actor performing a mutation, used for audit logging.
 */
export type MutationAuditActor = {
  userId: number;
  canManageCompanyDefaults?: boolean;
};

/**
 * Reservation status enumeration
 */
export enum ReservationStatus {
  PENDING = 1,
  CONFIRMED = 2,
  CHECKED_IN = 3,
  COMPLETED = 4,
  CANCELLED = 5,
  NO_SHOW = 6,
}

/**
 * Valid status transitions
 */
export const VALID_STATUS_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  [ReservationStatus.PENDING]: [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
  [ReservationStatus.CONFIRMED]: [ReservationStatus.CHECKED_IN, ReservationStatus.NO_SHOW, ReservationStatus.CANCELLED],
  [ReservationStatus.CHECKED_IN]: [ReservationStatus.COMPLETED],
  [ReservationStatus.NO_SHOW]: [],
  [ReservationStatus.CANCELLED]: [],
  [ReservationStatus.COMPLETED]: [],
};

/**
 * Final (terminal) statuses that cannot transition to other statuses
 */
export const FINAL_STATUSES: ReservationStatus[] = [
  ReservationStatus.COMPLETED,
  ReservationStatus.CANCELLED,
  ReservationStatus.NO_SHOW,
];

/**
 * Check if a status is a final (terminal) status
 */
export function isFinalStatus(status: ReservationStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

/**
 * Check if a status transition is valid
 */
export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
