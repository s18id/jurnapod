// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo } from "react";
import type { ReservationListQuery, ReservationRow, ReservationStatus } from "@jurnapod/shared";
import { isReservationFinalStatus as isReservationFinalStatusShared } from "../lib/reservation-status";
import { useReservations } from "./use-reservations";

export type ReservationCalendarViewMode = "day" | "week";

export const DEFAULT_RESERVATION_DURATION_MINUTES = 120;

export function normalizeReservationDurationMinutes(input?: number | null): number {
  const value = Math.round(Number(input ?? DEFAULT_RESERVATION_DURATION_MINUTES));
  if (!Number.isFinite(value)) {
    return DEFAULT_RESERVATION_DURATION_MINUTES;
  }
  return Math.min(480, Math.max(15, value));
}

export type ReservationCalendarDay = {
  key: string;
  startAt: Date;
  endAt: Date;
  label: string;
};

type TimeZoneDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  return {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw)
  };
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const parts = parseDateKey(dateKey);
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayIndexInTimeZone(date: Date, timeZone?: string | null): number {
  const zone = normalizeTimeZone(timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return map[weekday] ?? 0;
}

function dateKeyToDisplayDate(dateKey: string): Date {
  const parts = parseDateKey(dateKey);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
}

function normalizeTimeZone(timeZone?: string | null): string {
  return timeZone && timeZone.trim() ? timeZone : "UTC";
}

function getDatePartsInTimeZone(date: Date, timeZone?: string | null): TimeZoneDateParts {
  const zone = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute")
  };
}

