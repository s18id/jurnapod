// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Web Platform Storage Adapter
 * 
 * Implements PosStoragePort using IndexedDB via Dexie.
 */

import Dexie from "dexie";
import type { PosStoragePort } from "../../ports/storage-port.js";
import type {
  OutletTableRow,
  OutboxJobRow,
  PaymentRow,
  ProductCacheRow,
  SaleItemRow,
  SaleRow,
  SyncMetadataRow,
  SyncScopeConfigRow,
  PosOfflineDb,
  LocalSaleStatus,
  SaleSyncStatus
} from "@jurnapod/offline-db/dexie";

export class WebStorageAdapter implements PosStoragePort {
  constructor(private db: PosOfflineDb) {}

  async getProductsByOutlet(input: {
    company_id: number;
    outlet_id: number;
    is_active?: boolean;
  }): Promise<ProductCacheRow[]> {
    const isActive = input.is_active ?? true;
    const rows = await this.db.products_cache
      .toCollection()
      .filter((row) => 
        row.company_id === input.company_id && 
        row.outlet_id === input.outlet_id && 
        row.is_active === isActive
      )
      .toArray();

    return rows;
  }

  async upsertProducts(products: ProductCacheRow[]): Promise<void> {
    await this.db.products_cache.bulkPut(products);
  }

  async getOutletTablesByOutlet(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<OutletTableRow[]> {
    const rows = await this.db.outlet_tables
      .where("[company_id+outlet_id+table_id]")
      .between(
        [input.company_id, input.outlet_id, Dexie.minKey],
        [input.company_id, input.outlet_id, Dexie.maxKey]
      )
      .toArray();

    return rows.sort((left, right) => left.code.localeCompare(right.code));
  }

  async upsertOutletTables(tables: OutletTableRow[]): Promise<void> {
    await this.db.outlet_tables.bulkPut(tables);
  }

  async createSale(sale: SaleRow): Promise<void> {
    await this.db.sales.add(sale);
  }

  async getSale(sale_id: string): Promise<SaleRow | undefined> {
    return await this.db.sales.get(sale_id);
  }

  async updateSaleStatus(
    sale_id: string,
    status: string,
    sync_status?: string
  ): Promise<void> {
    const updates: Partial<SaleRow> = {
      status: status as LocalSaleStatus
    };
    if (sync_status !== undefined) {
      updates.sync_status = sync_status as SaleSyncStatus;
    }
    await this.db.sales.update(sale_id, updates);
  }

  async createSaleItems(items: SaleItemRow[]): Promise<void> {
    await this.db.sale_items.bulkAdd(items);
  }

  async getSaleItems(sale_id: string): Promise<SaleItemRow[]> {
    return await this.db.sale_items.where("sale_id").equals(sale_id).toArray();
  }

  async createPayments(payments: PaymentRow[]): Promise<void> {
    await this.db.payments.bulkAdd(payments);
  }

  async getPayments(sale_id: string): Promise<PaymentRow[]> {
    return await this.db.payments.where("sale_id").equals(sale_id).toArray();
  }

  async createOutboxJob(job: OutboxJobRow): Promise<void> {
    await this.db.outbox_jobs.add(job);
  }

  async getOutboxJob(job_id: string): Promise<OutboxJobRow | undefined> {
    return await this.db.outbox_jobs.get(job_id);
  }

  async listPendingOutboxJobs(limit = 100): Promise<OutboxJobRow[]> {
    return await this.db.outbox_jobs
      .where("status")
      .equals("PENDING")
      .limit(limit)
      .toArray();
  }

  async listUnsyncedOutboxJobs(limit = 100): Promise<OutboxJobRow[]> {
    return await this.db.outbox_jobs
      .where("status")
      .anyOf("PENDING", "FAILED")
      .limit(limit)
      .toArray();
  }

  async listDueOutboxJobs(input: {
    now: Date;
    limit?: number;
  }): Promise<OutboxJobRow[]> {
    const limit = input.limit ?? 100;
    const nowMs = input.now.getTime();
    
    // Include:
    // 1. PENDING with next_attempt_at = null (freshly enqueued)
    // 2. PENDING with next_attempt_at <= now
    // 3. FAILED with next_attempt_at = null or <= now
    const jobs = await this.db.outbox_jobs
      .where("status")
      .anyOf("PENDING", "FAILED")
      .toArray();
    
    return jobs
      .filter(job => {
        if (!job.next_attempt_at) return true; // freshly enqueued
        const attemptMs = new Date(job.next_attempt_at).getTime();
        return attemptMs <= nowMs;
      })
      .slice(0, limit);
  }

  async updateOutboxJob(
    job_id: string,
    updates: Partial<OutboxJobRow>
  ): Promise<void> {
    await this.db.outbox_jobs.update(job_id, updates);
  }

  async countPendingOutboxJobs(): Promise<number> {
    return await this.db.outbox_jobs.where("status").equals("PENDING").count();
  }

  async countFailedOutboxJobs(): Promise<number> {
    return await this.db.outbox_jobs.where("status").equals("FAILED").count();
  }

  async countUnsyncedOutboxJobs(): Promise<number> {
    return await this.db.outbox_jobs
      .where("status")
      .anyOf("PENDING", "FAILED")
      .count();
  }

  async countUnsyncedOutboxJobsForScope(scope: {
    company_id: number;
    outlet_id: number;
  }): Promise<number> {
    const jobs = await this.db.outbox_jobs
      .where("status")
      .anyOf("PENDING", "FAILED")
      .toArray();

    return jobs.filter(
      (job) => job.company_id === scope.company_id && job.outlet_id === scope.outlet_id
    ).length;
  }

  async countGlobalDueOutboxJobs(now: Date): Promise<number> {
    const nowMs = now.getTime();
    
    // Include:
    // 1. PENDING with next_attempt_at = null (freshly enqueued)
    // 2. PENDING with next_attempt_at <= now
    // 3. FAILED with next_attempt_at = null or <= now
    const jobs = await this.db.outbox_jobs
      .where("status")
      .anyOf("PENDING", "FAILED")
      .toArray();
    
    return jobs.filter(job => {
      if (!job.next_attempt_at) return true; // freshly enqueued or failed without retry time
      const attemptMs = new Date(job.next_attempt_at).getTime();
      return attemptMs <= nowMs;
    }).length;
  }

  async getSyncMetadata(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<SyncMetadataRow | undefined> {
    return await this.db.sync_metadata
      .where("[company_id+outlet_id]")
      .equals([input.company_id, input.outlet_id])
      .first();
  }

  async upsertSyncMetadata(metadata: SyncMetadataRow): Promise<void> {
    await this.db.sync_metadata.put(metadata);
  }

  async getSyncScopeConfig(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<SyncScopeConfigRow | undefined> {
    return await this.db.sync_scope_config
      .where("[company_id+outlet_id]")
      .equals([input.company_id, input.outlet_id])
      .first();
  }

  async upsertSyncScopeConfig(config: SyncScopeConfigRow): Promise<void> {
    await this.db.sync_scope_config.put(config);
  }

  async transaction<T>(
    mode: "readonly" | "readwrite",
    tables: string[],
    callback: (tx: unknown) => Promise<T>
  ): Promise<T> {
    return await this.db.transaction(mode, tables, callback);
  }
}

export function createWebStorageAdapter(db: PosOfflineDb): PosStoragePort {
  return new WebStorageAdapter(db);
}
