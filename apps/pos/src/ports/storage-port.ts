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
