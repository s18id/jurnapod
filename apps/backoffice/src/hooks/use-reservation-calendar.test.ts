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
    assert.strictEqual(query?.date_from, "2026-03-20");
    assert.strictEqual(query?.date_to, "2026-03-20");
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

  test("toDateKeyInTimeZone maps UTC timestamp to target timezone day", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const key = moduleRef.toDateKeyInTimeZone(new Date("2026-03-19T15:29:52.000Z"), "Asia/Tokyo");
    assert.strictEqual(key, "2026-03-20");
  });

  test("getReservationDurationMinutes uses configurable default for null duration", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const value = moduleRef.getReservationDurationMinutes({ duration_minutes: null }, 150);
    assert.strictEqual(value, 150);
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

  test("does not mark sequential same-table reservations as overlapping", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const first = {
      reservation_id: 3,
      company_id: 1,
      outlet_id: 1,
      table_id: 10,
      customer_name: "A",
      customer_phone: null,
      guest_count: 2,
      reservation_at: "2026-03-20T10:00:00.000Z",
      duration_minutes: 60,
      status: "CONFIRMED" as const,
      notes: null,
      linked_order_id: null,
      created_at: "2026-03-20T08:00:00.000Z",
      updated_at: "2026-03-20T08:00:00.000Z",
      arrived_at: null,
      seated_at: null,
      cancelled_at: null
    };
    const second = {
      ...first,
      reservation_id: 4,
      customer_name: "B",
      reservation_at: "2026-03-20T11:00:00.000Z"
    };

    assert.strictEqual(moduleRef.isOverlappingReservation(first, second), false);
    const overlaps = moduleRef.getOverlappingReservationIds([first, second]);
    assert.strictEqual(overlaps.size, 0);
  });

  test("buildReservationTimelineByDay creates off-hour blocks", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const days = moduleRef.createCalendarDaysInTimeZone(new Date("2026-03-20T00:00:00.000Z"), "day", "UTC");
    const timeline = moduleRef.buildReservationTimelineByDay(days, [
      {
        reservation_id: 20,
        company_id: 1,
        outlet_id: 1,
        table_id: 12,
        customer_name: "Off Hour",
        customer_phone: null,
        guest_count: 2,
        reservation_at: "2026-03-20T10:30:00.000Z",
        duration_minutes: 75,
        status: "CONFIRMED" as const,
        notes: null,
        linked_order_id: null,
        created_at: "2026-03-20T08:00:00.000Z",
        updated_at: "2026-03-20T08:00:00.000Z",
        arrived_at: null,
        seated_at: null,
        cancelled_at: null
      }
    ], "UTC");

    const blocks = timeline[days[0]!.key]![12]!;
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0]!.startMinute, 10 * 60 + 30);
    assert.strictEqual(blocks[0]!.endMinute, 11 * 60 + 45);
  });

  test("buildReservationTimelineByDay keeps finalized reservations visible", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const days = moduleRef.createCalendarDaysInTimeZone(new Date("2026-03-20T00:00:00.000Z"), "day", "UTC");
    const timeline = moduleRef.buildReservationTimelineByDay(days, [
      {
        reservation_id: 21,
        company_id: 1,
        outlet_id: 1,
        table_id: 12,
        customer_name: "Completed Guest",
        customer_phone: null,
        guest_count: 2,
        reservation_at: "2026-03-20T10:30:00.000Z",
        duration_minutes: 60,
        status: "COMPLETED" as const,
        notes: null,
        linked_order_id: null,
        created_at: "2026-03-20T08:00:00.000Z",
        updated_at: "2026-03-20T08:00:00.000Z",
        arrived_at: null,
        seated_at: null,
        cancelled_at: null
      }
    ], "UTC");

    const blocks = timeline[days[0]!.key]![12]!;
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0]!.status, "COMPLETED");
  });

  test("groupReservationsByDay uses outlet timezone boundaries", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const days = moduleRef.createCalendarDaysInTimeZone(new Date("2026-03-20T00:00:00.000Z"), "day", "Asia/Tokyo");
    const grouped = moduleRef.groupReservationsByDay(
      days,
      [
        {
          reservation_id: 31,
          company_id: 1,
          outlet_id: 1,
          table_id: 9,
          customer_name: "Tokyo",
          customer_phone: null,
          guest_count: 2,
          reservation_at: "2026-03-19T15:29:52.000Z",
          duration_minutes: 90,
          status: "BOOKED" as const,
          notes: null,
          linked_order_id: null,
          created_at: "2026-03-19T07:29:52.000Z",
          updated_at: "2026-03-19T07:29:52.000Z",
          arrived_at: null,
          seated_at: null,
          cancelled_at: null
        }
      ],
      "Asia/Tokyo"
    );

    assert.strictEqual(grouped[days[0]!.key]!.length, 1);
    assert.strictEqual(grouped[days[0]!.key]![0]!.reservation_id, 31);
  });

  test("timezone boundary reservation shows on local day lane", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const boundaryReservation = {
      reservation_id: 44,
      company_id: 1,
      outlet_id: 1,
      table_id: 3396,
      customer_name: "Boundary Guest",
      customer_phone: null,
      guest_count: 2,
      reservation_at: "2026-03-18T23:52:36.000Z",
      duration_minutes: null,
      status: "BOOKED" as const,
      notes: null,
      linked_order_id: null,
      created_at: "2026-03-18T22:52:36.000Z",
      updated_at: "2026-03-18T22:52:36.000Z",
      arrived_at: null,
      seated_at: null,
      cancelled_at: null
    };

    const day19 = moduleRef.createCalendarDaysInTimeZone(new Date("2026-03-19T00:00:00.000Z"), "day", "Asia/Jakarta");
    const grouped = moduleRef.groupReservationsByDay(day19, [boundaryReservation], "Asia/Jakarta");
    const timeline = moduleRef.buildReservationTimelineByDay(day19, [boundaryReservation], "Asia/Jakarta", 120);

    assert.strictEqual(day19[0]!.key, "2026-03-19");
    assert.strictEqual(grouped["2026-03-19"]!.length, 1);
    assert.strictEqual(grouped["2026-03-19"]![0]!.reservation_id, 44);
    assert.strictEqual(timeline["2026-03-19"]![3396]!.length, 1);
    assert.strictEqual(timeline["2026-03-19"]![3396]![0]!.startMinute, 6 * 60 + 52);
  });

  test("day mode mapping keeps API-filtered rows on selected day key", async () => {
    const moduleRef = await import("./use-reservation-calendar");
    const day20 = moduleRef.createCalendarDaysInTimeZone(new Date("2026-03-20T00:00:00.000Z"), "day", "Asia/Jakarta");
    const rows = [
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
        status: "BOOKED" as const,
        notes: null,
        linked_order_id: null,
        created_at: "2026-03-19T07:29:52.000Z",
        updated_at: "2026-03-19T07:29:52.000Z",
        arrived_at: null,
        seated_at: null,
        cancelled_at: null
      }
    ];

    const mapped = moduleRef.mapReservationsToCalendarDays({
      viewMode: "day",
      days: day20,
      reservations: rows,
      timeZone: "Asia/Jakarta"
    });

    assert.strictEqual(mapped["2026-03-20"]!.length, 1);
    assert.strictEqual(mapped["2026-03-20"]![0]!.reservation_id, 1573);
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
