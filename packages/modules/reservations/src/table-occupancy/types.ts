// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Table Occupancy Module - Error Classes
 */

export class TableOccupancyNotFoundError extends Error {
  constructor(tableId: number) {
    super(`Table occupancy not found for table ${tableId}`);
  }
}

export class TableOccupancyConflictError extends Error {
  constructor(
    message: string,
    public readonly currentState: TableOccupancyState
  ) {
    super(message);
  }
}

export class TableNotAvailableError extends Error {
  constructor(tableId: number, currentStatus: number) {
    super(`Table ${tableId} is not available (status: ${currentStatus})`);
  }
}

export class TableNotFoundError extends Error {
  constructor(tableId: number) {
    super(`Table ${tableId} not found`);
  }
}

export class TableNotOccupiedError extends Error {
  constructor(
    tableId: number,
    public readonly currentStatus: number
  ) {
    super(`Table ${tableId} is not occupied (status: ${currentStatus})`);
  }
}

/**
 * Table occupancy state
 */
export interface TableOccupancyState {
  id: number;
  companyId: number;
  outletId: number;
  tableId: number;
  statusId: number;
  version: number;
  serviceSessionId: number | null;
  reservationId: number | null;
  occupiedAt: Date | null;
  reservedUntil: Date | null;
  guestCount: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

/**
 * Table board item
 */
export interface TableBoardItem {
  tableId: number;
  tableCode: string;
  tableName: string;
  capacity: number | null;
  zone: string | null;
  occupancyStatusId: number;
  availableNow: boolean;
  currentSessionId: number | null;
  currentReservationId: number | null;
  guestCount: number | null;
  version: number;
  nextReservationStartAt: Date | null;
  updatedAt: Date;
}

/**
 * Input for holding a table
 */
export interface HoldTableInput {
  companyId: number;
  outletId: number;
  tableId: number;
  heldUntil: Date;
  reservationId?: number | null;
  notes?: string | null;
  expectedVersion: number;
  createdBy: string;
}

/**
 * Input for seating at a table
 */
export interface SeatTableInput {
  companyId: number;
  outletId: number;
  tableId: number;
  guestCount: number;
  guestName?: string | null;
  reservationId?: number | null;
  notes?: string | null;
  expectedVersion: number;
  createdBy: string;
}

/**
 * Input for releasing a table
 */
export interface ReleaseTableInput {
  companyId: number;
  outletId: number;
  tableId: number;
  notes?: string | null;
  expectedVersion: number;
  updatedBy: string;
}

// Table Occupancy Status constants
export const TableOccupancyStatus = {
  AVAILABLE: 1,
  RESERVED: 2,
  OCCUPIED: 3,
  OUT_OF_SERVICE: 7,
} as const;

// Table Event Type constants
export const TableEventType = {
  RESERVATION_CREATED: 1,
  TABLE_OPENED: 2,
  TABLE_CLOSED: 3,
} as const;
