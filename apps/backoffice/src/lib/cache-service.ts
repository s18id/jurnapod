import type { AccountResponse, AccountTypeResponse } from "@jurnapod/shared";
import { apiRequest } from "./api-client";
import { db } from "./offline-db";

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

type AccountsResponse = {
  success: true;
  data: AccountResponse[];
};

type AccountTypesResponse = {
  success: true;
  data: AccountTypeResponse[];
};

type ItemsResponse = {
  ok: true;
  items: unknown[];
};

type ItemPricesResponse = {
  ok: true;
  prices: unknown[];
};

type CachedPayload<T> = {
  data: T[];
  lastSync: Date;
  expiresAt: Date;
  version: number;
};

async function upsertCache<T>(type: "accounts" | "account_types" | "items" | "item_prices", payload: T[], ttlMs: number) {
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
  static async getCachedAccounts(
    companyId: number,
    accessToken: string,
    options: CacheOptions = {}
  ): Promise<AccountResponse[]> {
    const cached = await db.masterDataCache.get("accounts");
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as AccountResponse[];
    }
    return this.refreshAccounts(companyId, accessToken);
  }

  static async refreshAccounts(companyId: number, accessToken: string): Promise<AccountResponse[]> {
    const params = new URLSearchParams({ company_id: String(companyId), is_active: "true" });
    const response = await apiRequest<AccountsResponse>(`/accounts?${params.toString()}`, {}, accessToken);
    await upsertCache("accounts", response.data, DAY_MS);
    return response.data;
  }

  static async cacheAccounts(data: AccountResponse[]): Promise<void> {
    await upsertCache("accounts", data, DAY_MS);
  }

  static async getCachedAccountTypes(
    companyId: number,
    accessToken: string,
    options: CacheOptions = {}
  ): Promise<AccountTypeResponse[]> {
    const cached = await db.masterDataCache.get("account_types");
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as AccountTypeResponse[];
    }
    return this.refreshAccountTypes(companyId, accessToken);
  }

  static async refreshAccountTypes(companyId: number, accessToken: string): Promise<AccountTypeResponse[]> {
    const params = new URLSearchParams({ company_id: String(companyId), is_active: "true" });
    const response = await apiRequest<AccountTypesResponse>(`/accounts/types?${params.toString()}`, {}, accessToken);
    await upsertCache("account_types", response.data, DAY_MS);
    return response.data;
  }

  static async cacheAccountTypes(data: AccountTypeResponse[]): Promise<void> {
    await upsertCache("account_types", data, DAY_MS);
  }

  static async getCachedItems(accessToken: string, options: CacheOptions = {}): Promise<unknown[]> {
    const cached = await db.masterDataCache.get("items");
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as unknown[];
    }
    return this.refreshItems(accessToken);
  }

  static async refreshItems(accessToken: string): Promise<unknown[]> {
    const response = await apiRequest<ItemsResponse>("/inventory/items", {}, accessToken);
    await upsertCache("items", response.items, HALF_DAY_MS);
    return response.items;
  }

  static async getCachedItemPrices(
    outletId: number,
    accessToken: string,
    options: CacheOptions = {}
  ): Promise<unknown[]> {
    const cacheKey = `item_prices:${outletId}`;
    const cached = await db.masterDataCache.get(cacheKey as "item_prices");
    if (cached && (isCacheValid(cached) || options.allowStale)) {
      return cached.data as unknown[];
    }
    return this.refreshItemPrices(outletId, accessToken);
  }

  static async refreshItemPrices(outletId: number, accessToken: string): Promise<unknown[]> {
    const response = await apiRequest<ItemPricesResponse>(`/inventory/item-prices?outlet_id=${outletId}`, {}, accessToken);
    const cacheKey = `item_prices:${outletId}`;
    await db.masterDataCache.put({
      type: cacheKey as "item_prices",
      data: response.prices,
      lastSync: new Date(),
      expiresAt: new Date(Date.now() + HALF_DAY_MS),
      version: 1
    });
    return response.prices;
  }
}

type MasterDataRefreshOptions = {
  companyId: number;
  outletId: number;
  accessToken: string;
};

export function setupMasterDataRefresh(options: MasterDataRefreshOptions): () => void {
  const { companyId, outletId, accessToken } = options;

  async function runRefresh() {
    await Promise.all([
      CacheService.refreshAccounts(companyId, accessToken),
      CacheService.refreshAccountTypes(companyId, accessToken),
      CacheService.refreshItems(accessToken),
      outletId > 0 ? CacheService.refreshItemPrices(outletId, accessToken) : Promise.resolve([])
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
