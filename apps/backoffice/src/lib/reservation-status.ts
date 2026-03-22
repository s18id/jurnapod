// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReservationStatus } from "@jurnapod/shared";

type ReservationStatusMeta = {
  label: string;
  badgeColor: string;
};

export const RESERVATION_STATUS_META: Record<ReservationStatus, ReservationStatusMeta> = {
  BOOKED: { label: "Booked", badgeColor: "blue" },
  CONFIRMED: { label: "Confirmed", badgeColor: "cyan" },
  ARRIVED: { label: "Arrived", badgeColor: "yellow" },
  SEATED: { label: "Seated", badgeColor: "green" },
  COMPLETED: { label: "Completed", badgeColor: "gray" },
  CANCELLED: { label: "Cancelled", badgeColor: "red" },
  NO_SHOW: { label: "No Show", badgeColor: "orange" }
};

export const RESERVATION_STATUS_OPTIONS: Array<{ value: ReservationStatus; label: string }> = (
  Object.entries(RESERVATION_STATUS_META) as Array<[ReservationStatus, ReservationStatusMeta]>
).map(([value, meta]) => ({
  value,
  label: meta.label
}));

export const RESERVATION_STATUS_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  BOOKED: ["CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
  ARRIVED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

export function isReservationFinalStatus(status: ReservationStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED" || status === "NO_SHOW";
}

export function getCheckInTargetStatus(status: ReservationStatus): ReservationStatus | null {
  if (status === "BOOKED" || status === "CONFIRMED") {
    return "ARRIVED";
  }
  if (status === "ARRIVED") {
    return "SEATED";
  }
  return null;
}

export function getReservationStatusLabel(status: ReservationStatus): string {
  return RESERVATION_STATUS_META[status].label;
}
