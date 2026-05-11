/**
 * Thread-safe LRU-ish cache for settings.
 * Uses Map which maintains insertion order for iteration.
 * TTL prevents stale data from persisting.
 */
export declare class SettingsCache {
    private cache;
    private accessOrder;
    /**
     * Get a cached value if present and not expired.
     */
    get<T>(companyId: number, outletId: number | undefined, key: string): T | undefined;
    /**
     * Set a value in the cache with TTL.
     */
    set<T>(companyId: number, outletId: number | undefined, key: string, value: T): void;
    /**
     * Invalidate a specific setting.
     */
    invalidate(companyId: number, outletId: number | undefined, key: string): void;
    /**
     * Invalidate all settings for a company (outlet-level or company-level).
     */
    invalidateCompany(companyId: number): void;
    /**
     * Clear all cached entries.
     */
    clear(): void;
    /**
     * Get cache size (for testing/monitoring).
     */
    get size(): number;
}
/**
 * Singleton cache instance for settings.
 * Shared across all SettingsPort implementations.
 */
export declare const settingsCache: SettingsCache;
//# sourceMappingURL=cache.d.ts.map