import { type PosOfflineDb, posDb } from "./db.js";
import { reserveOutboxAttempt, updateOutboxJobStatus } from "./outbox.js";
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

export interface DrainOutboxJobsInput {
  batch_size?: number;
  sender?: OutboxJobSender;
  now?: () => number;
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

function parseIsoToMs(value: string | null): number | null {
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

function computeFailureBackoffMs(attempt: number, category: OutboxSendErrorCategory): number {
  if (category === "NON_RETRYABLE") {
    return NON_RETRYABLE_BACKOFF_MS;
  }

  const exponent = Math.max(0, attempt - 1);
  return Math.min(RETRY_BACKOFF_BASE_MS * 2 ** exponent, RETRY_BACKOFF_MAX_MS);
}

function stringifySendError(error: unknown): string {
  const classified = classifyOutboxSenderError(error);
  const categoryPrefix = classified.category === "NON_RETRYABLE" ? "NON_RETRYABLE" : "RETRYABLE";
  if (classified.message.trim().length > 0) {
    return `${categoryPrefix}:${classified.code}:${classified.message}`;
  }

  return `${categoryPrefix}:${classified.code}`;
}

async function selectDueOutboxJobs(db: PosOfflineDb, nowMs: number, batchSize: number): Promise<OutboxJobRow[]> {
  const candidates = await db.transaction("r", db.outbox_jobs, async () => {
    return db.outbox_jobs
      .toCollection()
      .filter((job) => isDrainableStatus(job.status) && isDueAtOrBeforeNow(job.next_attempt_at, nowMs))
      .toArray();
  });

  candidates.sort(compareDueJobs);
  return candidates.slice(0, batchSize);
}

async function isReservedAttemptCurrent(db: PosOfflineDb, jobId: string, attempt: number): Promise<boolean> {
  const current = await db.outbox_jobs.get(jobId);
  if (!current) {
    return false;
  }

  if (current.status === "SENT") {
    return false;
  }

  return current.attempts === attempt;
}

export async function drainOutboxJobs(input: DrainOutboxJobsInput = {}, db: PosOfflineDb = posDb): Promise<DrainOutboxJobsResult> {
  const now = input.now ?? Date.now;
  const sender = input.sender ?? defaultOutboxJobSender;
  const batchSize = resolveBatchSize(input.batch_size);
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
    const attempt = await reserveOutboxAttempt(job.job_id, db);
    const isCurrent = await isReservedAttemptCurrent(db, job.job_id, attempt.attempt);
    if (!isCurrent) {
      result.stale_count += 1;
      continue;
    }

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
          status: "SENT"
        },
        db
      );

      if (updateResult.applied) {
        result.sent_count += 1;
      } else {
        result.stale_count += 1;
      }
    } catch (error) {
      const classified = classifyOutboxSenderError(error);
      const nextAttemptAt = new Date(nowMs + computeFailureBackoffMs(attempt.attempt, classified.category)).toISOString();
      const updateResult = await updateOutboxJobStatus(
        {
          job_id: job.job_id,
          attempt_token: attempt.attempt,
          status: "FAILED",
          next_attempt_at: nextAttemptAt,
          last_error: stringifySendError(classified)
        },
        db
      );

      if (updateResult.applied) {
        result.failed_count += 1;
      } else {
        result.stale_count += 1;
      }
    }
  }

  result.skipped_count = Math.max(0, result.selected_count - result.sent_count - result.failed_count - result.stale_count);
  return result;
}
