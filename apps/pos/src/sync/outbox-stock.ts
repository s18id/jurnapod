// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Outbox Stock Integration
 *
 * Extends the outbox system to handle stock operations:
 * - stock_reservation: Reserve stock when POS creates transaction
 * - stock_release: Release reserved stock for voids/refunds
 */

import type { PosOfflineDb } from "@jurnapod/offline-db/dexie";
import type { OutboxJobRow, OutboxJobType } from "@jurnapod/offline-db/dexie";

// Stock operation payload
export interface StockOperationPayload {
  operation: "RESERVE" | "RELEASE";
  sale_id: string;
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  items: Array<{
    item_id: number;
    quantity: number;
  }>;
  created_at: string;
}

// Stock reservation result from server
export interface StockReservationResult {
  success: boolean;
  reserved: boolean;
  conflicts?: Array<{
    item_id: number;
    requested: number;
    available: number;
  }>;
  error?: string;
}

/**
 * Create a stock reservation job for the outbox
 */
export function createStockReservationJob(
  saleId: string,
  clientTxId: string,
  companyId: number,
  outletId: number,
  items: Array<{ item_id: number; quantity: number }>
): Omit<OutboxJobRow, "job_id" | "created_at" | "updated_at"> {
  const payload: StockOperationPayload = {
    operation: "RESERVE",
    sale_id: saleId,
    client_tx_id: clientTxId,
    company_id: companyId,
    outlet_id: outletId,
    items,
    created_at: new Date().toISOString()
  };

  return {
    sale_id: saleId,
    company_id: companyId,
    outlet_id: outletId,
    job_type: "STOCK_RESERVATION" as OutboxJobType,
    dedupe_key: `${clientTxId}:stock_reservation`,
    payload_json: JSON.stringify(payload),
    status: "PENDING",
    attempts: 0,
    lease_owner_id: null,
    lease_token: null,
    lease_expires_at: null,
    next_attempt_at: null,
    last_error: null
  };
}

/**
 * Create a stock release job for the outbox (for voids/refunds)
 */
export function createStockReleaseJob(
  saleId: string,
  clientTxId: string,
  companyId: number,
  outletId: number,
  items: Array<{ item_id: number; quantity: number }>
): Omit<OutboxJobRow, "job_id" | "created_at" | "updated_at"> {
  const payload: StockOperationPayload = {
    operation: "RELEASE",
    sale_id: saleId,
    client_tx_id: clientTxId,
    company_id: companyId,
    outlet_id: outletId,
    items,
    created_at: new Date().toISOString()
  };

  return {
    sale_id: saleId,
    company_id: companyId,
    outlet_id: outletId,
    job_type: "STOCK_RELEASE" as OutboxJobType,
    dedupe_key: `${clientTxId}:stock_release`,
    payload_json: JSON.stringify(payload),
    status: "PENDING",
    attempts: 0,
    lease_owner_id: null,
    lease_token: null,
    lease_expires_at: null,
    next_attempt_at: null,
    last_error: null
  };
}

/**
 * Parse stock operation payload from outbox job
 */
export function parseStockOperationPayload(job: OutboxJobRow): StockOperationPayload | null {
  if (job.job_type !== "STOCK_RESERVATION" && job.job_type !== "STOCK_RELEASE") {
    return null;
  }

  try {
    return JSON.parse(job.payload_json) as StockOperationPayload;
  } catch {
    return null;
  }
}

/**
 * Validate stock reservation before processing
 * Returns conflicts if server stock is insufficient
 */
export function validateStockReservation(
  payload: StockOperationPayload,
  localStock: Map<number, { available: number; reserved: number }>
): { valid: boolean; conflicts?: Array<{ item_id: number; requested: number; available: number }> } {
  const conflicts: Array<{ item_id: number; requested: number; available: number }> = [];

  for (const item of payload.items) {
    const stock = localStock.get(item.item_id);
    if (!stock) {
      conflicts.push({
        item_id: item.item_id,
        requested: item.quantity,
        available: 0
      });
    } else if (stock.available < item.quantity) {
      conflicts.push({
        item_id: item.item_id,
        requested: item.quantity,
        available: stock.available
      });
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts: conflicts.length > 0 ? conflicts : undefined
  };
}

/**
 * Process stock reservation on the server
 * This is called during sync push
 */
export async function processStockReservation(
  apiEndpoint: string,
  payload: StockOperationPayload,
  authToken: string
): Promise<StockReservationResult> {
  const response = await fetch(`${apiEndpoint}/api/v1/sync/stock/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      client_tx_id: payload.client_tx_id,
      company_id: payload.company_id,
      outlet_id: payload.outlet_id,
      items: payload.items
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Unknown error" }));

    // Check if it's a stock conflict (409 Conflict)
    if (response.status === 409) {
      return {
        success: false,
        reserved: false,
        conflicts: errorData.conflicts,
        error: errorData.message || "Stock conflict"
      };
    }

    return {
      success: false,
      reserved: false,
      error: errorData.message || `Server error: ${response.status}`
    };
  }

  const result = await response.json();
  return {
    success: true,
    reserved: result.reserved ?? true
  };
}

/**
 * Process stock release on the server (for voids/refunds)
 */
export async function processStockRelease(
  apiEndpoint: string,
  payload: StockOperationPayload,
  authToken: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${apiEndpoint}/api/v1/sync/stock/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      client_tx_id: payload.client_tx_id,
      company_id: payload.company_id,
      outlet_id: payload.outlet_id,
      items: payload.items
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
    return {
      success: false,
      error: errorData.message || `Server error: ${response.status}`
    };
  }

  return { success: true };
}

/**
 * Check if an outbox job is a stock operation
 */
export function isStockOperation(job: OutboxJobRow): boolean {
  return job.job_type === "STOCK_RESERVATION" || job.job_type === "STOCK_RELEASE";
}

/**
 * Get the priority order for stock operations
 * Stock reservations should be processed before transaction sync
 */
export function getStockOperationPriority(jobType: string): number {
  switch (jobType) {
    case "STOCK_RESERVATION":
      return 1; // Process first
    case "STOCK_RELEASE":
      return 2; // Process second
    case "SYNC_POS_TX":
      return 3; // Process after stock operations
    default:
      return 4;
  }
}

/**
 * Sort outbox jobs by stock operation priority
 */
export function sortOutboxJobsByPriority(jobs: OutboxJobRow[]): OutboxJobRow[] {
  return [...jobs].sort((a, b) => {
    return getStockOperationPriority(a.job_type) - getStockOperationPriority(b.job_type);
  });
}
