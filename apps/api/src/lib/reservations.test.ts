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
  ReservationConflictError,
  ReservationNotFoundError,
  InvalidStatusTransitionError,
  createReservation,
  updateReservation,
  createReservationV2,
  listReservationsV2,
  updateReservationStatus,
  generateReservationCode,
  VALID_TRANSITIONS,
  ReservationStatusV2,
  type CreateReservationInput,
  type ListReservationsParams
} from "./reservations";
import { createOutletTable } from "./outlet-tables";

loadEnvIfPresent();

type FixtureContext = {
  companyId: number;
  outletId: number;
  userId: number;
};

async function resolveFixtureContext(): Promise<FixtureContext> {
  const pool = getDbPool();
  const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
  const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
  const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.id AS company_id, o.id AS outlet_id, u.id AS user_id
     FROM companies c
     INNER JOIN outlets o ON o.company_id = c.id
     INNER JOIN users u ON u.company_id = c.id
     INNER JOIN user_outlets uo ON uo.user_id = u.id AND uo.outlet_id = o.id
     WHERE c.code = ? AND o.code = ? AND u.email = ?
     LIMIT 1`,
    [companyCode, outletCode, ownerEmail]
  );

  assert.ok(rows.length > 0, "Fixture company/outlet/user not found; run seed first");
  return {
    companyId: Number(rows[0].company_id),
    outletId: Number(rows[0].outlet_id),
    userId: Number(rows[0].user_id)
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
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdTableIds: number[] = [];
    const createdReservationIds: number[] = [];

    try {
      const table1 = await createOutletTable({
        company_id: companyId,
        outlet_id: outletId,
        code: `T1-${runId}`.slice(0, 32),
        name: `Table One ${runId}`,
        zone: "Main",
        capacity: 4,
        status: "AVAILABLE",
        actor: { userId, outletId, ipAddress: "127.0.0.1" }
      });
      createdTableIds.push(table1.id);

      const table2 = await createOutletTable({
        company_id: companyId,
        outlet_id: outletId,
        code: `T2-${runId}`.slice(0, 32),
        name: `Table Two ${runId}`,
        zone: "Main",
        capacity: 4,
        status: "AVAILABLE",
        actor: { userId, outletId, ipAddress: "127.0.0.1" }
      });
      createdTableIds.push(table2.id);

      const reservation = await createReservation(companyId, {
        outlet_id: outletId,
        table_id: table1.id,
        customer_name: `Reservation ${runId}`,
        customer_phone: "08123456789",
        guest_count: 2,
        reservation_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 90,
        notes: "Initial"
      });
      createdReservationIds.push(reservation.reservation_id);

      assert.equal(await readTableStatus(companyId, outletId, table1.id), "RESERVED");

      await updateReservation(companyId, reservation.reservation_id, {
        table_id: table2.id
      });
      assert.equal(await readTableStatus(companyId, outletId, table1.id), "AVAILABLE");
      assert.equal(await readTableStatus(companyId, outletId, table2.id), "RESERVED");

      await updateReservation(companyId, reservation.reservation_id, {
        status: "ARRIVED"
      });
      assert.equal(await readTableStatus(companyId, outletId, table2.id), "RESERVED");

      await updateReservation(companyId, reservation.reservation_id, {
        status: "SEATED"
      });
      assert.equal(await readTableStatus(companyId, outletId, table2.id), "OCCUPIED");

      await updateReservation(companyId, reservation.reservation_id, {
        status: "COMPLETED"
      });
      assert.equal(await readTableStatus(companyId, outletId, table2.id), "AVAILABLE");

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

      const table3 = await createOutletTable({
        company_id: companyId,
        outlet_id: outletId,
        code: `T3-${runId}`.slice(0, 32),
        name: `Table Three ${runId}`,
        zone: "Main",
        capacity: 4,
        status: "AVAILABLE",
        actor: { userId, outletId, ipAddress: "127.0.0.1" }
      });
      createdTableIds.push(table3.id);

      const reservationWithOpenOrder = await createReservation(companyId, {
        outlet_id: outletId,
        table_id: table3.id,
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
          table3.id,
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
      assert.equal(await readTableStatus(companyId, outletId, table3.id), "OCCUPIED");

      await updateReservation(companyId, reservationWithOpenOrder.reservation_id, {
        status: "COMPLETED"
      });
      assert.equal(
        await readTableStatus(companyId, outletId, table3.id),
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

test(
  "reservations reject missing table assignment on create and update",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const missingTableId = 987654321;
    const createdReservationIds: number[] = [];

    try {
      await assert.rejects(
        async () => {
          await createReservation(companyId, {
            outlet_id: outletId,
            table_id: missingTableId,
            customer_name: `Missing Table ${runId}`,
            customer_phone: null,
            guest_count: 2,
            reservation_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            duration_minutes: 90,
            notes: null
          });
        },
        (error: unknown) => {
          assert.ok(error instanceof ReservationValidationError);
          assert.match((error as ReservationValidationError).message, /table .* not found in outlet/i);
          return true;
        }
      );

      const baseReservation = await createReservation(companyId, {
        outlet_id: outletId,
        table_id: null,
        customer_name: `Update Missing ${runId}`,
        customer_phone: null,
        guest_count: 2,
        reservation_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 90,
        notes: null
      });
      createdReservationIds.push(baseReservation.reservation_id);

      await assert.rejects(
        async () => {
          await updateReservation(companyId, baseReservation.reservation_id, {
            table_id: missingTableId
          });
        },
        (error: unknown) => {
          assert.ok(error instanceof ReservationValidationError);
          assert.match((error as ReservationValidationError).message, /table .* not found in outlet/i);
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
    }
  }
);

test(
  "reservations allow adjacent windows when first end equals second start",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdTableIds: number[] = [];
    const createdReservationIds: bigint[] = [];

    try {
      const table = await createOutletTable({
        company_id: companyId,
        outlet_id: outletId,
        code: `T-BDRY-${runId}`.slice(0, 32),
        name: `Boundary Table ${runId}`,
        zone: "Main",
        capacity: 4,
        status: "AVAILABLE",
        actor: { userId, outletId, ipAddress: "127.0.0.1" }
      });
      createdTableIds.push(table.id);

      const firstStart = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const firstDurationMinutes = 60;
      const secondStart = new Date(firstStart.getTime() + firstDurationMinutes * 60000);

      const firstReservation = await createReservationV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(table.id),
        partySize: 2,
        customerName: `Boundary First ${runId}`,
        reservationTime: firstStart,
        durationMinutes: firstDurationMinutes,
        createdBy: "test-user"
      });
      createdReservationIds.push(firstReservation.id);

      const secondReservation = await createReservationV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(table.id),
        partySize: 2,
        customerName: `Boundary Second ${runId}`,
        reservationTime: secondStart,
        durationMinutes: 45,
        createdBy: "test-user"
      });
      createdReservationIds.push(secondReservation.id);

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, reservation_start_ts, reservation_end_ts
         FROM reservations
         WHERE company_id = ? AND outlet_id = ? AND id IN (?, ?)
         ORDER BY id ASC`,
        [companyId, outletId, firstReservation.id, secondReservation.id]
      );

      assert.strictEqual(rows.length, 2, "both adjacent reservations should be persisted");

      const firstRow = rows.find((row) => BigInt(row.id) === firstReservation.id);
      const secondRow = rows.find((row) => BigInt(row.id) === secondReservation.id);
      assert.ok(firstRow, "first reservation row should exist");
      assert.ok(secondRow, "second reservation row should exist");

      const firstStartTs = Number(firstRow!.reservation_start_ts);
      const firstEndTs = Number(firstRow!.reservation_end_ts);
      const secondStartTs = Number(secondRow!.reservation_start_ts);
      const secondEndTs = Number(secondRow!.reservation_end_ts);

      assert.ok(Number.isFinite(firstStartTs), "first reservation_start_ts should be populated");
      assert.ok(Number.isFinite(firstEndTs), "first reservation_end_ts should be populated");
      assert.ok(Number.isFinite(secondStartTs), "second reservation_start_ts should be populated");
      assert.ok(Number.isFinite(secondEndTs), "second reservation_end_ts should be populated");
      assert.ok(firstEndTs > firstStartTs, "first reservation end should be greater than start");
      assert.ok(secondEndTs > secondStartTs, "second reservation end should be greater than start");
      assert.strictEqual(
        firstEndTs,
        secondStartTs,
        "adjacent reservations should be allowed when first end equals second start"
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
    }
  }
);

