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

    // Pull data from server
    const response = await this.transport.pull(
      {
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        since_version: sinceVersion
      },
      {
        baseUrl: options?.baseUrl,
        accessToken: options?.accessToken
      }
    );

    const dataVersion = response.data.data_version;
    const items = response.data.items;
    const itemGroups = response.data.item_groups;
    const prices = response.data.prices;
    const config = response.data.config;

    // Build lookup maps
    const now = new Date().toISOString();
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const groupsById = new Map(itemGroups.map((group) => [group.id, group]));

    // Join items with prices for this outlet
    const productRows = prices
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

    await this.storage.upsertProducts(productRows);

    // Update sync metadata
    await this.storage.upsertSyncMetadata({
      pk: `${scope.company_id}:${scope.outlet_id}`,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      last_data_version: dataVersion,
      last_pulled_at: now,
      updated_at: now
    });

    // Update sync scope config
    await this.storage.upsertSyncScopeConfig({
      pk: `${scope.company_id}:${scope.outlet_id}`,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      data_version: dataVersion,
      tax_rate: config.tax.rate,
      tax_inclusive: config.tax.inclusive,
      payment_methods: config.payment_methods,
      updated_at: now
    });

    return {
      data_version: dataVersion,
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
