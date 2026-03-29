// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { PullSyncParams, PullSyncResult } from "./types.js";
import type { DbConn } from "@jurnapod/db";
import type { SyncPullPayload } from "@jurnapod/shared";
import { z } from "zod";
import { syncAuditor } from "@jurnapod/sync-core";
import {
  getItemsForSync,
  getOutletTablesForSync,
  getActiveReservationsForSync,
  getVariantsForSync,
  getVariantPricesForOutlet,
  getSyncDataVersion,
  getTaxRatesForSync,
  getDefaultTaxRateIds,
} from "@jurnapod/sync-core";

export type { PullSyncParams, PullSyncResult } from "./types.js";

// Inferred types from shared schemas
type SyncPullItem = z.infer<typeof import("@jurnapod/shared").SyncPullItemSchema>;
type SyncPullVariantPrice = z.infer<typeof import("@jurnapod/shared").SyncPullVariantPriceSchema>;
type SyncPullTable = z.infer<typeof import("@jurnapod/shared").SyncPullTableSchema>;
type SyncPullReservation = z.infer<typeof import("@jurnapod/shared").SyncPullReservationSchema>;
type SyncPullVariant = z.infer<typeof import("@jurnapod/shared").SyncPullVariantSchema>;
type SyncPullConfig = z.infer<typeof import("@jurnapod/shared").SyncPullConfigSchema>;

/**
 * Build config section for sync payload.
 */
function buildConfig(
  taxRates: Array<{
    id: number;
    code: string;
    name: string;
    rate_percent: number;
    is_inclusive: boolean;
    account_id: number | null;
    is_active: boolean;
  }>,
  defaultTaxRateIds: number[]
): SyncPullConfig {
  // Find the first default tax rate to get tax settings
  const firstDefault = defaultTaxRateIds[0];
  const defaultRate = firstDefault
    ? taxRates.find((r) => r.id === firstDefault)
    : null;

  return {
    tax: {
      rate: defaultRate ? Number(defaultRate.rate_percent) : 0,
      inclusive: defaultRate ? defaultRate.is_inclusive : false,
    },
    tax_rates: taxRates.map((tr) => ({
      id: tr.id,
      code: tr.code,
      name: tr.name,
      rate_percent: tr.rate_percent,
      account_id: tr.account_id,
      is_inclusive: tr.is_inclusive,
      is_active: tr.is_active,
    })),
    default_tax_rate_ids: defaultTaxRateIds,
    payment_methods: ["CASH"], // Default payment method
  };
}

/**
 * Transform items to SyncPullItem format.
 */
function transformItems(
  items: Array<{
    id: number;
    sku: string | null;
    name: string;
    item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
    item_group_id: number | null;
    barcode: string | null;
    is_active: boolean;
    updated_at: string;
  }>
): SyncPullItem[] {
  return items.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    type: item.item_type,
    item_group_id: item.item_group_id,
    barcode: item.barcode,
    thumbnail_url: null, // Thumbnails fetched separately if needed
    is_active: item.is_active,
    updated_at: item.updated_at,
  }));
}

/**
 * Transform tables to SyncPullTable format.
 */
function transformTables(
  tables: Array<{
    table_id: number;
    code: string;
    name: string;
    zone: string | null;
    capacity: number | null;
    status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
    updated_at: string;
  }>
): SyncPullTable[] {
  return tables.map((t) => ({
    table_id: t.table_id,
    code: t.code,
    name: t.name,
    zone: t.zone,
    capacity: t.capacity,
    status: t.status,
    updated_at: t.updated_at,
  }));
}

/**
 * Transform reservations to SyncPullReservation format.
 */
function transformReservations(
  reservations: Array<{
    reservation_id: number;
    table_id: number | null;
    customer_name: string | null;
    customer_phone: string | null;
    guest_count: number;
    reservation_at: string;
    reservation_start_ts: number | null;
    reservation_end_ts: number | null;
    duration_minutes: number | null;
    status: "BOOKED" | "CONFIRMED" | "ARRIVED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
    notes: string | null;
    linked_order_id: number | null;
    arrived_at: string | null;
    seated_at: string | null;
    cancelled_at: string | null;
    updated_at: string;
  }>
): SyncPullReservation[] {
  return reservations.map((r) => ({
    reservation_id: r.reservation_id,
    table_id: r.table_id,
    customer_name: r.customer_name ?? "",
    customer_phone: r.customer_phone,
    guest_count: r.guest_count,
    reservation_at: r.reservation_at,
    duration_minutes: r.duration_minutes,
    status: r.status,
    notes: r.notes,
    linked_order_id: r.linked_order_id ? String(r.linked_order_id) : null,
    arrived_at: r.arrived_at,
    seated_at: r.seated_at,
    cancelled_at: r.cancelled_at,
    updated_at: r.updated_at,
  }));
}

