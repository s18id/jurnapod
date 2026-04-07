// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @deprecated Use @jurnapod/modules-reservations reservation-groups service directly.
 * This wrapper is kept for one release cycle for API compatibility.
 * All logic has been moved to @jurnapod/modules-reservations/src/reservation-groups/service.ts
 */

import { getDb } from "./db";
import type {
  ReservationGroupDetail,
  TableSuggestion
} from "@jurnapod/shared";
import {
  createReservationGroupWithTables as pkgCreateReservationGroupWithTables,
  checkMultiTableAvailability as pkgCheckMultiTableAvailability,
  suggestTableCombinations as pkgSuggestTableCombinations,
  getReservationGroup as pkgGetReservationGroup,
  updateReservationGroup as pkgUpdateReservationGroup,
  deleteReservationGroupSafe as pkgDeleteReservationGroupSafe,
} from "@jurnapod/modules-reservations";

/**
 * @deprecated Use @jurnapod/modules-reservations reservation-groups service directly.
 * Kept for one release cycle for compatibility.
 */
export async function createReservationGroupWithTables(input: {
  companyId: number;
  outletId: number;
  customerName: string;
  customerPhone: string | null;
  guestCount: number;
  tableIds: number[];
  reservationAt: string;
  durationMinutes: number | null;
  notes: string | null;
  actor: { userId: number; ipAddress?: string | null };
}): Promise<{ groupId: number; reservationIds: number[] }> {
  const db = getDb();
  return pkgCreateReservationGroupWithTables(db, input);
}

/**
 * @deprecated Use @jurnapod/modules-reservations.OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function checkMultiTableAvailability(input: {
  companyId: number;
  outletId: number;
  tableIds: number[];
  startTs: number;
  endTs: number;
  excludeReservationIds?: number[];
}): Promise<{
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
}> {
  const db = getDb();
  return pkgCheckMultiTableAvailability(db, input);
}

/**
 * @deprecated Use @jurnapod/modules-reservations.OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function suggestTableCombinations(input: {
  companyId: number;
  outletId: number;
  guestCount: number;
  startTs: number;
  endTs: number;
  maxSuggestions?: number;
}): Promise<TableSuggestion[]> {
  const db = getDb();
  return pkgSuggestTableCombinations(db, input);
}

/**
 * @deprecated Use @jurnapod/modules-reservations.OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function getReservationGroup(input: {
  companyId: number;
  groupId: number;
}): Promise<ReservationGroupDetail | null> {
  const db = getDb();
  return pkgGetReservationGroup(db, input);
}

/**
 * @deprecated Use @jurnapod/modules-reservations.OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function deleteReservationGroupSafe(input: {
  companyId: number;
  groupId: number;
  actor: { userId: number; ipAddress?: string | null };
}): Promise<{ deleted: boolean; ungroupedCount: number }> {
  const db = getDb();
  return pkgDeleteReservationGroupSafe(db, input);
}

/**
 * @deprecated Use @jurnapod/modules-reservations.OutletTableService instead.
 * Kept for one release cycle for compatibility.
 */
export async function updateReservationGroup(input: {
  companyId: number;
  outletId: number;
  groupId: number;
  updates: {
    customerName?: string;
    customerPhone?: string | null;
    guestCount?: number;
    reservationAt?: string;
    durationMinutes?: number;
    notes?: string | null;
    tableIds?: number[];
  };
  actor: { userId: number; ipAddress?: string | null };
}): Promise<{
  groupId: number;
  reservationIds: number[];
  updatedTables: number[];
  removedTables: number[];
}> {
  const db = getDb();
  return pkgUpdateReservationGroup(db, input);
}
