// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { loadEnvIfPresent, readEnv } from "../../tests/integration/integration-harness.mjs";
import { getDb, closeDbPool } from "./db";
import { createOutletTablesBulk, deleteOutletTable, OutletTableBulkConflictError } from "./outlet-tables";
import { OutletTableBulkCreateRequestSchema } from "@jurnapod/shared";

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
  const userRows = await sql`
    SELECT c.id AS company_id, u.id AS user_id
     FROM companies c
     INNER JOIN users u ON u.company_id = c.id
     INNER JOIN user_role_assignments ura ON ura.user_id = u.id
     WHERE c.code = ${companyCode} AND u.email = ${ownerEmail} AND ura.outlet_id IS NULL
     LIMIT 1
  `.execute(db);

  assert.ok(userRows.rows.length > 0, "Fixture company/outlet/user not found; run seed first");
  const companyId = Number((userRows.rows[0] as { company_id: number }).company_id);
  const userId = Number((userRows.rows[0] as { user_id: number }).user_id);

  // Get outlet ID from outlets table
  const outletRows = await sql`
    SELECT id FROM outlets WHERE company_id = ${companyId} AND code = ${outletCode} LIMIT 1
  `.execute(db);
  assert.ok(outletRows.rows.length > 0, "Outlet not found");
  const outletId = Number((outletRows.rows[0] as { id: number }).id);

  return { companyId, outletId, userId };
}

async function readTableStatus(companyId: number, outletId: number, tableId: number): Promise<string | null> {
  const db = getDb();
  const rows = await sql`
    SELECT status FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${tableId} LIMIT 1
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  return String((rows.rows[0] as { status: string }).status);
}

const VALID_OUTLET_ID = 1;

function buildValidBulkPayload(overrides: Record<string, unknown> = {}) {
  return {
    outlet_id: VALID_OUTLET_ID,
    code_template: "T-{seq}",
    name_template: "Table {seq}",
    start_seq: 1,
    count: 3,
    zone: "Test",
    capacity: 4,
    ...overrides
  };
}

test(
  "deleteOutletTable rejects tables with active dine-in orders",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const orderId = `ord-del-${runId}`;
    const { companyId, outletId, userId } = await resolveFixtureContext();
    let tableId: number | null = null;

    try {
      const tableInsert = await sql`
        INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
         VALUES (${companyId}, ${outletId}, ${`TD-${runId}`.slice(0, 32)}, ${`Delete Guard ${runId}`}, "Main", 4, 'AVAILABLE', 1)
      `.execute(db);
      tableId = Number(tableInsert.insertId);
      const createdTableId = tableId;

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
          ) VALUES (${orderId}, ${companyId}, ${outletId}, 'DINE_IN', 'WALK_IN', 'DEFERRED', ${createdTableId}, NULL, 2, 0, 'OPEN', 'OPEN', 0, NOW(), ${nowTs}, NULL, NULL, NULL, NOW(), ${nowTs})
      `.execute(db);

      await assert.rejects(
        async () => {
          await deleteOutletTable({
            companyId,
            outletId,
            tableId: createdTableId,
            actor: {
              userId,
              outletId,
              ipAddress: "127.0.0.1"
            }
          });
        },
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /active dine-in orders/i);
          return true;
        }
      );

      assert.equal(await readTableStatus(companyId, outletId, createdTableId), "AVAILABLE");
    } finally {
      await sql`DELETE FROM pos_order_snapshots WHERE order_id = ${orderId} AND company_id = ${companyId} AND outlet_id = ${outletId}`.execute(db);

      if (tableId !== null) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${tableId}`.execute(db);
      }
    }
  }
);

test(
  "deleteOutletTable rejects tables with reservation history",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    let tableId: number | null = null;
    let reservationId: number | null = null;

    try {
      const tableInsert = await sql`
        INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
         VALUES (${companyId}, ${outletId}, ${`TR-${runId}`.slice(0, 32)}, ${`History Guard ${runId}`}, "Main", 4, 'AVAILABLE', 1)
      `.execute(db);
      tableId = Number(tableInsert.insertId);

      const reservationInsert = await sql`
        INSERT INTO reservations (
           company_id,
           outlet_id,
           table_id,
           customer_name,
           customer_phone,
           guest_count,
           reservation_at,
           duration_minutes,
           status,
           status_id,
           notes
        ) VALUES (${companyId}, ${outletId}, ${tableId}, ${`History ${runId}`}, NULL, 2, NOW(), 90, 'COMPLETED', 6, NULL)
      `.execute(db);
      reservationId = Number(reservationInsert.insertId);

      await assert.rejects(
        async () => {
          await deleteOutletTable({
            companyId,
            outletId,
            tableId: tableId!,
            actor: {
              userId,
              outletId,
              ipAddress: "127.0.0.1"
            }
          });
        },
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /reservations are linked to this table/i);
          return true;
        }
      );

      assert.equal(await readTableStatus(companyId, outletId, tableId), "AVAILABLE");
    } finally {
      if (reservationId !== null) {
        await sql`DELETE FROM reservations WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${reservationId}`.execute(db);
      }

      if (tableId !== null) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${tableId}`.execute(db);
      }
    }
  }
);

