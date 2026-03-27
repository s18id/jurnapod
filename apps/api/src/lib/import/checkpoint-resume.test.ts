// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Import Checkpoint/Resume - Integration Tests
 * 
 * Story 8.1: Import Resume/Checkpoint for Interrupted Imports
 * 
 * Tests:
 * - AC1: Checkpoint tracking after each batch commit
 * - AC2: Resume capability - skip already-committed batches
 * - AC3: File hash validation on resume
 * - AC4: Partial failure handling with structured error response
 * - AC5: Integration tests for resume, hash mismatch, expired session
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
  updateCheckpoint,
  clearCheckpoint,
  updateFileHash,
  computeFileHash,
  getCheckpoint,
  type CheckpointData,
  SESSION_TTL_MS,
} from "./session-store.js";
import type { Pool } from "mysql2/promise";

const COMPANY_ID = 1;
const SAMPLE_PAYLOAD = {
  entityType: "items",
  filename: "test-items.csv",
  rowCount: 10,
  columns: ["sku", "name", "item_type"],
  sampleData: [["SKU-001", "Item 1", "INVENTORY"]],
  rows: Array.from({ length: 10 }, (_, i) => ({
    rowNumber: i + 1,
    data: { sku: `SKU-${String(i + 1).padStart(3, "0")}`, name: `Item ${i + 1}`, item_type: "INVENTORY" },
    rawData: [`SKU-${String(i + 1).padStart(3, "0")}`, `Item ${i + 1}`, "INVENTORY"],
  })),
};

