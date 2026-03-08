// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * PosStoragePort
 * 
 * Platform-agnostic interface for POS local persistence.
 * Implementations may use IndexedDB, SQLite, or other storage backends.
 * 
 * This abstraction ensures business logic does not directly depend on
 * browser APIs or specific storage implementations.
 */

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
  SyncScopeConfigRow
} from "@jurnapod/offline-db/dexie";

export interface PosStoragePort {
  // Product cache operations
  getProductsByOutlet(input: {
    company_id: number;
    outlet_id: number;
    is_active?: boolean;
  }): Promise<ProductCacheRow[]>;

  upsertProducts(products: ProductCacheRow[]): Promise<void>;

  // Outlet tables operations
  getOutletTablesByOutlet(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<OutletTableRow[]>;

  upsertOutletTables(tables: OutletTableRow[]): Promise<void>;

  // Reservations operations
  getReservationsByOutlet(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<ReservationRow[]>;

  upsertReservations(reservations: ReservationRow[]): Promise<void>;

  // Active orders operations
  getActiveOrdersByOutlet(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<ActiveOrderRow[]>;

  getActiveOrder(order_id: string): Promise<ActiveOrderRow | undefined>;

  upsertActiveOrders(orders: ActiveOrderRow[]): Promise<void>;

  deleteActiveOrder(order_id: string): Promise<void>;

  getActiveOrderLines(order_id: string): Promise<ActiveOrderLineRow[]>;

  replaceActiveOrderLines(order_id: string, lines: ActiveOrderLineRow[]): Promise<void>;

  putActiveOrderUpdate(update: ActiveOrderUpdateRow): Promise<void>;

  listPendingActiveOrderUpdates(input: {
    company_id: number;
    outlet_id: number;
    limit?: number;
  }): Promise<ActiveOrderUpdateRow[]>;

  listActiveOrderUpdatesByOrder(input: {
    company_id: number;
    outlet_id: number;
    order_id: string;
  }): Promise<ActiveOrderUpdateRow[]>;

  markActiveOrderUpdateSyncResult(input: {
    update_id: string;
    sync_status: "SENT" | "FAILED";
    sync_error?: string | null;
  }): Promise<void>;

  putItemCancellation(cancellation: ItemCancellationRow): Promise<void>;

  listItemCancellationsByOrder(input: {
    company_id: number;
    outlet_id: number;
    order_id: string;
  }): Promise<ItemCancellationRow[]>;

  // Sale operations
  createSale(sale: SaleRow): Promise<void>;
  getSale(sale_id: string): Promise<SaleRow | undefined>;
  updateSaleStatus(sale_id: string, status: string, sync_status?: string): Promise<void>;

  // Sale items operations
  createSaleItems(items: SaleItemRow[]): Promise<void>;
  getSaleItems(sale_id: string): Promise<SaleItemRow[]>;

  // Payment operations
  createPayments(payments: PaymentRow[]): Promise<void>;
  getPayments(sale_id: string): Promise<PaymentRow[]>;

  // Outbox operations
  createOutboxJob(job: OutboxJobRow): Promise<void>;
  getOutboxJob(job_id: string): Promise<OutboxJobRow | undefined>;
  listPendingOutboxJobs(limit?: number): Promise<OutboxJobRow[]>;
  listUnsyncedOutboxJobs(limit?: number): Promise<OutboxJobRow[]>; // PENDING + FAILED
  listDueOutboxJobs(input: { now: Date; limit?: number }): Promise<OutboxJobRow[]>;
  updateOutboxJob(job_id: string, updates: Partial<OutboxJobRow>): Promise<void>;
  countPendingOutboxJobs(): Promise<number>;
  countFailedOutboxJobs(): Promise<number>;
  countUnsyncedOutboxJobs(): Promise<number>; // PENDING + FAILED
  countUnsyncedOutboxJobsForScope(scope: { company_id: number; outlet_id: number }): Promise<number>;
  countGlobalDueOutboxJobs(now: Date): Promise<number>;

  // Sync metadata operations
  getSyncMetadata(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<SyncMetadataRow | undefined>;

  upsertSyncMetadata(metadata: SyncMetadataRow): Promise<void>;

  // Sync scope config operations
  getSyncScopeConfig(input: {
    company_id: number;
    outlet_id: number;
  }): Promise<SyncScopeConfigRow | undefined>;

  upsertSyncScopeConfig(config: SyncScopeConfigRow): Promise<void>;

  // Transaction support
  transaction<T>(
    mode: "readonly" | "readwrite",
    tables: string[],
    callback: (tx: unknown) => Promise<T>
  ): Promise<T>;
}
