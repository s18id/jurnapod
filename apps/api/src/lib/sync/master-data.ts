// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Pull Master Data
 * 
 * Builds POS sync pull payloads with type-safe queries.
 * This module has zero HTTP knowledge.
 * 
 * Architecture:
 * - Simple SELECTs: Kysely query builder
 * - Complex aggregations (prices JOINs, order snapshots): raw SQL preserved
 * - Sync-specific helpers (config, open orders): mixed approach
 */

import { sql } from "kysely";
import { z } from "zod";
import {
  resolveCombinedTaxConfig
} from "../taxes.js";
import {
  listCompanyTaxRatesKysely,
  listCompanyDefaultTaxRatesKysely
} from "../tax-rates.js";
import { listItems } from "../items/index.js";
import { listItemGroups } from "../item-groups/index.js";
import type { SyncPullPayload, SyncPullResponse, SyncPullVariantPrice } from "@jurnapod/shared";
import { SyncPullConfigSchema } from "@jurnapod/shared";
import { getDb } from "../db.js";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";
import { getVariantsForSync } from "../item-variants.js";
import { getItemThumbnailsBatch } from "../item-images.js";
import { listEffectiveItemPricesForOutlet } from "../item-prices/index.js";

// =============================================================================
// Types
// =============================================================================

type ItemRow = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  item_group_id: number | null;
  barcode: string | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: number;
  updated_at: string;
};

type ItemGroupRow = {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: number;
  updated_at: string;
};

type OutletTableRow = {
  id: number;
  company_id: number;
  outlet_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
  updated_at: string;
};

type ReservationRow = {
  id: number;
  company_id: number;
  outlet_id: number;
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
};

type VersionRow = {
  current_version: number;
};

type CompanyModuleRow = {
  enabled: number | null;
  config_json: string | null;
};

// =============================================================================
// Payment Method Config
// =============================================================================

const paymentMethodConfigSchema = z.object({
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  method: z.string().trim().min(1).optional()
});

const syncPaymentMethodsConfigSchema = z
  .array(z.string().trim().min(1))
  .or(z.array(paymentMethodConfigSchema))
  .or(
    z.object({
      methods: z
        .array(z.string().trim().min(1))
        .or(z.array(paymentMethodConfigSchema))
    })
  )
  .optional();

function normalizePaymentMethods(value: unknown): string[] | null {
  const parsed = syncPaymentMethodsConfigSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const methods = Array.isArray(parsed.data) ? parsed.data : parsed.data?.methods;
  if (!methods || methods.length === 0) {
    return null;
  }

  const normalized = methods
    .map((method) => (typeof method === "string" ? method.trim() : method.code.trim()))
    .filter((method) => method.length > 0);

  return normalized.length > 0 ? normalized : null;
}

async function readLegacyPaymentMethods(
  companyId: number
): Promise<string[] | null> {
  const db = getDb();

  const rows = await sql<{ key: string; enabled: number; config_json: string | null }>`
    SELECT \`key\`, enabled, config_json
    FROM feature_flags
    WHERE company_id = ${companyId}
      AND \`key\` IN ('pos.payment_methods', 'pos.config')
  `.execute(db);

  let resolved: string[] | null = null;
  for (const row of rows.rows) {
    if (row.enabled !== 1 || typeof row.key !== "string") {
      continue;
    }

    let parsed: unknown = null;
    try {
      parsed = typeof row.config_json === "string" ? JSON.parse(row.config_json) : null;
    } catch {
      parsed = null;
    }

    let candidate = parsed;
    if (row.key === "pos.config" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      candidate = (parsed as Record<string, unknown>).payment_methods ?? parsed;
    }

    const normalized = normalizePaymentMethods(candidate);
    if (normalized) {
      resolved = normalized;
    }
  }

  return resolved;
}

// =============================================================================
// Normalizers
// =============================================================================

