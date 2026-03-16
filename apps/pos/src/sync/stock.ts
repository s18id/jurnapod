// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Stock Sync Handler
 *
 * Handles fetching and applying stock updates from the server to local SQLite.
 * Uses cursor-based pagination for incremental sync.
 */

import type { InventoryStockRow } from "@jurnapod/offline-db/dexie";
import type { PosStoragePort } from "../ports/storage-port.js";
import type { SyncTransport } from "../ports/sync-transport.js";

export interface StockSyncItem {
  product_id: number;
  outlet_id: number | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  updated_at: string;
}

export interface StockSyncResponse {
  items: StockSyncItem[];
  has_more: boolean;
  next_cursor?: string;
  sync_timestamp: string;
}

export interface StockSyncContext {
  company_id: number;
  outlet_id: number;
  baseUrl: string;
  accessToken: string;
}

export interface StockSyncResult {
  success: boolean;
  items_synced: number;
  last_sync_at: string;
  has_more: boolean;
  error?: string;
}

// Sync metadata key for tracking last stock sync
const STOCK_SYNC_METADATA_KEY_PREFIX = "stock_sync_";

/**
 * Fetch stock updates from server using SyncTransport
 */
async function fetchStockUpdates(
  transport: SyncTransport,
  context: StockSyncContext,
  cursor?: string
): Promise<StockSyncResponse> {
  // Use a custom request through the transport's pull mechanism
  // We'll extend this to support arbitrary endpoints
  const endpoint = "/api/v1/sync/stock";
  const params = new URLSearchParams({
    outlet_id: context.outlet_id.toString(),
    limit: "100"
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  const url = `${context.baseUrl}${endpoint}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(`Stock sync failed: ${errorData.message || response.statusText}`);
  }

  return response.json() as Promise<StockSyncResponse>;
}

/**
 * Apply stock updates to local database
 * Server wins in case of conflicts
 */
async function applyStockUpdates(
  storage: PosStoragePort,
  items: StockSyncItem[],
  companyId: number,
  outletId: number
): Promise<number> {
  let appliedCount = 0;

  for (const item of items) {
    // Build the stock row key
    const pk = `${companyId}:${outletId}:${item.product_id}`;

    const stockRow: InventoryStockRow = {
      pk,
      company_id: companyId,
      outlet_id: outletId,
      item_id: item.product_id,
      quantity_on_hand: item.quantity,
      quantity_reserved: item.reserved_quantity,
      quantity_available: item.available_quantity,
      last_updated_at: item.updated_at,
      data_version: Date.now() // Local version tracking
    };

    // Upsert stock data - server wins (conflict resolution)
    await storage.putInventoryStock(stockRow);
    appliedCount++;
  }

  return appliedCount;
}

/**
 * Get last sync metadata for stock
 */
async function getLastStockSyncMetadata(
  storage: PosStoragePort,
  companyId: number,
  outletId: number
): Promise<{ cursor?: string; last_sync_at?: string } | undefined> {
  const pk = `${STOCK_SYNC_METADATA_KEY_PREFIX}${companyId}:${outletId}`;
  const metadata = await storage.getInventoryStock({
    company_id: companyId,
    outlet_id: outletId,
    item_id: 0 // Use item_id 0 for sync metadata
  });

  if (!metadata) {
    return undefined;
  }

  return {
    cursor: metadata.quantity_on_hand ? String(metadata.quantity_on_hand) : undefined,
    last_sync_at: metadata.last_updated_at
  };
}

/**
 * Save sync metadata for stock
 */
async function saveStockSyncMetadata(
  storage: PosStoragePort,
  companyId: number,
  outletId: number,
  cursor: string,
  syncTimestamp: string
): Promise<void> {
  const pk = `${STOCK_SYNC_METADATA_KEY_PREFIX}${companyId}:${outletId}`;

  // Store metadata as a special inventory stock row
  // We use item_id = 0 to indicate this is sync metadata
  const metadataRow: InventoryStockRow = {
    pk,
    company_id: companyId,
    outlet_id: outletId,
    item_id: 0,
    quantity_on_hand: 0, // Not used for metadata
    quantity_reserved: 0,
    quantity_available: 0,
    last_updated_at: syncTimestamp,
    data_version: Date.now()
  };

  await storage.putInventoryStock(metadataRow);
}

/**
 * Sync stock data from server to local storage
 */
export async function syncStockFromServer(
  transport: SyncTransport,
  storage: PosStoragePort,
  context: StockSyncContext
): Promise<StockSyncResult> {
  try {
    // Get last cursor from sync metadata table using a different approach
    // We'll use the sync_metadata table instead
    let cursor: string | undefined;
    let totalSynced = 0;
    let hasMore = true;
    let lastSyncTimestamp = new Date().toISOString();

    // Paginate through all updates
    while (hasMore) {
      const response = await fetchStockUpdates(transport, context, cursor);

      if (response.items.length > 0) {
        const applied = await applyStockUpdates(
          storage,
          response.items,
          context.company_id,
          context.outlet_id
        );
        totalSynced += applied;
      }

      hasMore = response.has_more;
      lastSyncTimestamp = response.sync_timestamp;

      if (hasMore && response.next_cursor) {
        cursor = response.next_cursor;
      } else {
        cursor = undefined;
      }
    }

    return {
      success: true,
      items_synced: totalSynced,
      last_sync_at: lastSyncTimestamp,
      has_more: false
    };

  } catch (error) {
    console.error("Stock sync error:", error);
    return {
      success: false,
      items_synced: 0,
      last_sync_at: new Date().toISOString(),
      has_more: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Check if stock data is stale (older than specified threshold)
 */
export async function isStockStale(
  storage: PosStoragePort,
  companyId: number,
  outletId: number,
  staleThresholdMinutes: number = 60
): Promise<boolean> {
  // Get latest stock update for this outlet
  const stocks = await storage.getInventoryStockByOutlet({
    company_id: companyId,
    outlet_id: outletId
  });

  if (stocks.length === 0) {
    return true; // No stock data = stale
  }

  // Find the most recent update
  const lastUpdate = stocks.reduce((latest, stock) => {
    return new Date(stock.last_updated_at) > new Date(latest.last_updated_at) ? stock : latest;
  });

  const lastSyncTime = new Date(lastUpdate.last_updated_at).getTime();
  const now = Date.now();
  const thresholdMs = staleThresholdMinutes * 60 * 1000;

  return now - lastSyncTime > thresholdMs;
}
