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
  ServiceSessionLineState,
  TableEventType,
  ReservationStatusId,
  OutletTableStatusId,
  ReservationStatusV2,
} from '../constants/table-states.js';
import { NumericIdSchema } from './common.js';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const IdSchema = z.bigint().positive();
export const OptionalIdSchema = z.bigint().positive().nullable().optional();
export const OptionalOrderIdSchema = z.string().length(36).nullable().optional();

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
  posOrderId: OptionalOrderIdSchema,
  totalAmount: z.number().min(0).nullable().optional(),
  serverUserId: OptionalIdSchema,
  cashierUserId: OptionalIdSchema,
  notes: z.string().nullable().optional(),
  sessionVersion: z.number().int().min(1).optional(),
  lastFinalizedBatchNo: z.number().int().min(0).optional(),
}).merge(AuditFieldsSchema);

export type TableServiceSession = z.infer<typeof TableServiceSessionSchema>;

const serviceSessionLineStateValues = Object.values(ServiceSessionLineState) as [number, ...number[]];

export const ServiceSessionLineStateIdSchema = z
  .number()
  .int()
  .refine((val) => serviceSessionLineStateValues.includes(val), {
    message: 'Invalid service session line state ID',
  });

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
  clientTxId: z.string().min(1).max(255),
  occupancyVersionBefore: z.number().int().min(0).nullable().optional(),
  occupancyVersionAfter: z.number().int().min(0).nullable().optional(),
  eventData: TableEventDataSchema.nullable().optional(),
  statusIdBefore: TableOccupancyStatusIdSchema.nullable().optional(),
  statusIdAfter: TableOccupancyStatusIdSchema.nullable().optional(),
  serviceSessionId: OptionalIdSchema,
  reservationId: OptionalIdSchema,
  posOrderId: OptionalOrderIdSchema,
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
  companyId: IdSchema,
  outletId: IdSchema,
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
  companyId: IdSchema,
  outletId: IdSchema,
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
  companyId: IdSchema,
  outletId: IdSchema,
  tableId: IdSchema,
  guestCount: z.number().int().positive(),
  guestName: z.string().max(255).nullable().optional(),
  posOrderId: OptionalOrderIdSchema,
  serverUserId: OptionalIdSchema,
  notes: z.string().nullable().optional(),
});

export type CreateServiceSessionRequest = z.infer<typeof CreateServiceSessionRequestSchema>;

// Create Table Event (POS sync)
export const CreateTableEventRequestSchema = z.object({
  companyId: IdSchema,
  outletId: IdSchema,
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
  posOrderId: OptionalOrderIdSchema,
  occurredAt: TimestampSchema,
  sourceDevice: z.string().max(255).optional(),
});

export type CreateTableEventRequest = z.infer<typeof CreateTableEventRequestSchema>;

// Finalize Session Batch (checkpoint sync)
export const FinalizeSessionBatchRequestSchema = z.object({
  clientTxId: z.string().min(1).max(255),
  notes: z.string().max(500).optional(),
});

export type FinalizeSessionBatchRequest = z.infer<typeof FinalizeSessionBatchRequestSchema>;

export const FinalizeSessionBatchResponseSchema = z.object({
  sessionId: z.string(),
  batchNo: z.number().int().min(1),
  sessionVersion: z.number().int().min(1),
  syncedLinesCount: z.number().int().min(0),
});

export type FinalizeSessionBatchResponse = z.infer<typeof FinalizeSessionBatchResponseSchema>;

// Adjust Session Line (cancel/reduce before processing)
export const AdjustSessionLineActionSchema = z.enum(['CANCEL', 'REDUCE_QTY']);

export const AdjustSessionLineRequestSchema = z.object({
  clientTxId: z.string().min(1).max(255),
  action: AdjustSessionLineActionSchema,
  qtyDelta: z.number().int().positive().optional(),
  reason: z.string().min(1).max(500),
}).superRefine((value, ctx) => {
  if (value.action === 'REDUCE_QTY' && value.qtyDelta === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['qtyDelta'],
      message: 'qtyDelta is required for REDUCE_QTY action',
    });
  }
  if (value.action === 'CANCEL' && value.qtyDelta !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['qtyDelta'],
      message: 'qtyDelta must be omitted for CANCEL action',
    });
  }
});

export type AdjustSessionLineRequest = z.infer<typeof AdjustSessionLineRequestSchema>;

