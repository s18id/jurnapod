// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Runtime Service
 * 
 * Platform-agnostic runtime state management service.
 * Uses port interfaces instead of direct platform dependencies.
 */

import type { PosStoragePort } from "../ports/storage-port.js";
import type { NetworkPort } from "../ports/network-port.js";
import type { ProductCacheRow } from "@jurnapod/offline-db/dexie";

export type RuntimeSyncBadgeState = "Offline" | "Pending" | "Synced";

export interface RuntimeOutletScope {
  company_id: number;
  outlet_id: number;
}

export interface RuntimeOfflineSnapshot {
  pending_outbox_count: number;
  has_product_cache: boolean;
}

export interface RuntimeCheckoutConfig {
  tax: {
    rate: number;
    inclusive: boolean;
  };
  payment_methods: string[];
}

export interface RuntimeProductCatalogItem {
  item_id: number;
  sku: string | null;
  name: string;
  item_type: ProductCacheRow["item_type"];
  item_group_id?: number | null;
  item_group_name?: string | null;
  price_snapshot: number;
}

const DEFAULT_RUNTIME_PAYMENT_METHODS = ["CASH"];
const DEFAULT_RUNTIME_TAX = {
  rate: 0,
  inclusive: false
};

export class RuntimeService {
  constructor(
    private storage: PosStoragePort,
    private network: NetworkPort
  ) {}

  private normalizePaymentMethods(
    paymentMethods: readonly string[]
  ): string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const rawMethod of paymentMethods) {
      const method = rawMethod.trim();
      if (!method || seen.has(method)) {
        continue;
      }

      seen.add(method);
      normalized.push(method);
    }

    if (normalized.length === 0) {
      return [...DEFAULT_RUNTIME_PAYMENT_METHODS];
    }

    return normalized;
  }

  resolveCheckoutConfig(
    config: RuntimeCheckoutConfig | null
  ): RuntimeCheckoutConfig {
    if (!config) {
      return {
        tax: { ...DEFAULT_RUNTIME_TAX },
        payment_methods: [...DEFAULT_RUNTIME_PAYMENT_METHODS]
      };
    }

    const taxRate =
      Number.isFinite(config.tax.rate) && config.tax.rate >= 0
        ? config.tax.rate
        : 0;

    return {
      tax: {
        rate: taxRate,
        inclusive: config.tax.inclusive
      },
      payment_methods: this.normalizePaymentMethods(config.payment_methods)
    };
  }

  isPaymentMethodAllowed(
    method: string,
    paymentMethods: readonly string[]
  ): boolean {
    return this.normalizePaymentMethods(paymentMethods).includes(method);
  }

  resolvePaymentMethod(
    method: string,
    paymentMethods: readonly string[]
  ): string {
    const normalizedMethods = this.normalizePaymentMethods(paymentMethods);
    if (normalizedMethods.includes(method)) {
      return method;
    }

    return normalizedMethods[0];
  }

  async getGlobalDueOutboxCount(): Promise<number> {
    const now = new Date();
    return await this.storage.countGlobalDueOutboxJobs(now);
  }

  isOnline(): boolean {
    return this.network.isOnline();
  }

  onNetworkStatusChange(callback: (online: boolean) => void): () => void {
    return this.network.onStatusChange(callback);
  }

  resolveSyncBadgeState(
    isOnline: boolean,
    pendingOutboxCount: number
  ): RuntimeSyncBadgeState {
    if (!isOnline) {
      return "Offline";
    }

    if (pendingOutboxCount > 0) {
      return "Pending";
    }

    return "Synced";
  }

  async getOfflineSnapshot(
    scope: RuntimeOutletScope
  ): Promise<RuntimeOfflineSnapshot> {
    // Count pending/failed outbox jobs for this scope
    const allPendingJobs = await this.storage.listPendingOutboxJobs(10000);
    const scopedPendingJobs = allPendingJobs.filter(
      (job) =>
        job.company_id === scope.company_id &&
        job.outlet_id === scope.outlet_id
    );

    // Check if product cache exists for this scope
    const products = await this.storage.getProductsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id
    });

    return {
      pending_outbox_count: scopedPendingJobs.length,
      has_product_cache: products.length > 0
    };
  }

  async getProductCatalog(
    scope: RuntimeOutletScope
  ): Promise<RuntimeProductCatalogItem[]> {
    const rows = await this.storage.getProductsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      is_active: true
    });

    rows.sort((left, right) => left.name.localeCompare(right.name));

    return rows.map((row) => ({
      item_id: row.item_id,
      sku: row.sku,
      name: row.name,
      item_type: row.item_type,
      item_group_id: row.item_group_id ?? null,
      item_group_name: row.item_group_name ?? null,
      price_snapshot: row.price_snapshot
    }));
  }
}
