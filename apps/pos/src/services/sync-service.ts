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
    const products = response.data.products;
    const config = response.data.config;

    // Upsert products into cache
    const now = new Date().toISOString();
    const productRows = products.map((product) => ({
      pk: `${scope.company_id}:${scope.outlet_id}:${product.item_id}`,
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      item_id: product.item_id,
      sku: product.sku,
      name: product.name,
      item_type: "PRODUCT" as const,
      price_snapshot: product.price,
      is_active: product.is_active,
      item_updated_at: now,
      price_updated_at: now,
      data_version: dataVersion,
      pulled_at: now
    }));

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

    // Update sync scope config if present
    if (config && typeof config === "object") {
      const configObj = config as { tax?: { rate: number; inclusive: boolean }; payment_methods?: string[] };
      await this.storage.upsertSyncScopeConfig({
        pk: `${scope.company_id}:${scope.outlet_id}`,
        company_id: scope.company_id,
        outlet_id: scope.outlet_id,
        data_version: dataVersion,
        tax_rate: configObj.tax?.rate ?? 0,
        tax_inclusive: configObj.tax?.inclusive ?? false,
        payment_methods: configObj.payment_methods ?? ["CASH"],
        updated_at: now
      });
    }

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
