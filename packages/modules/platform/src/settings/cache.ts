// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Simple LRU cache entry with TTL.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Cache key format: `${companyId}:${outletId ?? 'null'}:${key}`
 */
function makeCacheKey(companyId: number, outletId: number | undefined, key: string): string {
  return `${companyId}:${outletId ?? "null"}:${key}`;
}

/**
 * 30-second TTL for settings cache.
 */
const CACHE_TTL_MS = 30_000;

/**
 * Thread-safe LRU-ish cache for settings.
 * Uses Map which maintains insertion order for iteration.
 * TTL prevents stale data from persisting.
 */
export class SettingsCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private accessOrder: string[] = [];

  /**
   * Get a cached value if present and not expired.
   */
  get<T>(companyId: number, outletId: number | undefined, key: string): T | undefined {
    const cacheKey = makeCacheKey(companyId, outletId, key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      // Expired - remove and return undefined
      this.cache.delete(cacheKey);
      this.accessOrder = this.accessOrder.filter((k) => k !== cacheKey);
      return undefined;
    }

    // Update access order (move to end = most recently used)
    this.accessOrder = this.accessOrder.filter((k) => k !== cacheKey);
    this.accessOrder.push(cacheKey);

    return entry.value as T;
  }

  /**
   * Set a value in the cache with TTL.
   */
  set<T>(companyId: number, outletId: number | undefined, key: string, value: T): void {
    const cacheKey = makeCacheKey(companyId, outletId, key);
    const expiresAt = Date.now() + CACHE_TTL_MS;

    this.cache.set(cacheKey, { value, expiresAt });

    // Update access order
    this.accessOrder = this.accessOrder.filter((k) => k !== cacheKey);
    this.accessOrder.push(cacheKey);
  }

  /**
   * Invalidate a specific setting.
   */
  invalidate(companyId: number, outletId: number | undefined, key: string): void {
    const cacheKey = makeCacheKey(companyId, outletId, key);
    this.cache.delete(cacheKey);
    this.accessOrder = this.accessOrder.filter((k) => k !== cacheKey);
  }

  /**
   * Invalidate all settings for a company (outlet-level or company-level).
   */
  invalidateCompany(companyId: number): void {
    const prefix = `${companyId}:`;
    const keysToDelete = this.accessOrder.filter((k) => k.startsWith(prefix));
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    this.accessOrder = this.accessOrder.filter((k) => !k.startsWith(prefix));
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache size (for testing/monitoring).
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Singleton cache instance for settings.
 * Shared across all SettingsPort implementations.
 */
export const settingsCache = new SettingsCache();
