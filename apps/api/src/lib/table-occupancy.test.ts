import assert from "node:assert/strict";
import { test } from "node:test";
import { closeDbPool } from "./db";
import { TableOccupancyStatus } from "@jurnapod/shared";
import {
  TableOccupancyConflictError,
  getTableBoard,
  holdTable,
} from "./table-occupancy";

type FakeRow = Record<string, unknown>;

class FakeConnection {
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;
  public released = false;
  public lastEventParams: unknown[] | null = null;

  private occupancyVersion = 1;

  async beginTransaction(): Promise<void> {
    this.beginCount += 1;
  }

  async commit(): Promise<void> {
    this.commitCount += 1;
  }

  async rollback(): Promise<void> {
    this.rollbackCount += 1;
  }

  release(): void {
    this.released = true;
  }

  async execute(sql: string): Promise<[FakeRow[]]> {
    if (sql.includes("FROM table_occupancy") && sql.includes("WHERE company_id = ?")) {
      return [[this.currentOccupancyRow()]];
    }

    if (sql.includes("UPDATE table_occupancy") && sql.includes("SET status_id")) {
      this.occupancyVersion += 1;
      return [[]];
    }

    if (sql.includes("INSERT INTO table_events")) {
      const args = Array.from(arguments);
      this.lastEventParams = Array.isArray(args[1]) ? (args[1] as unknown[]) : null;
      return [[]];
    }

    return [[]];
  }

  private currentOccupancyRow(): FakeRow {
    return {
      id: 1,
      company_id: 1,
      outlet_id: 1,
      table_id: 10,
      status_id: TableOccupancyStatus.AVAILABLE,
      version: this.occupancyVersion,
      service_session_id: null,
      reservation_id: null,
      occupied_at: null,
      reserved_until: null,
      guest_count: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: "tester",
      updated_by: "tester",
    };
  }
}

test("getTableBoard computes availableNow and nextReservationStartAt", async () => {
  const fakePool = {
    async execute() {
      return [[{
        table_id: 10,
        table_code: "T-10",
        table_name: "Table 10",
        capacity: 4,
        zone: "Main",
        occupancy_status_id: TableOccupancyStatus.AVAILABLE,
        current_session_id: null,
        current_reservation_id: null,
        guest_count: null,
        version: 1,
        next_reservation_start_at: "2026-03-20T10:00:00.000Z",
        updated_at: "2026-03-20T09:00:00.000Z",
      }]];
    },
    async end() {},
  };

  (globalThis as typeof globalThis & { __jurnapodApiDbPool?: unknown }).__jurnapodApiDbPool = fakePool;

  const tables = await getTableBoard(1n, 1n);

  assert.equal(tables.length, 1);
  assert.equal(tables[0].availableNow, true);
  assert.equal(tables[0].nextReservationStartAt?.toISOString(), "2026-03-20T10:00:00.000Z");
});

test("getTableBoard query includes canonical and legacy reservation status filters", async () => {
  let capturedSql = "";
  const fakePool = {
    async execute(sql: string) {
      capturedSql = sql;
      return [[]];
    },
    async end() {},
  };

  (globalThis as typeof globalThis & { __jurnapodApiDbPool?: unknown }).__jurnapodApiDbPool = fakePool;

  await getTableBoard(1n, 1n);

  assert.ok(capturedSql.includes("r.status_id IN (1, 2)"));
  assert.ok(capturedSql.includes("(r.status_id IS NULL AND r.status IN ('BOOKED', 'CONFIRMED'))"));
});

test("getTableBoard query scopes table_occupancy join by company and outlet", async () => {
  let capturedSql = "";
  const fakePool = {
    async execute(sql: string) {
      capturedSql = sql;
      return [[]];
    },
    async end() {},
  };

  (globalThis as typeof globalThis & { __jurnapodApiDbPool?: unknown }).__jurnapodApiDbPool = fakePool;

  await getTableBoard(1n, 1n);

  assert.ok(capturedSql.includes("LEFT JOIN table_occupancy to2 ON ot.id = to2.table_id"));
  assert.ok(capturedSql.includes("ot.company_id = to2.company_id"));
  assert.ok(capturedSql.includes("ot.outlet_id = to2.outlet_id"));
});

test("holdTable returns conflict on optimistic lock mismatch", async () => {
  const fakeConnection = new FakeConnection();
  const fakePool = {
    async getConnection() {
      return fakeConnection;
    },
    async end() {},
  };

  (globalThis as typeof globalThis & { __jurnapodApiDbPool?: unknown }).__jurnapodApiDbPool = fakePool;

  await assert.rejects(
    async () => {
      await holdTable({
        companyId: 1n,
        outletId: 1n,
        tableId: 10n,
        heldUntil: new Date("2026-03-20T10:00:00.000Z"),
        expectedVersion: 99,
        createdBy: "tester",
      });
    },
    (error: unknown) => error instanceof TableOccupancyConflictError,
  );

  assert.equal(fakeConnection.rollbackCount, 1);
  assert.equal(fakeConnection.commitCount, 0);
  assert.equal(fakeConnection.released, true);
});

test("holdTable writes non-null client_tx_id in table_events", async () => {
  const fakeConnection = new FakeConnection();
  const fakePool = {
    async getConnection() {
      return fakeConnection;
    },
    async end() {},
  };

  (globalThis as typeof globalThis & { __jurnapodApiDbPool?: unknown }).__jurnapodApiDbPool = fakePool;

  await holdTable({
    companyId: 1n,
    outletId: 1n,
    tableId: 10n,
    heldUntil: new Date("2026-03-20T10:00:00.000Z"),
    expectedVersion: 1,
    createdBy: "tester",
  });

  assert.ok(fakeConnection.lastEventParams, "table_events insert should be executed");
  assert.equal(typeof fakeConnection.lastEventParams?.[4], "string");
  assert.notEqual(fakeConnection.lastEventParams?.[4], "");
  assert.equal(fakeConnection.commitCount, 1);
});

test.after(async () => {
  await closeDbPool();
  delete (globalThis as typeof globalThis & { __jurnapodApiDbPool?: unknown }).__jurnapodApiDbPool;
});
