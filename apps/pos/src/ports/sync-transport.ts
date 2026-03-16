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
  orders_cursor?: number;
}

export interface SyncPullResponse {
  success: boolean;
  data: {
    data_version: number;
    items: Array<{
      id: number;
      sku: string | null;
      name: string;
      type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
      item_group_id: number | null;
      is_active: boolean;
      updated_at: string;
      track_stock: boolean;
      low_stock_threshold: number | null;
    }>;
    item_groups: Array<{
      id: number;
      parent_id: number | null;
      code: string | null;
      name: string;
      is_active: boolean;
      updated_at: string;
    }>;
    prices: Array<{
      id: number;
      item_id: number;
      outlet_id: number;
      price: number;
      is_active: boolean;
      updated_at: string;
    }>;
    config: {
      tax: {
        rate: number;
        inclusive: boolean;
      };
      payment_methods: string[];
    };
    open_orders?: Array<{
      order_id: string;
      company_id: number;
      outlet_id: number;
      service_type: "TAKEAWAY" | "DINE_IN";
      table_id: number | null;
      reservation_id: number | null;
      guest_count: number | null;
      is_finalized: boolean;
      order_status: "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED";
      order_state: "OPEN" | "CLOSED";
      paid_amount: number;
      opened_at: string;
      closed_at: string | null;
      notes: string | null;
      updated_at: string;
    }>;
    open_order_lines?: Array<{
      order_id: string;
      company_id: number;
      outlet_id: number;
      item_id: number;
      sku_snapshot: string | null;
      name_snapshot: string;
      item_type_snapshot: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
      unit_price_snapshot: number;
      qty: number;
      discount_amount: number;
      updated_at: string;
    }>;
    order_updates?: Array<{
      update_id: string;
      order_id: string;
      company_id: number;
      outlet_id: number;
      base_order_updated_at: string | null;
      event_type: string;
      delta_json: string;
      actor_user_id: number | null;
      device_id: string;
      event_at: string;
      created_at: string;
      sequence_no: number;
    }>;
    orders_cursor?: number;
    tables?: Array<{
      table_id: number;
      code: string;
      name: string;
      zone: string | null;
      capacity: number | null;
      status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
      updated_at: string;
    }>;
    reservations?: Array<{
      reservation_id: number;
      table_id: number | null;
      customer_name: string;
      customer_phone: string | null;
      guest_count: number;
      reservation_at: string;
      duration_minutes: number | null;
      status: "BOOKED" | "CONFIRMED" | "ARRIVED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
      notes: string | null;
      linked_order_id: string | null;
      arrived_at: string | null;
      seated_at: string | null;
      cancelled_at: string | null;
      updated_at: string;
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
