// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import {
  createIntegrationTestContext,
  loginOwner,
  readEnv,
  TEST_TIMEOUT_MS
} from "../../../tests/integration/integration-harness.mjs";
import {
  applyDateOnlyRange,
  MissingReservationTimezoneError,
  pickReservationTimezone
} from "./route";

function toDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (name: "year" | "month" | "day") =>
    parts.find((item) => item.type === name)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

test("pickReservationTimezone prefers outlet then company", () => {
  assert.strictEqual(pickReservationTimezone("Asia/Jakarta", "Asia/Tokyo"), "Asia/Jakarta");
  assert.strictEqual(pickReservationTimezone("", "Asia/Tokyo"), "Asia/Tokyo");
  assert.strictEqual(pickReservationTimezone(" ", " "), null);
});

test("applyDateOnlyRange rejects missing timezone for date-only filters", () => {
  assert.throws(
    () =>
      applyDateOnlyRange(
        {
          outlet_id: 1,
          date_from: "2026-03-20",
          date_to: "2026-03-20",
          limit: 50,
          offset: 0
        },
        null
      ),
    (error: unknown) => error instanceof MissingReservationTimezoneError
  );
});

const testContext = createIntegrationTestContext();
let baseUrl = "";
let db: Pool | null = null;

test.before(async () => {
  await testContext.start();
  baseUrl = testContext.baseUrl;
  db = testContext.db;
});

test.after(async () => {
  await testContext.stop();
});

test(
  "GET /api/reservations date_from/date_to filters by outlet/company timezone day",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    if (!db) {
      throw new Error("Database pool not initialized");
    }

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", null) ?? "password123";
    const outletCode = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";

    const [ownerRows] = await db.execute<RowDataPacket[]>(
      `SELECT u.id AS user_id,
              u.company_id,
              o.id AS outlet_id,
              o.timezone AS outlet_timezone,
              c.timezone AS company_timezone
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       INNER JOIN user_outlets uo ON uo.user_id = u.id
       INNER JOIN outlets o ON o.id = uo.outlet_id
       WHERE c.code = ?
         AND u.email = ?
         AND o.code = ?
         AND u.is_active = 1
       LIMIT 1`,
      [companyCode, ownerEmail, outletCode]
    );

    assert.ok(ownerRows.length > 0, "Owner fixture not found; run database seed first");
    const outletId = Number(ownerRows[0].outlet_id);
    const companyId = Number(ownerRows[0].company_id);
    const timezone =
      pickReservationTimezone(
        ownerRows[0].outlet_timezone == null ? null : String(ownerRows[0].outlet_timezone),
        ownerRows[0].company_timezone == null ? null : String(ownerRows[0].company_timezone)
      ) ?? "UTC";

    const token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    };

    const now = Date.now();
    const firstAt = new Date(now + 2 * 60 * 60 * 1000);
    let secondAt = new Date(now + 38 * 60 * 60 * 1000);
    const firstDateKey = toDateKeyInTimeZone(firstAt, timezone);
    if (toDateKeyInTimeZone(secondAt, timezone) === firstDateKey) {
      secondAt = new Date(now + 72 * 60 * 60 * 1000);
    }

    const createdReservationIds: number[] = [];

    try {
      const firstCreate = await fetch(`${baseUrl}/api/reservations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          outlet_id: outletId,
          table_id: null,
          customer_name: `DateRange A ${Date.now()}`,
          customer_phone: null,
          guest_count: 2,
          reservation_at: firstAt.toISOString(),
          duration_minutes: 90,
          notes: null
        })
      });
      const firstPayload = await firstCreate.json();
      assert.strictEqual(firstCreate.status, 201, JSON.stringify(firstPayload));
      createdReservationIds.push(Number(firstPayload.data.reservation_id));

      const secondCreate = await fetch(`${baseUrl}/api/reservations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          outlet_id: outletId,
          table_id: null,
          customer_name: `DateRange B ${Date.now()}`,
          customer_phone: null,
          guest_count: 2,
          reservation_at: secondAt.toISOString(),
          duration_minutes: 90,
          notes: null
        })
      });
      const secondPayload = await secondCreate.json();
      assert.strictEqual(secondCreate.status, 201, JSON.stringify(secondPayload));
      createdReservationIds.push(Number(secondPayload.data.reservation_id));

      const [createdRows] = await db.execute<RowDataPacket[]>(
        `SELECT id, reservation_start_ts, reservation_end_ts
         FROM reservations
         WHERE company_id = ? AND outlet_id = ? AND id IN (?, ?)
         ORDER BY id ASC`,
        [companyId, outletId, createdReservationIds[0], createdReservationIds[1]]
      );

      assert.strictEqual(createdRows.length, 2, "both created reservations should be persisted");
      for (const row of createdRows) {
        const reservationStartTs = row.reservation_start_ts == null ? null : Number(row.reservation_start_ts);
        const reservationEndTs = row.reservation_end_ts == null ? null : Number(row.reservation_end_ts);
        assert.ok(Number.isFinite(reservationStartTs), "reservation_start_ts should be populated");
        assert.ok(Number.isFinite(reservationEndTs), "reservation_end_ts should be populated");
        assert.ok(
          Number(reservationEndTs) > Number(reservationStartTs),
          "reservation_end_ts should be greater than reservation_start_ts"
        );
      }

      const listResponse = await fetch(
        `${baseUrl}/api/reservations?outlet_id=${outletId}&date_from=${firstDateKey}&date_to=${firstDateKey}&limit=200&offset=0`,
        { method: "GET", headers }
      );
      const listPayload = await listResponse.json();

      assert.strictEqual(listResponse.status, 200, JSON.stringify(listPayload));
      assert.ok(Array.isArray(listPayload.data));

      const reservationIds = new Set<number>(
        listPayload.data
          .map((row: { reservation_id?: number }) => Number(row.reservation_id))
          .filter((value: number) => Number.isFinite(value))
      );

      assert.ok(
        reservationIds.has(createdReservationIds[0]!),
        "date_from/date_to query should include reservation in selected timezone day"
      );
      assert.ok(
        !reservationIds.has(createdReservationIds[1]!),
        "date_from/date_to query should exclude reservation outside selected timezone day"
      );
    } finally {
      if (createdReservationIds.length > 0) {
        await db.execute(
          `DELETE FROM reservations WHERE company_id = ? AND outlet_id = ? AND id IN (${createdReservationIds.map(() => "?").join(",")})`,
          [companyId, outletId, ...createdReservationIds]
        );
      }
    }
  }
);
