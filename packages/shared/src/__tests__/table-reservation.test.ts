import {
  OutletTableStatusId,
  ReservationStatusId,
  TableEventSchema,
  TableOccupancyStatus,
  UpdateTableOccupancyRequestSchema,
} from "../index";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runTableReservationSchemaChecks(): void {
  assert(ReservationStatusId.BOOKED === 1, "ReservationStatusId.BOOKED mismatch");
  assert(ReservationStatusId.NO_SHOW === 7, "ReservationStatusId.NO_SHOW mismatch");
  assert(OutletTableStatusId.OCCUPIED === 5, "OutletTableStatusId.OCCUPIED mismatch");
  assert(OutletTableStatusId.UNAVAILABLE === 7, "OutletTableStatusId.UNAVAILABLE mismatch");

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
  assert(validEvent.clientTxId === "tx-1", "TableEventSchema should keep clientTxId");

  let rejected = false;
  try {
    TableEventSchema.parse({
      id: 1n,
      companyId: 1n,
      outletId: 1n,
      tableId: 1n,
      eventTypeId: 1,
      occurredAt: new Date(),
      createdAt: new Date(),
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "TableEventSchema must reject missing clientTxId");

  const request = UpdateTableOccupancyRequestSchema.parse({
    companyId: 1n,
    outletId: 1n,
    occupancyId: 9n,
    expectedVersion: 1,
    statusId: TableOccupancyStatus.AVAILABLE,
  });
  assert(request.companyId === 1n, "Update request must require companyId");
}

runTableReservationSchemaChecks();