function normalizeItem(row: ItemRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    sku: row.sku,
    name: row.name,
    type: row.item_type,
    item_group_id: row.item_group_id == null ? null : Number(row.item_group_id),
    barcode: row.barcode,
    cogs_account_id: row.cogs_account_id == null ? null : Number(row.cogs_account_id),
    inventory_asset_account_id: row.inventory_asset_account_id == null ? null : Number(row.inventory_asset_account_id),
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function normalizeItemGroup(row: ItemGroupRow) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    code: row.code,
    name: row.name,
    is_active: row.is_active === 1,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function normalizeOutletTable(row: OutletTableRow) {
  return {
    table_id: Number(row.id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

function normalizeReservation(row: ReservationRow) {
  return {
    reservation_id: Number(row.id),
    table_id: row.table_id == null ? null : Number(row.table_id),
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    guest_count: Number(row.guest_count),
    reservation_at: row.reservation_at, // raw SQL: string from MySQL DATETIME
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    status: row.status,
    notes: row.notes,
    linked_order_id: row.linked_order_id,
    arrived_at: row.arrived_at ? toRfc3339(row.arrived_at) : null,
    seated_at: row.seated_at ? toRfc3339(row.seated_at) : null,
    cancelled_at: row.cancelled_at ? toRfc3339(row.cancelled_at) : null,
    updated_at: toRfc3339Required(row.updated_at)
  };
}

// =============================================================================
// Query Functions (Kysely)
// =============================================================================

export { listItems };
export { listItemGroups };

/**
 * List outlet tables for POS.
 * Uses Kysely for type-safe queries.
 */
export async function listOutletTables(companyId: number, outletId: number) {
  const db = getDb();

  const rows = await db
    .selectFrom("outlet_tables")
    .where("company_id", "=", companyId)
    .where("outlet_id", "=", outletId)
    .select(["id", "company_id", "outlet_id", "code", "name", "zone", "capacity", "status", "updated_at"])
    .orderBy("code", "asc")
    .execute();

  return rows.map((row) => ({
    table_id: Number(row.id),
    code: row.code,
    name: row.name,
    zone: row.zone,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status as OutletTableRow["status"],
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

/**
 * List active reservations for an outlet.
 * Uses Kysely for type-safe queries.
 */
export async function listActiveReservations(companyId: number, outletId: number) {
  const db = getDb();

  const rows = await db
    .selectFrom("reservations")
    .where("company_id", "=", companyId)
    .where("outlet_id", "=", outletId)
    .where("status", "in", ["BOOKED", "CONFIRMED", "ARRIVED", "SEATED"])
    .select([
      "id",
      "company_id",
      "outlet_id",
      "table_id",
      "customer_name",
      "customer_phone",
      "guest_count",
      "reservation_at",
      "duration_minutes",
      "status",
      "notes",
      "linked_order_id",
      "arrived_at",
      "seated_at",
      "cancelled_at",
      "updated_at"
    ])
    .orderBy("reservation_at", "asc")
    .execute();

  return rows.map((row) => ({
    reservation_id: Number(row.id),
    table_id: row.table_id == null ? null : Number(row.table_id),
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    guest_count: Number(row.guest_count),
    reservation_at: toMySqlDateTime(row.reservation_at),
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    status: row.status as ReservationRow["status"],
    notes: row.notes,
    linked_order_id: row.linked_order_id,
    arrived_at: row.arrived_at ? toRfc3339(row.arrived_at) : null,
    seated_at: row.seated_at ? toRfc3339(row.seated_at) : null,
    cancelled_at: row.cancelled_at ? toRfc3339(row.cancelled_at) : null,
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

/**
 * Get current sync data version for a company.
 * Uses the unified sync_versions table with tier = NULL for data sync.
 */
export async function getCompanyDataVersion(companyId: number): Promise<number> {
  const db = getDb();

  const row = await db
    .selectFrom("sync_versions")
    .where("company_id", "=", companyId)
    .where("tier", "is", null)
    .select(["current_version"])
    .executeTakeFirst();

  return Number(row?.current_version ?? 0);
}

/**
 * Get variant prices for sync pull.
 * Returns all active variant-specific prices for the company that are relevant to the outlet.
 */
async function getVariantPricesForSync(
  companyId: number,
  outletId: number
): Promise<SyncPullVariantPrice[]> {
  const db = getDb();
  
  try {
    // Get all variant prices:
    // 1. Variant-specific prices for this outlet
    // 2. Variant default prices (no outlet)
    const rows = await sql<{
      id: number;
      item_id: number;
      variant_id: number | null;
      outlet_id: number | null;
      price: number;
      is_active: number;
      updated_at: string;
    }>`
      SELECT 
        ip.id,
        ip.item_id,
        ip.variant_id,
        COALESCE(ip.outlet_id, ${outletId}) AS outlet_id,
        ip.price,
        ip.is_active,
        ip.updated_at
       FROM item_prices ip
       WHERE ip.company_id = ${companyId}
         AND ip.variant_id IS NOT NULL
         AND ip.is_active = 1
         AND (ip.outlet_id = ${outletId} OR ip.outlet_id IS NULL)
    `.execute(db);

    return rows.rows.map((row) => ({
      id: Number(row.id),
      item_id: Number(row.item_id),
      variant_id: row.variant_id == null ? null : Number(row.variant_id),
      outlet_id: row.outlet_id == null ? outletId : Number(row.outlet_id),
      price: Number(row.price),
      is_active: row.is_active === 1,
      updated_at: toRfc3339Required(row.updated_at)
    }));
  } catch (error) {
    // If variant_prices column doesn't exist yet (migration not run), return empty array
    if (isMysqlError(error) && (error as { code?: string }).code === "ER_BAD_FIELD_ERROR") {
      console.warn("variant_prices column not found - sync will not include variant prices");
      return [];
    }
    throw error;
  }
}

// =============================================================================
// Complex Queries (raw SQL preserved)
// =============================================================================

/**
 * Read sync config for POS.
 * Uses Kysely for module lookup, raw SQL for feature flags.
 */
async function readSyncConfig(companyId: number): Promise<SyncPullResponse["data"]["config"]> {
  const db = getDb();

  const posRow = await db
    .selectFrom("company_modules as cm")
    .innerJoin("modules as m", "m.id", "cm.module_id")
    .where("cm.company_id", "=", companyId)
    .where("m.code", "=", "pos")
    .select(["cm.enabled", "cm.config_json"])
    .executeTakeFirst();

  const [taxRates, defaultTaxRates] = await Promise.all([
    listCompanyTaxRatesKysely(companyId),
    listCompanyDefaultTaxRatesKysely(companyId)
  ]);

  const activeTaxRates = taxRates.filter((rate: { is_active: boolean }) => rate.is_active);
  const defaultTaxRateIds = defaultTaxRates.map((rate: { id: number }) => rate.id);
  const combinedTax = resolveCombinedTaxConfig(defaultTaxRates);

  let taxRate = combinedTax.rate;
  let taxInclusive = combinedTax.inclusive;
  let paymentMethods: Array<string | z.infer<typeof paymentMethodConfigSchema>> = ["CASH"];
  let resolvedPaymentMethods = false;

  if (posRow && posRow.enabled === 1) {
    let parsed: unknown = null;
    try {
      parsed = typeof posRow.config_json === "string" ? JSON.parse(posRow.config_json) : null;
    } catch {
      parsed = null;
    }

    const candidate =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).payment_methods ?? parsed
        : parsed;
    const normalized = normalizePaymentMethods(candidate);
    if (normalized) {
      paymentMethods = normalized;
      resolvedPaymentMethods = true;
    }
  }

  if ((!posRow || (posRow.enabled === 1 && !resolvedPaymentMethods)) && !resolvedPaymentMethods) {
    const legacyPaymentMethods = await readLegacyPaymentMethods(companyId);
    if (legacyPaymentMethods) {
      paymentMethods = legacyPaymentMethods;
    }
  }

  return SyncPullConfigSchema.parse({
    tax: {
      rate: taxRate,
      inclusive: taxInclusive
    },
    tax_rates: activeTaxRates.map((rate: { id: number; code: string; name: string; rate_percent: number; account_id: number | null; is_inclusive: boolean; is_active: boolean }) => ({
      id: rate.id,
      code: rate.code,
      name: rate.name,
      rate_percent: rate.rate_percent,
      account_id: rate.account_id,
      is_inclusive: rate.is_inclusive,
      is_active: rate.is_active
    })),
    default_tax_rate_ids: defaultTaxRateIds,
    payment_methods: paymentMethods
  });
}

/**
 * Read open order sync payload (snapshots + updates).
 * Uses raw SQL due to snapshot/line snapshot queries.
 */
async function readOpenOrderSyncPayload(
  companyId: number,
  outletId: number,
  ordersCursor: number
): Promise<{
  open_orders: SyncPullPayload["open_orders"];
  open_order_lines: SyncPullPayload["open_order_lines"];
  order_updates: SyncPullPayload["order_updates"];
  orders_cursor: number;
}> {
  const db = getDb();

  try {
    const [ordersResult, linesResult, updatesResult] = await Promise.all([
      sql<{
        order_id: string;
        company_id: number;
        outlet_id: number;
        service_type: string;
        source_flow: string | null;
        settlement_flow: string | null;
        table_id: number | null;
        reservation_id: number | null;
        guest_count: number | null;
        is_finalized: number;
        order_status: string;
        order_state: string;
        paid_amount: number;
        opened_at: string;
        closed_at: string | null;
        notes: string | null;
        updated_at: string;
      }>`
        SELECT order_id, company_id, outlet_id, service_type, source_flow, settlement_flow, table_id, reservation_id, guest_count,
                is_finalized, order_status, order_state, paid_amount, opened_at, closed_at, notes, updated_at
         FROM pos_order_snapshots
         WHERE company_id = ${companyId}
           AND outlet_id = ${outletId}
           AND order_state = 'OPEN'
         ORDER BY updated_at DESC
      `.execute(db),
      sql<{
        order_id: string;
        company_id: number;
        outlet_id: number;
        item_id: number;
        sku_snapshot: string | null;
        name_snapshot: string;
        item_type_snapshot: string;
        unit_price_snapshot: number;
        qty: number;
        discount_amount: number;
        variant_id: number | null;
        variant_name_snapshot: string | null;
        updated_at: string;
      }>`
        SELECT order_id, company_id, outlet_id, item_id, sku_snapshot, name_snapshot, item_type_snapshot,
                unit_price_snapshot, qty, discount_amount, variant_id, variant_name_snapshot, updated_at
         FROM pos_order_snapshot_lines
         WHERE company_id = ${companyId}
           AND outlet_id = ${outletId}
      `.execute(db),
      sql<{
        sequence_no: number;
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
      }>`
        SELECT sequence_no, update_id, order_id, company_id, outlet_id, base_order_updated_at, event_type,
                delta_json, actor_user_id, device_id, event_at, created_at
         FROM pos_order_updates
         WHERE company_id = ${companyId}
           AND outlet_id = ${outletId}
           AND sequence_no > ${ordersCursor}
         ORDER BY sequence_no ASC
      `.execute(db)
    ]);

    const orderUpdates = updatesResult.rows.map((row) => ({
      sequence_no: Number(row.sequence_no),
      update_id: String(row.update_id),
      order_id: String(row.order_id),
      company_id: Number(row.company_id),
      outlet_id: Number(row.outlet_id),
      base_order_updated_at: row.base_order_updated_at ? toRfc3339(row.base_order_updated_at) : null,
      event_type: String(row.event_type) as SyncPullPayload["order_updates"][number]["event_type"],
      delta_json: String(row.delta_json),
      actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
      device_id: String(row.device_id),
      event_at: toRfc3339Required(row.event_at),
      created_at: toRfc3339Required(row.created_at)
    }));

    const nextCursor = orderUpdates.length > 0 ? orderUpdates[orderUpdates.length - 1].sequence_no : ordersCursor;

    return {
      open_orders: ordersResult.rows.map((row) => ({
        order_id: String(row.order_id),
        company_id: Number(row.company_id),
        outlet_id: Number(row.outlet_id),
        service_type: String(row.service_type) as SyncPullPayload["open_orders"][number]["service_type"],
        source_flow: row.source_flow == null ? undefined : String(row.source_flow) as SyncPullPayload["open_orders"][number]["source_flow"],
        settlement_flow: row.settlement_flow == null ? undefined : String(row.settlement_flow) as SyncPullPayload["open_orders"][number]["settlement_flow"],
        table_id: row.table_id == null ? null : Number(row.table_id),
        reservation_id: row.reservation_id == null ? null : Number(row.reservation_id),
        guest_count: row.guest_count == null ? null : Number(row.guest_count),
        is_finalized: Number(row.is_finalized) === 1,
        order_status: String(row.order_status) as SyncPullPayload["open_orders"][number]["order_status"],
        order_state: String(row.order_state) as SyncPullPayload["open_orders"][number]["order_state"],
        paid_amount: Number(row.paid_amount),
        opened_at: toRfc3339Required(row.opened_at),
        closed_at: row.closed_at ? toRfc3339(row.closed_at) : null,
        notes: row.notes == null ? null : String(row.notes),
        updated_at: toRfc3339Required(row.updated_at)
      })),
      open_order_lines: linesResult.rows.map((row) => ({
        order_id: String(row.order_id),
        company_id: Number(row.company_id),
        outlet_id: Number(row.outlet_id),
        item_id: Number(row.item_id),
        sku_snapshot: row.sku_snapshot == null ? null : String(row.sku_snapshot),
        name_snapshot: String(row.name_snapshot),
        item_type_snapshot: String(row.item_type_snapshot) as SyncPullPayload["open_order_lines"][number]["item_type_snapshot"],
        unit_price_snapshot: Number(row.unit_price_snapshot),
        qty: Number(row.qty),
        discount_amount: Number(row.discount_amount),
        variant_id: row.variant_id == null ? undefined : Number(row.variant_id),
        variant_name_snapshot: row.variant_name_snapshot == null ? undefined : String(row.variant_name_snapshot),
        updated_at: toRfc3339Required(row.updated_at)
      })),
      order_updates: orderUpdates,
      orders_cursor: nextCursor
    };
  } catch (error) {
    if (isMysqlError(error) && (error as { code?: string }).code === "ER_NO_SUCH_TABLE") {
      return {
        open_orders: [],
        open_order_lines: [],
        order_updates: [],
        orders_cursor: ordersCursor
      };
    }

    throw error;
  }
}

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

/**
 * Format a reservation timestamp to MySQL DATETIME string format (YYYY-MM-DD HH:mm:ss).
 * Kysely may surface DATETIME columns as either Date objects or mysql2 date strings
 * depending on connection mode, so preserve both shapes safely.
 */
function toMySqlDateTime(date: Date | string): string {
  if (typeof date === "string") {
    return date;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// =============================================================================
// Payload Builder
// =============================================================================

/**
 * Build complete POS sync pull payload.
 * This is the main entry point for sync pull.
 */
export async function buildSyncPullPayload(
  companyId: number,
  outletId: number,
  sinceVersion: number,
  ordersCursor: number = 0
): Promise<SyncPullPayload> {
  const currentVersion = await getCompanyDataVersion(companyId);
  const config = await readSyncConfig(companyId);

  if (currentVersion <= sinceVersion) {
    const [openOrderSync, tables, reservations, variants, variantPrices] = await Promise.all([
      readOpenOrderSyncPayload(companyId, outletId, ordersCursor),
      listOutletTables(companyId, outletId),
      listActiveReservations(companyId, outletId),
      getVariantsForSync(companyId, outletId),
      getVariantPricesForSync(companyId, outletId)
    ]);
    return {
      data_version: currentVersion,
      items: [],
      item_groups: [],
      prices: [],
      variant_prices: variantPrices,
      config,
      open_orders: openOrderSync.open_orders,
      open_order_lines: openOrderSync.open_order_lines,
      order_updates: openOrderSync.order_updates,
      orders_cursor: openOrderSync.orders_cursor,
      tables,
      reservations,
      variants
    };
  }

  const [items, effectivePrices, itemGroups, tables, reservations, variants, variantPrices] = await Promise.all([
    listItems(companyId, { isActive: true }),
    listEffectiveItemPricesForOutlet(companyId, outletId, { isActive: true }),
    listItemGroups(companyId),
    listOutletTables(companyId, outletId),
    listActiveReservations(companyId, outletId),
    getVariantsForSync(companyId, outletId),
    getVariantPricesForSync(companyId, outletId)
  ]);

  const [openOrderSync, thumbnailMap] = await Promise.all([
    readOpenOrderSyncPayload(companyId, outletId, ordersCursor),
    getItemThumbnailsBatch(
      companyId,
      items.map((item) => item.id)
    )
  ]);

  return {
    data_version: currentVersion,
    items: items.map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      type: item.type,
      item_group_id: item.item_group_id,
      barcode: item.barcode,
      thumbnail_url: thumbnailMap.get(item.id) ?? null,
      is_active: item.is_active,
      updated_at: item.updated_at
    })),
    item_groups: itemGroups.map((group) => ({
      id: group.id,
      parent_id: group.parent_id,
      code: group.code,
      name: group.name,
      is_active: group.is_active,
      updated_at: group.updated_at
    })),
    prices: effectivePrices.map((price) => ({
      id: price.id,
      item_id: price.item_id,
      outlet_id: price.outlet_id,
      price: price.price,
      is_active: price.is_active,
      updated_at: price.updated_at
    })),
    variant_prices: variantPrices,
    config,
    open_orders: openOrderSync.open_orders,
    open_order_lines: openOrderSync.open_order_lines,
    order_updates: openOrderSync.order_updates,
    orders_cursor: openOrderSync.orders_cursor,
    tables,
    reservations,
    variants
  };
}