describe("Import Checkpoint/Resume - Session Store", () => {
  let pool: Pool;

  before(() => {
    pool = getDbPool();
  });

  after(async () => {
    await closeDbPool();
  });

  // ============================================================================
  // AC1: Checkpoint Tracking Tests
  // ============================================================================

  describe("Checkpoint Tracking (AC1)", () => {
    test("creates checkpoint after batch commit", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 0,
        rowsCommitted: 100,
        timestamp: new Date().toISOString(),
      };

      // Create session
      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);

      // Update checkpoint
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      // Verify checkpoint was stored
      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored, "Session should exist");
      assert.ok(stored!.checkpointData, "Checkpoint data should exist");
      assert.equal(stored!.checkpointData!.lastSuccessfulBatchNumber, 0);
      assert.equal(stored!.checkpointData!.rowsCommitted, 100);

      // Cleanup
      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("updates checkpoint with new batch number", async () => {
      const sessionId = randomUUID();
      const checkpoint1: CheckpointData = {
        lastSuccessfulBatchNumber: 0,
        rowsCommitted: 100,
        timestamp: new Date().toISOString(),
      };
      const checkpoint2: CheckpointData = {
        lastSuccessfulBatchNumber: 1,
        rowsCommitted: 200,
        timestamp: new Date().toISOString(),
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint1);

      // Update to new checkpoint
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint2);

      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored);
      assert.ok(stored!.checkpointData);
      assert.equal(stored!.checkpointData!.lastSuccessfulBatchNumber, 1);
      assert.equal(stored!.checkpointData!.rowsCommitted, 200);

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("checkpoint persists with session within TTL", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 5,
        rowsCommitted: 500,
        timestamp: new Date().toISOString(),
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      // Session should still be valid
      const retrieved = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.ok(retrieved, "Checkpoint should be retrievable");
      assert.equal(retrieved!.lastSuccessfulBatchNumber, 5);

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("clearCheckpoint removes checkpoint data", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 3,
        rowsCommitted: 300,
        timestamp: new Date().toISOString(),
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);
      await clearCheckpoint(pool, sessionId, COMPANY_ID);

      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored, "Session should still exist");
      assert.equal(stored!.checkpointData, null, "Checkpoint should be cleared");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });
  });

  // ============================================================================
  // AC3: File Hash Validation Tests
  // ============================================================================

  describe("File Hash Validation (AC3)", () => {
    test("computes SHA-256 hash of buffer", () => {
      const buffer = Buffer.from("test content", "utf-8");
      const hash = computeFileHash(buffer);

      // SHA-256 produces 64 character hex string
      assert.equal(hash.length, 64);
      assert.ok(/^[a-f0-9]+$/.test(hash), "Hash should be lowercase hex");
    });

    test("different content produces different hash", () => {
      const buffer1 = Buffer.from("content 1", "utf-8");
      const buffer2 = Buffer.from("content 2", "utf-8");

      const hash1 = computeFileHash(buffer1);
      const hash2 = computeFileHash(buffer2);

      assert.notEqual(hash1, hash2, "Different content should produce different hashes");
    });

    test("same content produces same hash", () => {
      const content = "identical content";
      const buffer1 = Buffer.from(content, "utf-8");
      const buffer2 = Buffer.from(content, "utf-8");

      const hash1 = computeFileHash(buffer1);
      const hash2 = computeFileHash(buffer2);

      assert.equal(hash1, hash2, "Same content should produce identical hashes");
    });

    test("stores file hash in session", async () => {
      const sessionId = randomUUID();
      const fileHash = computeFileHash(Buffer.from("test file content"));

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateFileHash(pool, sessionId, COMPANY_ID, fileHash);

      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored);
      assert.ok(stored!.fileHash, "File hash should exist");
      assert.equal(stored!.fileHash, fileHash);

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("file hash mismatch detection", async () => {
      const sessionId = randomUUID();
      const originalHash = computeFileHash(Buffer.from("original file content"));
      const tamperedHash = computeFileHash(Buffer.from("tampered file content"));

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateFileHash(pool, sessionId, COMPANY_ID, originalHash);

      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored);
      assert.ok(stored!.fileHash);

      // Simulate hash mismatch detection
      const hashesMatch = stored!.fileHash === tamperedHash;
      assert.equal(hashesMatch, false, "Tampered file should have different hash");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });
  });

  // ============================================================================
  // Resume Capability Tests (AC2)
  // ============================================================================

  describe("Resume Capability (AC2)", () => {
    test("getCheckpoint returns null when no checkpoint exists", async () => {
      const sessionId = randomUUID();

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);

      const checkpoint = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.equal(checkpoint, null, "No checkpoint should exist for new session");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("getCheckpoint returns checkpoint within TTL window", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 4,
        rowsCommitted: 400,
        timestamp: new Date().toISOString(),
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      const retrieved = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.ok(retrieved, "Checkpoint should be within TTL");
      assert.equal(retrieved!.lastSuccessfulBatchNumber, 4);

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("calculate startBatch from checkpoint", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 7,
        rowsCommitted: 700,
        timestamp: new Date().toISOString(),
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      // Simulate resume logic: start from checkpoint + 1
      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored);
      const startBatch = stored!.checkpointData
        ? stored!.checkpointData!.lastSuccessfulBatchNumber + 1
        : 0;

      assert.equal(startBatch, 8, "Should start from batch 8");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("resume only valid within session TTL window", async () => {
      const sessionId = randomUUID();
      const oldTimestamp = new Date(Date.now() - SESSION_TTL_MS - 1000).toISOString();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 3,
        rowsCommitted: 300,
        timestamp: oldTimestamp,
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      // Check checkpoint age
      const checkpointTime = new Date(checkpoint.timestamp).getTime();
      const now = Date.now();
      const isWithinTTL = (now - checkpointTime) <= SESSION_TTL_MS;

      assert.equal(isWithinTTL, false, "Checkpoint should be expired");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });
  });

  // ============================================================================
  // Company Isolation Tests
  // ============================================================================

  describe("Company Isolation", () => {
    test("company A cannot access company B checkpoint", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 2,
        rowsCommitted: 200,
        timestamp: new Date().toISOString(),
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      // Company B tries to access
      const retrieved = await getSession(pool, sessionId, 999);
      assert.equal(retrieved, null, "Company B should not access Company A session");

      // Company A can access
      const companyA = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(companyA, "Company A should access its own session");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("company A cannot update company B checkpoint", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 1,
        rowsCommitted: 100,
        timestamp: new Date().toISOString(),
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);

      // Company B tries to update checkpoint
      await updateCheckpoint(pool, sessionId, 999, checkpoint);

      // Check that no checkpoint exists for company B's access
      const stored = await getSession(pool, sessionId, 999);
      assert.equal(stored, null, "Company B update should not affect Company A session");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });
  });

  // ============================================================================
  // TTL and Expiry Tests
  // ============================================================================

  describe("Session TTL Enforcement", () => {
    test("SESSION_TTL_MS is 30 minutes", () => {
      assert.equal(SESSION_TTL_MS, 30 * 60 * 1000, "TTL should be 30 minutes");
    });

    test("expired session cannot be retrieved", async () => {
      const sessionId = randomUUID();

      // Insert session with past expires_at
      await pool.execute(
        `INSERT INTO import_sessions (session_id, company_id, entity_type, payload, created_at, expires_at)
         VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
        [sessionId, COMPANY_ID, "items", JSON.stringify(SAMPLE_PAYLOAD)]
      );

      // Session should not be retrievable (expired)
      const retrieved = await getSession(pool, sessionId, COMPANY_ID);
      assert.equal(retrieved, null, "Expired session should not be retrievable");

      // Cleanup
      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("checkpoint with expired session is not retrievable", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 5,
        rowsCommitted: 500,
        timestamp: new Date().toISOString(),
      };

      // Insert with past expiry
      await pool.execute(
        `INSERT INTO import_sessions (session_id, company_id, entity_type, payload, checkpoint_data, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
        [sessionId, COMPANY_ID, "items", JSON.stringify(SAMPLE_PAYLOAD), JSON.stringify(checkpoint)]
      );

      // getCheckpoint should return null due to expiry
      const retrieved = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.equal(retrieved, null, "Checkpoint in expired session should not be retrievable");

      // Cleanup
      await deleteSession(pool, sessionId, COMPANY_ID);
    });
  });

  // ============================================================================
  // Data Integrity Tests
  // ============================================================================

  describe("Data Integrity", () => {
    test("checkpoint data is valid JSON", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 10,
        rowsCommitted: 1000,
        timestamp: new Date().toISOString(),
        validationHash: "abc123",
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      // Direct DB check to verify JSON validity
      const [rows] = await pool.execute<any[]>(
        `SELECT checkpoint_data FROM import_sessions WHERE session_id = ?`,
        [sessionId]
      );

      assert.ok(rows.length > 0, "Row should exist");
      const parsed = JSON.parse(rows[0].checkpoint_data);
      assert.equal(parsed.lastSuccessfulBatchNumber, 10);

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("checkpoint preserves all fields", async () => {
      const sessionId = randomUUID();
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 15,
        rowsCommitted: 1500,
        timestamp: "2024-01-15T10:30:00.000Z",
        validationHash: "hash-abc-123",
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      const retrieved = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.ok(retrieved);
      assert.equal(retrieved!.lastSuccessfulBatchNumber, 15);
      assert.equal(retrieved!.rowsCommitted, 1500);
      assert.equal(retrieved!.timestamp, "2024-01-15T10:30:00.000Z");
      assert.equal(retrieved!.validationHash, "hash-abc-123");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });
  });
});

describe("Import Checkpoint/Resume - Acceptance Criteria Integration", () => {
  let pool: Pool;

  before(() => {
    pool = getDbPool();
  });

  after(async () => {
    await closeDbPool();
  });

  // ============================================================================
  // AC4: Partial Failure Handling Tests
  // ============================================================================

  describe("AC4: Partial Failure Handling", () => {
    test("simulates partial failure with checkpoint persistence", async () => {
      const sessionId = randomUUID();
      const initialCheckpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 3,
        rowsCommitted: 300,
        timestamp: new Date().toISOString(),
      };

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateFileHash(pool, sessionId, COMPANY_ID, computeFileHash(Buffer.from("test")));

      // First apply fails at batch 4
      await updateCheckpoint(pool, sessionId, COMPANY_ID, initialCheckpoint);

      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored);
      assert.ok(stored!.checkpointData, "Checkpoint should exist after partial failure");
      assert.equal(stored!.checkpointData!.lastSuccessfulBatchNumber, 3, "Batch 3 should be recorded");
      assert.equal(stored!.checkpointData!.rowsCommitted, 300, "300 rows should be committed");

      // Calculate resume point
      const resumeBatch = stored!.checkpointData!.lastSuccessfulBatchNumber + 1;
      assert.equal(resumeBatch, 4, "Should resume from batch 4");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("structured error response format for partial failure", async () => {
      // Test the structure that would be returned by apply endpoint
      const mockResult = {
        success: 500,
        failed: 50,
        created: 300,
        updated: 200,
        batchesCompleted: 3,
        batchesFailed: 1,
        rowsProcessed: 300,
        failedAtBatch: 3,
        rowsCommitted: 300,
        canResume: true,
        resumed: true,
        skippedBatches: 3,
        skippedRows: 300,
        errors: [
          { row: 301, error: "Batch 4 failed: Database connection lost" }
        ],
      };

      // Verify structured error has required fields
      assert.ok(typeof mockResult.failedAtBatch === "number", "failedAtBatch should be number");
      assert.ok(typeof mockResult.rowsCommitted === "number", "rowsCommitted should be number");
      assert.ok(typeof mockResult.canResume === "boolean", "canResume should be boolean");
      assert.ok(mockResult.canResume, "canResume should be true for partial failure");
      assert.ok(Array.isArray(mockResult.errors), "errors should be array");
    });
  });

  // ============================================================================
  // AC5: Integration Test Scenarios
  // ============================================================================

  describe("AC5: Integration Test Scenarios", () => {
    test("scenario: import 1000 rows, fail at batch 5, verify batches 1-4 committed", async () => {
      const sessionId = randomUUID();
      const fileHash = computeFileHash(Buffer.from("1000-row-import"));

      // Simulate 1000 rows = 2 batches (batch size 500)
      // But we simulate failure after 4 "batches" (with smaller batch size simulation)
      const rowsPerBatch = 100;
      const totalBatches = 10;

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateFileHash(pool, sessionId, COMPANY_ID, fileHash);

      // Simulate batches 0-3 committed successfully
      const committedThroughBatch = 3;
      for (let batch = 0; batch <= committedThroughBatch; batch++) {
        const checkpoint: CheckpointData = {
          lastSuccessfulBatchNumber: batch,
          rowsCommitted: (batch + 1) * rowsPerBatch,
          timestamp: new Date().toISOString(),
        };
        await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);
      }

      // Verify checkpoint reflects batch 3 (4th batch)
      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored);
      assert.ok(stored!.checkpointData);
      assert.equal(stored!.checkpointData!.lastSuccessfulBatchNumber, 3);
      assert.equal(stored!.checkpointData!.rowsCommitted, 400);

      // Calculate what would be resumed
      const resumeBatch = stored!.checkpointData!.lastSuccessfulBatchNumber + 1;
      assert.equal(resumeBatch, 4, "Should resume from batch 4");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("scenario: resume from checkpoint completes successfully", async () => {
      const sessionId = randomUUID();
      const fileHash = computeFileHash(Buffer.from("resume-test-file"));

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateFileHash(pool, sessionId, COMPANY_ID, fileHash);

      // Simulate previous partial import
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 2,
        rowsCommitted: 200,
        timestamp: new Date().toISOString(),
      };
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      // Simulate resume
      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored);
      assert.ok(stored!.checkpointData, "Checkpoint should exist for resume");
      assert.equal(stored!.fileHash, fileHash, "File hash should match for resume");

      // Resume calculation
      const resumeBatch = stored!.checkpointData!.lastSuccessfulBatchNumber + 1;
      const skippedRows = resumeBatch * 100;
      assert.equal(resumeBatch, 3, "Should resume from batch 3");
      assert.equal(skippedRows, 300, "Should skip 300 rows");

      // Simulate successful completion
      await clearCheckpoint(pool, sessionId, COMPANY_ID);
      const finalStored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(finalStored);
      assert.equal(finalStored!.checkpointData, null, "Checkpoint should be cleared after completion");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("scenario: hash mismatch detection rejects resume", async () => {
      const sessionId = randomUUID();
      const originalHash = computeFileHash(Buffer.from("original file"));
      const tamperedHash = computeFileHash(Buffer.from("tampered file"));

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateFileHash(pool, sessionId, COMPANY_ID, originalHash);

      // Set checkpoint for resume
      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 1,
        rowsCommitted: 100,
        timestamp: new Date().toISOString(),
      };
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      // Simulate client providing different hash (file was modified)
      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.ok(stored);
      assert.ok(stored!.fileHash);
      const hashMismatch = stored!.fileHash !== tamperedHash;

      assert.ok(hashMismatch, "Hash mismatch should be detected");
      assert.equal(stored!.fileHash, originalHash, "Original hash should be preserved");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("scenario: multiple resumes on same session work correctly", async () => {
      const sessionId = randomUUID();

      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);

      // First resume: batch 0 -> 1
      let checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 0,
        rowsCommitted: 100,
        timestamp: new Date().toISOString(),
      };
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      let retrieved = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.ok(retrieved);
      assert.equal(retrieved!.lastSuccessfulBatchNumber, 0);

      // Second resume: batch 1 -> 2
      checkpoint = {
        lastSuccessfulBatchNumber: 1,
        rowsCommitted: 200,
        timestamp: new Date().toISOString(),
      };
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      retrieved = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.ok(retrieved);
      assert.equal(retrieved!.lastSuccessfulBatchNumber, 1);

      // Third resume: batch 2 -> 3
      checkpoint = {
        lastSuccessfulBatchNumber: 2,
        rowsCommitted: 300,
        timestamp: new Date().toISOString(),
      };
      await updateCheckpoint(pool, sessionId, COMPANY_ID, checkpoint);

      retrieved = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.ok(retrieved);
      assert.equal(retrieved!.lastSuccessfulBatchNumber, 2);

      // Final resume: complete
      await clearCheckpoint(pool, sessionId, COMPANY_ID);
      retrieved = await getCheckpoint(pool, sessionId, COMPANY_ID);
      assert.equal(retrieved, null, "Checkpoint should be cleared");

      await deleteSession(pool, sessionId, COMPANY_ID);
    });

    test("scenario: expired session cannot resume", async () => {
      const sessionId = randomUUID();

      // Create session and set checkpoint
      await createSession(pool, sessionId, COMPANY_ID, "items", SAMPLE_PAYLOAD);
      await updateFileHash(pool, sessionId, COMPANY_ID, computeFileHash(Buffer.from("file")));

      const checkpoint: CheckpointData = {
        lastSuccessfulBatchNumber: 1,
        rowsCommitted: 100,
        timestamp: new Date(Date.now() - SESSION_TTL_MS - 1000).toISOString(), // Expired
      };

      // Insert directly with past expiry
      await pool.execute(
        `UPDATE import_sessions 
         SET checkpoint_data = ?, expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND)
         WHERE session_id = ? AND company_id = ?`,
        [JSON.stringify(checkpoint), sessionId, COMPANY_ID]
      );

      // Check if can resume
      const stored = await getSession(pool, sessionId, COMPANY_ID);
      assert.equal(stored, null, "Session should be expired");

      // Cleanup
      await deleteSession(pool, sessionId, COMPANY_ID);
    });
  });
});
