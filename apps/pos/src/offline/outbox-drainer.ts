import { type PosOfflineDb, posDb } from "./db.js";
import { renewOutboxAttemptLease, reserveOutboxAttempt, updateOutboxJobStatus } from "./outbox.js";
import {
  type OutboxSendAck,
  type OutboxSendErrorCategory,
  classifyOutboxSenderError,
  sendOutboxJobToSyncPush
} from "./outbox-sender.js";
import type { OutboxJobRow } from "./types.js";

const DEFAULT_BATCH_SIZE = 10;
const RETRY_BACKOFF_BASE_MS = 5_000;
const RETRY_BACKOFF_MAX_MS = 60_000;
const NON_RETRYABLE_BACKOFF_MS = 300_000;
const NON_RETRYABLE_JITTER_MAX_MS = 30_000;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_OWNER_ID = `OUTBOX_DRAINER:${crypto.randomUUID()}`;
const UNKNOWN_DRAIN_REASON = "UNSPECIFIED";
const UNKNOWN_CLIENT_TX_ID = "UNKNOWN";

export interface DrainOutboxJobsInput {
  batch_size?: number;
  sender?: OutboxJobSender;
  now?: () => number;
  random?: () => number;
  owner_id?: string;
  lease_ms?: number;
  drain_reason?: string;
}

export interface OutboxSendInput {
  job: OutboxJobRow;
  attempt_token: number;
  db: PosOfflineDb;
}

export type OutboxJobSender = (input: OutboxSendInput) => Promise<OutboxSendAck>;

export interface DrainOutboxJobsResult {
  selected_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  stale_count: number;
}

export const defaultOutboxJobSender: OutboxJobSender = async ({ job, db }) => {
  return sendOutboxJobToSyncPush({ job }, db);
};

function parseIsoToMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDrainableStatus(status: OutboxJobRow["status"]): boolean {
  return status === "PENDING" || status === "FAILED";
}

function isDueAtOrBeforeNow(nextAttemptAt: string | null, nowMs: number): boolean {
  const nextAttemptMs = parseIsoToMs(nextAttemptAt);
  if (nextAttemptMs === null) {
    return true;
  }

  return nextAttemptMs <= nowMs;
}

function isLeaseActive(job: Pick<OutboxJobRow, "lease_token" | "lease_expires_at">, nowMs: number): boolean {
  if (!job.lease_token) {
    return false;
  }

  const expiresAtMs = parseIsoToMs(job.lease_expires_at);
  if (expiresAtMs === null) {
    return false;
  }

  return expiresAtMs > nowMs;
}

function compareDueJobs(first: OutboxJobRow, second: OutboxJobRow): number {
  const firstDue = parseIsoToMs(first.next_attempt_at) ?? 0;
  const secondDue = parseIsoToMs(second.next_attempt_at) ?? 0;
  if (firstDue !== secondDue) {
    return firstDue - secondDue;
  }

  const firstCreated = parseIsoToMs(first.created_at) ?? 0;
  const secondCreated = parseIsoToMs(second.created_at) ?? 0;
  if (firstCreated !== secondCreated) {
    return firstCreated - secondCreated;
  }

  return first.job_id.localeCompare(second.job_id);
}

function resolveBatchSize(batchSize: number | undefined): number {
  if (!Number.isFinite(batchSize) || batchSize === undefined || batchSize <= 0) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.floor(batchSize);
}

function normalizeRandomValue(randomValue: number): number {
  if (!Number.isFinite(randomValue)) {
    return 0;
  }

  return Math.max(0, Math.min(1, randomValue));
}

function computeFailureBackoffMs(attempt: number, category: OutboxSendErrorCategory, random: () => number): number {
  if (category === "NON_RETRYABLE") {
    const jitter = Math.floor(normalizeRandomValue(random()) * NON_RETRYABLE_JITTER_MAX_MS);
    return NON_RETRYABLE_BACKOFF_MS + jitter;
  }

  const exponent = Math.max(0, attempt - 1);
  const raw = Math.min(RETRY_BACKOFF_BASE_MS * 2 ** exponent, RETRY_BACKOFF_MAX_MS);
  return Math.floor(normalizeRandomValue(random()) * raw);
}

function stringifySendError(error: unknown): string {
  const classified = classifyOutboxSenderError(error);
  const categoryPrefix = classified.category === "NON_RETRYABLE" ? "NON_RETRYABLE" : "RETRYABLE";
  if (classified.message.trim().length > 0) {
    return `${categoryPrefix}:${classified.code}:${classified.message}`;
  }

  return `${categoryPrefix}:${classified.code}`;
}

function resolveDrainReason(value: string | undefined): string {
  if (!value) {
    return UNKNOWN_DRAIN_REASON;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : UNKNOWN_DRAIN_REASON;
}

function readClientTxIdFromOutboxPayload(job: OutboxJobRow): string {
  try {
    const parsed = JSON.parse(job.payload_json) as { client_tx_id?: unknown };
    if (typeof parsed.client_tx_id === "string" && parsed.client_tx_id.trim().length > 0) {
      return parsed.client_tx_id;
    }
  } catch {
    // Keep deterministic fallback for malformed payloads.
  }

  return UNKNOWN_CLIENT_TX_ID;
}

function maskLeaseToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return "***";
  }

  return `***${normalized.slice(-8)}`;
}

