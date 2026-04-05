// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module - Status Policy
 *
 * Canonical status management for reservations.
 * Maps legacy string statuses to numeric status IDs and vice versa.
 * Provides semantic status sets (active/blocking/terminal).
 */

export const RESERVATION_STATUS = {
  PENDING: 1,
  CONFIRMED: 2,
  CHECKED_IN: 3, // Note: SEATED maps to CHECKED_IN
  COMPLETED: 4,
  CANCELLED: 5,
  NO_SHOW: 6,
} as const;

/**
 * Active statuses (non-terminal reservations that can still change)
 */
export const ACTIVE_STATUS_IDS: ReadonlySet<number> = new Set([1, 2, 3]);

/**
 * Blocking statuses (reservations that hold table capacity)
 */
export const BLOCKING_STATUS_IDS: ReadonlySet<number> = new Set([1, 2, 3]);

/**
 * Terminal statuses (final states - no further transitions)
 */
export const TERMINAL_STATUS_IDS: ReadonlySet<number> = new Set([4, 5, 6]);

/**
 * Map legacy string status to numeric status ID.
 * Hard-fails on unknown legacy status (write path).
 */
export const LEGACY_STATUS_TO_ID: Record<string, number> = {
  'BOOKED': 1,
  'CONFIRMED': 2,
  'ARRIVED': 3,
  'SEATED': 3, // maps to CHECKED_IN
  'COMPLETED': 4,
  'CANCELLED': 5,
  'NO_SHOW': 6,
};

/**
 * Reverse map: numeric status ID to legacy string status
 */
export const ID_TO_LEGACY_STATUS: Record<number, string> = {
  1: 'BOOKED',
  2: 'CONFIRMED',
  3: 'ARRIVED', // CHECKED_IN maps to ARRIVED (v1 legacy)
  4: 'COMPLETED',
  5: 'CANCELLED',
  6: 'NO_SHOW',
};

/**
 * Convert legacy string status to numeric status ID.
 * Returns undefined if the legacy status is null/undefined.
 * Throws on unknown legacy status (write path hard-fails).
 */
export function legacyStatusToStatusId(
  status: string | null | undefined
): number | undefined {
  if (status == null) {
    return undefined;
  }
  const id = LEGACY_STATUS_TO_ID[status];
  if (id === undefined) {
    throw new Error(`Unknown legacy reservation status: ${status}`);
  }
  return id;
}

/**
 * Convert numeric status ID to legacy string status.
 */
export function statusIdToLegacyStatus(statusId: number): string {
  return ID_TO_LEGACY_STATUS[statusId] ?? 'BOOKED';
}

/**
 * Resolve status ID from a row that may have either status_id or status (legacy).
 * Prefer status_id if present, otherwise fall back to legacy status.
 * Returns undefined if neither is present.
 */
export function resolveStatusId(row: {
  status_id?: number | null;
  status?: string | null;
}): number {
  // Prefer numeric status_id
  if (row.status_id != null) {
    return row.status_id;
  }

  // Fall back to legacy status string
  if (row.status != null) {
    const id = LEGACY_STATUS_TO_ID[row.status];
    if (id !== undefined) {
      return id;
    }
    // Unknown legacy status - hard fail on write path
    throw new Error(`Unknown legacy reservation status: ${row.status}`);
  }

  // Neither present - throw
  throw new Error('Reservation row has neither status_id nor status');
}

/**
 * Check if a status ID represents a blocking (non-terminal) reservation.
 */
export function isBlockingStatusId(statusId: number): boolean {
  return BLOCKING_STATUS_IDS.has(statusId);
}

/**
 * Check if a status ID represents a terminal reservation.
 */
export function isTerminalStatusId(statusId: number): boolean {
  return TERMINAL_STATUS_IDS.has(statusId);
}

/**
 * Check if a status ID represents an active (non-terminal) reservation.
 */
export function isActiveStatusId(statusId: number): boolean {
  return ACTIVE_STATUS_IDS.has(statusId);
}
