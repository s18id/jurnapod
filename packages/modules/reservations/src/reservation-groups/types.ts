// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservation Groups Module - Types
 */

import type {
  ReservationGroupDetail,
  TableSuggestion,
} from "@jurnapod/shared";

export type { ReservationGroupDetail, TableSuggestion };

/**
 * Actor performing a mutation, used for audit logging
 */
export interface ReservationGroupActor {
  userId: number;
  ipAddress?: string | null;
}

/**
 * Input for creating a reservation group
 */
export interface CreateReservationGroupInput {
  companyId: number;
  outletId: number;
  customerName: string;
  customerPhone: string | null;
  guestCount: number;
  tableIds: number[];
  reservationAt: string; // ISO 8601 datetime
  durationMinutes: number | null;
  notes: string | null;
  actor: ReservationGroupActor;
}

/**
 * Result of creating a reservation group
 */
export interface CreateReservationGroupResult {
  groupId: number;
  reservationIds: number[];
}

/**
 * Input for checking multi-table availability
 */
export interface CheckMultiTableAvailabilityInput {
  companyId: number;
  outletId: number;
  tableIds: number[];
  startTs: number; // Unix ms
  endTs: number; // Unix ms
  excludeReservationIds?: number[];
}

/**
 * Availability check result
 */
export interface CheckMultiTableAvailabilityResult {
  available: boolean;
  conflicts: Array<{
    tableId: number;
    tableName: string;
    tableCode: string;
    conflictingReservationId: number;
    conflictStart: number;
    conflictEnd: number;
  }>;
  tables: Array<{
    id: number;
    code: string;
    name: string;
    capacity: number;
  }>;
  totalCapacity: number;
}

/**
 * Input for table suggestion query
 */
export interface SuggestTableCombinationsInput {
  companyId: number;
  outletId: number;
  guestCount: number;
  startTs: number; // Unix ms
  endTs: number; // Unix ms
  maxSuggestions?: number;
}

/**
 * Input for getting reservation group details
 */
export interface GetReservationGroupInput {
  companyId: number;
  groupId: number;
}

/**
 * Input for deleting a reservation group
 */
export interface DeleteReservationGroupInput {
  companyId: number;
  groupId: number;
  actor: ReservationGroupActor;
};

/**
 * Result of deleting a reservation group
 */
export interface DeleteReservationGroupResult {
  deleted: boolean;
  ungroupedCount: number;
}

/**
 * Input for updating a reservation group
 */
export interface UpdateReservationGroupInput {
  companyId: number;
  outletId: number;
  groupId: number;
  updates: {
    customerName?: string;
    customerPhone?: string | null;
    guestCount?: number;
    reservationAt?: string; // ISO 8601 datetime
    durationMinutes?: number;
    notes?: string | null;
    tableIds?: number[]; // If provided, replaces current tables
  };
  actor: ReservationGroupActor;
}

/**
 * Result of updating a reservation group
 */
export interface UpdateReservationGroupResult {
  groupId: number;
  reservationIds: number[];
  updatedTables: number[];
  removedTables: number[];
}