function logOutboxDrainAttempt(params: {
  correlationId: string | null;
  clientTxId: string;
  attempt: number;
  leaseToken: string | null;
  drainReason: string;
  latencyMs: number;
  result: "SENT" | "FAILED" | "STALE";
}): void {
  console.info("POS outbox drain attempt", {
    correlation_id: params.correlationId,
    client_tx_id: params.clientTxId,
    attempt: params.attempt,
    lease_token: maskLeaseToken(params.leaseToken),
    drain_reason: params.drainReason,
    latency_ms: params.latencyMs,
    result: params.result
  });
}

async function selectDueOutboxJobs(db: PosOfflineDb, nowMs: number, batchSize: number): Promise<OutboxJobRow[]> {
  const candidates = await db.transaction("r", db.outbox_jobs, async () => {
    return db.outbox_jobs
      .toCollection()
      .filter(
        (job) =>
          isDrainableStatus(job.status) && isDueAtOrBeforeNow(job.next_attempt_at, nowMs) && !isLeaseActive(job, nowMs)
      )
      .toArray();
  });

  candidates.sort(compareDueJobs);
  return candidates.slice(0, batchSize);
}

export async function drainOutboxJobs(input: DrainOutboxJobsInput = {}, db: PosOfflineDb = posDb): Promise<DrainOutboxJobsResult> {
  const now = input.now ?? Date.now;
  const random = input.random ?? Math.random;
  const sender = input.sender ?? defaultOutboxJobSender;
  const batchSize = resolveBatchSize(input.batch_size);
  const ownerId = input.owner_id ?? DEFAULT_OWNER_ID;
  const drainReason = resolveDrainReason(input.drain_reason);
  const leaseMs =
    Number.isFinite(input.lease_ms) && input.lease_ms !== undefined && input.lease_ms > 0
      ? Math.floor(input.lease_ms)
      : DEFAULT_LEASE_MS;
  const nowMs = now();
  const jobs = await selectDueOutboxJobs(db, nowMs, batchSize);

  const result: DrainOutboxJobsResult = {
    selected_count: jobs.length,
    sent_count: 0,
    failed_count: 0,
    skipped_count: 0,
    stale_count: 0
  };

  for (const job of jobs) {
    const clientTxId = readClientTxIdFromOutboxPayload(job);
    const attempt = await reserveOutboxAttempt(
      {
        job_id: job.job_id,
        owner_id: ownerId,
        lease_ms: leaseMs,
        now
      },
      db
    );

    if (!attempt.claimed || !attempt.lease_token) {
      result.stale_count += 1;
      continue;
    }

    const leaseToken = attempt.lease_token;
    const sendStartedAtMs = now();

    const heartbeatIntervalMs = Math.max(1_000, Math.floor(leaseMs / 3));
    const heartbeatId = globalThis.setInterval(() => {
      void renewOutboxAttemptLease(
        {
          job_id: job.job_id,
          attempt_token: attempt.attempt,
          lease_token: leaseToken,
          owner_id: ownerId,
          lease_ms: leaseMs,
          now
        },
        db
      );
    }, heartbeatIntervalMs);

    try {
      const sendResult = await sender({
        job,
        attempt_token: attempt.attempt,
        db
      });

      if (sendResult.result !== "OK" && sendResult.result !== "DUPLICATE") {
        throw new Error(`Unsupported sender result: ${String(sendResult.result)}`);
      }

      const updateResult = await updateOutboxJobStatus(
        {
          job_id: job.job_id,
          attempt_token: attempt.attempt,
          lease_token: leaseToken,
          status: "SENT"
        },
        db
      );

      if (updateResult.applied) {
        result.sent_count += 1;
        logOutboxDrainAttempt({
          correlationId: sendResult.correlation_id ?? null,
          clientTxId,
          attempt: attempt.attempt,
          leaseToken,
          drainReason,
          latencyMs: Math.max(0, now() - sendStartedAtMs),
          result: "SENT"
        });
      } else {
        result.stale_count += 1;
        logOutboxDrainAttempt({
          correlationId: sendResult.correlation_id ?? null,
          clientTxId,
          attempt: attempt.attempt,
          leaseToken,
          drainReason,
          latencyMs: Math.max(0, now() - sendStartedAtMs),
          result: "STALE"
        });
      }
    } catch (error) {
      const classified = classifyOutboxSenderError(error);
      const nextAttemptAt = new Date(now() + computeFailureBackoffMs(attempt.attempt, classified.category, random)).toISOString();
      const updateResult = await updateOutboxJobStatus(
        {
          job_id: job.job_id,
          attempt_token: attempt.attempt,
          lease_token: leaseToken,
          status: "FAILED",
          next_attempt_at: nextAttemptAt,
          last_error: stringifySendError(classified)
        },
        db
      );

      if (updateResult.applied) {
        result.failed_count += 1;
        logOutboxDrainAttempt({
          correlationId: null,
          clientTxId,
          attempt: attempt.attempt,
          leaseToken,
          drainReason,
          latencyMs: Math.max(0, now() - sendStartedAtMs),
          result: "FAILED"
        });
      } else {
        result.stale_count += 1;
        logOutboxDrainAttempt({
          correlationId: null,
          clientTxId,
          attempt: attempt.attempt,
          leaseToken,
          drainReason,
          latencyMs: Math.max(0, now() - sendStartedAtMs),
          result: "STALE"
        });
      }
    } finally {
      globalThis.clearInterval(heartbeatId);
    }
  }

  result.skipped_count = Math.max(0, result.selected_count - result.sent_count - result.failed_count - result.stale_count);
  return result;
}
