// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo } from "react";
import type { ReservationListQuery, ReservationRow, ReservationStatus } from "@jurnapod/shared";
import { useReservations } from "./use-reservations";

export type ReservationCalendarViewMode = "day" | "week";

export type ReservationCalendarDay = {
  key: string;
  startAt: Date;
  endAt: Date;
  label: string;
};

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeekStart(date: Date): Date {
  const normalized = startOfDay(date);
  const day = normalized.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(normalized, offset);
}

export function buildReservationCalendarQuery(input: {
  outletId: number | null;
  viewMode: ReservationCalendarViewMode;
  anchorDate: Date;
  status?: ReservationStatus | null;
}): Partial<ReservationListQuery> | null {
  if (!input.outletId) {
    return null;
  }

  const anchor = startOfDay(input.anchorDate);
  const fromDate = input.viewMode === "week" ? getWeekStart(anchor) : anchor;
  const toDate = input.viewMode === "week" ? endOfDay(addDays(fromDate, 6)) : endOfDay(anchor);

  return {
    outlet_id: input.outletId,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    status: input.status ?? undefined,
    limit: 200,
    offset: 0
  };
}

export function createCalendarDays(anchorDate: Date, viewMode: ReservationCalendarViewMode): ReservationCalendarDay[] {
  const start = viewMode === "week" ? getWeekStart(anchorDate) : startOfDay(anchorDate);
  const dayCount = viewMode === "week" ? 7 : 1;
  return Array.from({ length: dayCount }, (_, index) => {
    const current = addDays(start, index);
    return {
      key: toLocalDateKey(current),
      startAt: startOfDay(current),
      endAt: endOfDay(current),
      label: current.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })
    };
  });
}

export function groupReservationsByDay(days: ReservationCalendarDay[], reservations: ReservationRow[]): Record<string, ReservationRow[]> {
  const grouped: Record<string, ReservationRow[]> = Object.fromEntries(days.map((day) => [day.key, [] as ReservationRow[]]));
  for (const reservation of reservations) {
    const key = toLocalDateKey(new Date(reservation.reservation_at));
    if (grouped[key]) {
      grouped[key].push(reservation);
    }
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => new Date(a.reservation_at).getTime() - new Date(b.reservation_at).getTime());
  }

  return grouped;
}

export function isReservationFinalStatus(status: ReservationStatus): boolean {
  return status === "CANCELLED" || status === "NO_SHOW" || status === "COMPLETED";
}

export function getReservationEndAt(row: ReservationRow): Date {
  const startAt = new Date(row.reservation_at);
  const duration = row.duration_minutes ?? 120;
  return new Date(startAt.getTime() + duration * 60 * 1000);
}

export function isOverlappingReservation(a: ReservationRow, b: ReservationRow): boolean {
  if (!a.table_id || !b.table_id || a.table_id !== b.table_id) {
    return false;
  }
  if (isReservationFinalStatus(a.status) || isReservationFinalStatus(b.status)) {
    return false;
  }

  const aStart = new Date(a.reservation_at).getTime();
  const aEnd = getReservationEndAt(a).getTime();
  const bStart = new Date(b.reservation_at).getTime();
  const bEnd = getReservationEndAt(b).getTime();
  return aStart < bEnd && bStart < aEnd;
}

export function getOverlappingReservationIds(reservations: ReservationRow[]): Set<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < reservations.length; i += 1) {
    for (let j = i + 1; j < reservations.length; j += 1) {
      if (isOverlappingReservation(reservations[i]!, reservations[j]!)) {
        overlapping.add(reservations[i]!.reservation_id);
        overlapping.add(reservations[j]!.reservation_id);
      }
    }
  }
  return overlapping;
}

export type DailyUtilization = {
  dayKey: string;
  bookedTables: number;
  availableTables: number;
};

export function buildDailyUtilization(days: ReservationCalendarDay[], reservationsByDay: Record<string, ReservationRow[]>, availableTables: number): DailyUtilization[] {
  return days.map((day) => {
    const rows = reservationsByDay[day.key] ?? [];
    const bookedTables = new Set(
      rows
        .filter((row) => !isReservationFinalStatus(row.status) && row.table_id)
        .map((row) => row.table_id as number)
    ).size;

    return {
      dayKey: day.key,
      bookedTables,
      availableTables
    };
  });
}

export function useReservationCalendar(input: {
  outletId: number | null;
  anchorDate: Date;
  viewMode: ReservationCalendarViewMode;
  status?: ReservationStatus | null;
  accessToken: string;
}) {
  const query = useMemo(
    () =>
      buildReservationCalendarQuery({
        outletId: input.outletId,
        viewMode: input.viewMode,
        anchorDate: input.anchorDate,
        status: input.status
      }),
    [input.outletId, input.viewMode, input.anchorDate, input.status]
  );

  const reservations = useReservations(query, input.accessToken);

  const days = useMemo(
    () => createCalendarDays(input.anchorDate, input.viewMode),
    [input.anchorDate, input.viewMode]
  );

  const reservationsByDay = useMemo(
    () => groupReservationsByDay(days, reservations.data),
    [days, reservations.data]
  );

  const overlappingReservationIds = useMemo(
    () => getOverlappingReservationIds(reservations.data),
    [reservations.data]
  );

  return {
    query,
    days,
    reservations: reservations.data,
    reservationsByDay,
    overlappingReservationIds,
    loading: reservations.loading,
    error: reservations.error,
    refetch: reservations.refetch
  };
}