export function toDateKeyInTimeZone(date: Date, timeZone?: string | null): string {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.year}-${`${parts.month}`.padStart(2, "0")}-${`${parts.day}`.padStart(2, "0")}`;
}

export function minuteOfDayInTimeZone(date: Date, timeZone?: string | null): number {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

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
  timeZone?: string | null;
  status?: ReservationStatus | null;
}): Partial<ReservationListQuery> | null {
  if (!input.outletId) {
    return null;
  }

  const days = createCalendarDaysInTimeZone(input.anchorDate, input.viewMode, input.timeZone);
  const dateFrom = days[0]?.key;
  const dateTo = days[days.length - 1]?.key;

  return {
    outlet_id: input.outletId,
    date_from: dateFrom,
    date_to: dateTo,
    status: input.status ?? undefined,
    limit: 200,
    offset: 0
  };
}

export function createCalendarDays(anchorDate: Date, viewMode: ReservationCalendarViewMode): ReservationCalendarDay[] {
  return createCalendarDaysInTimeZone(anchorDate, viewMode, null);
}

export function createCalendarDaysInTimeZone(
  anchorDate: Date,
  viewMode: ReservationCalendarViewMode,
  timeZone?: string | null
): ReservationCalendarDay[] {
  const zone = normalizeTimeZone(timeZone);
  const anchorKey = toDateKeyInTimeZone(anchorDate, zone);
  const weekday = weekdayIndexInTimeZone(anchorDate, zone);
  const weekOffset = weekday === 0 ? -6 : 1 - weekday;
  const startKey = viewMode === "week" ? addDaysToDateKey(anchorKey, weekOffset) : anchorKey;
  const dayCount = viewMode === "week" ? 7 : 1;
  return Array.from({ length: dayCount }, (_, index) => {
    const dayKey = addDaysToDateKey(startKey, index);
    const displayDate = dateKeyToDisplayDate(dayKey);
    const localDate = new Date(`${dayKey}T00:00:00`);
    return {
      key: dayKey,
      startAt: startOfDay(localDate),
      endAt: endOfDay(localDate),
      label: displayDate.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", timeZone: zone })
    };
  });
}

export function groupReservationsByDay(
  days: ReservationCalendarDay[],
  reservations: ReservationRow[],
  timeZone?: string | null
): Record<string, ReservationRow[]> {
  const grouped: Record<string, ReservationRow[]> = Object.fromEntries(days.map((day) => [day.key, [] as ReservationRow[]]));
  for (const reservation of reservations) {
    const key = toDateKeyInTimeZone(new Date(reservation.reservation_at), timeZone);
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
  return isReservationFinalStatusShared(status);
}

export function getReservationEndAt(row: ReservationRow, defaultDurationMinutes?: number | null): Date {
  const startAt = new Date(row.reservation_at);
  const duration = getReservationDurationMinutes(row, defaultDurationMinutes);
  return new Date(startAt.getTime() + duration * 60 * 1000);
}

export function getReservationDurationMinutes(
  row: Pick<ReservationRow, "duration_minutes">,
  defaultDurationMinutes?: number | null
): number {
  const fallback = normalizeReservationDurationMinutes(defaultDurationMinutes);
  return normalizeReservationDurationMinutes(row.duration_minutes ?? fallback);
}

export function isOverlappingReservation(
  a: ReservationRow,
  b: ReservationRow,
  defaultDurationMinutes?: number | null
): boolean {
  if (!a.table_id || !b.table_id || a.table_id !== b.table_id) {
    return false;
  }
  if (isReservationFinalStatus(a.status) || isReservationFinalStatus(b.status)) {
    return false;
  }

  const aStart = new Date(a.reservation_at).getTime();
  const aEnd = getReservationEndAt(a, defaultDurationMinutes).getTime();
  const bStart = new Date(b.reservation_at).getTime();
  const bEnd = getReservationEndAt(b, defaultDurationMinutes).getTime();
  return aStart < bEnd && bStart < aEnd;
}

export function getOverlappingReservationIds(
  reservations: ReservationRow[],
  defaultDurationMinutes?: number | null
): Set<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < reservations.length; i += 1) {
    for (let j = i + 1; j < reservations.length; j += 1) {
      if (isOverlappingReservation(reservations[i]!, reservations[j]!, defaultDurationMinutes)) {
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

export type ReservationTimelineBlock = {
  reservationId: number;
  tableId: number;
  customerName: string;
  status: ReservationStatus;
  startAt: Date;
  endAt: Date;
  startMinute: number;
  endMinute: number;
  row: ReservationRow;
};

function clampToDayMinutes(value: number): number {
  return Math.min(24 * 60, Math.max(0, value));
}

export function buildReservationTimelineByDay(
  days: ReservationCalendarDay[],
  reservations: ReservationRow[],
  timeZone?: string | null,
  defaultDurationMinutes?: number | null
): Record<string, Record<number, ReservationTimelineBlock[]>> {
  const zone = normalizeTimeZone(timeZone);
  const timeline: Record<string, Record<number, ReservationTimelineBlock[]>> = Object.fromEntries(
    days.map((day) => [day.key, {} as Record<number, ReservationTimelineBlock[]>])
  );

  const dayIndexes = Object.fromEntries(days.map((day, index) => [day.key, index])) as Record<string, number>;

  for (const reservation of reservations) {
    if (!reservation.table_id) {
      continue;
    }

    const reservationStart = new Date(reservation.reservation_at);
    const reservationEnd = getReservationEndAt(reservation, defaultDurationMinutes);

    const startKey = toDateKeyInTimeZone(reservationStart, zone);
    const endKey = toDateKeyInTimeZone(new Date(reservationEnd.getTime() - 1), zone);
    const startDayIndex = dayIndexes[startKey];
    const endDayIndex = dayIndexes[endKey];

    if (startDayIndex === undefined && endDayIndex === undefined) {
      continue;
    }

    for (let index = 0; index < days.length; index += 1) {
      const day = days[index]!;
      if (startDayIndex !== undefined && index < startDayIndex) {
        continue;
      }
      if (endDayIndex !== undefined && index > endDayIndex) {
        continue;
      }

      const startMinute =
        startDayIndex !== undefined && index === startDayIndex
          ? clampToDayMinutes(minuteOfDayInTimeZone(reservationStart, zone))
          : 0;
      const endMinute =
        endDayIndex !== undefined && index === endDayIndex
          ? clampToDayMinutes(minuteOfDayInTimeZone(reservationEnd, zone))
          : 24 * 60;

      if (startMinute >= endMinute) {
        continue;
      }

      if (!timeline[day.key]![reservation.table_id]) {
        timeline[day.key]![reservation.table_id] = [];
      }

      timeline[day.key]![reservation.table_id]!.push({
        reservationId: reservation.reservation_id,
        tableId: reservation.table_id,
        customerName: reservation.customer_name,
        status: reservation.status,
        startAt: reservationStart,
        endAt: reservationEnd,
        startMinute,
        endMinute,
        row: reservation
      });
    }
  }

  for (const dayKey of Object.keys(timeline)) {
    const tableMap = timeline[dayKey]!;
    for (const tableIdRaw of Object.keys(tableMap)) {
      const tableId = Number(tableIdRaw);
      tableMap[tableId]!.sort((a, b) => a.startMinute - b.startMinute || a.reservationId - b.reservationId);
    }
  }

  return timeline;
}

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

export function mapReservationsToCalendarDays(input: {
  viewMode: ReservationCalendarViewMode;
  days: ReservationCalendarDay[];
  reservations: ReservationRow[];
  timeZone?: string | null;
}): Record<string, ReservationRow[]> {
  if (input.viewMode === "day") {
    const dayKey = input.days[0]?.key;
    if (!dayKey) {
      return {};
    }

    const sorted = [...input.reservations].sort(
      (a, b) => new Date(a.reservation_at).getTime() - new Date(b.reservation_at).getTime()
    );
    return {
      [dayKey]: sorted
    };
  }

  return groupReservationsByDay(input.days, input.reservations, input.timeZone);
}

export function useReservationCalendar(input: {
  outletId: number | null;
  anchorDate: Date;
  viewMode: ReservationCalendarViewMode;
  timeZone?: string | null;
  defaultDurationMinutes?: number | null;
  status?: ReservationStatus | null;
  accessToken: string;
}) {
  const query = useMemo(
    () =>
      buildReservationCalendarQuery({
        outletId: input.outletId,
        viewMode: input.viewMode,
        anchorDate: input.anchorDate,
        timeZone: input.timeZone,
        status: input.status
      }),
    [input.outletId, input.viewMode, input.anchorDate, input.timeZone, input.status]
  );

  const reservations = useReservations(query, input.accessToken);

  const days = useMemo(
    () => createCalendarDaysInTimeZone(input.anchorDate, input.viewMode, input.timeZone),
    [input.anchorDate, input.viewMode, input.timeZone]
  );

  const reservationsByDay = useMemo(
    () =>
      mapReservationsToCalendarDays({
        viewMode: input.viewMode,
        days,
        reservations: reservations.data,
        timeZone: input.timeZone
      }),
    [input.viewMode, days, reservations.data, input.timeZone]
  );

  const overlappingReservationIds = useMemo(
    () => getOverlappingReservationIds(reservations.data, input.defaultDurationMinutes),
    [reservations.data, input.defaultDurationMinutes]
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
