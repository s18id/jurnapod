import Dexie from "dexie";
import { type PosOfflineDb, posDb } from "./db.js";
import {
  type EnqueueOutboxJobInput,
  type OutboxAttemptToken,
  type OutboxJobRow,
  type OutboxStatusUpdateResult,
  type ReserveOutboxAttemptInput,
  type UpdateOutboxStatusInput,
  RecordNotFoundError,
  ScopeValidationError
} from "./types.js";

const SYNC_JOB_TYPE = "SYNC_POS_TX" as const;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_LEASE_OWNER_ID = "OUTBOX_DRAINER";

interface RenewOutboxLeaseInput {
  job_id: string;
  attempt_token: number;
  lease_token: string;
  owner_id: string;
  lease_ms: number;
  now?: () => number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isoFromMs(value: number): string {
  return new Date(value).toISOString();
}

function parseIsoToMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Dexie.ConstraintError || (error instanceof Error && error.name === "ConstraintError");
}

function isLeaseActive(job: Pick<OutboxJobRow, "lease_token" | "lease_expires_at">, nowMs: number): boolean {
  if (!job.lease_token) {
    return false;
  }

  const leaseExpiresAtMs = parseIsoToMs(job.lease_expires_at);
  if (leaseExpiresAtMs === null) {
    return false;
  }

  return leaseExpiresAtMs > nowMs;
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

function resolveReserveAttemptInput(input: string | ReserveOutboxAttemptInput): ReserveOutboxAttemptInput {
  if (typeof input === "string") {
    return {
      job_id: input,
      owner_id: DEFAULT_LEASE_OWNER_ID,
      lease_ms: DEFAULT_LEASE_MS
    };
  }

  return {
    job_id: input.job_id,
    owner_id: input.owner_id,
    lease_ms: input.lease_ms,
    now: input.now
  };
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
    lease_owner_id: null,
    lease_token: null,
    lease_expires_at: null,
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

export async function reserveOutboxAttempt(
  input: string | ReserveOutboxAttemptInput,
  db: PosOfflineDb = posDb
): Promise<OutboxAttemptToken> {
  const resolved = resolveReserveAttemptInput(input);
  const now = resolved.now ?? Date.now;
  const leaseMs = Number.isFinite(resolved.lease_ms) && resolved.lease_ms > 0 ? Math.floor(resolved.lease_ms) : DEFAULT_LEASE_MS;

  return db.transaction("rw", db.outbox_jobs, async () => {
    const job = await db.outbox_jobs.get(resolved.job_id);
    if (!job) {
      throw new RecordNotFoundError("outbox_job", resolved.job_id);
    }

    if (job.status === "SENT") {
      return { job_id: job.job_id, attempt: job.attempts, lease_token: null, claimed: false };
    }

    const nowMs = now();
    if (isLeaseActive(job, nowMs)) {
      return {
        job_id: job.job_id,
        attempt: job.attempts,
        lease_token: job.lease_token,
        claimed: false
      };
    }

    const nextAttempt = job.attempts + 1;
    const leaseToken = crypto.randomUUID();
    await db.outbox_jobs.update(job.job_id, {
      attempts: nextAttempt,
      lease_owner_id: resolved.owner_id,
      lease_token: leaseToken,
      lease_expires_at: isoFromMs(nowMs + leaseMs),
      updated_at: nowIso()
    });

    return { job_id: job.job_id, attempt: nextAttempt, lease_token: leaseToken, claimed: true };
  });
}

export async function renewOutboxAttemptLease(input: RenewOutboxLeaseInput, db: PosOfflineDb = posDb): Promise<boolean> {
  const now = input.now ?? Date.now;
  const leaseMs = Number.isFinite(input.lease_ms) && input.lease_ms > 0 ? Math.floor(input.lease_ms) : DEFAULT_LEASE_MS;

  return db.transaction("rw", db.outbox_jobs, async () => {
    const current = await db.outbox_jobs.get(input.job_id);
    if (!current) {
      return false;
    }

    if (current.status === "SENT") {
      return false;
    }

    if (current.attempts !== input.attempt_token) {
      return false;
    }

    if (current.lease_token !== input.lease_token || current.lease_owner_id !== input.owner_id) {
      return false;
    }

    await db.outbox_jobs.update(input.job_id, {
      lease_expires_at: isoFromMs(now() + leaseMs),
      updated_at: nowIso()
    });
    return true;
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

    if (input.lease_token !== undefined && current.lease_token !== input.lease_token) {
      return {
        applied: false,
        reason: "STALE_LEASE",
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
      lease_owner_id: null,
      lease_token: null,
      lease_expires_at: null,
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
