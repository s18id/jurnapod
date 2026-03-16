// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResultSetHeader } from "mysql2";
import type { RowDataPacket } from "mysql2";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDbPool } from "./db";
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
    const openOrderId = `ord-${runId}-open`;
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

      const [table3Insert] = await pool.execute<ResultSetHeader>(
        `INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status)
         VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE')`,
        [companyId, outletId, `T3-${runId}`.slice(0, 32), `Table Three ${runId}`, "Main", 4]
      );
      const table3Id = Number(table3Insert.insertId);
      createdTableIds.push(table3Id);

      const reservationWithOpenOrder = await createReservation(companyId, {
        outlet_id: outletId,
        table_id: table3Id,
        customer_name: `Reservation Open Order ${runId}`,
        customer_phone: "08123456789",
        guest_count: 2,
        reservation_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 90,
        notes: "With open order"
      });
      createdReservationIds.push(reservationWithOpenOrder.reservation_id);

      await pool.execute(
        `INSERT INTO pos_order_snapshots (
           order_id,
           company_id,
           outlet_id,
           service_type,
           source_flow,
           settlement_flow,
           table_id,
           reservation_id,
           guest_count,
           is_finalized,
           order_status,
           order_state,
           paid_amount,
           opened_at,
           closed_at,
           notes,
           updated_at
         ) VALUES (?, ?, ?, 'DINE_IN', 'WALK_IN', 'DEFERRED', ?, ?, ?, 0, 'OPEN', 'OPEN', 0, NOW(), NULL, NULL, NOW())`,
        [
          openOrderId,
          companyId,
          outletId,
          table3Id,
          reservationWithOpenOrder.reservation_id,
          reservationWithOpenOrder.guest_count
        ]
      );

      await updateReservation(companyId, reservationWithOpenOrder.reservation_id, {
        status: "ARRIVED"
      });
      await updateReservation(companyId, reservationWithOpenOrder.reservation_id, {
        status: "SEATED"
      });
      assert.equal(await readTableStatus(companyId, outletId, table3Id), "OCCUPIED");

      await updateReservation(companyId, reservationWithOpenOrder.reservation_id, {
        status: "COMPLETED"
      });
      assert.equal(
        await readTableStatus(companyId, outletId, table3Id),
        "OCCUPIED",
        "table should remain OCCUPIED while open dine-in order exists"
      );
    } finally {
      await pool.execute(`DELETE FROM pos_order_snapshots WHERE order_id = ? AND company_id = ? AND outlet_id = ?`, [
        openOrderId,
        companyId,
        outletId
      ]);

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
    }
  }
);

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
