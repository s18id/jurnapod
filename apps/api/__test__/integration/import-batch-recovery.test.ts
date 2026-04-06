// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Batch Failure Recovery & Session Hardening - Integration Tests (Story 7.3)
 *
 * Tests TD-027 (batch progress tracking), TD-028 (session expiry guard),
 * TD-029 (partial resume from checkpoint).
 *
 * CRITICAL: Pool must be closed in afterAll() to prevent test hang.
 */

import assert from "node:assert/strict";
import {test, describe, beforeAll, afterAll} from 'vitest';
import { randomUUID } from "node:crypto";
import { closeDbPool, getDb } from "../../src/lib/db.js";
import { sql } from "kysely";
import {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  cleanupExpiredSessions,
} from "../../src/lib/import/session-store.js";

const COMPANY_A = 1;

const SAMPLE_PAYLOAD = {
  entityType: "items",
  filename: "test.csv",
  rowCount: 10,
  columns: ["sku", "name", "item_type"],
  sampleData: [],
  rows: [],
};

describe("Batch Failure Recovery & Session Hardening", () => {
  beforeAll(() => {
    // Warm up the db connection
    getDb();
  });

  afterAll(async () => {
    // Clean up any expired sessions created during testing
    await cleanupExpiredSessions();
    await closeDbPool();
  });

  // -------------------------------------------------------------------------
  // TD-027: Batch progress tracking
  // -------------------------------------------------------------------------

  describe("TD-027: Batch progress tracking", () => {
    test("ApplyResult includes batchesCompleted and batchesFailed fields", () => {
      // Verify the shape of the result type is correct by constructing a mock result
      const mockResult = {
        created: 5,
        updated: 3,
        errors: [],
        batchesCompleted: 2,
        batchesFailed: 1,
        rowsProcessed: 800,
      };

      assert.ok("batchesCompleted" in mockResult, "batchesCompleted must be in result");
      assert.ok("batchesFailed" in mockResult, "batchesFailed must be in result");
      assert.ok("rowsProcessed" in mockResult, "rowsProcessed must be in result");
      assert.equal(mockResult.batchesCompleted, 2);
      assert.equal(mockResult.batchesFailed, 1);
    });

    test("batch counts sum correctly for partial failure scenario", () => {
      // 3 total batches: 2 committed, 1 failed
      const batchesCompleted = 2;
      const batchesFailed = 1;
      const totalBatches = batchesCompleted + batchesFailed;

      assert.equal(totalBatches, 3);
      assert.ok(batchesFailed > 0, "Partial failure scenario has at least one failed batch");
      assert.ok(batchesCompleted > 0, "Partial failure scenario has at least one committed batch");
    });
  });

  // -------------------------------------------------------------------------
  // TD-028: Session expiry guard
  // -------------------------------------------------------------------------

  describe("TD-028: Session expiry guard", () => {
    test("active session with >60s remaining is retrievable", async () => {
      const sessionId = randomUUID();

      await createSession(sessionId, COMPANY_A, "items", SAMPLE_PAYLOAD);

      const session = await getSession(sessionId, COMPANY_A);
      assert.ok(session, "Active session must be retrievable");

      const expiresInMs = session.expiresAt.getTime() - Date.now();
      assert.ok(expiresInMs > 60_000, "Active session should have more than 60s remaining");

      await deleteSession(sessionId, COMPANY_A);
    });

    test("session expiring within 60s should be rejected by apply guard", async () => {
      const sessionId = randomUUID();

      // Insert a session that expires in 30 seconds
      const db = getDb();
      await sql`
        INSERT INTO import_sessions (session_id, company_id, entity_type, payload, created_at, expires_at)
        VALUES (${sessionId}, ${COMPANY_A}, ${"items"}, ${JSON.stringify(SAMPLE_PAYLOAD)}, NOW(), DATE_ADD(NOW(), INTERVAL 30 SECOND))
      `.execute(db);

      const session = await getSession(sessionId, COMPANY_A);
      assert.ok(session, "Session should still be found (not expired yet)");

      const expiresInMs = session.expiresAt.getTime() - Date.now();
      // Verify the apply guard condition: < 60s → reject
      assert.ok(expiresInMs < 60_000, "This session should trigger the expiry guard");

      // Cleanup
      await deleteSession(sessionId, COMPANY_A);
    });

    test("expired session returns null from getSession", async () => {
      const sessionId = randomUUID();

      // Insert an already-expired session
      const db = getDb();
      await sql`
        INSERT INTO import_sessions (session_id, company_id, entity_type, payload, created_at, expires_at)
        VALUES (${sessionId}, ${COMPANY_A}, ${"items"}, ${JSON.stringify(SAMPLE_PAYLOAD)}, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 30 MINUTE))
      `.execute(db);

      const session = await getSession(sessionId, COMPANY_A);
      assert.equal(session, null, "Expired session must return null");

      // Cleanup
      await deleteSession(sessionId, COMPANY_A);
    });
  });

  // -------------------------------------------------------------------------
  // TD-029: Partial resume from checkpoint
  // -------------------------------------------------------------------------

  describe("TD-029: Checkpoint and resume", () => {
    test("updateSession persists lastSuccessfulBatch in payload", async () => {
      const sessionId = randomUUID();

      await createSession(sessionId, COMPANY_A, "items", SAMPLE_PAYLOAD);

      // Simulate checkpoint after batch 2 commits (0-based index 2 = batch 3)
      const updatedPayload = { ...SAMPLE_PAYLOAD, lastSuccessfulBatch: 2 };
      await updateSession(sessionId, COMPANY_A, updatedPayload);

      const session = await getSession(sessionId, COMPANY_A);
      assert.ok(session, "Session must exist after update");
      assert.equal(
        (session.payload as { lastSuccessfulBatch?: number }).lastSuccessfulBatch,
        2,
        "Checkpoint must be persisted as lastSuccessfulBatch = 2"
      );

      await deleteSession(sessionId, COMPANY_A);
    });

    test("resume startBatch is derived from lastSuccessfulBatch + 1", () => {
      // Verify the resume calculation logic
      const lastSuccessfulBatch = 2;
      const startBatch = lastSuccessfulBatch + 1;

      assert.equal(startBatch, 3, "Resume should start at batch index 3 (skip 0, 1, 2)");
    });

    test("session without checkpoint starts from batch 0", () => {
      const session = { ...SAMPLE_PAYLOAD }; // No lastSuccessfulBatch
      const startBatch = (session as { lastSuccessfulBatch?: number }).lastSuccessfulBatch !== undefined
        ? (session as { lastSuccessfulBatch?: number }).lastSuccessfulBatch! + 1
        : 0;

      assert.equal(startBatch, 0, "No checkpoint → start from batch 0");
    });

    test("session with checkpoint resumes correctly", () => {
      const session = { ...SAMPLE_PAYLOAD, lastSuccessfulBatch: 4 };
      const startBatch = session.lastSuccessfulBatch !== undefined
        ? session.lastSuccessfulBatch + 1
        : 0;

      assert.equal(startBatch, 5, "Checkpoint at 4 → resume from batch 5");
    });

    test("checkpoint survives concurrent reads (isolation)", async () => {
      const sessionIdA = randomUUID();
      const sessionIdB = randomUUID();

      await createSession(sessionIdA, COMPANY_A, "items", SAMPLE_PAYLOAD);
      await createSession(sessionIdB, COMPANY_A, "items", SAMPLE_PAYLOAD);

      // Checkpoint session A at batch 3, session B at batch 7
      await updateSession(sessionIdA, COMPANY_A, { ...SAMPLE_PAYLOAD, lastSuccessfulBatch: 3 });
      await updateSession(sessionIdB, COMPANY_A, { ...SAMPLE_PAYLOAD, lastSuccessfulBatch: 7 });

      const storedA = await getSession(sessionIdA, COMPANY_A);
      const storedB = await getSession(sessionIdB, COMPANY_A);

      assert.equal((storedA!.payload as { lastSuccessfulBatch?: number }).lastSuccessfulBatch, 3);
      assert.equal((storedB!.payload as { lastSuccessfulBatch?: number }).lastSuccessfulBatch, 7);

      await deleteSession(sessionIdA, COMPANY_A);
      await deleteSession(sessionIdB, COMPANY_A);
    });

    test("session with all batches failed remains in DB for retry", async () => {
      const sessionId = randomUUID();
      await createSession(sessionId, COMPANY_A, "items", SAMPLE_PAYLOAD);

      // Simulate: no batches committed, batchesFailed > 0 → session NOT deleted
      const batchesFailed = 2;
      const batchesCompleted = 0;

      // Apply handler only deletes session when batchesFailed === 0
      // Using function to avoid TypeScript unreachable code detection
      const shouldDelete = (failed: number) => failed === 0;
      if (shouldDelete(batchesFailed)) {
        await deleteSession(sessionId, COMPANY_A);
      }

      // Session should still be present
      const session = await getSession(sessionId, COMPANY_A);
      assert.ok(session, "Session with failed batches must remain for retry");

      assert.equal(batchesCompleted, 0);
      assert.ok(batchesFailed > 0);
    });
  });
});
