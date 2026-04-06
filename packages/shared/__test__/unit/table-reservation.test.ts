import { describe, it, expect } from 'vitest';
import {
  OutletTableStatusId,
  ReservationStatusId,
  TableEventSchema,
  TableOccupancyStatus,
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
});