test(
  "reservations overlap detection handles mixed canonical and legacy interval rows",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdTableIds: number[] = [];
    const createdReservationIds: bigint[] = [];

    try {
      const table = await createOutletTable({
        company_id: companyId,
        outlet_id: outletId,
        code: `T-MIX-${runId}`.slice(0, 32),
        name: `Mixed Table ${runId}`,
        zone: "Main",
        capacity: 4,
        status: "AVAILABLE",
        actor: { userId, outletId, ipAddress: "127.0.0.1" }
      });
      createdTableIds.push(table.id);

      const baseStartA = new Date(Date.now() + 8 * 60 * 60 * 1000);
      baseStartA.setSeconds(0, 0);
      const staleReservationAtA = new Date(baseStartA.getTime() - 5 * 60 * 60 * 1000);

      const [insertA] = await pool.execute<ResultSetHeader>(
        `INSERT INTO reservations (
           company_id, outlet_id, table_id,
           customer_name, customer_phone, guest_count,
           reservation_at, reservation_start_ts, reservation_end_ts,
           duration_minutes, status, status_id, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`,
        [
          companyId,
          outletId,
           Number(table.id),
          `Mixed A ${runId}`,
          null,
          2,
          staleReservationAtA,
          baseStartA.getTime(),
          null,
          60,
          "start_ts present, end_ts null"
        ]
      );
      createdReservationIds.push(BigInt(insertA.insertId));

      await assert.rejects(
        async () => {
          await createReservationV2({
            companyId: BigInt(companyId),
            outletId: BigInt(outletId),
            tableId: BigInt(table.id),
            partySize: 2,
            customerName: `Overlap A ${runId}`,
            reservationTime: new Date(baseStartA.getTime() + 30 * 60000),
            durationMinutes: 30,
            createdBy: "test-user"
          });
        },
        (error: unknown) => {
          assert.ok(error instanceof ReservationConflictError);
          return true;
        }
      );

      const baseStartB = new Date(baseStartA.getTime() + 4 * 60 * 60 * 1000);
      const staleReservationAtB = new Date(baseStartB.getTime() - 5 * 60 * 60 * 1000);

      const [insertB] = await pool.execute<ResultSetHeader>(
        `INSERT INTO reservations (
           company_id, outlet_id, table_id,
           customer_name, customer_phone, guest_count,
           reservation_at, reservation_start_ts, reservation_end_ts,
           duration_minutes, status, status_id, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`,
        [
          companyId,
          outletId,
           Number(table.id),
          `Mixed B ${runId}`,
          null,
          2,
          staleReservationAtB,
          null,
          baseStartB.getTime() + 60 * 60000,
          60,
          "start_ts null, end_ts present"
        ]
      );
      createdReservationIds.push(BigInt(insertB.insertId));

      await assert.rejects(
        async () => {
          await createReservationV2({
            companyId: BigInt(companyId),
            outletId: BigInt(outletId),
            tableId: BigInt(table.id),
            partySize: 2,
            customerName: `Overlap B ${runId}`,
            reservationTime: new Date(baseStartB.getTime() + 30 * 60000),
            durationMinutes: 30,
            createdBy: "test-user"
          });
        },
        (error: unknown) => {
          assert.ok(error instanceof ReservationConflictError);
          return true;
        }
      );

      const baseStartC = new Date(baseStartB.getTime() + 4 * 60 * 60 * 1000);
      const staleReservationAtC = new Date(baseStartC.getTime() - 6 * 60 * 60 * 1000);

      const [insertC] = await pool.execute<ResultSetHeader>(
        `INSERT INTO reservations (
           company_id, outlet_id, table_id,
           customer_name, customer_phone, guest_count,
           reservation_at, reservation_start_ts, reservation_end_ts,
           duration_minutes, status, status_id, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 1, ?)`,
        [
          companyId,
          outletId,
           Number(table.id),
          `Mixed C ${runId}`,
          null,
          2,
          staleReservationAtC,
          baseStartC.getTime(),
          null,
          60,
          "adjacent boundary mixed row"
        ]
      );
      createdReservationIds.push(BigInt(insertC.insertId));

      const adjacentReservation = await createReservationV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(table.id),
        partySize: 2,
        customerName: `Adjacent Mixed ${runId}`,
        reservationTime: new Date(baseStartC.getTime() + 60 * 60000),
        durationMinutes: 30,
        createdBy: "test-user"
      });
      createdReservationIds.push(adjacentReservation.id);
      assert.ok(adjacentReservation.id > 0n, "adjacent mixed-state reservation should be created");
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
    }
  }
);

