/**
 * Table State Constants
 * 
 * Shared constants for table management, reservations, and POS sync.
 * All status and type columns use these integer constants instead of DB ENUMs.
 * 
 * This ensures consistency across:
 * - Database migrations (0096+)
 * - API contracts (Zod schemas)
 * - Frontend state management
 * - POS offline-first sync
 */

// ============================================================================
// TABLE OCCUPANCY STATUS (table_occupancy.status_id)
// Represents the current physical state of a table
// ============================================================================
export const TableOccupancyStatus = {
  AVAILABLE: 1,
  OCCUPIED: 2,
  RESERVED: 3,
  CLEANING: 4,
  OUT_OF_SERVICE: 5,
} as const;

export type TableOccupancyStatusType = typeof TableOccupancyStatus[keyof typeof TableOccupancyStatus];

export const TableOccupancyStatusLabels: Record<TableOccupancyStatusType, string> = {
  [TableOccupancyStatus.AVAILABLE]: 'Available',
  [TableOccupancyStatus.OCCUPIED]: 'Occupied',
  [TableOccupancyStatus.RESERVED]: 'Reserved',
  [TableOccupancyStatus.CLEANING]: 'Cleaning',
  [TableOccupancyStatus.OUT_OF_SERVICE]: 'Out of Service',
};

// ============================================================================
// SERVICE SESSION STATUS (table_service_sessions.status_id)
// Represents the commercial lifecycle of a dine-in session
// ============================================================================
export const ServiceSessionStatus = {
  ACTIVE: 1,
  COMPLETED: 2,
  CANCELLED: 3,
} as const;

export type ServiceSessionStatusType = typeof ServiceSessionStatus[keyof typeof ServiceSessionStatus];

export const ServiceSessionStatusLabels: Record<ServiceSessionStatusType, string> = {
  [ServiceSessionStatus.ACTIVE]: 'Active',
  [ServiceSessionStatus.COMPLETED]: 'Completed',
  [ServiceSessionStatus.CANCELLED]: 'Cancelled',
};

// ============================================================================
// TABLE EVENT TYPES (table_events.event_type_id)
// Classification of events in the append-only event log
// ============================================================================
export const TableEventType = {
  TABLE_OPENED: 1,
  TABLE_CLOSED: 2,
  RESERVATION_CREATED: 3,
  RESERVATION_CONFIRMED: 4,
  RESERVATION_CANCELLED: 5,
  STATUS_CHANGED: 6,
  GUEST_COUNT_CHANGED: 7,
  TABLE_TRANSFERRED: 8,
} as const;

export type TableEventTypeType = typeof TableEventType[keyof typeof TableEventType];

export const TableEventTypeLabels: Record<TableEventTypeType, string> = {
  [TableEventType.TABLE_OPENED]: 'Table Opened',
  [TableEventType.TABLE_CLOSED]: 'Table Closed',
  [TableEventType.RESERVATION_CREATED]: 'Reservation Created',
  [TableEventType.RESERVATION_CONFIRMED]: 'Reservation Confirmed',
  [TableEventType.RESERVATION_CANCELLED]: 'Reservation Cancelled',
  [TableEventType.STATUS_CHANGED]: 'Status Changed',
  [TableEventType.GUEST_COUNT_CHANGED]: 'Guest Count Changed',
  [TableEventType.TABLE_TRANSFERRED]: 'Table Transferred',
};

// ============================================================================
// RESERVATION STATUS (legacy migrations, for reference)
// Note: 0096 migration adds status_id alongside existing VARCHAR status
// ============================================================================
export const ReservationStatusId = {
  BOOKED: 1,
  CONFIRMED: 2,
  ARRIVED: 3,
  SEATED: 4,
  CANCELLED: 5,
  COMPLETED: 6,
  NO_SHOW: 7,
} as const;

export type ReservationStatusIdType = typeof ReservationStatusId[keyof typeof ReservationStatusId];

export const ReservationStatusIdLabels: Record<ReservationStatusIdType, string> = {
  [ReservationStatusId.BOOKED]: 'Booked',
  [ReservationStatusId.CONFIRMED]: 'Confirmed',
  [ReservationStatusId.ARRIVED]: 'Arrived',
  [ReservationStatusId.SEATED]: 'Seated',
  [ReservationStatusId.CANCELLED]: 'Cancelled',
  [ReservationStatusId.COMPLETED]: 'Completed',
  [ReservationStatusId.NO_SHOW]: 'No Show',
};

// ============================================================================
// OUTLET TABLE STATUS (legacy migrations, for reference)
// Note: 0096 migration adds status_id alongside existing VARCHAR status
// ============================================================================
export const OutletTableStatusId = {
  AVAILABLE: 1,
  RESERVED: 2,
  OCCUPIED: 5,
  UNAVAILABLE: 7,
} as const;

export type OutletTableStatusIdType = typeof OutletTableStatusId[keyof typeof OutletTableStatusId];

export const OutletTableStatusIdLabels: Record<OutletTableStatusIdType, string> = {
  [OutletTableStatusId.AVAILABLE]: 'Available',
  [OutletTableStatusId.RESERVED]: 'Reserved',
  [OutletTableStatusId.OCCUPIED]: 'Occupied',
  [OutletTableStatusId.UNAVAILABLE]: 'Unavailable',
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export function isValidTableOccupancyStatus(status: number): status is TableOccupancyStatusType {
  return Object.values(TableOccupancyStatus).includes(status as TableOccupancyStatusType);
}

export function isValidServiceSessionStatus(status: number): status is ServiceSessionStatusType {
  return Object.values(ServiceSessionStatus).includes(status as ServiceSessionStatusType);
}

export function isValidTableEventType(eventType: number): eventType is TableEventTypeType {
  return Object.values(TableEventType).includes(eventType as TableEventTypeType);
}

export function isValidReservationStatusId(status: number): status is ReservationStatusIdType {
  return Object.values(ReservationStatusId).includes(status as ReservationStatusIdType);
}

export function isValidOutletTableStatusId(status: number): status is OutletTableStatusIdType {
  return Object.values(OutletTableStatusId).includes(status as OutletTableStatusIdType);
}

export function getStatusLabel<T extends number>(
  status: T,
  labels: Record<T, string>
): string {
  return labels[status] ?? 'Unknown';
}
