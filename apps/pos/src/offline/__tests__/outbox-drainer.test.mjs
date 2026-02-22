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

test("stale update path is ignored when attempt token is superseded", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T15:00:00.000Z");

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));

    const result = await drainOutboxJobs(
      {
        now: () => fixedNow,
        sender: async ({ job: activeJob }) => {
          await reserveOutboxAttempt(activeJob.job_id, db);
          return { result: "OK" };
        }
      },
      db
    );

    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(result.sent_count, 0);
    assert.equal(result.failed_count, 0);
    assert.equal(result.stale_count, 1);
    assert.equal(persisted?.status, "PENDING");
    assert.equal(persisted?.attempts, 2);
    assert.equal(persisted?.last_error, null);
  } finally {
    db.close();
    await db.delete();
  }
});

test("delayed older failure cannot overwrite newer SENT status", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-drainer-test-${crypto.randomUUID()}`);
  const fixedNow = Date.parse("2026-02-21T16:00:00.000Z");

  try {
    const job = await seedPendingOutboxJob(db, nowIso(fixedNow - 1_000));
    const firstAttemptEntered = createDeferred();
    const releaseFirstAttemptFailure = createDeferred();

    let senderCalls = 0;
    const sender = async ({ attempt_token }) => {
      senderCalls += 1;

      if (attempt_token === 1) {
        firstAttemptEntered.resolve();
        await releaseFirstAttemptFailure.promise;
        throw new OutboxSenderError("RETRYABLE", "NETWORK_ERROR", "LATE_FAILURE");
      }

      if (attempt_token === 2) {
        return { result: "OK" };
      }

      throw new Error(`Unexpected attempt token: ${attempt_token}`);
    };

    const firstDrainPromise = drainOutboxJobs(
      {
        now: () => fixedNow,
        sender
      },
      db
    );

    await firstAttemptEntered.promise;

    const secondDrainResult = await drainOutboxJobs(
      {
        now: () => fixedNow,
        sender
      },
      db
    );

    releaseFirstAttemptFailure.resolve();
    const firstDrainResult = await firstDrainPromise;
    const persisted = await db.outbox_jobs.get(job.job_id);

    assert.equal(senderCalls, 2);
    assert.equal(secondDrainResult.sent_count, 1);
    assert.equal(secondDrainResult.failed_count, 0);
    assert.equal(secondDrainResult.stale_count, 0);
    assert.equal(firstDrainResult.sent_count, 0);
    assert.equal(firstDrainResult.failed_count, 0);
    assert.equal(firstDrainResult.stale_count, 1);
    assert.equal(persisted?.status, "SENT");
    assert.equal(persisted?.attempts, 2);
    assert.equal(persisted?.next_attempt_at, null);
    assert.equal(persisted?.last_error, null);
  } finally {
    db.close();
    await db.delete();
  }
});