test(
  "bulk create rejects derived statuses at validation boundary",
  { concurrency: false, timeout: 30000 },
  async () => {
    const payloadReserved = buildValidBulkPayload({ status: "RESERVED" });
    const result = OutletTableBulkCreateRequestSchema.safeParse(payloadReserved);
    assert.equal(result.success, false, "Should reject derived status RESERVED");

    const payloadOccupied = buildValidBulkPayload({ status: "OCCUPIED" });
    const result2 = OutletTableBulkCreateRequestSchema.safeParse(payloadOccupied);
    assert.equal(result2.success, false, "Should reject derived status OCCUPIED");

    const payloadReservedInt = buildValidBulkPayload({ status_id: 2 });
    const result3 = OutletTableBulkCreateRequestSchema.safeParse(payloadReservedInt);
    assert.equal(result3.success, false, "Should reject derived status_id=2");

    const payloadAvailableInt = buildValidBulkPayload({ status_id: 1 });
    const result4 = OutletTableBulkCreateRequestSchema.safeParse(payloadAvailableInt);
    assert.equal(result4.success, true, "Should accept operational status_id=1");
  }
);

test(
  "bulk create duplicate generated codes returns 409",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    let createdTableIds: number[] = [];

    try {
      const collisionPrefix = `TC-${runId.toUpperCase()}`;
      const collisionCode = `${collisionPrefix}-1`;

      const existingTable = await sql`
        INSERT INTO outlet_tables (company_id, outlet_id, code, name, zone, capacity, status, status_id)
         VALUES (${companyId}, ${outletId}, ${collisionCode}, ${`Existing ${runId}`}, "Test", 4, 'AVAILABLE', 1)
      `.execute(db);
      createdTableIds.push(Number(existingTable.insertId));

      await assert.rejects(
        async () => {
          await createOutletTablesBulk({
            company_id: companyId,
            outlet_id: outletId,
            code_template: `${collisionPrefix}-{seq}`,
            name_template: "Table {seq}",
            start_seq: 1,
            count: 3,
            zone: "Test",
            capacity: 4,
            status: "AVAILABLE",
            actor: {
              userId,
              outletId,
              ipAddress: "127.0.0.1"
            }
          });
        },
        (error: unknown) => {
          assert.ok(error instanceof OutletTableBulkConflictError, "Should throw OutletTableBulkConflictError");
          assert.match(error.message, /already exists/i, "Error message should mention existing code");
          return true;
        }
      );
    } finally {
      if (createdTableIds.length > 0) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdTableIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      }
    }
  }
);

test(
  "bulk create succeeds with operational status only",
  { concurrency: false, timeout: 60000 },
  async () => {
    const db = getDb();
    const runId = Date.now().toString(36);
    const { companyId, outletId, userId } = await resolveFixtureContext();
    let createdTableIds: number[] = [];

    try {
      const tables = await createOutletTablesBulk({
        company_id: companyId,
        outlet_id: outletId,
        code_template: `BK-${runId}-{seq}`.slice(0, 28),
        name_template: "Bulk {seq}",
        start_seq: 1,
        count: 3,
        zone: "BulkZone",
        capacity: 2,
        status: "AVAILABLE",
        actor: {
          userId,
          outletId,
          ipAddress: "127.0.0.1"
        }
      });

      assert.equal(tables.length, 3, "Should create 3 tables");
      createdTableIds = tables.map((t) => t.id);

      for (const table of tables) {
        assert.equal(table.status, "AVAILABLE", "All tables should have AVAILABLE status");
        assert.equal(table.status_id, 1, "All tables should include status_id=1");
        assert.match(table.code, new RegExp(`^BK-${runId.toUpperCase()}-`), "Code should match template");
      }

    } finally {
      if (createdTableIds.length > 0) {
        await sql`DELETE FROM outlet_tables WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id IN (${sql.join(createdTableIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      }
    }
  }
);

test.after(async () => {
  await closeDbPool();
});
