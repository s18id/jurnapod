// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

import { createPosOfflineDb } from "../../../dist/offline/db.js";
import { drainOutboxJobs } from "../../../dist/offline/outbox-drainer.js";
import { OutboxSenderError } from "../../../dist/offline/outbox-sender.js";
import { enqueueOutboxJob, reserveOutboxAttempt, updateOutboxJobStatus } from "../../../dist/offline/outbox.js";

function nowIso(ms = Date.now()) {
  return new Date(ms).toISOString();
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject
  };
}

function buildCompletedSale(saleId, clientTxId, timestamp) {
  return {
    sale_id: saleId,
    client_tx_id: clientTxId,
    company_id: 2,
    outlet_id: 20,
    cashier_user_id: 77,
    status: "COMPLETED",
    sync_status: "PENDING",
    trx_at: timestamp,
    subtotal: 25000,
    discount_total: 0,
    tax_total: 0,
    grand_total: 25000,
    paid_total: 25000,
    change_total: 0,
    data_version: null,
    created_at: timestamp,
    completed_at: timestamp
  };
}

async function seedPendingOutboxJob(db, timestamp) {
  const saleId = crypto.randomUUID();
  const clientTxId = crypto.randomUUID();
  await db.sales.add(buildCompletedSale(saleId, clientTxId, timestamp));
  return enqueueOutboxJob({ sale_id: saleId }, db);
}

test("pending job becomes SENT when sender succeeds", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T10:00:00.000Z");

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));
    let senderCalls = 0;

    const result = await drainOutboxJobs(
      {
        batch_size: 5,
        now: () => fixedNow,
        sender: async ({ job: sentJob }) => {
          senderCalls += 1;
          assert.equal(sentJob.job_id, job.job_id);
          return { result: "OK" };
        }
      },
      db
    );

    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(senderCalls, 1);
    assert.equal(result.sent_count, 1);
    assert.equal(result.failed_count, 0);
    assert.equal(result.stale_count, 0);
    assert.equal(persisted?.status, "SENT");
    assert.equal(persisted?.attempts, 1);
    assert.equal(persisted?.next_attempt_at, null);
    assert.equal(persisted?.last_error, null);
  } finally {
    db.close();
    await db.delete();
  }
});

test("drain attempt log includes lease token context", { concurrency: false }, async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T10:05:00.000Z");
  const capturedLogs = [];
  const originalConsoleInfo = console.info;
  console.info = (...args) => {
    capturedLogs.push(args);
  };

  try {
    await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));

    const result = await drainOutboxJobs(
      {
        now: () => fixedNow,
        sender: async () => {
          return { result: "OK" };
        }
      },
      db
    );

    const attemptLog = capturedLogs.find(
      (entry) => entry[0] === "POS outbox drain attempt" && entry[1]?.result === "SENT"
    );

    assert.equal(result.sent_count, 1);
    assert.ok(attemptLog);
    assert.equal(typeof attemptLog[1].lease_token, "string");
    assert.match(attemptLog[1].lease_token, /^\*\*\*.{8}$/);
  } finally {
    console.info = originalConsoleInfo;
    db.close();
    await db.delete();
  }
});

test("drain attempt log masks short lease tokens", { concurrency: false }, async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T10:06:00.000Z");
  const capturedLogs = [];
  const originalConsoleInfo = console.info;
  const originalRandomUUID = globalThis.crypto.randomUUID;
  const shortLeaseToken = "tok123";
  let randomUuidCallCount = 0;
  console.info = (...args) => {
    capturedLogs.push(args);
  };

  try {
    await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));
    globalThis.crypto.randomUUID = () => {
      randomUuidCallCount += 1;
      if (randomUuidCallCount === 1) {
        return shortLeaseToken;
      }

      return originalRandomUUID();
    };

    const result = await drainOutboxJobs(
      {
        now: () => fixedNow,
        sender: async () => {
          return { result: "OK" };
        }
      },
      db
    );

    const attemptLog = capturedLogs.find(
      (entry) => entry[0] === "POS outbox drain attempt" && entry[1]?.result === "SENT"
    );

    assert.equal(result.sent_count, 1);
    assert.ok(attemptLog);
    assert.equal(attemptLog[1].lease_token, `***${shortLeaseToken}`);
    assert.notEqual(attemptLog[1].lease_token, shortLeaseToken);
  } finally {
    globalThis.crypto.randomUUID = originalRandomUUID;
    console.info = originalConsoleInfo;
    db.close();
    await db.delete();
  }
});

test("server DUPLICATE result marks job SENT", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T11:00:00.000Z");

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));

    const result = await drainOutboxJobs(
      {
        now: () => fixedNow,
        sender: async () => {
          return { result: "DUPLICATE" };
        }
      },
      db
    );

    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(result.sent_count, 1);
    assert.equal(result.failed_count, 0);
    assert.equal(persisted?.status, "SENT");
    assert.equal(persisted?.next_attempt_at, null);
    assert.equal(persisted?.last_error, null);
  } finally {
    db.close();
    await db.delete();
  }
});

