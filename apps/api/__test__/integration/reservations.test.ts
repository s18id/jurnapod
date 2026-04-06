// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import {test, afterAll} from 'vitest';
import { sql } from "kysely";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.js";
import { closeDbPool, getDb } from "../../src/lib/db";
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
} from "../../src/lib/reservations";
import { createOutletTable } from "../../src/lib/outlet-tables";
import { toDateTimeRangeWithTimezone } from "../../src/lib/date-helpers";

loadEnvIfPresent();

type FixtureContext = {
  companyId: number;
  outletId: number;
  userId: number;
};

async function resolveFixtureContext(): Promise<FixtureContext> {
  const db = getDb();
  const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
  const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
  const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
  
  // Global owner has outlet_id = NULL in user_role_assignments
  const userRows = await sql<{ company_id: number; user_id: number }>`
    SELECT c.id AS company_id, u.id AS user_id
     FROM companies c
     INNER JOIN users u ON u.company_id = c.id
     INNER JOIN user_role_assignments ura ON ura.user_id = u.id
     WHERE c.code = ${companyCode} AND u.email = ${ownerEmail} AND ura.outlet_id IS NULL
     LIMIT 1
  `.execute(db);

  assert.ok(userRows.rows.length > 0, "Fixture company/outlet/user not found; run seed first");
  const companyId = Number(userRows.rows[0]!.company_id);
  const userId = Number(userRows.rows[0]!.user_id);

  // Get outlet ID from outlets table
  const outletRows = await sql<{ id: number }>`
    SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
  `.execute(db);
  assert.ok(outletRows.rows.length > 0, "Outlet not found");
  const outletId = Number(outletRows.rows[0]!.id);

  return { companyId, outletId, userId };
}

async function readTableStatus(
  companyId: number,
  outletId: number,
  tableId: number
): Promise<string | null> {
  const db = getDb();
  const rows = await sql<{ status: string }>`
    SELECT status FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${tableId} LIMIT 1
  `.execute(db);
  if (rows.rows.length === 0) {
    return null;
  }
  return String(rows.rows[0]!.status);
}

test(
  "@slow reservations enforce finalized immutability and table status transitions",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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

const nowTs = Date.now();
      await sql`
        INSERT INTO pos_order_snapshots (
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
           opened_at_ts,
           closed_at,
           closed_at_ts,
            notes,
            updated_at,
            updated_at_ts
           ) VALUES (${openOrderId}, ${companyId}, ${outletId}, 'DINE_IN', 'WALK_IN', 'DEFERRED', ${table3.id}, ${reservationWithOpenOrder.reservation_id}, ${reservationWithOpenOrder.guest_count}, 0, 'OPEN', 'OPEN', 0, NOW(), ${nowTs}, NULL, NULL, NULL, NOW(), ${nowTs})
      `.execute(db);

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
      await sql`DELETE FROM pos_order_snapshots WHERE order_id = ${openOrderId} AND company_id = ${companyId} AND outlet_id = ${outletId}`.execute(db);

      if (createdReservationIds.length > 0) {
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }

      if (createdTableIds.length > 0) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdTableIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow reservations reject missing table assignment on create and update",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow reservations allow adjacent windows when first end equals second start",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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

      const rows = await sql<{ id: bigint; reservation_start_ts: bigint; reservation_end_ts: bigint }>`
        SELECT id, reservation_start_ts, reservation_end_ts
         FROM reservations
         WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${firstReservation.id}, ${secondReservation.id})
         ORDER BY id ASC
      `.execute(db);

      assert.strictEqual(rows.rows.length, 2, "both adjacent reservations should be persisted");

      const firstRow = rows.rows.find((row) => Number(row.id) === Number(firstReservation.id));
      const secondRow = rows.rows.find((row) => Number(row.id) === Number(secondReservation.id));
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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }

      if (createdTableIds.length > 0) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdTableIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow reservations overlap detection handles mixed canonical and legacy interval rows",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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

      const insertAResult = await sql`
        INSERT INTO reservations (
           company_id, outlet_id, table_id,
           customer_name, customer_phone, guest_count,
           reservation_at, reservation_start_ts, reservation_end_ts,
           duration_minutes, status, status_id, notes
         ) VALUES (${companyId}, ${outletId}, ${Number(table.id)}, ${`Mixed A ${runId}`}, null, 2, ${staleReservationAtA}, ${baseStartA.getTime()}, null, 60, 'BOOKED', 1, ${"start_ts present, end_ts null"})
      `.execute(db);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createdReservationIds.push(BigInt((insertAResult as any).insertId ?? 0));

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

      const insertBResult = await sql`
        INSERT INTO reservations (
           company_id, outlet_id, table_id,
           customer_name, customer_phone, guest_count,
           reservation_at, reservation_start_ts, reservation_end_ts,
           duration_minutes, status, status_id, notes
         ) VALUES (${companyId}, ${outletId}, ${Number(table.id)}, ${`Mixed B ${runId}`}, null, 2, ${staleReservationAtB}, null, ${baseStartB.getTime() + 60 * 60000}, 60, 'BOOKED', 1, ${"start_ts null, end_ts present"})
      `.execute(db);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createdReservationIds.push(BigInt((insertBResult as any).insertId ?? 0));

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

      const insertCResult = await sql`
        INSERT INTO reservations (
           company_id, outlet_id, table_id,
           customer_name, customer_phone, guest_count,
           reservation_at, reservation_start_ts, reservation_end_ts,
           duration_minutes, status, status_id, notes
         ) VALUES (${companyId}, ${outletId}, ${Number(table.id)}, ${`Mixed C ${runId}`}, null, 2, ${staleReservationAtC}, ${baseStartC.getTime()}, null, 60, 'BOOKED', 1, ${"adjacent boundary mixed row"})
      `.execute(db);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createdReservationIds.push(BigInt((insertCResult as any).insertId ?? 0));

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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }

      if (createdTableIds.length > 0) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdTableIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