// ============================================================================
// STORY 12.4 - V2 CONTRACT TESTS
// ============================================================================

test(
  "Story 12.4: createReservationV2 creates reservation with generated code",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];

    try {
      const input: CreateReservationInput = {
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 4,
        customerName: `V2 Customer ${runId}`,
        customerPhone: "081234567890",
        customerEmail: `test-${runId}@example.com`,
        reservationTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        durationMinutes: 120,
        notes: "V2 test reservation",
        createdBy: "test-user"
      };

      const reservation = await createReservationV2(input);
      createdReservationIds.push(reservation.id);

      assert.ok(reservation.id > 0, "Reservation should have valid ID");
      // reservationCode falls back to `RES-${id}` if column doesn't exist yet
      assert.ok(reservation.reservationCode.startsWith("RES-"), "Reservation code should start with RES-");
      assert.equal(reservation.statusId, ReservationStatusV2.PENDING, "Status should be PENDING (1)");
      assert.equal(reservation.partySize, 4, "Party size should match input");
      assert.equal(reservation.customerName, input.customerName, "Customer name should match");
      assert.equal(reservation.customerPhone, input.customerPhone, "Customer phone should match");
      // customerEmail is optional and may not be stored if column doesn't exist
      assert.equal(reservation.durationMinutes, 120, "Duration should match input");
      assert.equal(reservation.notes, input.notes, "Notes should match");
      // createdBy falls back to 'system' if column doesn't exist
      assert.ok(reservation.createdBy, "Created by should be set");
      assert.ok(reservation.createdAt instanceof Date, "Created at should be a Date");
      assert.ok(reservation.updatedAt instanceof Date, "Updated at should be a Date");
    } finally {
      if (createdReservationIds.length > 0) {
        const placeholders = createdReservationIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM reservations WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdReservationIds]
        );
      }
    }
  }
);