// Create Reservation (Story 12.2 - legacy naming)
export const CreateReservationRequestSchema = z.object({
  companyId: IdSchema,
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
// RESERVATION API SCHEMAS (Story 12.4)
// ============================================================================

const reservationStatusValues = Object.values(ReservationStatusV2) as [number, ...number[]];

export const ReservationStatusIdSchemaV2 = z
  .number()
  .int()
  .refine((val) => reservationStatusValues.includes(val), {
    message: 'Invalid reservation status ID',
  });

// For POST /reservations
export const CreateReservationSchemaV2 = z.object({
  partySize: z.number().int().min(1),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional(),
  reservationTime: z.string().datetime(),
  durationMinutes: z.number().int().min(15).default(90),
  tableId: NumericIdSchema.optional(),
  notes: z.string().max(500).optional(),
});

export type CreateReservationV2 = z.infer<typeof CreateReservationSchemaV2>;

// For PATCH /reservations/:id
export const UpdateReservationStatusSchemaV2 = z.object({
  statusId: z.number().int().min(1).max(6),
  tableId: NumericIdSchema.optional(),
  cancellationReason: z.string().optional(),
  notes: z.string().optional(),
});

export type UpdateReservationStatusV2 = z.infer<typeof UpdateReservationStatusSchemaV2>;

// For GET /reservations query params
export const ListReservationsQuerySchemaV2 = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  statusId: z.number().int().optional(),
  tableId: NumericIdSchema.optional(),
  customerName: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type ListReservationsQueryV2 = z.infer<typeof ListReservationsQuerySchemaV2>;

// ============================================================================
// POS SYNC SCHEMAS (Offline-first)
// ============================================================================

export const PosTableSyncRequestSchema = z.object({
  companyId: IdSchema,
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

// ============================================================================
// TABLE SYNC SCHEMAS (Story 12.6 - POS Sync for Table Operations)
// ============================================================================

// Push result status enum
export const TableSyncPushStatusSchema = z.enum(['OK', 'DUPLICATE', 'ERROR']);
export type TableSyncPushStatus = z.infer<typeof TableSyncPushStatusSchema>;

// Table event for push request
// IDs are coerced from strings to numbers since JSON doesn't support bigint
export const TableSyncPushEventSchema = z.object({
  client_tx_id: z.string().min(1).max(255),
  table_id: z.coerce.number().int().positive(),
  expected_table_version: z.number().int().positive(),
  event_type: z.number().int(), // References TableEventType constant
  payload: z.record(z.unknown()),
  recorded_at: z.string().datetime(),
});

export type TableSyncPushEvent = z.infer<typeof TableSyncPushEventSchema>;

// Push Request Schema (POS → API)
export const TableSyncPushRequestSchema = z.object({
  outlet_id: z.coerce.number().int().positive(),
  events: z.array(TableSyncPushEventSchema).min(1),
});

export type TableSyncPushRequest = z.infer<typeof TableSyncPushRequestSchema>;

// Conflict payload for push response
export const TableSyncConflictPayloadSchema = z.object({
  current_occupancy: z.object({
    status_id: z.number().int(),
    guest_count: z.number().int().nullable().optional(),
    service_session_id: z.coerce.number().int().positive().nullable().optional(),
  }),
  active_session: z.object({
    id: z.coerce.number().int().positive().optional(),
    status_id: z.number().int().optional(),
    started_at: z.string().datetime().optional(),
  }).nullable(),
  current_version: z.number().int().positive(),
  conflict_reason: z.string(),
});

export type TableSyncConflictPayload = z.infer<typeof TableSyncConflictPayloadSchema>;

// Push result per event
export const TableSyncPushResultSchema = z.object({
  client_tx_id: z.string(),
  status: TableSyncPushStatusSchema,
  table_version: z.number().int().positive().optional().nullable(),
  conflict_payload: TableSyncConflictPayloadSchema.optional().nullable(),
  error_message: z.string().optional().nullable(),
});

export type TableSyncPushResult = z.infer<typeof TableSyncPushResultSchema>;

// Push Response Schema (API → POS)
export const TableSyncPushResponseSchema = z.object({
  results: z.array(TableSyncPushResultSchema),
  sync_timestamp: z.string().datetime(),
});

export type TableSyncPushResponse = z.infer<typeof TableSyncPushResponseSchema>;

// Pull Request Schema (POS → API)
export const TableSyncPullRequestSchema = z.object({
  outlet_id: z.coerce.number().int().positive(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export type TableSyncPullRequest = z.infer<typeof TableSyncPullRequestSchema>;

// Table occupancy snapshot for pull response
export const TableSyncTableSnapshotSchema = z.object({
  table_id: z.coerce.number().int().positive(),
  table_number: z.string(),
  status: z.number().int(), // References TableOccupancyStatus constant
  current_session_id: z.coerce.number().int().positive().nullable(),
  version: z.number().int().positive(),
  staleness_ms: z.number().int().min(0),
});

export type TableSyncTableSnapshot = z.infer<typeof TableSyncTableSnapshotSchema>;

// Incremental table event for pull response
export const TableSyncIncrementalEventSchema = z.object({
  id: z.coerce.number().int().positive(), // Event ID
  table_id: z.coerce.number().int().positive(),
  event_type: z.string(),
  payload: z.record(z.unknown()),
  recorded_at: z.string().datetime(),
});

export type TableSyncIncrementalEvent = z.infer<typeof TableSyncIncrementalEventSchema>;

// Pull Response Schema (API → POS)
export const TableSyncPullResponseSchema = z.object({
  tables: z.array(TableSyncTableSnapshotSchema),
  events: z.array(TableSyncIncrementalEventSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  sync_timestamp: z.string().datetime(),
});

export type TableSyncPullResponse = z.infer<typeof TableSyncPullResponseSchema>;

// ============================================================================
// TABLE SYNC VALIDATION HELPERS
// ============================================================================

export function validateTableSyncPushRequest(data: unknown): TableSyncPushRequest {
  return TableSyncPushRequestSchema.parse(data);
}

export function validateTableSyncPushResponse(data: unknown): TableSyncPushResponse {
  return TableSyncPushResponseSchema.parse(data);
}

export function validateTableSyncPullRequest(data: unknown): TableSyncPullRequest {
  return TableSyncPullRequestSchema.parse(data);
}

export function validateTableSyncPullResponse(data: unknown): TableSyncPullResponse {
  return TableSyncPullResponseSchema.parse(data);
}
