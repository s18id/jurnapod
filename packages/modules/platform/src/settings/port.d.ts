import type { SettingKey, SettingValue } from "@jurnapod/shared";
/**
 * Error thrown when setting validation fails (wrong type in DB).
 */
export declare class SettingValidationError extends Error {
    constructor(key: string, expectedType: string, actualType: string);
}
/**
 * Error thrown when companyId or outletId is invalid.
 */
export declare class InvalidSettingsContextError extends Error {
    constructor(message: string);
}
/**
 * SettingsPort provides typed, cached access to company/outlet settings.
 *
 * It implements a dual-read pattern:
 * 1. Try typed tables (settings_strings, settings_numbers, settings_booleans) first
 * 2. Fall back to legacy company_settings table
 * 3. On legacy read, lazy-migrate to typed table
 * 4. Return typed value from SETTINGS_REGISTRY if not found anywhere
 */
export interface SettingsPort {
    /**
     * Get a single setting by key.
     * Returns the typed value from SETTINGS_REGISTRY if not found.
     *
     * @throws SettingValidationError if setting exists but has wrong type
     * @throws InvalidSettingsContextError if companyId is invalid
     */
    get<K extends SettingKey>(key: K, companyId: number, options?: {
        outletId?: number;
    }): Promise<SettingValue>;
    /**
     * Get multiple settings by keys in a single call.
     * Returns a map of key -> typed value.
     * Missing settings return their registry defaults.
     */
    getMany<K extends SettingKey>(keys: readonly K[], companyId: number, options?: {
        outletId?: number;
    }): Promise<ReadonlyMap<K, SettingValue>>;
    /**
     * Resolve a setting by key with optional default value.
     * If key is not found, returns defaultValue or registry default.
     *
     * @throws InvalidSettingsContextError if companyId is invalid
     */
    resolve<T>(companyId: number, key: string, options?: {
        outletId?: number;
        defaultValue?: T;
    }): Promise<T>;
}
//# sourceMappingURL=port.d.ts.map