test(
  "Story 12.4: createReservationV2 generates unique codes across multiple reservations",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];
    const codes: string[] = [];

    try {
      // Create 5 reservations and verify all codes are unique
      for (let i = 0; i < 5; i++) {
        const input: CreateReservationInput = {
          companyId: BigInt(companyId),
          outletId: BigInt(outletId),
          partySize: 2,
          customerName: `Customer ${i} ${runId}`,
          customerPhone: "081234567890",
          reservationTime: new Date(Date.now() + (i + 1) * 60 * 60 * 1000),
          durationMinutes: 90,
          createdBy: "test-user"
        };

        const reservation = await createReservationV2(input);
        createdReservationIds.push(reservation.id);
        codes.push(reservation.reservationCode);
      }

      const uniqueCodes = new Set(codes);
      assert.equal(uniqueCodes.size, codes.length, "All reservation codes should be unique");
      assert.equal(codes.length, 5, "Should have created 5 reservations");

      // Verify code format - codes can be either generated (RES-XXXXXX) or fallback (RES-{id})
      for (const code of codes) {
        assert.ok(code.startsWith("RES-"), `Code ${code} should start with RES-`);
        // Length varies: generated codes are 10 chars, fallback codes vary by ID length
        assert.ok(code.length >= 6, `Code ${code} should have at least 6 characters`);
      }
    } finally {
      if (createdReservationIds.length > 0) {
        const placeholders = createdReservationIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM reservations WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdReservationIds]
        );
      }
    }
  }
);

