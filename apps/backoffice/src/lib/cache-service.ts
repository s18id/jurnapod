// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { AccountResponse, AccountTypeResponse } from "@jurnapod/shared";

import { apiRequest } from "./api-client";
import { db } from "./offline-db";

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const MODULES_CACHE_TTL_MS = DAY_MS;

export type CacheKeyType =
  | "accounts"
  | "account_types"
  | "items"
  | "item_groups"
  | "item_prices"
  | "modules";

type AccountsResponse = {
  success: true;
  data: AccountResponse[];
};

type AccountTypesResponse = {
  success: true;
  data: AccountTypeResponse[];
};

type ItemsResponse = {
  success: true;
  data: unknown[];
};

type ItemGroupsResponse = {
  success: true;
  data: unknown[];
};

type ItemPricesResponse = {
  success: true;
  data: unknown[];
};

export type CachedModuleConfig = {
  code: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

type CachedPayload<T> = {
  data: T[];
  lastSync: Date;
  expiresAt: Date;
  version: number;
};

let legacyCacheCleared = false;

export function buildCacheKey(
  type: CacheKeyType,
  options: { companyId: number; outletId?: number }
): string {
  if (type === "item_prices") {
    const outletId = options.outletId ?? 0;
    return `item_prices:${options.companyId}:${outletId}`;
  }
  return `${type}:${options.companyId}`;
}

async function clearLegacyCacheKeys(): Promise<void> {
  if (legacyCacheCleared) {
    return;
  }

  const legacyKeys = ["accounts", "account_types", "items", "item_groups", "item_prices", "modules"];
  await Promise.all(legacyKeys.map((key) => db.masterDataCache.delete(key)));

  const allEntries = await db.masterDataCache.toArray();
  const legacyItemPrices = allEntries.filter((entry) => {
    return entry.type.startsWith("item_prices:") && entry.type.split(":").length === 2;
  });

  await Promise.all(legacyItemPrices.map((entry) => db.masterDataCache.delete(entry.type)));
  legacyCacheCleared = true;
}

async function upsertCache<T>(
  type: string,
  payload: T[],
  ttlMs: number
) {
  await clearLegacyCacheKeys();
  const cached = await db.masterDataCache.get(type);
  const version = cached?.version ? cached.version + 1 : 1;
  const now = new Date();
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.masterDataCache.put({
    type,
    data: payload,
    lastSync: now,
    expiresAt,
    version
  });
}

function isCacheValid(cache: CachedPayload<unknown> | undefined): cache is CachedPayload<unknown> {
  if (!cache) return false;
  return new Date(cache.expiresAt).getTime() > Date.now();
}

type CacheOptions = {
  allowStale?: boolean;
};

export class CacheService {
  static async getCachedModules(
    companyId: number,
    options: CacheOptions = {}
  ): Promise<CachedModuleConfig[] | null> {
    const cacheKey = buildCacheKey("modules", { companyId });
    const cached = await db.masterDataCache.get(cacheKey);
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as CachedModuleConfig[];
    }
    return null;
  }

  static async cacheModules(companyId: number, data: CachedModuleConfig[]): Promise<void> {
    const cacheKey = buildCacheKey("modules", { companyId });
    await upsertCache(cacheKey, data, MODULES_CACHE_TTL_MS);
  }

  static async getCachedAccounts(
    companyId: number,
    options: CacheOptions = {}
  ): Promise<AccountResponse[]> {
    const cacheKey = buildCacheKey("accounts", { companyId });
    const cached = await db.masterDataCache.get(cacheKey);
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as AccountResponse[];
    }
    return this.refreshAccounts(companyId);
  }

  static async refreshAccounts(companyId: number): Promise<AccountResponse[]> {
    const params = new URLSearchParams({ company_id: String(companyId), is_active: "true" });
    const response = await apiRequest<AccountsResponse>(`/accounts?${params.toString()}`);
    const cacheKey = buildCacheKey("accounts", { companyId });
    await upsertCache(cacheKey, response.data, DAY_MS);
    return response.data;
  }

  static async cacheAccounts(companyId: number, data: AccountResponse[]): Promise<void> {
    const cacheKey = buildCacheKey("accounts", { companyId });
    await upsertCache(cacheKey, data, DAY_MS);
  }

  static async getCachedAccountTypes(
    companyId: number,
    options: CacheOptions = {}
  ): Promise<AccountTypeResponse[]> {
    const cacheKey = buildCacheKey("account_types", { companyId });
    const cached = await db.masterDataCache.get(cacheKey);
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as AccountTypeResponse[];
    }
    return this.refreshAccountTypes(companyId);
  }

  static async refreshAccountTypes(companyId: number): Promise<AccountTypeResponse[]> {
    const params = new URLSearchParams({ company_id: String(companyId), is_active: "true" });
    const response = await apiRequest<AccountTypesResponse>(`/accounts/types?${params.toString()}`);
    const cacheKey = buildCacheKey("account_types", { companyId });
    await upsertCache(cacheKey, response.data, HALF_DAY_MS);
    return response.data;
  }

  static async cacheAccountTypes(companyId: number, data: AccountTypeResponse[]): Promise<void> {
    const cacheKey = buildCacheKey("account_types", { companyId });
    await upsertCache(cacheKey, data, DAY_MS);
  }

  static async getCachedItems(
    companyId: number,
    options: CacheOptions = {}
  ): Promise<unknown[]> {
    const cacheKey = buildCacheKey("items", { companyId });
    const cached = await db.masterDataCache.get(cacheKey);
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as unknown[];
    }
    return this.refreshItems(companyId);
  }

  static async refreshItems(companyId: number): Promise<unknown[]> {
    const response = await apiRequest<ItemsResponse>("/inventory/items");
    const cacheKey = buildCacheKey("items", { companyId });
    await upsertCache(cacheKey, response.data, HALF_DAY_MS);
    return response.data;
  }

  static async getCachedItemGroups(
    companyId: number,
    options: CacheOptions = {}
  ): Promise<unknown[]> {
    const cacheKey = buildCacheKey("item_groups", { companyId });
    const cached = await db.masterDataCache.get(cacheKey);
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as unknown[];
    }
    return this.refreshItemGroups(companyId);
  }

  static async refreshItemGroups(companyId: number): Promise<unknown[]> {
    const response = await apiRequest<ItemGroupsResponse>("/inventory/item-groups");
    const cacheKey = buildCacheKey("item_groups", { companyId });
    await upsertCache(cacheKey, response.data, HALF_DAY_MS);
    return response.data;
  }

  static async getCachedItemPrices(
    companyId: number,
    outletId: number,
    options: CacheOptions = {}
  ): Promise<unknown[]> {
    const cacheKey = buildCacheKey("item_prices", { companyId, outletId });
    const cached = await db.masterDataCache.get(cacheKey);
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as unknown[];
    }
    return this.refreshItemPrices(companyId, outletId);
  }

  static async refreshItemPrices(
    companyId: number,
    outletId: number
  ): Promise<unknown[]> {
    const response = await apiRequest<ItemPricesResponse>(`/inventory/item-prices?outlet_id=${outletId}`);
    const cacheKey = buildCacheKey("item_prices", { companyId, outletId });
    await upsertCache(cacheKey, response.data, HALF_DAY_MS);
    return response.data;
  }
}

type MasterDataRefreshOptions = {
  companyId: number;
  outletId: number;
};

export function setupMasterDataRefresh(options: MasterDataRefreshOptions): () => void {
  const { companyId, outletId } = options;

  async function runRefresh() {
    await Promise.all([
      CacheService.refreshAccounts(companyId),
      CacheService.refreshAccountTypes(companyId),
      CacheService.refreshItems(companyId),
      CacheService.refreshItemGroups(companyId),
      outletId > 0
        ? CacheService.refreshItemPrices(companyId, outletId)
        : Promise.resolve([])
    ]);
  }

  const handleOnline = () => {
    runRefresh().catch(() => undefined);
  };

  window.addEventListener("online", handleOnline);

  const intervalId = window.setInterval(() => {
    runRefresh().catch(() => undefined);
  }, DAY_MS);

  runRefresh().catch(() => undefined);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.clearInterval(intervalId);
  };
}
