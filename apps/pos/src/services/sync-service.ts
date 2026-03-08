// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Service
 * 
 * Platform-agnostic sync orchestration service.
 * Uses port interfaces instead of direct platform dependencies.
 */

import type { PosStoragePort } from "../ports/storage-port.js";
import type { SyncTransport } from "../ports/sync-transport.js";
import type { RuntimeOutletScope } from "./runtime-service.js";

export interface SyncPullOptions {
  baseUrl?: string;
  accessToken?: string;
}

export interface SyncPullResult {
  data_version: number;
  upserted_product_count: number;
}

export class SyncService {
  constructor(
    private storage: PosStoragePort,
    private transport: SyncTransport
  ) {}

  async pull(
    scope: RuntimeOutletScope,
    options?: SyncPullOptions
  ): Promise<SyncPullResult> {
    // Get current data version
    const currentMetadata = await this.storage.getSyncMetadata(scope);
    const sinceVersion = currentMetadata?.last_data_version;

    // Self-heal for stale metadata: if local active catalog is empty, force full pull.
    const currentActiveProducts = await this.storage.getProductsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      is_active: true
    });
    const requestedSinceVersion = currentActiveProducts.length === 0 ? 0 : sinceVersion;

    // Pull data from server
    const response = await this.transport.pull(
      {
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        since_version: requestedSinceVersion
      },
      {
        baseUrl: options?.baseUrl,
        accessToken: options?.accessToken
      }
    );

    const dataVersion = response.data.data_version;
    const previousDataVersion = currentMetadata?.last_data_version ?? 0;
    const catalogAdvanced = dataVersion > previousDataVersion;

    const items = response.data.items;
    const itemGroups = response.data.item_groups;
    const prices = response.data.prices;
    const config = response.data.config;
    const tables = response.data.tables ?? [];
    const reservations = response.data.reservations ?? [];

    // Build lookup maps
    const now = new Date().toISOString();
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const groupsById = new Map(itemGroups.map((group) => [group.id, group]));

    let productRows: Array<{
      pk: string;
      company_id: number;
      outlet_id: number;
      item_id: number;
      sku: string | null;
      name: string;
      item_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
      item_group_id: number | null;
      item_group_name: string | null;
      price_snapshot: number;
      is_active: boolean;
      item_updated_at: string;
      price_updated_at: string;
      data_version: number;
      pulled_at: string;
    }> = [];

    if (catalogAdvanced) {
      // Join items with prices for this outlet
      productRows = prices
        .filter((price) => price.outlet_id === scope.outlet_id)
        .map((price) => {
          const item = itemsById.get(price.item_id);
          if (!item) {
            return null;
          }

          const groupId = item.item_group_id ?? null;
          const group = groupId ? groupsById.get(groupId) : null;

          return {
            pk: `${scope.company_id}:${scope.outlet_id}:${item.id}`,
            company_id: scope.company_id,
            outlet_id: scope.outlet_id,
            item_id: item.id,
            sku: item.sku,
            name: item.name,
            item_type: item.type,
            item_group_id: groupId,
            item_group_name: group?.name ?? null,
            price_snapshot: price.price,
            is_active: item.is_active && price.is_active,
            item_updated_at: item.updated_at,
            price_updated_at: price.updated_at,
            data_version: dataVersion,
            pulled_at: now
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      // Reconcile stale products: mark previously cached items as inactive
      // if they don't appear in the new payload
      const incomingItemIds = new Set(productRows.map((row) => row.item_id));
      const staleProducts = currentActiveProducts
        .filter((row) => !incomingItemIds.has(row.item_id))
        .map((row) => ({
          ...row,
          is_active: false,
          data_version: dataVersion,
          pulled_at: now
        }));

      // Upsert both new/updated products and stale products
      await this.storage.upsertProducts([...productRows, ...staleProducts]);
    }

    const effectiveDataVersion = catalogAdvanced ? dataVersion : previousDataVersion;

    // Upsert outlet tables
    if (tables.length > 0) {
      const tableRows = tables.map((table) => ({
        pk: `${scope.company_id}:${scope.outlet_id}:${table.table_id}`,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        table_id: table.table_id,
        code: table.code,
        name: table.name,
        zone: table.zone,
        capacity: table.capacity,
        status: table.status,
        updated_at: table.updated_at
      }));
      await this.storage.upsertOutletTables(tableRows);
    }

    // Upsert reservations
    if (reservations.length > 0) {
      const reservationRows = reservations.map((reservation) => ({
        pk: `${scope.company_id}:${scope.outlet_id}:${reservation.reservation_id}`,
        reservation_id: reservation.reservation_id,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        table_id: reservation.table_id,
        customer_name: reservation.customer_name,
        customer_phone: reservation.customer_phone,
        guest_count: reservation.guest_count,
        reservation_at: reservation.reservation_at,
        duration_minutes: reservation.duration_minutes,
        status: reservation.status,
        notes: reservation.notes,
        linked_order_id: reservation.linked_order_id,
        created_at: reservation.updated_at,
        updated_at: reservation.updated_at,
        arrived_at: reservation.arrived_at,
        seated_at: reservation.seated_at,
        cancelled_at: reservation.cancelled_at
      }));
      await this.storage.upsertReservations(reservationRows);
    }

    // Update sync metadata
    await this.storage.upsertSyncMetadata({
      pk: `${scope.company_id}:${scope.outlet_id}`,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      last_data_version: effectiveDataVersion,
      last_pulled_at: now,
      updated_at: now
    });

    // Update sync scope config
    await this.storage.upsertSyncScopeConfig({
      pk: `${scope.company_id}:${scope.outlet_id}`,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      data_version: effectiveDataVersion,
      tax_rate: config.tax.rate,
      tax_inclusive: config.tax.inclusive,
      payment_methods: config.payment_methods,
      updated_at: now
    });

    return {
      data_version: effectiveDataVersion,
      upserted_product_count: productRows.length
    };
  }

  async getSyncDataVersion(scope: RuntimeOutletScope): Promise<number> {
    const metadata = await this.storage.getSyncMetadata(scope);
    return metadata?.last_data_version ?? 0;
  }

  async getSyncConfig(
    scope: RuntimeOutletScope
  ): Promise<{ tax: { rate: number; inclusive: boolean }; payment_methods: string[] } | null> {
    const config = await this.storage.getSyncScopeConfig(scope);
    if (!config) {
      return null;
    }

    return {
      tax: {
        rate: config.tax_rate,
        inclusive: config.tax_inclusive
      },
      payment_methods: config.payment_methods
    };
  }
}