/**
 * Transform variants to SyncPullVariant format.
 */
function transformVariants(
  variants: Array<{
    id: number;
    company_id: number;
    item_id: number;
    sku: string | null;
    variant_name: string | null;
    price_override: number | null;
    stock_quantity: number | null;
    is_active: boolean;
    updated_at: string;
  }>
): SyncPullVariant[] {
  return variants.map((v) => ({
    id: v.id,
    item_id: v.item_id,
    sku: v.sku ?? "",
    variant_name: v.variant_name ?? "",
    price: v.price_override ?? 0,
    stock_quantity: v.stock_quantity ?? 0,
    barcode: null, // Barcode not in variant query
    is_active: v.is_active,
    attributes: {}, // Attributes not in basic variant query
  }));
}

/**
 * Transform variant prices to SyncPullVariantPrice format.
 */
function transformVariantPrices(
  prices: Array<{
    id: number;
    item_id: number;
    variant_id: number | null;
    outlet_id: number | null;
    price: number;
    is_active: boolean;
    updated_at: string;
  }>
): SyncPullVariantPrice[] {
  return prices.map((p) => ({
    id: p.id,
    item_id: p.item_id,
    variant_id: p.variant_id,
    outlet_id: p.outlet_id ?? 0,
    price: p.price,
    is_active: p.is_active,
    updated_at: p.updated_at,
  }));
}

/**
 * Handle pull sync for POS client.
 * This is the canonical entry point for POS data synchronization.
 *
 * @param db - Database connection (DbConn from @jurnapod/db)
 * @param params - Pull sync parameters including companyId, outletId, sinceVersion, ordersCursor
 * @returns PullSyncResult containing the payload and current version
 */
export async function handlePullSync(
  db: DbConn,
  params: PullSyncParams
): Promise<PullSyncResult> {
  const { companyId, outletId, sinceVersion = 0, ordersCursor = 0 } = params;

  const startTime = Date.now();
  let auditId: string | undefined;

  // Start audit tracking with proper context
  auditId = syncAuditor.startEvent(
    "pos",
    "MASTER",
    "PULL",
    {
      company_id: companyId,
      outlet_id: outletId,
      client_type: "POS",
      request_id: `pos-pull-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }
  );

  try {
    // Get data using shared queries from sync-core
    const [currentVersion, items, tables, reservations, variants, variantPrices, taxRates, defaultTaxRateIds] =
      await Promise.all([
        getSyncDataVersion(db, companyId),
        sinceVersion === 0 ? getItemsForSync(db, companyId) : [],
        getOutletTablesForSync(db, companyId, outletId),
        getActiveReservationsForSync(db, companyId, outletId),
        getVariantsForSync(db, companyId),
        getVariantPricesForOutlet(db, companyId, outletId),
        getTaxRatesForSync(db, companyId),
        getDefaultTaxRateIds(db, companyId),
      ]);

    const payload: SyncPullPayload = {
      data_version: currentVersion,
      items: transformItems(items),
      item_groups: [],
      prices: [],
      variant_prices: transformVariantPrices(variantPrices),
      config: buildConfig(taxRates, defaultTaxRateIds),
      tables: transformTables(tables),
      reservations: transformReservations(reservations),
      variants: transformVariants(variants),
      open_orders: [],
      open_order_lines: [],
      order_updates: [],
      orders_cursor: ordersCursor,
    };

    // Complete audit tracking
    if (auditId) {
      syncAuditor.completeEvent(
        auditId,
        items.length + tables.length + reservations.length + variants.length,
        currentVersion,
        { duration_ms: Date.now() - startTime }
      );
    }

    return {
      payload,
      currentVersion,
    };
  } catch (error) {
    // Log audit failure
    if (auditId) {
      syncAuditor.failEvent(
        auditId,
        error instanceof Error ? error : new Error("Unknown error")
      );
    }

    throw error;
  }
}