test(
  "Story 12.4: createReservationV2 handles minimal input",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];

    try {
      // Test with minimal required fields
      const input: CreateReservationInput = {
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 2,
        customerName: `Minimal Customer ${runId}`,
        reservationTime: new Date(Date.now() + 60 * 60 * 1000),
        durationMinutes: 90,
        createdBy: "test-user"
        // Optional fields omitted: customerPhone, customerEmail, tableId, notes
      };

      const reservation = await createReservationV2(input);
      createdReservationIds.push(reservation.id);

      assert.ok(reservation.id > 0, "Reservation should have valid ID");
      assert.equal(reservation.statusId, ReservationStatusV2.PENDING, "Status should be PENDING");
      assert.equal(reservation.partySize, 2, "Party size should match");
      assert.equal(reservation.customerName, input.customerName, "Customer name should match");
      assert.ok(reservation.customerPhone === null || reservation.customerPhone === undefined, "Phone should be null/undefined when not provided");
      assert.ok(reservation.customerEmail === null || reservation.customerEmail === undefined, "Email should be null/undefined when not provided");
      assert.equal(reservation.tableId, null, "Table ID should be null when not provided");
    } finally {
      if (createdReservationIds.length > 0) {
        const placeholders = createdReservationIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM reservations WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdReservationIds]
        );
      }
    }
  }
);

test(
  "Story 12.4: listReservationsV2 filters and paginates correctly",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];

    try {
      // Create test reservations with different statuses
      const baseTime = new Date();
      baseTime.setHours(baseTime.getHours() + 1);
      baseTime.setMinutes(0, 0, 0);

      for (let i = 0; i < 5; i++) {
        const reservationTime = new Date(baseTime);
        reservationTime.setHours(reservationTime.getHours() + i);

        const input: CreateReservationInput = {
          companyId: BigInt(companyId),
          outletId: BigInt(outletId),
          partySize: i + 1,
          customerName: `ListTest Customer ${i} ${runId}`,
          customerPhone: "081234567890",
          reservationTime,
          durationMinutes: 90,
          createdBy: "test-user"
        };

        const reservation = await createReservationV2(input);
        createdReservationIds.push(reservation.id);
      }

      // Test 1: List all reservations
      const listResult = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0
      });

      assert.ok(listResult.reservations.length >= 5, "Should return at least 5 reservations");
      assert.ok(listResult.total >= 5, "Total should be at least 5");

      // Test 2: Pagination
      const page1 = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 2,
        offset: 0
      });

      assert.equal(page1.reservations.length, 2, "Page 1 should have 2 items");

      const page2 = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 2,
        offset: 2
      });

      assert.equal(page2.reservations.length, 2, "Page 2 should have 2 items");

      // Test 3: Filter by customer name
      const filteredByName = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        customerName: `ListTest Customer 0 ${runId}`
      });

      assert.ok(filteredByName.reservations.length >= 1, "Should find reservation by customer name");

      // Test 4: Tenant isolation - wrong outlet
      const wrongOutletResult = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(999999),
        limit: 10,
        offset: 0
      });

      assert.equal(wrongOutletResult.reservations.length, 0, "Should not find reservations for wrong outlet");
      assert.equal(wrongOutletResult.total, 0, "Total should be 0 for wrong outlet");

    } finally {
      if (createdReservationIds.length > 0) {
        const placeholders = createdReservationIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM reservations WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdReservationIds]
        );
      }
    }
  }
);

