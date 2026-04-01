// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sql } from "kysely";
import { closeDbPool, getDb } from "../db.js";
import { createSyncAuditService } from "./audit-adapter.js";
import { loadEnvIfPresent, readEnv } from "../../../tests/integration/integration-harness.mjs";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";

test.after(async () => {
  await closeDbPool();
});

describe("createSyncAuditService", () => {
  test("creates service with required methods (mock pool)", async () => {
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

  test("Kysely path: startEvent and completeEvent persist audit rows to sync_audit_events", async () => {
    const db = getDb();

    // Create audit service with Kysely instance
    const service = createSyncAuditService(db);

    const eventType = "PULL";
    const companyRows = await sql<{ id: number }>`
      SELECT id
      FROM companies
      WHERE code = ${TEST_COMPANY_CODE}
      LIMIT 1
    `.execute(db);
    assert.equal(companyRows.rows.length, 1, `Company fixture ${TEST_COMPANY_CODE} should exist`);
    const companyId = Number(companyRows.rows[0].id);

    // Start an event - use correct SyncAuditEvent property names (camelCase)
    // Note: status is required by type but hardcoded to IN_PROGRESS by startEvent implementation
    const eventIdBigInt = await service.startEvent({
      companyId,
      operationType: eventType as "PUSH" | "PULL" | "VERSION_BUMP" | "HEALTH_CHECK",
      tierName: "default",
      status: "IN_PROGRESS",
      startedAt: new Date(),
    });

    assert.ok(typeof eventIdBigInt === "bigint", "startEvent should return a bigint event ID");

    // Complete the event - completeEvent takes (eventId: bigint, updates: Partial<SyncAuditEvent>)
    await service.completeEvent(eventIdBigInt, {
      status: "SUCCESS",
      completedAt: new Date(),
    });

    // Verify the row was inserted/updated in sync_audit_events
    const auditRows = await sql`
      SELECT id, company_id, operation_type, tier_name, status
      FROM sync_audit_events
      WHERE id = ${eventIdBigInt}
      LIMIT 1
    `.execute(db);

    assert.equal(auditRows.rows.length, 1, "Should find the audit event row");

    const row = auditRows.rows[0] as {
      id: bigint;
      company_id: number;
      operation_type: string;
      tier_name: string;
      status: string;
    };

    assert.equal(row.company_id, companyId, "company_id should match");
    assert.equal(row.operation_type, eventType, "operation_type should match");
    assert.equal(row.tier_name, "default", "tier_name should match");
    assert.equal(row.status, "SUCCESS", "status should be SUCCESS for completed event");

    // Cleanup - delete the test audit row
    await sql`DELETE FROM sync_audit_events WHERE id = ${eventIdBigInt}`.execute(db);
  });
});
