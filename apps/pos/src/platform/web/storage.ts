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
  ReservationRow,
  ActiveOrderRow,
  ActiveOrderLineRow,
  ActiveOrderUpdateRow,
  ItemCancellationRow,
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

  async getReservationsByOutlet(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<ReservationRow[]> {
    const rows = await this.db.reservations
      .where("[company_id+outlet_id+reservation_at]")
      .between(
        [input.company_id, input.outlet_id, Dexie.minKey],
        [input.company_id, input.outlet_id, Dexie.maxKey]
      )
      .toArray();

    return rows.sort((left, right) => left.reservation_at.localeCompare(right.reservation_at));
  }

  async upsertReservations(reservations: ReservationRow[]): Promise<void> {
    await this.db.reservations.bulkPut(reservations);
  }

  async getActiveOrdersByOutlet(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<ActiveOrderRow[]> {
    const rows = await this.db.active_orders
      .where("[company_id+outlet_id+order_state+updated_at]")
      .between(
        [input.company_id, input.outlet_id, "", Dexie.minKey],
        [input.company_id, input.outlet_id, "\uffff", Dexie.maxKey]
      )
      .toArray();

    return rows.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  async getActiveOrder(order_id: string): Promise<ActiveOrderRow | undefined> {
    return await this.db.active_orders.get(order_id);
  }

  async upsertActiveOrders(orders: ActiveOrderRow[]): Promise<void> {
    await this.db.active_orders.bulkPut(orders);
  }

  async deleteActiveOrder(order_id: string): Promise<void> {
    await this.db.active_orders.delete(order_id);
  }

  async getActiveOrderLines(order_id: string): Promise<ActiveOrderLineRow[]> {
    const rows = await this.db.active_order_lines
      .where("[order_id+item_id]")
      .between([order_id, Dexie.minKey], [order_id, Dexie.maxKey])
      .toArray();

    return rows.sort((left, right) => left.item_id - right.item_id);
  }

  async replaceActiveOrderLines(order_id: string, lines: ActiveOrderLineRow[]): Promise<void> {
    await this.db.transaction("rw", this.db.active_order_lines, async () => {
      const existing = await this.db.active_order_lines
        .where("[order_id+item_id]")
        .between([order_id, Dexie.minKey], [order_id, Dexie.maxKey])
        .primaryKeys();
      const existingKeys = existing.map((key) => String(key));

      if (existingKeys.length > 0) {
        await this.db.active_order_lines.bulkDelete(existingKeys);
      }

      if (lines.length > 0) {
        await this.db.active_order_lines.bulkPut(lines);
      }
    });
  }

  async putActiveOrderUpdate(update: ActiveOrderUpdateRow): Promise<void> {
    await this.db.active_order_updates.put(update);
  }

  async listPendingActiveOrderUpdates(input: {
    company_id: number;
    outlet_id: number;
    limit?: number;
  }): Promise<ActiveOrderUpdateRow[]> {
    const rows = await this.db.active_order_updates
      .where("[company_id+outlet_id+sync_status+event_at]")
      .between(
        [input.company_id, input.outlet_id, "PENDING", Dexie.minKey],
        [input.company_id, input.outlet_id, "PENDING", Dexie.maxKey]
      )
      .limit(input.limit ?? 100)
      .toArray();

    return rows.sort((left, right) => left.event_at.localeCompare(right.event_at));
  }

  async listActiveOrderUpdatesByOrder(input: {
    company_id: number;
    outlet_id: number;
    order_id: string;
  }): Promise<ActiveOrderUpdateRow[]> {
    const rows = await this.db.active_order_updates
      .where("[company_id+outlet_id+order_id+event_at]")
      .between(
        [input.company_id, input.outlet_id, input.order_id, Dexie.minKey],
        [input.company_id, input.outlet_id, input.order_id, Dexie.maxKey]
      )
      .toArray();

    return rows.sort((left, right) => left.event_at.localeCompare(right.event_at));
  }

  async markActiveOrderUpdateSyncResult(input: {
    update_id: string;
    sync_status: "SENT" | "FAILED";
    sync_error?: string | null;
  }): Promise<void> {
    const existing = await this.db.active_order_updates.where("update_id").equals(input.update_id).first();
    if (!existing) {
      return;
    }

    await this.db.active_order_updates.update(existing.pk, {
      sync_status: input.sync_status,
      sync_error: input.sync_status === "FAILED" ? input.sync_error ?? "SYNC_FAILED" : null
    });
  }

  async putItemCancellation(cancellation: ItemCancellationRow): Promise<void> {
    await this.db.item_cancellations.put(cancellation);
  }

  async listItemCancellationsByOrder(input: {
    company_id: number;
    outlet_id: number;
    order_id: string;
  }): Promise<ItemCancellationRow[]> {
    const rows = await this.db.item_cancellations
      .where("[company_id+outlet_id+order_id]")
      .equals([input.company_id, input.outlet_id, input.order_id])
      .toArray();

    return rows.sort((left, right) => left.cancelled_at.localeCompare(right.cancelled_at));
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
