import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

import { createPosOfflineDb } from "../../../dist/offline/db.js";
import { enqueueOutboxJob, reserveOutboxAttempt, updateOutboxJobStatus } from "../../../dist/offline/outbox.js";

function nowIso() {
  return new Date().toISOString();
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

test("concurrent enqueue collision creates one physical job row", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-test-${crypto.randomUUID()}`);
  const timestamp = nowIso();
  const saleId = crypto.randomUUID();
  const clientTxId = crypto.randomUUID();

  try {
    await db.sales.add(buildCompletedSale(saleId, clientTxId, timestamp));

    const [first, second] = await Promise.all([
      enqueueOutboxJob({ sale_id: saleId }, db),
      enqueueOutboxJob({ sale_id: saleId }, db)
    ]);

    assert.equal(first.job_id, second.job_id);
    assert.equal(first.dedupe_key, clientTxId);

    const outboxCount = await db.outbox_jobs.count();
    assert.equal(outboxCount, 1);
  } finally {
    db.close();
    await db.delete();
  }
});

test("stale attempt token is ignored and does not mutate job", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-test-${crypto.randomUUID()}`);
  const timestamp = nowIso();
  const saleId = crypto.randomUUID();
  const clientTxId = crypto.randomUUID();

  try {
    await db.sales.add(buildCompletedSale(saleId, clientTxId, timestamp));
    const job = await enqueueOutboxJob({ sale_id: saleId }, db);

    const firstAttempt = await reserveOutboxAttempt(job.job_id, db);
    const blockedAttempt = await reserveOutboxAttempt(job.job_id, db);

    assert.equal(firstAttempt.attempt, 1);
    assert.equal(firstAttempt.claimed, true);
    assert.equal(typeof firstAttempt.lease_token, "string");
    assert.equal(blockedAttempt.claimed, false);
    assert.equal(blockedAttempt.attempt, 1);

    const staleUpdate = await updateOutboxJobStatus(
      {
        job_id: job.job_id,
        attempt_token: firstAttempt.attempt + 1,
        status: "FAILED",
        last_error: "STALE_SHOULD_NOT_APPLY"
      },
      db
    );

    assert.equal(staleUpdate.applied, false);
    assert.equal(staleUpdate.reason, "STALE_ATTEMPT");
    assert.equal(staleUpdate.job.status, "PENDING");
    assert.equal(staleUpdate.job.attempts, 1);
    assert.equal(staleUpdate.job.last_error, null);

    const freshUpdate = await updateOutboxJobStatus(
      {
        job_id: job.job_id,
        attempt_token: firstAttempt.attempt,
        lease_token: firstAttempt.lease_token,
        status: "FAILED",
        next_attempt_at: nowIso(),
        last_error: "NETWORK_TIMEOUT"
      },
      db
    );

    assert.equal(freshUpdate.applied, true);
    assert.equal(freshUpdate.reason, "APPLIED");
    assert.equal(freshUpdate.job.status, "FAILED");
    assert.equal(freshUpdate.job.attempts, 1);
    assert.equal(freshUpdate.job.last_error, "NETWORK_TIMEOUT");
  } finally {
    db.close();
    await db.delete();
  }
});

test("stale lease token is rejected by CAS update", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-test-${crypto.randomUUID()}`);
  const timestamp = nowIso();
  const saleId = crypto.randomUUID();
  const clientTxId = crypto.randomUUID();

  try {
    await db.sales.add(buildCompletedSale(saleId, clientTxId, timestamp));
    const job = await enqueueOutboxJob({ sale_id: saleId }, db);
    const attempt = await reserveOutboxAttempt(job.job_id, db);

    assert.equal(attempt.claimed, true);

    const staleLeaseUpdate = await updateOutboxJobStatus(
      {
        job_id: job.job_id,
        attempt_token: attempt.attempt,
        lease_token: `${attempt.lease_token}-stale`,
        status: "SENT"
      },
      db
    );

    assert.equal(staleLeaseUpdate.applied, false);
    assert.equal(staleLeaseUpdate.reason, "STALE_LEASE");
    assert.equal(staleLeaseUpdate.job.status, "PENDING");

    const freshUpdate = await updateOutboxJobStatus(
      {
        job_id: job.job_id,
        attempt_token: attempt.attempt,
        lease_token: attempt.lease_token,
        status: "SENT"
      },
      db
    );

    assert.equal(freshUpdate.applied, true);
    assert.equal(freshUpdate.job.status, "SENT");
  } finally {
    db.close();
    await db.delete();
  }
});

test("SENT is terminal against later FAILED/PENDING updates", async () => {
  const db = createPosOfflineDb(`jp-pos-outbox-test-${crypto.randomUUID()}`);
  const timestamp = nowIso();
  const saleId = crypto.randomUUID();
  const clientTxId = crypto.randomUUID();

  try {
    await db.sales.add(buildCompletedSale(saleId, clientTxId, timestamp));
    const job = await enqueueOutboxJob({ sale_id: saleId }, db);
    const attempt = await reserveOutboxAttempt(job.job_id, db);

    const markSent = await updateOutboxJobStatus(
      {
        job_id: job.job_id,
        attempt_token: attempt.attempt,
        lease_token: attempt.lease_token,
        status: "SENT"
      },
      db
    );
    assert.equal(markSent.applied, true);
    assert.equal(markSent.job.status, "SENT");

    const downgradeToFailed = await updateOutboxJobStatus(
      {
        job_id: job.job_id,
        attempt_token: attempt.attempt,
        status: "FAILED",
        next_attempt_at: nowIso(),
        last_error: "LATE_FAILURE"
      },
      db
    );
    assert.equal(downgradeToFailed.applied, false);
    assert.equal(downgradeToFailed.reason, "ALREADY_SENT");
    assert.equal(downgradeToFailed.job.status, "SENT");

    const downgradeToPending = await updateOutboxJobStatus(
      {
        job_id: job.job_id,
        attempt_token: attempt.attempt,
        status: "PENDING",
        next_attempt_at: nowIso(),
        last_error: "LATE_RETRY"
      },
      db
    );
    assert.equal(downgradeToPending.applied, false);
    assert.equal(downgradeToPending.reason, "ALREADY_SENT");
    assert.equal(downgradeToPending.job.status, "SENT");

    const persisted = await db.outbox_jobs.get(job.job_id);
    assert.equal(persisted?.status, "SENT");
    assert.equal(persisted?.next_attempt_at, null);
    assert.equal(persisted?.last_error, null);
  } finally {
    db.close();
    await db.delete();
  }
});
