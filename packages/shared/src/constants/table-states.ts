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
// Story 12.5: ACTIVE -> LOCKED_FOR_PAYMENT -> CLOSED
// ============================================================================
export const ServiceSessionStatus = {
  ACTIVE: 1,
  LOCKED_FOR_PAYMENT: 2,
  CLOSED: 3,
} as const;

export type ServiceSessionStatusType = typeof ServiceSessionStatus[keyof typeof ServiceSessionStatus];

export const ServiceSessionStatusLabels: Record<ServiceSessionStatusType, string> = {
  [ServiceSessionStatus.ACTIVE]: 'Active',
  [ServiceSessionStatus.LOCKED_FOR_PAYMENT]: 'Locked for Payment',
  [ServiceSessionStatus.CLOSED]: 'Closed',
};

// ============================================================================
// SERVICE SESSION LINE STATE (table_service_session_lines.line_state)
// Finalize checkpoint lifecycle for line-level mutations
// ============================================================================
export const ServiceSessionLineState = {
  OPEN: 1,
  FINALIZED: 2,
  VOIDED: 3,
} as const;

export type ServiceSessionLineStateType = typeof ServiceSessionLineState[keyof typeof ServiceSessionLineState];

export const ServiceSessionLineStateLabels: Record<ServiceSessionLineStateType, string> = {
  [ServiceSessionLineState.OPEN]: 'Open',
  [ServiceSessionLineState.FINALIZED]: 'Finalized',
  [ServiceSessionLineState.VOIDED]: 'Voided',
};

// ============================================================================
// TABLE EVENT TYPES (table_events.event_type_id)
// Classification of events in the append-only event log
// Story 12.5: Added session management event types (9-16)
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
  // Story 12.5: Service Session Management Events
  SESSION_LINE_ADDED: 9,
  SESSION_LINE_UPDATED: 10,
  SESSION_LINE_REMOVED: 11,
  SESSION_LOCKED: 12,
  SESSION_CLOSED: 13,
  SESSION_BATCH_FINALIZED: 14,
  SESSION_LINE_ADJUSTED: 15,
  SESSION_VERSION_BUMPED: 16,
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
  // Story 12.5: Service Session Management Event Labels
  [TableEventType.SESSION_LINE_ADDED]: 'Session Line Added',
  [TableEventType.SESSION_LINE_UPDATED]: 'Session Line Updated',
  [TableEventType.SESSION_LINE_REMOVED]: 'Session Line Removed',
  [TableEventType.SESSION_LOCKED]: 'Session Locked',
  [TableEventType.SESSION_CLOSED]: 'Session Closed',
  [TableEventType.SESSION_BATCH_FINALIZED]: 'Session Batch Finalized',
  [TableEventType.SESSION_LINE_ADJUSTED]: 'Session Line Adjusted',
  [TableEventType.SESSION_VERSION_BUMPED]: 'Session Version Bumped',
};

// ============================================================================
// RESERVATION STATUS (Story 12.4 - Reservation Management API)
// Used by POST /reservations, PATCH /reservations/:id, and GET /reservations
// ============================================================================
export const ReservationStatusV2 = {
  PENDING: 1,
  CONFIRMED: 2,
  CHECKED_IN: 3,
  NO_SHOW: 4,
  CANCELLED: 5,
  COMPLETED: 6,
} as const;

export type ReservationStatusV2Type = typeof ReservationStatusV2[keyof typeof ReservationStatusV2];

export const ReservationStatusV2Labels: Record<ReservationStatusV2Type, string> = {
  [ReservationStatusV2.PENDING]: 'Pending',
  [ReservationStatusV2.CONFIRMED]: 'Confirmed',
  [ReservationStatusV2.CHECKED_IN]: 'Checked In',
  [ReservationStatusV2.NO_SHOW]: 'No Show',
  [ReservationStatusV2.CANCELLED]: 'Cancelled',
  [ReservationStatusV2.COMPLETED]: 'Completed',
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

export type OutletTableStatusText = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'UNAVAILABLE';

const OUTLET_TABLE_STATUS_TO_ID: Record<OutletTableStatusText, OutletTableStatusIdType> = {
  AVAILABLE: OutletTableStatusId.AVAILABLE,
  RESERVED: OutletTableStatusId.RESERVED,
  OCCUPIED: OutletTableStatusId.OCCUPIED,
  UNAVAILABLE: OutletTableStatusId.UNAVAILABLE,
};

export function outletTableStatusToId(status: OutletTableStatusText): OutletTableStatusIdType {
  return OUTLET_TABLE_STATUS_TO_ID[status];
}

export function outletTableStatusFromId(statusId: OutletTableStatusIdType): OutletTableStatusText {
  switch (statusId) {
    case OutletTableStatusId.AVAILABLE:
      return 'AVAILABLE';
    case OutletTableStatusId.RESERVED:
      return 'RESERVED';
    case OutletTableStatusId.OCCUPIED:
      return 'OCCUPIED';
    case OutletTableStatusId.UNAVAILABLE:
      return 'UNAVAILABLE';
    default:
      return 'AVAILABLE';
  }
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export function isValidTableOccupancyStatus(status: number): status is TableOccupancyStatusType {
  return Object.values(TableOccupancyStatus).includes(status as TableOccupancyStatusType);
}

export function isValidServiceSessionStatus(status: number): status is ServiceSessionStatusType {
  return Object.values(ServiceSessionStatus).includes(status as ServiceSessionStatusType);
}

export function isValidServiceSessionLineState(status: number): status is ServiceSessionLineStateType {
  return Object.values(ServiceSessionLineState).includes(status as ServiceSessionLineStateType);
}

export function isValidTableEventType(eventType: number): eventType is TableEventTypeType {
  return Object.values(TableEventType).includes(eventType as TableEventTypeType);
}

export function isValidReservationStatusId(status: number): status is ReservationStatusIdType {
  return Object.values(ReservationStatusId).includes(status as ReservationStatusIdType);
}

export function isValidReservationStatusV2(status: number): status is ReservationStatusV2Type {
  return Object.values(ReservationStatusV2).includes(status as ReservationStatusV2Type);
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
