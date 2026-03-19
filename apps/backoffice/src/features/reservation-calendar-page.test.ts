// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("Reservation Calendar page helpers", () => {
  test("maps check-in action by status", async () => {
    const pageModule = await import("./reservation-calendar-page");
    assert.strictEqual(pageModule.getCheckInTargetStatus("BOOKED"), "ARRIVED");
    assert.strictEqual(pageModule.getCheckInTargetStatus("CONFIRMED"), "ARRIVED");
    assert.strictEqual(pageModule.getCheckInTargetStatus("ARRIVED"), "SEATED");
    assert.strictEqual(pageModule.getCheckInTargetStatus("SEATED"), null);
  });

  test("suggests table options by capacity and overlap conflict", async () => {
    const pageModule = await import("./reservation-calendar-page");
    const options = pageModule.getSuggestedTableOptions({
      tables: [
        {
          id: 1,
          company_id: 1,
          outlet_id: 1,
          code: "T1",
          name: "Table 1",
          zone: null,
          capacity: 4,
          status: "AVAILABLE",
          status_id: 1,
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z"
        },
        {
          id: 2,
          company_id: 1,
          outlet_id: 1,
          code: "T2",
          name: "Table 2",
          zone: null,
          capacity: 2,
          status: "AVAILABLE",
          status_id: 1,
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z"
        }
      ],
      reservations: [
        {
          reservation_id: 99,
          company_id: 1,
          outlet_id: 1,
          table_id: 1,
          customer_name: "Busy",
          customer_phone: null,
          guest_count: 2,
          reservation_at: "2026-03-20T10:00:00.000Z",
          duration_minutes: 120,
          status: "CONFIRMED",
          notes: null,
          linked_order_id: null,
          created_at: "2026-03-20T08:00:00.000Z",
          updated_at: "2026-03-20T08:00:00.000Z",
          arrived_at: null,
          seated_at: null,
          cancelled_at: null
        }
      ],
      guestCount: 2,
      reservationAt: new Date("2026-03-20T10:30:00.000Z"),
      durationMinutes: 60,
      editingReservationId: null
    });

    assert.strictEqual(options.some((row: { value: string }) => row.value === "1"), false);
    assert.strictEqual(options.some((row: { value: string }) => row.value === "2"), true);
  });

  test("executes create reservation action and refreshes data", async () => {
    const pageModule = await import("./reservation-calendar-page");
    const calls: Array<{ type: "create" | "update"; payload: unknown }> = [];
    let refetchCalendarCount = 0;
    let refetchTablesCount = 0;

    const result = await pageModule.executeReservationFormAction({
      mode: "create",
      selectedOutletId: 1,
      editingReservationId: null,
      formState: {
        tableId: 2,
        customerName: "New Guest",
        customerPhone: "123",
        guestCount: 4,
        reservationAt: new Date("2026-03-20T12:00:00.000Z"),
        durationMinutes: 90,
        notes: "Window"
      },
      accessToken: "token",
      createReservationFn: async (payload) => {
        calls.push({ type: "create", payload });
        return {
          reservation_id: 1,
          company_id: 1,
          outlet_id: 1,
          table_id: 2,
          customer_name: "New Guest",
          customer_phone: "123",
          guest_count: 4,
          reservation_at: "2026-03-20T12:00:00.000Z",
          duration_minutes: 90,
          status: "BOOKED",
          notes: "Window",
          linked_order_id: null,
          created_at: "2026-03-20T10:00:00.000Z",
          updated_at: "2026-03-20T10:00:00.000Z",
          arrived_at: null,
          seated_at: null,
          cancelled_at: null
        };
      },
      refetchCalendar: async () => {
        refetchCalendarCount += 1;
      },
      refetchTables: async () => {
        refetchTablesCount += 1;
      }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.successMessage, "Reservation created.");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0]?.type, "create");
    assert.strictEqual(refetchCalendarCount, 1);
    assert.strictEqual(refetchTablesCount, 1);
  });

  test("executes edit reservation action", async () => {
    const pageModule = await import("./reservation-calendar-page");
    const calls: Array<{ reservationId: number; payload: unknown }> = [];

    const result = await pageModule.executeReservationFormAction({
      mode: "edit",
      selectedOutletId: 1,
      editingReservationId: 99,
      formState: {
        tableId: 3,
        customerName: "Edit Guest",
        customerPhone: "456",
        guestCount: 2,
        reservationAt: new Date("2026-03-20T13:00:00.000Z"),
        durationMinutes: 60,
        notes: "Updated"
      },
      accessToken: "token",
      updateReservationFn: async (reservationId, payload) => {
        calls.push({ reservationId, payload });
        return {
          reservation_id: reservationId,
          company_id: 1,
          outlet_id: 1,
          table_id: 3,
          customer_name: "Edit Guest",
          customer_phone: "456",
          guest_count: 2,
          reservation_at: "2026-03-20T13:00:00.000Z",
          duration_minutes: 60,
          status: "CONFIRMED",
          notes: "Updated",
          linked_order_id: null,
          created_at: "2026-03-20T10:00:00.000Z",
          updated_at: "2026-03-20T10:00:00.000Z",
          arrived_at: null,
          seated_at: null,
          cancelled_at: null
        };
      },
      refetchCalendar: async () => {
        return;
      },
      refetchTables: async () => {
        return;
      }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.successMessage, "Reservation updated.");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0]?.reservationId, 99);
  });

  test("returns error when reservation action fails", async () => {
    const pageModule = await import("./reservation-calendar-page");
    const result = await pageModule.executeReservationFormAction({
      mode: "create",
      selectedOutletId: 1,
      editingReservationId: null,
      formState: {
        tableId: null,
        customerName: "Guest",
        customerPhone: "",
        guestCount: 2,
        reservationAt: new Date("2026-03-20T15:00:00.000Z"),
        durationMinutes: 120,
        notes: ""
      },
      accessToken: "token",
      createReservationFn: async () => {
        throw new Error("boom");
      },
      refetchCalendar: async () => {
        return;
      },
      refetchTables: async () => {
        return;
      }
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorMessage, "boom");
  });

  test("executes status actions for cancel and check-in", async () => {
    const pageModule = await import("./reservation-calendar-page");
    const statuses: string[] = [];
    const row = {
      reservation_id: 20,
      company_id: 1,
      outlet_id: 1,
      table_id: 1,
      customer_name: "Status Guest",
      customer_phone: null,
      guest_count: 2,
      reservation_at: "2026-03-20T12:00:00.000Z",
      duration_minutes: 120,
      status: "CONFIRMED" as const,
      notes: null,
      linked_order_id: null,
      created_at: "2026-03-20T10:00:00.000Z",
      updated_at: "2026-03-20T10:00:00.000Z",
      arrived_at: null,
      seated_at: null,
      cancelled_at: null
    };

    const cancelResult = await pageModule.executeReservationStatusAction({
      row,
      status: "CANCELLED",
      accessToken: "token",
      updateReservationFn: async (_id, payload) => {
        statuses.push(String(payload.status));
        return row;
      },
      refetchCalendar: async () => {
        return;
      },
      refetchTables: async () => {
        return;
      }
    });

    const checkInResult = await pageModule.executeReservationStatusAction({
      row,
      status: "ARRIVED",
      accessToken: "token",
      updateReservationFn: async (_id, payload) => {
        statuses.push(String(payload.status));
        return row;
      },
      refetchCalendar: async () => {
        return;
      },
      refetchTables: async () => {
        return;
      }
    });

    assert.strictEqual(cancelResult.ok, true);
    assert.strictEqual(checkInResult.ok, true);
    assert.deepStrictEqual(statuses, ["CANCELLED", "ARRIVED"]);
  });

  test("builds send-reminder notice payload", async () => {
    const pageModule = await import("./reservation-calendar-page");
    const reminder = pageModule.buildReminderActionNotice("Nora");
    assert.strictEqual(reminder.success, "Reminder action recorded.");
    assert.strictEqual(
      reminder.notice,
      "Reminder noted for Nora. Outbound reminder channel is not configured yet."
    );
  });

  test("returns error when status update fails", async () => {
    const pageModule = await import("./reservation-calendar-page");
    const row = {
      reservation_id: 21,
      company_id: 1,
      outlet_id: 1,
      table_id: 1,
      customer_name: "Error Guest",
      customer_phone: null,
      guest_count: 2,
      reservation_at: "2026-03-20T12:00:00.000Z",
      duration_minutes: 120,
      status: "BOOKED" as const,
      notes: null,
      linked_order_id: null,
      created_at: "2026-03-20T10:00:00.000Z",
      updated_at: "2026-03-20T10:00:00.000Z",
      arrived_at: null,
      seated_at: null,
      cancelled_at: null
    };

    const result = await pageModule.executeReservationStatusAction({
      row,
      status: "CANCELLED",
      accessToken: "token",
      updateReservationFn: async () => {
        throw new Error("status failed");
      },
      refetchCalendar: async () => {
        return;
      },
      refetchTables: async () => {
        return;
      }
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorMessage, "status failed");
  });
});
