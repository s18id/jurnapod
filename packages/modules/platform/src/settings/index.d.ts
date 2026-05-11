import type { KyselySchema } from "@jurnapod/db";
export { type EncryptedPayload } from "./encryption.js";
export { type SettingsPort, SettingValidationError, InvalidSettingsContextError } from "./port.js";
export { SettingsCache, settingsCache } from "./cache.js";
export { KyselySettingsAdapter } from "./adapter.js";
export declare class PlatformSettingNotFoundError extends Error {
}
export declare const PLATFORM_SETTINGS_SEED_MARKER_KEY = "platform.settings.seeded";
export declare const PLATFORM_SETTINGS_KEYS: string[];
export declare function isSensitiveKey(key: string): boolean;
/**
 * Build seed values for platform settings from environment configuration.
 * This is a pure function that can be used by the API adapter.
 */
export interface PlatformSettingsSeedConfig {
    mailer: {
        driver: string;
        fromName: string;
        fromEmail: string;
        smtp: {
            host: string;
            port: number;
            user: string;
            password: string;
            secure: boolean;
            tlsRejectUnauthorized: boolean;
        };
    };
}
export declare function buildPlatformSettingsSeedValues(env: PlatformSettingsSeedConfig): Record<string, string>;
/**
 * Platform settings are stored in settings_strings with NULL company_id and NULL outlet_id.
 * Sensitive values are encrypted before storage.
 */
/**
 * Ensure platform settings are seeded in the database.
 * Uses a seed marker to avoid re-seeding on every startup.
 */
export declare function ensurePlatformSettingsSeeded(db: KyselySchema, seedValues: Record<string, string>, encryptionKey: string): Promise<void>;
/**
 * Get a single platform setting by key
 */
export declare function getPlatformSetting(db: KyselySchema, key: string, encryptionKey: string): Promise<string | null>;
/**
 * Get all platform settings (masked for sensitive values)
 */
export declare function getAllPlatformSettings(db: KyselySchema): Promise<Record<string, {
    value: string;
    is_set: boolean;
    is_sensitive: boolean;
}>>;
/**
 * Set a platform setting (creates or updates)
 */
export declare function setPlatformSetting(db: KyselySchema, params: {
    key: string;
    value: string;
    updatedBy: number;
}, encryptionKey: string): Promise<void>;
/**
 * Set multiple platform settings in a transaction
 */
export declare function setBulkPlatformSettings(db: KyselySchema, params: {
    settings: Record<string, string | null>;
    updatedBy: number;
}, encryptionKey: string): Promise<void>;
/**
 * Delete a platform setting
 */
export declare function deletePlatformSetting(db: KyselySchema, key: string): Promise<void>;
//# sourceMappingURL=index.d.ts.map