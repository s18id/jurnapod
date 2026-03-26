// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Session Store - Integration Tests
 *
 * Verifies MySQL-backed session persistence:
 * - Sessions survive across service instances (DB-backed not in-memory)
 * - Company-scoped isolation enforced at query level
 * - TTL expiry returns null correctly
 * - Cleanup removes only expired sessions
 *
 * CRITICAL: Pool must be closed in after() to prevent test hang.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { closeDbPool, getDbPool } from "../../lib/db.js";
import {
  createSession,
  getSession,
  deleteSession,
  cleanupExpiredSessions,
} from "./session-store.js";
import type { Pool } from "mysql2/promise";

const COMPANY_A = 1;
const COMPANY_B = 2;

const SAMPLE_PAYLOAD = {
  entityType: "items",
  filename: "test-items.csv",
  rowCount: 3,
  columns: ["sku", "name", "item_type"],
  sampleData: [["SKU-001", "Item 1", "INVENTORY"]],
  rows: [],
};

describe("Import Session Store", () => {
  let pool: Pool;

  before(() => {
    pool = getDbPool();
  });

  after(async () => {
    await closeDbPool();
  });

  describe("createSession + getSession", () => {
    test("creates a session and retrieves it by ID and company", async () => {
      const sessionId = randomUUID();

      await createSession(pool, sessionId, COMPANY_A, "items", SAMPLE_PAYLOAD);

      const session = await getSession(pool, sessionId, COMPANY_A);

      assert.ok(session, "Session should be found");
      assert.equal(session.sessionId, sessionId);
      assert.equal(session.companyId, COMPANY_A);
      assert.equal(session.entityType, "items");
      assert.equal(session.payload.filename, "test-items.csv");
      assert.equal(session.payload.rowCount, 3);

      // Cleanup
      await deleteSession(pool, sessionId, COMPANY_A);
    });

    test("returns null for non-existent session", async () => {
      const session = await getSession(pool, randomUUID(), COMPANY_A);
      assert.equal(session, null);
    });

    test("company B cannot read company A session (isolation enforced)", async () => {
      const sessionId = randomUUID();

      await createSession(pool, sessionId, COMPANY_A, "items", SAMPLE_PAYLOAD);

      // Company B attempts to read Company A's session
      const session = await getSession(pool, sessionId, COMPANY_B);
      assert.equal(session, null, "Company B must not access Company A session");

      // Cleanup
      await deleteSession(pool, sessionId, COMPANY_A);
    });

    test("session read by correct company succeeds", async () => {
      const sessionIdA = randomUUID();
      const sessionIdB = randomUUID();

      await createSession(pool, sessionIdA, COMPANY_A, "items", SAMPLE_PAYLOAD);
      await createSession(pool, sessionIdB, COMPANY_B, "prices", { ...SAMPLE_PAYLOAD, entityType: "prices" });

      const sessionA = await getSession(pool, sessionIdA, COMPANY_A);
      const sessionB = await getSession(pool, sessionIdB, COMPANY_B);

      assert.ok(sessionA, "Company A should read its own session");
      assert.ok(sessionB, "Company B should read its own session");
      assert.equal(sessionA.entityType, "items");
      assert.equal(sessionB.entityType, "prices");

      // Cleanup
      await deleteSession(pool, sessionIdA, COMPANY_A);
      await deleteSession(pool, sessionIdB, COMPANY_B);
    });
  });

  describe("deleteSession", () => {
    test("deletes session so it is no longer retrievable", async () => {
      const sessionId = randomUUID();

      await createSession(pool, sessionId, COMPANY_A, "items", SAMPLE_PAYLOAD);
      await deleteSession(pool, sessionId, COMPANY_A);

      const session = await getSession(pool, sessionId, COMPANY_A);
      assert.equal(session, null, "Deleted session must not be retrievable");
    });

    test("delete by wrong company leaves session intact", async () => {
      const sessionId = randomUUID();

      await createSession(pool, sessionId, COMPANY_A, "items", SAMPLE_PAYLOAD);

      // Company B attempts delete of Company A session — must be a no-op
      await deleteSession(pool, sessionId, COMPANY_B);

      const session = await getSession(pool, sessionId, COMPANY_A);
      assert.ok(session, "Session owned by Company A must survive Company B delete attempt");

      // Cleanup
      await deleteSession(pool, sessionId, COMPANY_A);
    });
  });

  describe("cleanupExpiredSessions", () => {
    test("returns a non-negative count", async () => {
      const count = await cleanupExpiredSessions(pool);
      assert.ok(count >= 0, "Cleanup count must be non-negative");
    });

    test("does not delete active (non-expired) sessions", async () => {
      const sessionId = randomUUID();

      await createSession(pool, sessionId, COMPANY_A, "items", SAMPLE_PAYLOAD);

      // Run cleanup — session is not expired, must survive
      await cleanupExpiredSessions(pool);

      const session = await getSession(pool, sessionId, COMPANY_A);
      assert.ok(session, "Active session must survive cleanup");

      // Cleanup
      await deleteSession(pool, sessionId, COMPANY_A);
    });

    test("cleanup removes expired sessions (inserted with past expires_at)", async () => {
      const sessionId = randomUUID();

      // Insert a session that expired 1 hour ago directly via SQL
      await pool.execute(
        `INSERT INTO import_sessions (session_id, company_id, entity_type, payload, created_at, expires_at)
         VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
        [sessionId, COMPANY_A, "items", JSON.stringify(SAMPLE_PAYLOAD)]
      );

      const deletedCount = await cleanupExpiredSessions(pool);
      assert.ok(deletedCount >= 1, "At least the expired test session must be cleaned up");

      // Confirm it's gone
      const session = await getSession(pool, sessionId, COMPANY_A);
      assert.equal(session, null, "Expired session must be gone after cleanup");
    });
  });
});
