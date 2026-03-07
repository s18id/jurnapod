// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Outbox Service
 * 
 * Abstracts outbox queue operations from UI components.
 * Provides high-level operations for managing the sync outbox.
 */

import type { PosStoragePort } from "../ports/storage-port.js";
import type { OutboxJobRow } from "@jurnapod/offline-db/dexie";

export interface OutboxStats {
  pending_count: number;
  due_count: number;
  failed_count: number;
}

export interface OutboxJobSummary {
  job_id: string;
  sale_id: string;
  status: string;
  attempts: number;
  created_at: string;
  next_attempt_at: string | null;
  last_error: string | null;
}

/**
 * OutboxService
 * 
 * Provides operations for managing the outbox sync queue.
 */
export class OutboxService {
  constructor(private storage: PosStoragePort) {}

  /**
   * Get outbox statistics.
   */
  async getStats(): Promise<OutboxStats> {
    const now = new Date();
    const [pending_count, due_count] = await Promise.all([
      this.storage.countPendingOutboxJobs(),
      this.storage.countGlobalDueOutboxJobs(now)
    ]);

    // Count failed jobs (unsynced jobs include both PENDING and FAILED)
    const allUnsyncedJobs = await this.storage.listUnsyncedOutboxJobs(10000);
    const failed_count = allUnsyncedJobs.filter(job => job.status === "FAILED").length;

    return {
      pending_count,
      due_count,
      failed_count
    };
  }

  /**
   * List pending outbox jobs.
   */
  async listPendingJobs(limit = 100): Promise<OutboxJobSummary[]> {
    const jobs = await this.storage.listPendingOutboxJobs(limit);
    return jobs.map(job => this.toSummary(job));
  }

  /**
   * List due outbox jobs (ready for retry).
   */
  async listDueJobs(limit = 100): Promise<OutboxJobSummary[]> {
    const now = new Date();
    const jobs = await this.storage.listDueOutboxJobs({ now, limit });
    return jobs.map(job => this.toSummary(job));
  }

  /**
   * Get a specific outbox job.
   */
  async getJob(job_id: string): Promise<OutboxJobSummary | null> {
    const job = await this.storage.getOutboxJob(job_id);
    return job ? this.toSummary(job) : null;
  }

  /**
   * Check if there are any unsynced jobs (PENDING or FAILED) for a specific scope.
   */
  async hasPendingJobsForScope(scope: {
    company_id: number;
    outlet_id: number;
  }): Promise<boolean> {
    const allUnsynced = await this.storage.listUnsyncedOutboxJobs(10000);
    const scopedUnsynced = allUnsynced.filter(
      job =>
        job.company_id === scope.company_id &&
        job.outlet_id === scope.outlet_id
    );
    return scopedUnsynced.length > 0;
  }

  /**
   * Count unsynced jobs (PENDING or FAILED) for a specific scope.
   */
  async countPendingJobsForScope(scope: {
    company_id: number;
    outlet_id: number;
  }): Promise<number> {
    const allUnsynced = await this.storage.listUnsyncedOutboxJobs(10000);
    const scopedUnsynced = allUnsynced.filter(
      job =>
        job.company_id === scope.company_id &&
        job.outlet_id === scope.outlet_id
    );
    return scopedUnsynced.length;
  }

  private toSummary(job: OutboxJobRow): OutboxJobSummary {
    return {
      job_id: job.job_id,
      sale_id: job.sale_id,
      status: job.status,
      attempts: job.attempts,
      created_at: job.created_at,
      next_attempt_at: job.next_attempt_at,
      last_error: job.last_error
    };
  }
}
