import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { closeDbPool, getDb, type KyselySchema } from "./db";
import { TableOccupancyStatus } from "@jurnapod/shared";
import { createTestCompanyMinimal, createTestOutletMinimal } from "./test-fixtures";
import {
  TableOccupancyConflictError,
  getTableBoard,
  holdTable,
  seatTable,
} from "./table-occupancy";

let db: KyselySchema;
let companyId: number;
let outletId: number;
let tableId: number;

async function ensureTableOccupancy(): Promise<void> {
  await db.deleteFrom("table_occupancy").where("company_id", "=", companyId).where("outlet_id", "=", outletId).where("table_id", "=", tableId).execute();
  await db
    .insertInto("table_occupancy")
    .values({
      company_id: companyId,
      outlet_id: outletId,
      table_id: tableId,
      status_id: TableOccupancyStatus.AVAILABLE,
      version: 1,
      created_by: "tester",
      updated_by: "tester",
    })
    .execute();
}

before(async () => {
  db = getDb();
  const company = await createTestCompanyMinimal({
    code: `TOCC-${Date.now().toString(36)}`,
    name: "Table Occupancy Test Company",
  });
  companyId = company.id;

  const outlet = await createTestOutletMinimal(companyId, {
    code: `TOUT-${Date.now().toString(36)}`,
    name: "Table Occupancy Test Outlet",
  });
  outletId = outlet.id;

  const tableInsert = await db
    .insertInto("outlet_tables")
    .values({
      company_id: companyId,
      outlet_id: outletId,
      code: `TB-${Date.now().toString(36)}`,
      name: "Table Test",
      zone: "Main",
      capacity: 4,
      status_id: 1,
      status: "AVAILABLE",
    })
    .executeTakeFirstOrThrow();

  tableId = Number(tableInsert.insertId);
});

beforeEach(async () => {
  await db.deleteFrom("reservations").where("company_id", "=", companyId).where("outlet_id", "=", outletId).execute();
  await db.deleteFrom("table_occupancy").where("company_id", "=", companyId).where("outlet_id", "=", outletId).execute();
  await db.deleteFrom("table_service_sessions").where("company_id", "=", companyId).where("outlet_id", "=", outletId).execute();
  await ensureTableOccupancy();
});

afterEach(async () => {
  await db.deleteFrom("reservations").where("company_id", "=", companyId).where("outlet_id", "=", outletId).execute();
  await db.deleteFrom("table_occupancy").where("company_id", "=", companyId).where("outlet_id", "=", outletId).execute();
  await db.deleteFrom("table_service_sessions").where("company_id", "=", companyId).where("outlet_id", "=", outletId).execute();
});

after(async () => {
  await closeDbPool();
});

test("getTableBoard computes availableNow and nextReservationStartAt", async () => {
  const reservationAt = new Date(Date.now() + 60 * 60 * 1000);

  await db
    .insertInto("reservations")
    .values({
      company_id: companyId,
      outlet_id: outletId,
      table_id: tableId,
      customer_name: "Guest",
      guest_count: 2,
      reservation_at: reservationAt,
      reservation_start_ts: reservationAt.getTime(),
      status_id: 1,
      status: "BOOKED",
    })
    .execute();

  const tables = await getTableBoard(BigInt(companyId), BigInt(outletId));
  const target = tables.find((row) => Number(row.tableId) === tableId);

  assert.ok(target);
  assert.equal(typeof target.availableNow, "boolean");
  assert.ok(target.occupancyStatusId > 0);
  assert.ok(target.nextReservationStartAt instanceof Date);
  assert.equal(target.nextReservationStartAt?.getTime(), reservationAt.getTime());
});

test("holdTable returns conflict on optimistic lock mismatch", async () => {
  await assert.rejects(
    async () => {
      await holdTable({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(tableId),
        heldUntil: new Date(Date.now() + 30 * 60 * 1000),
        expectedVersion: 99,
        createdBy: "tester",
      });
    },
    (error: unknown) => error instanceof TableOccupancyConflictError,
  );
});

test("seatTable writes non-null client_tx_id in table_events", async () => {
  await seatTable({
    companyId: BigInt(companyId),
    outletId: BigInt(outletId),
    tableId: BigInt(tableId),
    guestCount: 2,
    guestName: "Test Guest",
    expectedVersion: 1,
    createdBy: "tester",
  });

  const event = await db
    .selectFrom("table_events")
    .select(["client_tx_id", "table_id", "event_type_id"])
    .where("company_id", "=", companyId)
    .where("outlet_id", "=", outletId)
    .where("table_id", "=", tableId)
    .orderBy("id", "desc")
    .executeTakeFirst();

  assert.ok(event);
  assert.equal(typeof event.client_tx_id, "string");
  assert.notEqual(event.client_tx_id, "");
});