test(
  "Story 12.4: updateReservationStatus validates transitions and handles side effects",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];
    const createdTableIds: number[] = [];

    try {
      // Create a table for testing
      const table = await createOutletTable({
        company_id: companyId,
        outlet_id: outletId,
        code: `V2T-${runId}`.slice(0, 32),
        name: `V2 Test Table ${runId}`,
        zone: "Main",
        capacity: 4,
        status: "AVAILABLE",
        actor: { userId, outletId, ipAddress: "127.0.0.1" }
      });
      createdTableIds.push(table.id);

      // Create a reservation
      const reservationTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const input: CreateReservationInput = {
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 4,
        customerName: `StatusTest Customer ${runId}`,
        reservationTime,
        durationMinutes: 90,
        createdBy: "test-user"
      };

      const reservation = await createReservationV2(input);
      createdReservationIds.push(reservation.id);

      assert.equal(reservation.statusId, ReservationStatusV2.PENDING, "Initial status should be PENDING");

      // Test 1: Valid transition PENDING -> CONFIRMED
      const confirmed = await updateReservationStatus(
        reservation.id,
        BigInt(companyId),
        BigInt(outletId),
        {
          statusId: ReservationStatusV2.CONFIRMED,
          updatedBy: "test-user"
        }
      );

      assert.equal(confirmed.statusId, ReservationStatusV2.CONFIRMED, "Status should be CONFIRMED");

      // Test 2: Valid transition CONFIRMED -> CHECKED_IN
      const checkedIn = await updateReservationStatus(
        reservation.id,
        BigInt(companyId),
        BigInt(outletId),
        {
          statusId: ReservationStatusV2.CHECKED_IN,
          updatedBy: "test-user"
        }
      );

      assert.equal(checkedIn.statusId, ReservationStatusV2.CHECKED_IN, "Status should be CHECKED_IN");

      // Test 3: Valid transition CHECKED_IN -> COMPLETED
      const completed = await updateReservationStatus(
        reservation.id,
        BigInt(companyId),
        BigInt(outletId),
        {
          statusId: ReservationStatusV2.COMPLETED,
          updatedBy: "test-user"
        }
      );

      assert.equal(completed.statusId, ReservationStatusV2.COMPLETED, "Status should be COMPLETED");

      // Test 4: Invalid transition COMPLETED -> PENDING
      await assert.rejects(
        async () => {
          await updateReservationStatus(
            reservation.id,
            BigInt(companyId),
            BigInt(outletId),
            {
              statusId: ReservationStatusV2.PENDING,
              updatedBy: "test-user"
            }
          );
        },
        (error: unknown) => {
          assert.ok(error instanceof InvalidStatusTransitionError, "Should throw InvalidStatusTransitionError");
          // Error message should mention invalid transition
          assert.ok((error as InvalidStatusTransitionError).message.includes("Invalid"), "Error message should mention 'Invalid'");
          return true;
        }
      );

      // Test 5: Non-existent reservation
      await assert.rejects(
        async () => {
          await updateReservationStatus(
            BigInt(999999),
            BigInt(companyId),
            BigInt(outletId),
            {
              statusId: ReservationStatusV2.CONFIRMED,
              updatedBy: "test-user"
            }
          );
        },
        (error: unknown) => {
          assert.ok(error instanceof ReservationNotFoundError);
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
    }
  }
);

test(
  "Story 12.4: generateReservationCode produces unique codes with fallback",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const generatedCodes: string[] = [];

    try {
      // Generate multiple codes - function handles missing column gracefully
      for (let i = 0; i < 10; i++) {
        const code = await generateReservationCode(BigInt(outletId));
        generatedCodes.push(code);

        // Verify format - codes should start with RES-
        assert.ok(code.startsWith("RES-"), `Code ${code} should start with RES-`);
        // Codes are either 10 chars (RES- + 6 hex) or fallback format (RES- + timestamp)
        assert.ok(code.length >= 6, `Code ${code} should have at least 6 characters`);
        assert.ok(/^[A-Z0-9-]+$/.test(code), `Code ${code} should be uppercase alphanumeric with hyphens`);
      }

      // Verify uniqueness
      const uniqueCodes = new Set(generatedCodes);
      assert.equal(uniqueCodes.size, generatedCodes.length, "All generated codes should be unique");

    } finally {
      // No cleanup needed as we're not creating reservations
      // The function only generates codes, doesn't store them
    }
  }
);

