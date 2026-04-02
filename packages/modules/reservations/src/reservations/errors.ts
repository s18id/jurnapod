// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module - Error Classes
 *
 * Error classes for reservation operations.
 */

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
