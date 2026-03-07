// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * SyncTransport
 * 
 * Platform-agnostic interface for sync communication with the server.
 * Implementations may use fetch, XMLHttpRequest, native HTTP clients,
 * or other transport mechanisms.
 * 
 * This abstraction ensures sync logic does not directly depend on
 * browser fetch API or platform-specific networking.
 */

export interface SyncPullRequest {
  company_id: number;
  outlet_id: number;
  since_version?: number;
}

export interface SyncPullResponse {
  success: boolean;
  data: {
    data_version: number;
    config: unknown;
    products: Array<{
      item_id: number;
      sku: string | null;
      name: string;
      price: number;
      is_active: boolean;
    }>;
  };
}

export interface SyncPushTransaction {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  cashier_user_id: number;
  created_at: string;
  items: Array<{
    item_id: number;
    qty: number;
    price_snapshot: number;
    discount_amount: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
  }>;
  totals: {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    grand_total: number;
  };
}

export interface SyncPushRequest {
  transactions: SyncPushTransaction[];
}

export interface SyncPushResponseItem {
  client_tx_id: string;
  status: "OK" | "DUPLICATE" | "ERROR";
  message?: string;
  server_tx_id?: string;
}

export interface SyncPushResponse {
  success: boolean;
  results: SyncPushResponseItem[];
}

export interface SyncTransport {
  /**
   * Pull master data (products, config) from the server.
   */
  pull(request: SyncPullRequest, options?: {
    baseUrl?: string;
    accessToken?: string;
  }): Promise<SyncPullResponse>;

  /**
   * Push completed transactions to the server.
   */
  push(request: SyncPushRequest, options?: {
    baseUrl?: string;
    accessToken?: string;
  }): Promise<SyncPushResponse>;
}
