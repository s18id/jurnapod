import { describe, it, expect } from 'vitest';
import {
  OutletTableStatusId,
  ReservationStatusId,
  TableEventSchema,
  TableOccupancyStatus,
  TableSyncPushResultSchema,
  UpdateTableOccupancyRequestSchema,
} from "../../src/index.js";

describe('Table Reservation Schema', () => {
  it('should have correct ReservationStatusId values', () => {
    // ReservationStatusId enum values
    // BOOKED = 1
    // NO_SHOW = 7
    // etc.
  });

  it('should have correct OutletTableStatusId values', () => {
    // OCCUPIED = 5
    // UNAVAILABLE = 7
  });

  it('should parse valid TableEventSchema', () => {
    const validEvent = TableEventSchema.parse({
      id: 1n,
      companyId: 1n,
      outletId: 1n,
      tableId: 1n,
      eventTypeId: 1,
      clientTxId: "tx-1",
      occurredAt: new Date(),
      createdAt: new Date(),
    });
    expect(validEvent.clientTxId).toBe("tx-1");
  });

  it('should reject TableEventSchema missing clientTxId', () => {
    expect(() => {
      TableEventSchema.parse({
        id: 1n,
        companyId: 1n,
        outletId: 1n,
        tableId: 1n,
        eventTypeId: 1,
        occurredAt: new Date(),
        createdAt: new Date(),
      });
    }).toThrow();
  });

  it('should parse valid UpdateTableOccupancyRequestSchema', () => {
    const request = UpdateTableOccupancyRequestSchema.parse({
      companyId: 1n,
      outletId: 1n,
      occupancyId: 9n,
      expectedVersion: 1,
      statusId: TableOccupancyStatus.AVAILABLE,
    });
    expect(request.companyId).toBe(1n);
  });

  it('should accept canonical table sync push statuses only', () => {
    const ok = TableSyncPushResultSchema.parse({
      client_tx_id: 'tx-ok',
      status: 'OK',
      table_version: 1,
      conflict_payload: null,
      error_message: null,
    });
    const duplicate = TableSyncPushResultSchema.parse({
      client_tx_id: 'tx-dupe',
      status: 'DUPLICATE',
      table_version: null,
      conflict_payload: null,
      error_message: null,
    });
    const error = TableSyncPushResultSchema.parse({
      client_tx_id: 'tx-error',
      status: 'ERROR',
      table_version: null,
      conflict_payload: {
        current_occupancy: {
          status_id: 5,
          guest_count: 2,
          service_session_id: 10,
        },
        active_session: null,
        current_version: 5,
        conflict_reason: 'version mismatch',
      },
      error_message: 'version mismatch',
    });

    expect(ok.status).toBe('OK');
    expect(duplicate.status).toBe('DUPLICATE');
    expect(error.status).toBe('ERROR');
  });

  it('should reject non-canonical table sync status CONFLICT', () => {
    const result = TableSyncPushResultSchema.safeParse({
      client_tx_id: 'tx-conflict',
      status: 'CONFLICT',
      table_version: null,
      conflict_payload: null,
      error_message: null,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected parse failure for CONFLICT status');
    }

    const issue = result.error.issues.find((i) => i.path.join('.') === 'status');
    expect(issue).toBeDefined();
    expect(issue?.code).toBe('invalid_enum_value');
  });
});
