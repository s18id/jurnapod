// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { closeDbPool } from "../db.js";
import { createSyncAuditService } from "./audit-adapter.js";

test.after(async () => {
  await closeDbPool();
});

describe("createSyncAuditService", () => {
  test("creates service with required methods", async () => {
    const mockPool = {
      query: async () => [[{ id: 1 }], []],
      execute: async () => [{ affectedRows: 1, insertId: 1 }],
      getConnection: async () => ({
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        execute: async () => [{ affectedRows: 1 }],
        release: () => {},
      }),
    };

    const service = createSyncAuditService(mockPool as unknown as import("mysql2/promise").Pool);

    assert.ok(service, "service should be created");
    assert.strictEqual(typeof service.startEvent, "function", "should have startEvent method");
    assert.strictEqual(typeof service.completeEvent, "function", "should have completeEvent method");
  });
});