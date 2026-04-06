// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("useTableBoard hook", () => {
  test("buildTableBoardPath includes encoded outletId", async () => {
    const hookModule = await import("./use-table-board.js");
    const path = hookModule.buildTableBoardPath(17);
    assert.strictEqual(path, "/dinein/tables/board?outletId=17");
  });

  test("extractTableBoardRows reads API envelope data.tables", async () => {
    const hookModule = await import("./use-table-board.js");
    const rows = hookModule.extractTableBoardRows({
      success: true,
      data: {
        tables: [
          {
            tableId: "101",
            tableCode: "A1",
            tableName: "Table A1",
            capacity: 4,
            zone: "Main",
            occupancyStatusId: 1,
            availableNow: true,
            currentSessionId: null,
            currentReservationId: null,
            nextReservationStartAt: null,
            guestCount: 0,
            version: 3,
            updatedAt: "2026-03-19T10:00:00.000Z"
          }
        ]
      }
    });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]?.tableCode, "A1");
  });

  test("extractTableBoardRows coerces numeric-like fields from strings", async () => {
    const hookModule = await import("./use-table-board.js");
    const rows = hookModule.extractTableBoardRows({
      success: true,
      data: {
        tables: [
          {
            tableId: 101,
            tableCode: "A1",
            tableName: "Table A1",
            capacity: "4",
            zone: "Main",
            occupancyStatusId: "1",
            availableNow: true,
            currentSessionId: 55,
            currentReservationId: null,
            nextReservationStartAt: null,
            guestCount: "2",
            version: "3",
            updatedAt: "2026-03-19T10:00:00.000Z"
          }
        ]
      }
    });

    assert.strictEqual(rows[0]?.tableId, "101");
    assert.strictEqual(rows[0]?.occupancyStatusId, 1);
    assert.strictEqual(rows[0]?.capacity, 4);
    assert.strictEqual(rows[0]?.guestCount, 2);
    assert.strictEqual(rows[0]?.version, 3);
    assert.strictEqual(rows[0]?.currentSessionId, "55");
  });

  test("extractTableBoardRows returns empty array for malformed payload", async () => {
    const hookModule = await import("./use-table-board.js");
    const rows = hookModule.extractTableBoardRows({ success: true, data: { unexpected: [] } });
    assert.deepStrictEqual(rows, []);
  });

  test("calculateRecentChangeIds flags changed table versions", async () => {
    const hookModule = await import("./use-table-board.js");
    const previousRows = [
      { tableId: "1", version: 2 },
      { tableId: "2", version: 5 }
    ];
    const nextRows = [
      { tableId: "1", version: 3 },
      { tableId: "2", version: 5 },
      { tableId: "3", version: 1 }
    ];

    const changed = hookModule.calculateRecentChangeIds(previousRows, nextRows);
    assert.strictEqual(changed.has("1"), true);
    assert.strictEqual(changed.has("2"), false);
    assert.strictEqual(changed.has("3"), false);
  });

  test("startPolling returns cleanup that clears interval", async () => {
    const hookModule = await import("./use-table-board.js");
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;

    let cleared = false;

    global.setInterval = ((_: () => void, _ms?: number) => 77 as unknown as NodeJS.Timeout) as typeof setInterval;
    global.clearInterval = ((handle?: NodeJS.Timeout) => {
      if (Number(handle) === 77) {
        cleared = true;
      }
    }) as typeof clearInterval;

    const stop = hookModule.startPolling(() => {
      return;
    }, 5000);

    stop();
    assert.strictEqual(cleared, true);

    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });
});
