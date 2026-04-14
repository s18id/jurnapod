// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Recovery Service
 * 
 * Handles crash recovery and transaction durability:
 * - Transaction recovery on POS app startup
 * - Detection of incomplete transactions from previous sessions
 * - Resume outbox sync for pending transactions
 * - Duplicate prevention using client_tx_id
 */

import type { PosOfflineDb, OutboxJobRow, SaleRow } from "@jurnapod/offline-db/dexie";
import { posDb } from "@jurnapod/offline-db/dexie";

export interface RecoveryResult {
  success: boolean;
  transactionsRecovered: number;
  duplicatesPrevented: number;
  orphanedJobsCleaned: number;
  durationMs: number;
  errors: string[];
}

export interface TransactionRecoveryEntry {
  saleId: string;
  clientTxId: string;
  status: "PENDING" | "SYNCING" | "RECOVERED";
  previousSessionDetected: boolean;
  recoveredAt: string;
}

export type TransactionState = "PENDING" | "SYNCING" | "COMPLETED" | "FAILED";

export interface TransactionStateInfo {
  saleId: string;
  clientTxId: string | null;
  saleStatus: string;
  syncStatus: string;
  state: TransactionState;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * POS Recovery Service
 * 
 * Manages crash recovery and ensures transaction durability
 */
export class RecoveryService {
  constructor(private db: PosOfflineDb = posDb) {}