test("retryable sender failure marks job FAILED and schedules near retry", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T12:00:00.000Z");

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));

    const result = await drainOutboxJobs(
      {
        now: () => fixedNow,
        random: () => 1,
        sender: async () => {
          throw new OutboxSenderError("RETRYABLE", "NETWORK_ERROR", "NETWORK_TIMEOUT");
        }
      },
      db
    );

    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(result.sent_count, 0);
    assert.equal(result.failed_count, 1);
    assert.equal(persisted?.status, "FAILED");
    assert.equal(persisted?.attempts, 1);
    assert.equal(persisted?.last_error, "RETRYABLE:NETWORK_ERROR:NETWORK_TIMEOUT");
    assert.equal(Date.parse(persisted?.next_attempt_at ?? ""), fixedNow + 5_000);
  } finally {
    db.close();
    await db.delete();
  }
});

test("non-retryable validation failure marks FAILED with tagged reason", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T13:00:00.000Z");

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));

    const result = await drainOutboxJobs(
      {
        now: () => fixedNow,
        random: () => 0,
        sender: async () => {
          throw new OutboxSenderError("NON_RETRYABLE", "VALIDATION_ERROR", "INVALID_PAYLOAD");
        }
      },
      db
    );

    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(result.sent_count, 0);
    assert.equal(result.failed_count, 1);
    assert.equal(persisted?.status, "FAILED");
    assert.equal(persisted?.attempts, 1);
    assert.equal(persisted?.last_error, "NON_RETRYABLE:VALIDATION_ERROR:INVALID_PAYLOAD");
    assert.equal(Date.parse(persisted?.next_attempt_at ?? ""), fixedNow + 300_000);
  } finally {
    db.close();
    await db.delete();
  }
});

test("failed job with future next_attempt_at is skipped", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T14:00:00.000Z");
  const retryAt = nowIso(fixedNow + 60_000);

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));
    const attempt = await reserveOutboxAttempt(job.job_id, db);
    await updateOutboxJobStatus(
      {
        job_id: job.job_id,
        attempt_token: attempt.attempt,
        status: "FAILED",
        next_attempt_at: retryAt,
        last_error: "PREVIOUS_FAILURE"
      },
      db
    );

    let senderCalls = 0;
    const result = await drainOutboxJobs(
      {
        now: () => fixedNow,
        sender: async () => {
          senderCalls += 1;
          return { result: "OK" };
        }
      },
      db
    );

    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(senderCalls, 0);
    assert.equal(result.selected_count, 0);
    assert.equal(result.sent_count, 0);
    assert.equal(result.failed_count, 0);
    assert.equal(persisted?.status, "FAILED");
    assert.equal(persisted?.next_attempt_at, retryAt);
  } finally {
    db.close();
    await db.delete();
  }
});

test("active lease prevents overlapping second drain send", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T15:00:00.000Z");

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));
    const senderGate = createDeferred();
    const releaseSender = createDeferred();
    let senderCalls = 0;

    const firstDrainPromise = drainOutboxJobs(
      {
        now: () => fixedNow,
        sender: async ({ job: activeJob }) => {
          senderCalls += 1;
          assert.equal(activeJob.job_id, job.job_id);
          senderGate.resolve();
          await releaseSender.promise;
          return { result: "OK" };
        }
      },
      db
    );

    await senderGate.promise;

    const secondDrainResult = await drainOutboxJobs(
      {
        now: () => fixedNow,
        sender: async () => {
          senderCalls += 1;
          return { result: "OK" };
        }
      },
      db
    );

    releaseSender.resolve();
    const firstDrainResult = await firstDrainPromise;

    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(senderCalls, 1);
    assert.equal(secondDrainResult.selected_count, 0);
    assert.equal(secondDrainResult.sent_count, 0);
    assert.equal(firstDrainResult.sent_count, 1);
    assert.equal(persisted?.status, "SENT");
    assert.equal(persisted?.attempts, 1);
    assert.equal(persisted?.last_error, null);
  } finally {
    db.close();
    await db.delete();
  }
});

test("timeout-like retry then duplicate replay converges to SENT", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T16:00:00.000Z");

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));
    let senderCalls = 0;
    const sender = async ({ attempt_token }) => {
      senderCalls += 1;
      if (attempt_token === 1) {
        throw new OutboxSenderError("RETRYABLE", "REQUEST_ABORTED", "AbortError");
      }

      return { result: "DUPLICATE" };
    };

    const firstDrainResult = await drainOutboxJobs(
      {
        now: () => fixedNow,
        random: () => 1,
        sender
      },
      db
    );

    const secondDrainResult = await drainOutboxJobs(
      {
        now: () => fixedNow + 5_000,
        sender
      },
      db
    );

    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(senderCalls, 2);
    assert.equal(firstDrainResult.sent_count, 0);
    assert.equal(firstDrainResult.failed_count, 1);
    assert.equal(firstDrainResult.stale_count, 0);
    assert.equal(secondDrainResult.sent_count, 1);
    assert.equal(secondDrainResult.failed_count, 0);
    assert.equal(secondDrainResult.stale_count, 0);
    assert.equal(persisted?.status, "SENT");
    assert.equal(persisted?.attempts, 2);
    assert.equal(persisted?.next_attempt_at, null);
    assert.equal(persisted?.last_error, null);
  } finally {
    db.close();
    await db.delete();
  }
});
