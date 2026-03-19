// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("useReservationCalendar helpers", () => {
  test("buildReservationCalendarQuery serializes day range", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const query = moduleRef.buildReservationCalendarQuery({
      outletId: 9,
      viewMode: "day",
      anchorDate: new Date("2026-03-20T08:00:00.000Z"),
      status: null
    });

    assert.strictEqual(query?.outlet_id, 9);
    assert.ok(query?.from?.includes("T"));
    assert.ok(query?.to?.includes("T"));
    assert.strictEqual(query?.limit, 200);
  });

  test("createCalendarDays returns 7 days for week mode", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const days = moduleRef.createCalendarDays(new Date("2026-03-20T00:00:00.000Z"), "week");
    assert.strictEqual(days.length, 7);
    assert.strictEqual(days[0]?.key <= days[1]?.key, true);
  });

  test("toLocalDateKey uses local calendar date", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const key = moduleRef.toLocalDateKey(new Date(2026, 2, 20, 0, 15, 0, 0));
    assert.strictEqual(key, "2026-03-20");
  });

  test("detects overlapping reservations for same table", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const rows = [
      {
        reservation_id: 1,
        company_id: 1,
        outlet_id: 1,
        table_id: 10,
        customer_name: "A",
        customer_phone: null,
        guest_count: 2,
        reservation_at: "2026-03-20T10:00:00.000Z",
        duration_minutes: 120,
        status: "CONFIRMED" as const,
        notes: null,
        linked_order_id: null,
        created_at: "2026-03-20T08:00:00.000Z",
        updated_at: "2026-03-20T08:00:00.000Z",
        arrived_at: null,
        seated_at: null,
        cancelled_at: null
      },
      {
        reservation_id: 2,
        company_id: 1,
        outlet_id: 1,
        table_id: 10,
        customer_name: "B",
        customer_phone: null,
        guest_count: 2,
        reservation_at: "2026-03-20T11:00:00.000Z",
        duration_minutes: 60,
        status: "BOOKED" as const,
        notes: null,
        linked_order_id: null,
        created_at: "2026-03-20T08:00:00.000Z",
        updated_at: "2026-03-20T08:00:00.000Z",
        arrived_at: null,
        seated_at: null,
        cancelled_at: null
      }
    ];

    const overlaps = moduleRef.getOverlappingReservationIds(rows);
    assert.strictEqual(overlaps.has(1), true);
    assert.strictEqual(overlaps.has(2), true);
  });

  test("buildDailyUtilization counts booked unique tables", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const days = moduleRef.createCalendarDays(new Date("2026-03-20T00:00:00.000Z"), "day");
    const dayKey = days[0]!.key;
    const utilization = moduleRef.buildDailyUtilization(
      days,
      {
        [dayKey]: [
          {
            reservation_id: 11,
            company_id: 1,
            outlet_id: 1,
            table_id: 100,
            customer_name: "A",
            customer_phone: null,
            guest_count: 2,
            reservation_at: "2026-03-20T12:00:00.000Z",
            duration_minutes: 90,
            status: "CONFIRMED" as const,
            notes: null,
            linked_order_id: null,
            created_at: "2026-03-20T08:00:00.000Z",
            updated_at: "2026-03-20T08:00:00.000Z",
            arrived_at: null,
            seated_at: null,
            cancelled_at: null
          },
          {
            reservation_id: 12,
            company_id: 1,
            outlet_id: 1,
            table_id: 100,
            customer_name: "B",
            customer_phone: null,
            guest_count: 3,
            reservation_at: "2026-03-20T15:00:00.000Z",
            duration_minutes: 60,
            status: "BOOKED" as const,
            notes: null,
            linked_order_id: null,
            created_at: "2026-03-20T08:00:00.000Z",
            updated_at: "2026-03-20T08:00:00.000Z",
            arrived_at: null,
            seated_at: null,
            cancelled_at: null
          }
        ]
      },
      8
    );

    assert.strictEqual(utilization[0]?.bookedTables, 1);
    assert.strictEqual(utilization[0]?.availableTables, 8);
  });
});