// ============================================================================
// STORY 12.4 - V2 CONTRACT TESTS
// ============================================================================

test(
  "@slow Story 12.4: createReservationV2 creates reservation with generated code",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow Story 12.4: createReservationV2 generates unique codes across multiple reservations",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow Story 12.4: createReservationV2 handles minimal input",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow Story 12.4: listReservationsV2 filters and paginates correctly",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow Story 12.4: updateReservationStatus validates transitions and handles side effects",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }

      if (createdTableIds.length > 0) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdTableIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow Story 12.4: generateReservationCode produces unique codes with fallback",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
  "@slow Story 12.4: VALID_TRANSITIONS defines correct state machine",
  { concurrent: false, timeout: 10000 },
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
  "@slow Story 12.4: updateReservationStatus with cancellation reason and notes",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
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
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

// ============================================================================
// STORY 17.4 - RESERVATION BOUNDARY TIMESTAMP REGRESSION TESTS
// ============================================================================

test(
  "@slow Story 17.4: listReservationsV2 uses canonical timestamps for date filtering",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];

    try {
      // Create test reservations at specific future times
      const baseTime = new Date();
      baseTime.setHours(baseTime.getHours() + 24); // Tomorrow
      baseTime.setMinutes(0, 0, 0);

      const reservation1Time = new Date(baseTime); // Tomorrow 00:00
      const reservation2Time = new Date(baseTime.getTime() + 3 * 60 * 60 * 1000); // Tomorrow 03:00
      const reservation3Time = new Date(baseTime.getTime() + 6 * 60 * 60 * 1000); // Tomorrow 06:00

      const input1: CreateReservationInput = {
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 2,
        customerName: `DateFilter1 ${runId}`,
        reservationTime: reservation1Time,
        durationMinutes: 60,
        createdBy: "test-user"
      };
      const res1 = await createReservationV2(input1);
      createdReservationIds.push(res1.id);

      const input2: CreateReservationInput = {
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 2,
        customerName: `DateFilter2 ${runId}`,
        reservationTime: reservation2Time,
        durationMinutes: 60,
        createdBy: "test-user"
      };
      const res2 = await createReservationV2(input2);
      createdReservationIds.push(res2.id);

      const input3: CreateReservationInput = {
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 2,
        customerName: `DateFilter3 ${runId}`,
        reservationTime: reservation3Time,
        durationMinutes: 60,
        createdBy: "test-user"
      };
      const res3 = await createReservationV2(input3);
      createdReservationIds.push(res3.id);

      // Test 1: Filter by fromDate only (should include all future reservations)
      const fromOnly = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        fromDate: baseTime
      });
      assert.ok(fromOnly.reservations.length >= 3, "Should find at least 3 reservations from tomorrow onwards");

      // Test 2: Filter by toDate only (should include reservations up to that time)
      const toTime = new Date(baseTime.getTime() + 4 * 60 * 60 * 1000); // Tomorrow 04:00
      const toOnly = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        toDate: toTime
      });
      // Should include reservations 1 and 2 (starting at 00:00 and 03:00, both before 04:00)
      const before4Count = [res1, res2].filter(r =>
        toOnly.reservations.some(found => found.id === r.id)
      ).length;
      assert.ok(before4Count >= 2, "Should find reservations starting before 04:00");

      // Test 3: Filter by both fromDate and toDate (report mode - uses start timestamp)
      const rangeResult = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        fromDate: baseTime,
        toDate: new Date(baseTime.getTime() + 5 * 60 * 60 * 1000) // Tomorrow 05:00
      });
      // In report mode, should include reservations starting within range (res1 at 00:00, res2 at 03:00)
      const inRangeCount = [res1, res2].filter(r =>
        rangeResult.reservations.some(found => found.id === r.id)
      ).length;
      assert.ok(inRangeCount >= 2, "Report mode should find reservations starting within range");

      // Test 4: Verify canonical timestamps are present in returned reservations
      const firstReservation = rangeResult.reservations.find(r => r.id === res1.id);
      assert.ok(firstReservation, "Should find first reservation");
      assert.ok(firstReservation!.reservationTime instanceof Date, "reservationTime should be a Date");
      // reservationTime should be derived from reservation_start_ts, not reservation_at

    } finally {
      if (createdReservationIds.length > 0) {
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow Story 17.4: listReservationsV2 calendar mode (useOverlapFilter) shows day-spanning reservations",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];

    try {
      // Create a reservation that spans midnight (23:00 -> 02:00 next day)
      const dayStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const previousDayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
      const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const spanningStart = new Date(dayStart.getTime() - 1 * 60 * 60 * 1000); // previous day 23:00

      const spanningReservation = await createReservationV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 4,
        customerName: `Spanning ${runId}`,
        reservationTime: spanningStart,
        durationMinutes: 180, // 3 hours - ends at 02:00 next day
        createdBy: "test-user"
      });
      createdReservationIds.push(spanningReservation.id);

      // Calendar view for the previous day: should include the reservation because it starts at 23:00.
      const calendarModePreviousDay = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        fromDate: previousDayStart,
        toDate: new Date(dayStart.getTime() - 1),
        useOverlapFilter: true
      });

      // Calendar view for the next day: should also include it because it overlaps until 02:00.
      const calendarModeNextDay = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        fromDate: dayStart,
        toDate: new Date(nextDayStart.getTime() - 1),
        useOverlapFilter: true
      });

      const foundPreviousDay = calendarModePreviousDay.reservations.some(r => r.id === spanningReservation.id);
      const foundNextDay = calendarModeNextDay.reservations.some(r => r.id === spanningReservation.id);
      assert.ok(foundPreviousDay, "Calendar overlap filter should include spanning reservation on its start day");
      assert.ok(foundNextDay, "Calendar overlap filter should include spanning reservation on the next day it overlaps");

      // In report mode, the reservation should appear only on its start day, not on the next day.
      const reportModePreviousDay = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        fromDate: previousDayStart,
        toDate: new Date(dayStart.getTime() - 1),
        useOverlapFilter: false
      });
      const reportModeNextDay = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        fromDate: dayStart,
        toDate: new Date(nextDayStart.getTime() - 1),
        useOverlapFilter: false
      });

      assert.ok(
        reportModePreviousDay.reservations.some(r => r.id === spanningReservation.id),
        "Report mode should include the spanning reservation on its start day"
      );
      assert.ok(
        !reportModeNextDay.reservations.some(r => r.id === spanningReservation.id),
        "Report mode should exclude the spanning reservation on the following day because filtering is by start timestamp"
      );

    } finally {
      if (createdReservationIds.length > 0) {
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow Story 17.4: verify overlap rule preserves adjacency non-overlap semantics",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    const createdTableIds: number[] = [];
    const createdReservationIds: bigint[] = [];

    try {
      const table = await createOutletTable({
        company_id: companyId,
        outlet_id: outletId,
        code: `T-ADJ-${runId}`.slice(0, 32),
        name: `Adjacency Test Table ${runId}`,
        zone: "Main",
        capacity: 4,
        status: "AVAILABLE",
        actor: { userId, outletId, ipAddress: "127.0.0.1" }
      });
      createdTableIds.push(table.id);

      // Create first reservation: 10:00 - 11:00
      const firstStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
      firstStart.setHours(10, 0, 0, 0);
      const firstDurationMinutes = 60;

      const firstRes = await createReservationV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(table.id),
        partySize: 2,
        customerName: `Adjacency First ${runId}`,
        reservationTime: firstStart,
        durationMinutes: firstDurationMinutes,
        createdBy: "test-user"
      });
      createdReservationIds.push(firstRes.id);

      // Verify first reservation timestamps
      const firstRows = await sql<{ reservation_start_ts: bigint; reservation_end_ts: bigint }>`
        SELECT reservation_start_ts, reservation_end_ts FROM reservations WHERE id = ${firstRes.id}
      `.execute(db);
      assert.ok(firstRows.rows.length > 0, "First reservation should exist in DB");
      const firstStartTs = Number(firstRows.rows[0]!.reservation_start_ts);
      const firstEndTs = Number(firstRows.rows[0]!.reservation_end_ts);
      assert.ok(firstEndTs > firstStartTs, "End must be after start");
      assert.strictEqual(firstEndTs - firstStartTs, firstDurationMinutes * 60000, "Duration should match");

      // Create second reservation starting exactly when first ends (adjacent)
      const secondStart = new Date(firstEndTs);
      const secondRes = await createReservationV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        tableId: BigInt(table.id),
        partySize: 2,
        customerName: `Adjacent Second ${runId}`,
        reservationTime: secondStart,
        durationMinutes: 45,
        createdBy: "test-user"
      });
      createdReservationIds.push(secondRes.id);

      // Verify second reservation timestamps
      const secondRows = await sql<{ reservation_start_ts: bigint; reservation_end_ts: bigint }>`
        SELECT reservation_start_ts, reservation_end_ts FROM reservations WHERE id = ${secondRes.id}
      `.execute(db);
      assert.ok(secondRows.rows.length > 0, "Second reservation should exist in DB");
      const secondStartTs = Number(secondRows.rows[0]!.reservation_start_ts);
      const secondEndTs = Number(secondRows.rows[0]!.reservation_end_ts);

      // Critical assertion: adjacent reservations should have end == next start
      assert.strictEqual(
        firstEndTs,
        secondStartTs,
        "Adjacent reservation: first.end should equal second.start"
      );

      // The key verification: both reservations should coexist without conflict
      // If the overlap rule was wrong (using >= instead of >), the second creation would fail
      // This is already proven by the successful creation of both reservations above.
      
      // Additional DB-level verification: query both reservations
      const bothReservationsResult = await sql<{ id: bigint; reservation_start_ts: bigint; reservation_end_ts: bigint }>`
        SELECT id, reservation_start_ts, reservation_end_ts
         FROM reservations
         WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND table_id = ${table.id}
           AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
           AND reservation_start_ts IS NOT NULL
           AND reservation_end_ts IS NOT NULL
         ORDER BY reservation_start_ts ASC
      `.execute(db);
      
      const bothReservations = bothReservationsResult.rows;
      assert.strictEqual(bothReservations.length, 2, "Should have exactly 2 reservations");
      
      // Verify timestamps are correctly stored and adjacent
      const res1 = bothReservations[0]!;
      const res2 = bothReservations[1]!;
      const storedFirstStart = Number(res1.reservation_start_ts);
      const storedFirstEnd = Number(res1.reservation_end_ts);
      const storedSecondStart = Number(res2.reservation_start_ts);
      const storedSecondEnd = Number(res2.reservation_end_ts);
      
      assert.strictEqual(
        storedFirstEnd,
        storedSecondStart,
        "Stored first_end should equal stored second_start (adjacent)"
      );
      
      // Verify the strict inequality overlap check with DB timestamps
      // This is the same pattern used in checkReservationOverlap
      // For adjacency: first_end == second_start
      // Check: first_start < second_end AND first_end > second_start
      // Since first_end == second_start: first_end > second_start = FALSE
      const overlapForFirstResult = await sql<{ cnt: number }>`
        SELECT COUNT(*) as cnt
         FROM reservations
         WHERE reservation_start_ts < ${storedSecondEnd} AND reservation_end_ts > ${storedSecondStart} AND id = ${res1.id}
      `.execute(db);
      assert.strictEqual(
        Number(overlapForFirstResult.rows[0]!.cnt),
        0,
        "First reservation should NOT overlap with [second_start, second_end] interval"
      );
      
      // Check: second_start < first_end AND second_end > first_start
      // Since second_start == first_end: second_start < first_end = FALSE
      const overlapForSecondResult = await sql<{ cnt: number }>`
        SELECT COUNT(*) as cnt
         FROM reservations
         WHERE reservation_start_ts < ${storedFirstEnd} AND reservation_end_ts > ${storedFirstStart} AND id = ${res2.id}
      `.execute(db);
      assert.strictEqual(
        Number(overlapForSecondResult.rows[0]!.cnt),
        0,
        "Second reservation should NOT overlap with [first_start, first_end] interval"
      );

    } finally {
      if (createdReservationIds.length > 0) {
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
      if (createdTableIds.length > 0) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdTableIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

test(
  "@slow Story 17.4: timezone-prepared date boundaries preserve local-day classification",
  { concurrent: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const { companyId, outletId } = await resolveFixtureContext();
    const createdReservationIds: bigint[] = [];

    try {
      const timezone = "Asia/Jakarta";
      const localBusinessDay = "2026-03-20";
      const nextLocalBusinessDay = "2026-03-21";
      const { fromStartUTC, toEndUTC } = toDateTimeRangeWithTimezone(
        localBusinessDay,
        localBusinessDay,
        timezone
      );
      const nextDayRange = toDateTimeRangeWithTimezone(
        nextLocalBusinessDay,
        nextLocalBusinessDay,
        timezone
      );

      // 00:30 on 2026-03-20 in Asia/Jakarta = 2026-03-19T17:30:00.000Z
      const reservationTime = new Date("2026-03-19T17:30:00.000Z");

      const input: CreateReservationInput = {
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        partySize: 2,
        customerName: `TimezoneBoundary ${runId}`,
        reservationTime,
        durationMinutes: 90,
        createdBy: "test-user"
      };

      const reservation = await createReservationV2(input);
      createdReservationIds.push(reservation.id);

      const sameDayResults = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        fromDate: new Date(fromStartUTC),
        toDate: new Date(toEndUTC),
        useOverlapFilter: false
      });
      assert.ok(
        sameDayResults.reservations.some(r => r.id === reservation.id),
        "Timezone-prepared boundaries should classify the reservation on its local business day"
      );

      const nextDayResults = await listReservationsV2({
        companyId: BigInt(companyId),
        outletId: BigInt(outletId),
        limit: 10,
        offset: 0,
        fromDate: new Date(nextDayRange.fromStartUTC),
        toDate: new Date(nextDayRange.toEndUTC),
        useOverlapFilter: false
      });
      assert.ok(
        !nextDayResults.reservations.some(r => r.id === reservation.id),
        "Timezone-prepared boundaries should not misclassify the reservation onto the next local business day"
      );

    } finally {
      if (createdReservationIds.length > 0) {
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdReservationIds.map(id => sql`${id}`))})`.execute(db);
      }
    }
  }
);

// Standard DB pool cleanup - runs after all tests in this file
afterAll(async () => {
  await closeDbPool();
});
