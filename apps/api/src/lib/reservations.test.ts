// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResultSetHeader } from "mysql2";
import type { RowDataPacket } from "mysql2";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { getDbPool } from "./db";
import {
  ReservationValidationError,
  createReservation,
  updateReservation
} from "./reservations";

loadEnvIfPresent();

type FixtureContext = {
  companyId: number;
  outletId: number;
};

async function resolveFixtureContext(): Promise<FixtureContext> {
  const pool = getDbPool();
  const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
  const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.id AS company_id, o.id AS outlet_id
     FROM companies c
     INNER JOIN outlets o ON o.company_id = c.id
     WHERE c.code = ? AND o.code = ?
     LIMIT 1`,
    [companyCode, outletCode]
  );

  assert.ok(rows.length > 0, "Fixture company/outlet not found; run seed first");
  return {
    companyId: Number(rows[0].company_id),
    outletId: Number(rows[0].outlet_id)
  };
}

async function readTableStatus(
  companyId: number,
  outletId: number,
  tableId: number
): Promise<string | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT status FROM outlet_tables WHERE company_id = ? AND outlet_id = ? AND id = ? LIMIT 1`,
    [companyId, outletId, tableId]
  );
  if (rows.length === 0) {
    return null;
  }
  return String(rows[0].status);
}

test(
  "reservations enforce finalized immutability and table status transitions",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdTableIds: number[] = [];
    const createdReservationIds: number[] = [];

    try {
      const [table1Insert] = await pool.execute<ResultSetHeader>(
        `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status)
         VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE')`,
        [companyId, outletId, `T1-${runId}`.slice(0, 32), `Table One ${runId}`, "Main", 4]
      );
      const table1Id = Number(table1Insert.insertId);
      createdTableIds.push(table1Id);

      const [table2Insert] = await pool.execute<ResultSetHeader>(
        `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status)
         VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE')`,
        [companyId, outletId, `T2-${runId}`.slice(0, 32), `Table Two ${runId}`, "Main", 4]
      );
      const table2Id = Number(table2Insert.insertId);
      createdTableIds.push(table2Id);

      const reservation = await createReservation(companyId, {
        outlet_id: outletId,
        table_id: table1Id,
        customer_name: `Reservation ${runId}`,
        customer_phone: "08123456789",
        guest_count: 2,
        reservation_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 90,
        notes: "Initial"
      });
      createdReservationIds.push(reservation.reservation_id);

      assert.equal(await readTableStatus(companyId, outletId, table1Id), "RESERVED");

      await updateReservation(companyId, reservation.reservation_id, {
        table_id: table2Id
      });
      assert.equal(await readTableStatus(companyId, outletId, table1Id), "AVAILABLE");
      assert.equal(await readTableStatus(companyId, outletId, table2Id), "RESERVED");

      await updateReservation(companyId, reservation.reservation_id, {
        status: "ARRIVED"
      });
      assert.equal(await readTableStatus(companyId, outletId, table2Id), "RESERVED");

      await updateReservation(companyId, reservation.reservation_id, {
        status: "SEATED"
      });
      assert.equal(await readTableStatus(companyId, outletId, table2Id), "OCCUPIED");

      await updateReservation(companyId, reservation.reservation_id, {
        status: "COMPLETED"
      });
      assert.equal(await readTableStatus(companyId, outletId, table2Id), "AVAILABLE");

      const cancelled = await createReservation(companyId, {
        outlet_id: outletId,
        table_id: null,
        customer_name: `Finalized ${runId}`,
        customer_phone: null,
        guest_count: 2,
        reservation_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        notes: "Before cancel"
      });
      createdReservationIds.push(cancelled.reservation_id);

      await updateReservation(companyId, cancelled.reservation_id, {
        status: "CANCELLED"
      });

      await assert.rejects(
        async () =>
          updateReservation(companyId, cancelled.reservation_id, {
            notes: "Should fail"
          }),
        (error: unknown) => {
          assert.ok(error instanceof ReservationValidationError);
          assert.equal((error as ReservationValidationError).message, "Finalized reservation cannot be modified");
          return true;
        }
      );
    } finally {
      if (createdReservationIds.length > 0) {
        const placeholders = createdReservationIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM reservations WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdReservationIds]
        );
      }

      if (createdTableIds.length > 0) {
        const placeholders = createdTableIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM outlet_tables WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdTableIds]
        );
      }

      await pool.end();
    }
  }
);