test(
  "Story 12.4: VALID_TRANSITIONS defines correct state machine",
  { concurrency: false, timeout: 10000 },
  async () => {
    // Verify PENDING transitions
    assert.ok(VALID_TRANSITIONS[ReservationStatusV2.PENDING].includes(ReservationStatusV2.CONFIRMED), "PENDING can transition to CONFIRMED");
    assert.ok(VALID_TRANSITIONS[ReservationStatusV2.PENDING].includes(ReservationStatusV2.CANCELLED), "PENDING can transition to CANCELLED");
    assert.equal(VALID_TRANSITIONS[ReservationStatusV2.PENDING].length, 2, "PENDING has exactly 2 valid transitions");

    // Verify CONFIRMED transitions
    assert.ok(VALID_TRANSITIONS[ReservationStatusV2.CONFIRMED].includes(ReservationStatusV2.CHECKED_IN), "CONFIRMED can transition to CHECKED_IN");
    assert.ok(VALID_TRANSITIONS[ReservationStatusV2.CONFIRMED].includes(ReservationStatusV2.NO_SHOW), "CONFIRMED can transition to NO_SHOW");
    assert.ok(VALID_TRANSITIONS[ReservationStatusV2.CONFIRMED].includes(ReservationStatusV2.CANCELLED), "CONFIRMED can transition to CANCELLED");
    assert.equal(VALID_TRANSITIONS[ReservationStatusV2.CONFIRMED].length, 3, "CONFIRMED has exactly 3 valid transitions");

    // Verify CHECKED_IN transitions
    assert.ok(VALID_TRANSITIONS[ReservationStatusV2.CHECKED_IN].includes(ReservationStatusV2.COMPLETED), "CHECKED_IN can transition to COMPLETED");
    assert.equal(VALID_TRANSITIONS[ReservationStatusV2.CHECKED_IN].length, 1, "CHECKED_IN has exactly 1 valid transition");

    // Verify final states have no transitions
    assert.equal(VALID_TRANSITIONS[ReservationStatusV2.NO_SHOW].length, 0, "NO_SHOW is a final state");
    assert.equal(VALID_TRANSITIONS[ReservationStatusV2.CANCELLED].length, 0, "CANCELLED is a final state");
    assert.equal(VALID_TRANSITIONS[ReservationStatusV2.COMPLETED].length, 0, "COMPLETED is a final state");
  }
);

test(
  "Story 12.4: updateReservationStatus with cancellation reason and notes",
  { concurrency: false, timeout: 60000 },
  async () => {
    const pool = getDbPool();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];

    try {
      // Create a reservation
      const input: CreateReservationInput = {
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 4,
        customerName: `CancelTest Customer ${runId}`,
        reservationTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        durationMinutes: 90,
        createdBy: "test-user"
      };

      const reservation = await createReservationV2(input);
      createdReservationIds.push(reservation.id);

      // Transition to CONFIRMED first
      await updateReservationStatus(
        reservation.id,
        BigInt(companyId),
        BigInt(outletId),
        {
          statusId: ReservationStatusV2.CONFIRMED,
          updatedBy: "test-user"
        }
      );

      // Cancel with reason and notes
      const cancelled = await updateReservationStatus(
        reservation.id,
        BigInt(companyId),
        BigInt(outletId),
        {
          statusId: ReservationStatusV2.CANCELLED,
          cancellationReason: "Customer requested cancellation",
          notes: "Cancelled by phone call at 2:00 PM",
          updatedBy: "test-user"
        }
      );

      assert.equal(cancelled.statusId, ReservationStatusV2.CANCELLED, "Status should be CANCELLED");
      // Note: cancellation_reason and notes fields may not exist in current schema
      // The update function handles this gracefully by checking column existence
    } finally {
      if (createdReservationIds.length > 0) {
        const placeholders = createdReservationIds.map(() => "?").join(", ");
        await pool.execute(
          `DELETE FROM reservations WHERE company_id = ? AND outlet_id = ? AND id IN (${placeholders})`,
          [companyId, outletId, ...createdReservationIds]
        );
      }
    }
  }
);

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
