/**
 * Table Reservation & POS Sync Zod Schemas
 * 
 * Shared TypeScript + Zod contracts for API validation.
 * All schemas reference integer constants from @jurnapod/shared/constants/table-states
 * 
 * These schemas ensure type safety across:
 * - API request/response validation
 * - POS offline-first sync payloads
 * - Database query results
 * - Frontend state management
 */

import { z } from 'zod';
import {
  TableOccupancyStatus,
  ServiceSessionStatus,
  TableEventType,
  ReservationStatusId,
  OutletTableStatusId,
} from '../constants/table-states';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const IdSchema = z.bigint().positive();
export const OptionalIdSchema = z.bigint().positive().nullable().optional();

export const TimestampSchema = z.date();
export const OptionalTimestampSchema = z.date().nullable().optional();

export const AuditFieldsSchema = z.object({
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  createdBy: z.string().nullable().optional(),
  updatedBy: z.string().nullable().optional(),
});

// ============================================================================
// TABLE OCCUPANCY SCHEMAS
// ============================================================================

const tableOccupancyStatusValues = Object.values(TableOccupancyStatus) as [number, ...number[]];

export const TableOccupancyStatusIdSchema = z
  .number()
  .int()
  .refine((val) => tableOccupancyStatusValues.includes(val), {
    message: 'Invalid table occupancy status ID',
  });

export const TableOccupancySchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  outletId: IdSchema,
  tableId: IdSchema,
  statusId: TableOccupancyStatusIdSchema,
  version: z.number().int().min(1),
  serviceSessionId: OptionalIdSchema,
  reservationId: OptionalIdSchema,
  occupiedAt: OptionalTimestampSchema,
  reservedUntil: OptionalTimestampSchema,
  guestCount: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
}).merge(AuditFieldsSchema);

export type TableOccupancy = z.infer<typeof TableOccupancySchema>;

// ============================================================================
// SERVICE SESSION SCHEMAS
// ============================================================================

const serviceSessionStatusValues = Object.values(ServiceSessionStatus) as [number, ...number[]];

export const ServiceSessionStatusIdSchema = z
  .number()
  .int()
  .refine((val) => serviceSessionStatusValues.includes(val), {
    message: 'Invalid service session status ID',
  });

export const TableServiceSessionSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  outletId: IdSchema,
  tableId: IdSchema,
  statusId: ServiceSessionStatusIdSchema,
  startedAt: TimestampSchema,
  completedAt: OptionalTimestampSchema,
  guestCount: z.number().int().positive(),
  guestName: z.string().max(255).nullable().optional(),
  posOrderId: OptionalIdSchema,
  totalAmount: z.number().min(0).nullable().optional(),
  serverUserId: OptionalIdSchema,
  cashierUserId: OptionalIdSchema,
  notes: z.string().nullable().optional(),
}).merge(AuditFieldsSchema);

export type TableServiceSession = z.infer<typeof TableServiceSessionSchema>;

// ============================================================================
// TABLE EVENT SCHEMAS
// ============================================================================

const tableEventTypeValues = Object.values(TableEventType) as [number, ...number[]];

export const TableEventTypeIdSchema = z
  .number()
  .int()
  .refine((val) => tableEventTypeValues.includes(val), {
    message: 'Invalid table event type ID',
  });

export const TableEventDataSchema = z.object({
  reason: z.string().optional(),
  before: z.record(z.unknown()).optional(),
  after: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const TableEventSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  outletId: IdSchema,
  tableId: IdSchema,
  eventTypeId: TableEventTypeIdSchema,
  clientTxId: z.string().max(255).nullable().optional(),
  occupancyVersionBefore: z.number().int().min(0).nullable().optional(),
  occupancyVersionAfter: z.number().int().min(0).nullable().optional(),
  eventData: TableEventDataSchema.nullable().optional(),
  statusIdBefore: TableOccupancyStatusIdSchema.nullable().optional(),
  statusIdAfter: TableOccupancyStatusIdSchema.nullable().optional(),
  serviceSessionId: OptionalIdSchema,
  reservationId: OptionalIdSchema,
  posOrderId: OptionalIdSchema,
  syncedAt: OptionalTimestampSchema,
  sourceDevice: z.string().max(255).nullable().optional(),
  occurredAt: TimestampSchema,
  createdBy: z.string().nullable().optional(),
}).merge(z.object({ createdAt: TimestampSchema }));

export type TableEvent = z.infer<typeof TableEventSchema>;

// ============================================================================
// RESERVATION SCHEMAS (updated with status_id)
// ============================================================================

const reservationStatusIdValues = Object.values(ReservationStatusId) as [number, ...number[]];

export const ReservationStatusIdSchema = z
  .number()
  .int()
  .refine((val) => reservationStatusIdValues.includes(val), {
    message: 'Invalid reservation status ID',
  });