  /**
   * Perform startup recovery check
   * Scans for incomplete transactions and ensures they're properly queued
   */
  async performStartupRecovery(): Promise<RecoveryResult> {
    const startTime = performance.now();
    const errors: string[] = [];
    let transactionsRecovered = 0;
    let duplicatesPrevented = 0;
    let orphanedJobsCleaned = 0;

    try {
      // Step 1: Find sales that are COMPLETED but not in outbox
      const completedSalesWithoutOutbox = await this.findCompletedSalesWithoutOutbox();
      for (const sale of completedSalesWithoutOutbox) {
        const recovered = await this.recoverOrphanedSale(sale);
        if (recovered) transactionsRecovered++;
      }

      // Step 2: Find outbox jobs for non-existent sales (orphaned)
      orphanedJobsCleaned = await this.cleanOrphanedOutboxJobs();

      // Step 3: Reset stale SYNCING jobs back to PENDING
      const resetCount = await this.resetStaleSyncingJobs();
      transactionsRecovered += resetCount;

      // Step 4: Verify all PENDING jobs have valid sale references
      const validJobs = await this.validateOutboxJobReferences();
      if (validJobs > 0) {
        // Some jobs were invalid and cleaned up
        orphanedJobsCleaned += validJobs;
      }

      return {
        success: true,
        transactionsRecovered,
        duplicatesPrevented,
        orphanedJobsCleaned,
        durationMs: performance.now() - startTime,
        errors
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Recovery failed: ${message}`);
      return {
        success: false,
        transactionsRecovered,
        duplicatesPrevented,
        orphanedJobsCleaned,
        durationMs: performance.now() - startTime,
        errors
      };
    }
  }

  /**
   * Find COMPLETED sales that don't have a corresponding outbox job
   */
  private async findCompletedSalesWithoutOutbox(): Promise<SaleRow[]> {
    // Get all COMPLETED sales with sync_status PENDING or LOCAL_ONLY
    const completedSales = await this.db.sales
      .where("status")
      .equals("COMPLETED")
      .filter(sale => sale.sync_status === "PENDING" || sale.sync_status === "LOCAL_ONLY")
      .toArray();

    // Get all sale_ids that have outbox jobs
    const outboxSaleIds = new Set<string>();
    const outboxJobs = await this.db.outbox_jobs.toArray();
    for (const job of outboxJobs) {
      outboxSaleIds.add(job.sale_id);
    }

    // Return sales without outbox jobs
    return completedSales.filter(sale => !outboxSaleIds.has(sale.sale_id));
  }

  /**
   * Recover an orphaned sale by creating an outbox job for it
   */
  private async recoverOrphanedSale(sale: SaleRow): Promise<boolean> {
    try {
      if (!sale.client_tx_id) {
        // Sale has no client_tx_id, can't recover safely
        console.warn(`[Recovery] Cannot recover sale ${sale.sale_id}: no client_tx_id`);
        return false;
      }

      // Create outbox job for this sale
      const { enqueueOutboxJobInTransaction } = await import("../offline/outbox.js");
      await enqueueOutboxJobInTransaction({ sale_id: sale.sale_id }, this.db);

      // Update sale sync_status to PENDING if it was LOCAL_ONLY
      if (sale.sync_status === "LOCAL_ONLY") {
        await this.db.sales.update(sale.sale_id, { sync_status: "PENDING" });
      }

      return true;
    } catch (error) {
      // If it's a constraint error, the job might already exist (duplicate)
      if (error instanceof Error && error.name === "ConstraintError") {
        return false;
      }
      throw error;
    }
  }

  /**
   * Clean up orphaned outbox jobs (jobs referencing non-existent sales)
   */
  private async cleanOrphanedOutboxJobs(): Promise<number> {
    const outboxJobs = await this.db.outbox_jobs.toArray();
    const sales = await this.db.sales.toArray();
    const validSaleIds = new Set(sales.map(s => s.sale_id));

    const orphanedJobs: string[] = [];
    for (const job of outboxJobs) {
      if (!validSaleIds.has(job.sale_id)) {
        orphanedJobs.push(job.job_id);
      }
    }

    if (orphanedJobs.length > 0) {
      await this.db.outbox_jobs.bulkDelete(orphanedJobs);
    }

    return orphanedJobs.length;
  }

  /**
   * Reset stale SYNCING jobs back to PENDING
   * A job is stale if it's been in SYNCING state for too long (likely due to crash)
   */
  private async resetStaleSyncingJobs(): Promise<number> {
    // Find jobs that are stuck (have lease_owner_id but lease is expired)
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    const allJobs = await this.db.outbox_jobs.toArray();
    const staleJobs: string[] = [];

    for (const job of allJobs) {
      if (job.lease_expires_at) {
        const expiresAt = Date.parse(job.lease_expires_at);
        if (!isNaN(expiresAt) && expiresAt < now - staleThreshold) {
          staleJobs.push(job.job_id);
        }
      }
    }

    // Reset stale jobs
    for (const jobId of staleJobs) {
      await this.db.outbox_jobs.update(jobId, {
        status: "PENDING",
        lease_owner_id: null,
        lease_token: null,
        lease_expires_at: null,
        next_attempt_at: null
      });
    }

    return staleJobs.length;
  }

  /**
   * Validate that outbox job references are still valid
   */
  private async validateOutboxJobReferences(): Promise<number> {
    const outboxJobs = await this.db.outbox_jobs.toArray();
    const sales = await this.db.sales.toArray();
    const validSaleIds = new Set(sales.map(s => s.sale_id));

    let invalidCount = 0;
    for (const job of outboxJobs) {
      if (!validSaleIds.has(job.sale_id)) {
        // Delete invalid job
        await this.db.outbox_jobs.delete(job.job_id);
        invalidCount++;
      } else {
        // Check sale status - if sale is VOID, we might want to handle differently
        const sale = sales.find(s => s.sale_id === job.sale_id);
        if (sale && sale.status === "VOID") {
          // Keep VOID sales in outbox for audit trail, but mark as non-retryable
          // Actually, we should keep them so the server knows about the void
        }
      }
    }

    return invalidCount;
  }

  /**
   * Get transaction state for a specific sale
   */
  async getTransactionState(saleId: string): Promise<TransactionStateInfo | null> {
    const sale = await this.db.sales.get(saleId);
    if (!sale) return null;

    const outboxJobs = await this.db.outbox_jobs.where("sale_id").equals(saleId).toArray();
    const latestJob = outboxJobs.sort((a, b) => 
      (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0)
    )[0];

    let state: TransactionState;
    let attempts = 0;
    let lastError: string | null = null;

    if (latestJob) {
      attempts = latestJob.attempts;
      lastError = latestJob.last_error;

      if (latestJob.status === "SENT") {
        state = "COMPLETED";
      } else if (latestJob.status === "FAILED") {
        state = "FAILED";
      } else if (latestJob.lease_token && latestJob.lease_expires_at) {
        const expiresAt = Date.parse(latestJob.lease_expires_at);
        if (!isNaN(expiresAt) && expiresAt > Date.now()) {
          state = "SYNCING";
        } else {
          state = "PENDING";
        }
      } else {
        state = "PENDING";
      }
    } else {
      state = sale.status === "COMPLETED" ? "PENDING" : "PENDING";
    }

    return {
      saleId: sale.sale_id,
      clientTxId: sale.client_tx_id ?? null,
      saleStatus: sale.status,
      syncStatus: sale.sync_status,
      state,
      attempts,
      lastError,
      createdAt: sale.created_at,
      completedAt: sale.completed_at
    };
  }

  /**
   * Get all transactions in a specific state
   */
  async getTransactionsByState(state: TransactionState): Promise<TransactionStateInfo[]> {
    const sales = await this.db.sales.toArray();
    const results: TransactionStateInfo[] = [];

    for (const sale of sales) {
      const stateInfo = await this.getTransactionState(sale.sale_id);
      if (stateInfo && stateInfo.state === state) {
        results.push(stateInfo);
      }
    }

    return results;
  }

  /**
   * Manually retry a failed transaction
   */
  async manualRetry(saleId: string): Promise<boolean> {
    const stateInfo = await this.getTransactionState(saleId);
    if (!stateInfo) return false;

    if (stateInfo.state !== "FAILED") {
      return false;
    }

    // Reset job status to PENDING for immediate retry
    const jobs = await this.db.outbox_jobs.where("sale_id").equals(saleId).toArray();
    for (const job of jobs) {
      if (job.status === "FAILED") {
        await this.db.outbox_jobs.update(job.job_id, {
          status: "PENDING",
          next_attempt_at: new Date().toISOString()
        });
      }
    }

    return true;
  }

  /**
   * Get recovery statistics
   */
  async getRecoveryStats(): Promise<{
    totalSales: number;
    completedSales: number;
    pendingSync: number;
    failedSync: number;
    completedSync: number;
    orphanedJobs: number;
  }> {
    const [sales, outboxJobs] = await Promise.all([
      this.db.sales.toArray(),
      this.db.outbox_jobs.toArray()
    ]);

    const completedSales = sales.filter(s => s.status === "COMPLETED").length;
    const pendingSync = outboxJobs.filter(j => j.status === "PENDING").length;
    const failedSync = outboxJobs.filter(j => j.status === "FAILED").length;
    const completedSync = outboxJobs.filter(j => j.status === "SENT").length;

    const validSaleIds = new Set(sales.map(s => s.sale_id));
    const orphanedJobs = outboxJobs.filter(j => !validSaleIds.has(j.sale_id)).length;

    return {
      totalSales: sales.length,
      completedSales,
      pendingSync,
      failedSync,
      completedSync,
      orphanedJobs
    };
  }
}

// Singleton for global recovery service
let globalRecoveryService: RecoveryService | null = null;

export function getRecoveryService(db?: PosOfflineDb): RecoveryService {
  if (!globalRecoveryService || db) {
    return new RecoveryService(db);
  }
  return globalRecoveryService;
}
