// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("Table Board page helpers", () => {
  const sampleRow = {
    tableId: "tb-1",
    zone: "Main",
    occupancyStatusId: 1,
    capacity: 4,
    tableCode: "A1",
    tableName: "Alpha 1",
    availableNow: true,
    currentSessionId: null,
    currentReservationId: null,
    nextReservationStartAt: null,
    guestCount: 2,
    version: 7,
    updatedAt: "2026-03-19T10:00:00.000Z"
  };

  test("groups rows by zone with fallback", async () => {
    const pageModule = await import("./table-board-page");
    const groups = pageModule.groupTablesByZone([
      {
        tableId: "1",
        zone: "Main",
        occupancyStatusId: 1,
        capacity: 4,
        tableCode: "A1",
        tableName: "A1",
        availableNow: true,
        currentSessionId: null,
        currentReservationId: null,
        nextReservationStartAt: null,
        guestCount: 0,
        version: 2,
        updatedAt: "2026-03-19T10:00:00.000Z"
      },
      {
        tableId: "2",
        zone: null,
        occupancyStatusId: 2,
        capacity: 2,
        tableCode: "B1",
        tableName: "B1",
        availableNow: false,
        currentSessionId: "991",
        currentReservationId: null,
        nextReservationStartAt: null,
        guestCount: 2,
        version: 1,
        updatedAt: "2026-03-19T10:00:00.000Z"
      }
    ]);
    assert.deepStrictEqual(groups.map((g: { zone: string }) => g.zone), ["Main", "No Zone"]);
  });

  test("maps occupancy status to expected semantic colors", async () => {
    const pageModule = await import("./table-board-page");
    assert.strictEqual(pageModule.getBoardStatusMeta(1).color, "green");
    assert.strictEqual(pageModule.getBoardStatusMeta(2).color, "red");
    assert.strictEqual(pageModule.getBoardStatusMeta(3).color, "yellow");
    assert.strictEqual(pageModule.getBoardStatusMeta("1" as unknown as number).label, "Available");
    assert.strictEqual(pageModule.getBoardStatusMeta(4).key, "CLEANING");
    assert.strictEqual(pageModule.getBoardStatusMeta(4).label, "Cleaning");
    assert.strictEqual(pageModule.getBoardStatusMeta(5).key, "OUT_OF_SERVICE");
    assert.strictEqual(pageModule.getBoardStatusMeta(5).label, "Out of Service");
  });

  test("filters include explicit CLEANING and OUT_OF_SERVICE statuses", async () => {
    const pageModule = await import("./table-board-page");
    const rows = [
      {
        tableId: "1",
        zone: "Main",
        occupancyStatusId: 4,
        capacity: 4,
        tableCode: "A1",
        tableName: "Alpha",
        availableNow: false,
        currentSessionId: null,
        currentReservationId: null,
        nextReservationStartAt: null,
        guestCount: 0,
        version: 2,
        updatedAt: "2026-03-19T10:00:00.000Z"
      },
      {
        tableId: "2",
        zone: "Main",
        occupancyStatusId: 5,
        capacity: 4,
        tableCode: "A2",
        tableName: "Alpha 2",
        availableNow: false,
        currentSessionId: null,
        currentReservationId: null,
        nextReservationStartAt: null,
        guestCount: 0,
        version: 2,
        updatedAt: "2026-03-19T10:00:00.000Z"
      }
    ];

    const cleaning = pageModule.filterBoardTables(rows, {
      status: "CLEANING",
      zone: "ALL",
      minCapacity: null,
      maxCapacity: null,
      search: ""
    });
    const outOfService = pageModule.filterBoardTables(rows, {
      status: "OUT_OF_SERVICE",
      zone: "ALL",
      minCapacity: null,
      maxCapacity: null,
      search: ""
    });

    assert.strictEqual(cleaning.length, 1);
    assert.strictEqual(cleaning[0]?.tableCode, "A1");
    assert.strictEqual(outOfService.length, 1);
    assert.strictEqual(outOfService[0]?.tableCode, "A2");
  });

  test("computes reserved-soon window from next reservation time", async () => {
    const pageModule = await import("./table-board-page");
    const nowMs = Date.parse("2026-03-20T10:00:00.000Z");

    assert.strictEqual(pageModule.getReservedSoonInfo(null, 30, nowMs), null);
    assert.strictEqual(pageModule.getReservedSoonInfo("2026-03-20T09:59:00.000Z", 30, nowMs), null);

    const withinThreshold = pageModule.getReservedSoonInfo("2026-03-20T10:20:00.000Z", 30, nowMs);
    assert.ok(withinThreshold);
    assert.strictEqual(withinThreshold.startsInMinutes, 20);

    assert.strictEqual(pageModule.getReservedSoonInfo("2026-03-20T10:45:00.000Z", 30, nowMs), null);
  });

  test("filters by status, zone, search, and minimum capacity", async () => {
    const pageModule = await import("./table-board-page");
    const rows = [
      {
        tableId: "1",
        zone: "Main",
        occupancyStatusId: 1,
        capacity: 4,
        tableCode: "A1",
        tableName: "Alpha",
        availableNow: true,
        currentSessionId: null,
        currentReservationId: null,
        nextReservationStartAt: null,
        guestCount: 0,
        version: 2,
        updatedAt: "2026-03-19T10:00:00.000Z"
      },
      {
        tableId: "2",
        zone: "Patio",
        occupancyStatusId: 2,
        capacity: 2,
        tableCode: "B2",
        tableName: "Bravo",
        availableNow: false,
        currentSessionId: "91",
        currentReservationId: null,
        nextReservationStartAt: null,
        guestCount: 2,
        version: 2,
        updatedAt: "2026-03-19T10:00:00.000Z"
      }
    ];

    const filtered = pageModule.filterBoardTables(rows, {
      status: "AVAILABLE",
      zone: "Main",
      minCapacity: 4,
      maxCapacity: null,
      search: "alp"
    });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0]?.tableCode, "A1");
  });

  test("derives row actions from occupancy state", async () => {
    const pageModule = await import("./table-board-page");
    const available = pageModule.getAvailableActionsForTable({ occupancyStatusId: 1, currentSessionId: null });
    const occupied = pageModule.getAvailableActionsForTable({ occupancyStatusId: 2, currentSessionId: "9" });
    assert.deepStrictEqual(available, ["NEW_RESERVATION", "HOLD", "SEAT"]);
    assert.deepStrictEqual(occupied, ["NEW_RESERVATION", "RELEASE", "VIEW_SESSION"]);
  });

  test("does not expose unsafe actions for CLEANING and OUT_OF_SERVICE", async () => {
    const pageModule = await import("./table-board-page");

    const cleaning = pageModule.getAvailableActionsForTable({
      occupancyStatusId: 4,
      currentSessionId: null,
      availableNow: false
    });
    const outOfService = pageModule.getAvailableActionsForTable({
      occupancyStatusId: 5,
      currentSessionId: null,
      availableNow: false
    });

    assert.deepStrictEqual(cleaning, []);
    assert.deepStrictEqual(outOfService, []);
  });

  test("parses board table id for reservation prefill", async () => {
    const pageModule = await import("./table-board-page");
    assert.strictEqual(pageModule.parseBoardTableId("12"), 12);
    assert.strictEqual(pageModule.parseBoardTableId("0"), null);
    assert.strictEqual(pageModule.parseBoardTableId("table-uuid"), null);
  });

  test("creates expected version header", async () => {
    const pageModule = await import("./table-board-page");
    const headers = pageModule.buildExpectedVersionHeaders(7);
    assert.strictEqual(headers["X-Expected-Version"], "7");
  });

  test("normalizes conflict message with refresh hint", async () => {
    const pageModule = await import("./table-board-page");
    const text = pageModule.normalizeActionErrorMessage("Version conflict detected");
    assert.strictEqual(text, "Version conflict detected. Board refreshed.");
  });

  test("resolves session modal title from session detail", async () => {
    const pageModule = await import("./table-board-page");
    assert.strictEqual(pageModule.resolveSessionModalTitle(null), "Session Detail");
    assert.strictEqual(
      pageModule.resolveSessionModalTitle({
        id: "88",
        tableCode: "A1",
        tableName: "Alpha 1",
        statusLabel: "Active",
        guestCount: 2,
        startedAt: "2026-03-20T10:00:00.000Z",
        lineCount: 3,
        totalAmount: 120000
      }),
      "Session 88"
    );
  });

  test("executes HOLD action with expected version and refresh", async () => {
    const pageModule = await import("./table-board-page");
    const calls: Array<{ path: string; init?: RequestInit; token?: string }> = [];
    const busyStates: Array<string | null> = [];
    let actionError: string | null = "old error";
    let actionSuccess: string | null = null;
    let refetchCount = 0;

    const request = async (path: string, init?: RequestInit, accessToken?: string) => {
      calls.push({ path, init, token: accessToken });
      return { success: true };
    };

    await pageModule.executeTableBoardAction({
      row: sampleRow,
      action: "HOLD",
      selectedOutletId: 17,
      busyTableId: null,
      accessToken: "token-1",
      request,
      refetchBoard: async () => {
        refetchCount += 1;
      },
      setBusyTableId: (value: string | null) => {
        busyStates.push(value);
      },
      setActionError: (value: string | null) => {
        actionError = value;
      },
      setActionSuccess: (value: string | null) => {
        actionSuccess = value;
      }
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0]?.path, "/dinein/tables/tb-1/hold?outletId=17");
    assert.strictEqual(calls[0]?.init?.method, "POST");
    assert.strictEqual((calls[0]?.init?.headers as Record<string, string>)["X-Expected-Version"], "7");
    const holdPayload = JSON.parse(String(calls[0]?.init?.body));
    assert.strictEqual(typeof holdPayload.heldUntil, "string");
    assert.strictEqual(actionError, null);
    assert.strictEqual(actionSuccess, "Table A1 is now reserved.");
    assert.strictEqual(refetchCount, 1);
    assert.deepStrictEqual(busyStates, ["tb-1", null]);
  });

  test("executes SEAT action with guest count fallback and refresh", async () => {
    const pageModule = await import("./table-board-page");
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const seatRow = { ...sampleRow, guestCount: null, occupancyStatusId: 3 };
    let actionSuccess: string | null = null;
    let refetchCount = 0;

    await pageModule.executeTableBoardAction({
      row: seatRow,
      action: "SEAT",
      selectedOutletId: 9,
      busyTableId: null,
      accessToken: "token-2",
      request: async (path: string, init?: RequestInit) => {
        calls.push({ path, init });
        return { success: true };
      },
      refetchBoard: async () => {
        refetchCount += 1;
      },
      setBusyTableId: () => {
        return;
      },
      setActionError: () => {
        return;
      },
      setActionSuccess: (value: string | null) => {
        actionSuccess = value;
      }
    });

    assert.strictEqual(calls[0]?.path, "/dinein/tables/tb-1/seat?outletId=9");
    assert.strictEqual((calls[0]?.init?.headers as Record<string, string>)["X-Expected-Version"], "7");
    assert.deepStrictEqual(JSON.parse(String(calls[0]?.init?.body)), { guestCount: 1 });
    assert.strictEqual(actionSuccess, "Guests seated at A1.");
    assert.strictEqual(refetchCount, 1);
  });

  test("executes RELEASE action with expected version and refresh", async () => {
    const pageModule = await import("./table-board-page");
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    let actionSuccess: string | null = null;
    let refetchCount = 0;

    await pageModule.executeTableBoardAction({
      row: { ...sampleRow, occupancyStatusId: 2 },
      action: "RELEASE",
      selectedOutletId: 5,
      busyTableId: null,
      accessToken: "token-3",
      request: async (path: string, init?: RequestInit) => {
        calls.push({ path, init });
        return { success: true };
      },
      refetchBoard: async () => {
        refetchCount += 1;
      },
      setBusyTableId: () => {
        return;
      },
      setActionError: () => {
        return;
      },
      setActionSuccess: (value: string | null) => {
        actionSuccess = value;
      }
    });

    assert.strictEqual(calls[0]?.path, "/dinein/tables/tb-1/release?outletId=5");
    assert.strictEqual((calls[0]?.init?.headers as Record<string, string>)["X-Expected-Version"], "7");
    assert.deepStrictEqual(JSON.parse(String(calls[0]?.init?.body)), {});
    assert.strictEqual(actionSuccess, "Table A1 released.");
    assert.strictEqual(refetchCount, 1);
  });

  test("normalizes conflict errors and still refreshes board", async () => {
    const pageModule = await import("./table-board-page");
    const busyStates: Array<string | null> = [];
    let actionError: string | null = null;
    let refetchCount = 0;

    await pageModule.executeTableBoardAction({
      row: sampleRow,
      action: "HOLD",
      selectedOutletId: 11,
      busyTableId: null,
      accessToken: "token-4",
      request: async () => {
        throw new Error("Version conflict detected");
      },
      refetchBoard: async () => {
        refetchCount += 1;
      },
      setBusyTableId: (value: string | null) => {
        busyStates.push(value);
      },
      setActionError: (value: string | null) => {
        actionError = value;
      },
      setActionSuccess: () => {
        return;
      }
    });

    assert.strictEqual(actionError, "Version conflict detected. Board refreshed.");
    assert.strictEqual(refetchCount, 1);
    assert.deepStrictEqual(busyStates, ["tb-1", null]);
  });

  test("skips action execution while any action is already in-flight", async () => {
    const pageModule = await import("./table-board-page");
    let called = false;

    await pageModule.executeTableBoardAction({
      row: sampleRow,
      action: "HOLD",
      selectedOutletId: 11,
      busyTableId: "another-table",
      accessToken: "token-4",
      request: async () => {
        called = true;
        return { success: true };
      },
      refetchBoard: async () => {
        return;
      },
      setBusyTableId: () => {
        return;
      },
      setActionError: () => {
        return;
      },
      setActionSuccess: () => {
        return;
      }
    });

    assert.strictEqual(called, false);
  });
});