export const ReservationSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  outletId: IdSchema,
  tableId: OptionalIdSchema,
  statusId: ReservationStatusIdSchema,
  // Legacy VARCHAR status for backward compatibility
  status: z.string().optional(),
  reservationTime: TimestampSchema,
  partySize: z.number().int().positive(),
  guestName: z.string().max(255).nullable().optional(),
  guestPhone: z.string().max(50).nullable().optional(),
  guestEmail: z.string().email().max(255).nullable().optional(),
  specialRequests: z.string().nullable().optional(),
  confirmedAt: OptionalTimestampSchema,
  checkedInAt: OptionalTimestampSchema,
  cancelledAt: OptionalTimestampSchema,
  noShowAt: OptionalTimestampSchema,
  notes: z.string().nullable().optional(),
}).merge(AuditFieldsSchema);

export type Reservation = z.infer<typeof ReservationSchema>;

// ============================================================================
// API REQUEST/RESPONSE SCHEMAS
// ============================================================================

// Create Table Occupancy
export const CreateTableOccupancyRequestSchema = z.object({
  tableId: IdSchema,
  statusId: TableOccupancyStatusIdSchema.default(TableOccupancyStatus.AVAILABLE),
  serviceSessionId: OptionalIdSchema,
  reservationId: OptionalIdSchema,
  guestCount: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type CreateTableOccupancyRequest = z.infer<typeof CreateTableOccupancyRequestSchema>;

// Update Table Occupancy (with optimistic locking)
export const UpdateTableOccupancyRequestSchema = z.object({
  occupancyId: IdSchema,
  expectedVersion: z.number().int().min(1),
  statusId: TableOccupancyStatusIdSchema.optional(),
  serviceSessionId: OptionalIdSchema,
  reservationId: OptionalIdSchema,
  guestCount: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type UpdateTableOccupancyRequest = z.infer<typeof UpdateTableOccupancyRequestSchema>;

// Create Service Session
export const CreateServiceSessionRequestSchema = z.object({
  tableId: IdSchema,
  guestCount: z.number().int().positive(),
  guestName: z.string().max(255).nullable().optional(),
  posOrderId: OptionalIdSchema,
  serverUserId: OptionalIdSchema,
  notes: z.string().nullable().optional(),
});

export type CreateServiceSessionRequest = z.infer<typeof CreateServiceSessionRequestSchema>;

// Create Table Event (POS sync)
export const CreateTableEventRequestSchema = z.object({
  tableId: IdSchema,
  eventTypeId: TableEventTypeIdSchema,
  clientTxId: z.string().max(255),
  occupancyVersionBefore: z.number().int().min(0).nullable().optional(),
  occupancyVersionAfter: z.number().int().min(0).nullable().optional(),
  eventData: TableEventDataSchema.optional(),
  statusIdBefore: TableOccupancyStatusIdSchema.nullable().optional(),
  statusIdAfter: TableOccupancyStatusIdSchema.nullable().optional(),
  serviceSessionId: OptionalIdSchema,
  reservationId: OptionalIdSchema,
  posOrderId: OptionalIdSchema,
  occurredAt: TimestampSchema,
  sourceDevice: z.string().max(255).optional(),
});

export type CreateTableEventRequest = z.infer<typeof CreateTableEventRequestSchema>;

// Create Reservation
export const CreateReservationRequestSchema = z.object({
  outletId: IdSchema,
  tableId: OptionalIdSchema,
  reservationTime: z.coerce.date(),
  partySize: z.number().int().positive(),
  guestName: z.string().max(255).optional(),
  guestPhone: z.string().max(50).optional(),
  guestEmail: z.string().email().max(255).optional(),
  specialRequests: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateReservationRequest = z.infer<typeof CreateReservationRequestSchema>;

// ============================================================================
// POS SYNC SCHEMAS (Offline-first)
// ============================================================================

export const PosTableSyncRequestSchema = z.object({
  clientTxId: z.string().max(255),
  outletId: IdSchema,
  tableId: IdSchema,
  events: z.array(CreateTableEventRequestSchema).min(1),
  deviceId: z.string().max(255),
  syncTimestamp: z.coerce.date(),
});

export type PosTableSyncRequest = z.infer<typeof PosTableSyncRequestSchema>;

export const PosTableSyncResponseSchema = z.object({
  success: z.boolean(),
  clientTxId: z.string(),
  serverTxId: z.string(),
  syncedAt: z.date(),
  processedEvents: z.number().int(),
  conflicts: z.array(z.object({
    eventId: z.string(),
    reason: z.string(),
    serverState: z.record(z.unknown()),
  })).optional(),
});

export type PosTableSyncResponse = z.infer<typeof PosTableSyncResponseSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateTableOccupancy(data: unknown): TableOccupancy {
  return TableOccupancySchema.parse(data);
}

export function validateServiceSession(data: unknown): TableServiceSession {
  return TableServiceSessionSchema.parse(data);
}

export function validateTableEvent(data: unknown): TableEvent {
  return TableEventSchema.parse(data);
}

export function validateReservation(data: unknown): Reservation {
  return ReservationSchema.parse(data);
}

export function validatePosSyncRequest(data: unknown): PosTableSyncRequest {
  return PosTableSyncRequestSchema.parse(data);
}
