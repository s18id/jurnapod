// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("useReservations API parsing", () => {
  test("extracts reservation rows from API envelope", async () => {
    const moduleRef = await import("./use-reservations");
    const payload = {
      success: true,
      data: [
        {
          reservation_id: 1573,
          company_id: 1,
          outlet_id: 1,
          table_id: 3396,
          customer_name: "Reserved Guest",
          customer_phone: null,
          guest_count: 2,
          reservation_at: "2026-03-19T15:29:52.000Z",
          duration_minutes: null,
          status: "BOOKED",
          notes: null,
          linked_order_id: null,
          created_at: "2026-03-19T07:29:52.000Z",
          updated_at: "2026-03-19T07:29:52.000Z",
          arrived_at: null,
          seated_at: null,
          cancelled_at: null
        }
      ]
    };

    const rows = moduleRef.extractReservationRowsFromApiPayload(payload);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]!.reservation_id, 1573);
    assert.strictEqual(rows[0]!.reservation_at, "2026-03-19T15:29:52.000Z");
  });

  test("ignores malformed rows and keeps valid entries", async () => {
    const moduleRef = await import("./use-reservations");
    const payload = {
      success: true,
      data: [
        { reservation_id: 1 },
        {
          reservation_id: 239,
          company_id: 1,
          outlet_id: 1,
          table_id: null,
          customer_name: "Walk-in",
          customer_phone: null,
          guest_count: 2,
          reservation_at: "2026-03-18T23:55:14.000Z",
          duration_minutes: 90,
          status: "BOOKED",
          notes: null,
          linked_order_id: null,
          created_at: "2026-03-18T22:55:14.000Z",
          updated_at: "2026-03-18T22:55:14.000Z",
          arrived_at: null,
          seated_at: null,
          cancelled_at: null
        }
      ]
    };

    const rows = moduleRef.extractReservationRowsFromApiPayload(payload);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]!.reservation_id, 239);
  });
});
