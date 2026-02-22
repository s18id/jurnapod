import Dexie from "dexie";
import { type PosOfflineDb, posDb } from "./db.js";
import {
  type EnqueueOutboxJobInput,
  type OutboxAttemptToken,
  type OutboxJobRow,
  type OutboxStatusUpdateResult,
  type UpdateOutboxStatusInput,
  RecordNotFoundError,
  ScopeValidationError
} from "./types.js";

const SYNC_JOB_TYPE = "SYNC_POS_TX" as const;

function nowIso(): string {
  return new Date().toISOString();
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Dexie.ConstraintError || (error instanceof Error && error.name === "ConstraintError");
}

function assertEnqueueableSale(saleId: string, sale: { status: string; client_tx_id?: string }): string {
  if (sale.status !== "COMPLETED") {
    throw new ScopeValidationError(`Only COMPLETED sale can enqueue outbox job: ${saleId}`);
  }

  if (!sale.client_tx_id) {
    throw new ScopeValidationError(`COMPLETED sale missing client_tx_id: ${saleId}`);
  }

  return sale.client_tx_id;
}

export async function enqueueOutboxJob(input: EnqueueOutboxJobInput, db: PosOfflineDb = posDb): Promise<OutboxJobRow> {
  return db.transaction("rw", db.sales, db.outbox_jobs, async () => {
    return enqueueOutboxJobInTransaction(input, db);
  });
}

export async function enqueueOutboxJobInTransaction(
  input: EnqueueOutboxJobInput,
  db: PosOfflineDb,
  timestamp: string = nowIso()
): Promise<OutboxJobRow> {
  const sale = await db.sales.get(input.sale_id);
  if (!sale) {
    throw new RecordNotFoundError("sale", input.sale_id);
  }

  const dedupeKey = assertEnqueueableSale(input.sale_id, sale);

  const newJob: OutboxJobRow = {
    job_id: crypto.randomUUID(),
    sale_id: sale.sale_id,
    company_id: sale.company_id,
    outlet_id: sale.outlet_id,
    job_type: SYNC_JOB_TYPE,
    dedupe_key: dedupeKey,
    payload_json: JSON.stringify({
      sale_id: sale.sale_id,
      client_tx_id: dedupeKey,
      company_id: sale.company_id,
      outlet_id: sale.outlet_id
    }),
    status: "PENDING",
    attempts: 0,
    next_attempt_at: null,
    last_error: null,
    created_at: timestamp,
    updated_at: timestamp
  };

  try {
    await db.outbox_jobs.add(newJob);
    return newJob;
  } catch (error) {
    if (!isConstraintError(error)) {
      throw error;
    }

    const existing = await db.outbox_jobs.where("dedupe_key").equals(dedupeKey).first();
    if (!existing) {
      throw error;
    }

    return existing;
  }
}

export async function reserveOutboxAttempt(jobId: string, db: PosOfflineDb = posDb): Promise<OutboxAttemptToken> {
  return db.transaction("rw", db.outbox_jobs, async () => {
    const job = await db.outbox_jobs.get(jobId);
    if (!job) {
      throw new RecordNotFoundError("outbox_job", jobId);
    }

    if (job.status === "SENT") {
      return { job_id: job.job_id, attempt: job.attempts };
    }

    const nextAttempt = job.attempts + 1;
    await db.outbox_jobs.update(job.job_id, {
      attempts: nextAttempt,
      updated_at: nowIso()
    });

    return { job_id: job.job_id, attempt: nextAttempt };
  });
}

export async function updateOutboxJobStatus(
  input: UpdateOutboxStatusInput,
  db: PosOfflineDb = posDb
): Promise<OutboxStatusUpdateResult> {
  return db.transaction("rw", db.outbox_jobs, async () => {
    const current = await db.outbox_jobs.get(input.job_id);
    if (!current) {
      throw new RecordNotFoundError("outbox_job", input.job_id);
    }

    if (current.attempts !== input.attempt_token) {
      return {
        applied: false,
        reason: "STALE_ATTEMPT",
        job: current
      };
    }

    if (current.status === "SENT" && input.status !== "SENT") {
      return {
        applied: false,
        reason: "ALREADY_SENT",
        job: current
      };
    }

    const patch: Partial<OutboxJobRow> = {
      status: input.status,
      updated_at: nowIso()
    };

    if (input.status === "SENT") {
      patch.next_attempt_at = null;
      patch.last_error = null;
    }

    if (input.status === "FAILED") {
      patch.next_attempt_at = input.next_attempt_at ?? null;
      patch.last_error = input.last_error ?? "UNKNOWN_SYNC_ERROR";
    }

    if (input.status === "PENDING") {
      patch.next_attempt_at = input.next_attempt_at ?? current.next_attempt_at;
      patch.last_error = input.last_error ?? current.last_error;
    }

    await db.outbox_jobs.update(current.job_id, patch);

    const next: OutboxJobRow = {
      ...current,
      ...patch
    };

    return {
      applied: true,
      reason: "APPLIED",
      job: next
    };
  });
}
