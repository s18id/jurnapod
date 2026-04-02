// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Platform Settings Adapter for API
 *
 * Thin adapter that delegates to @jurnapod/modules-platform.
 * No business logic here - all logic lives in the platform package.
 *
 * This adapter handles:
 * - Database connection (getDb singleton)
 * - Environment configuration (encryption key)
 */

import { getDb } from "./db";
import { getAppEnv } from "./env";
import {
  ensurePlatformSettingsSeeded as platformEnsureSeeded,
  getPlatformSetting as platformGetSetting,
  getAllPlatformSettings as platformGetAllSettings,
  setPlatformSetting as platformSetSetting,
  setBulkPlatformSettings as platformBulkSetSettings,
  deletePlatformSetting as platformDeleteSetting,
  buildPlatformSettingsSeedValues as platformBuildSeedValues
} from "@jurnapod/modules-platform";



/**
 * Get the encryption key from environment.
 * Kept as separate function for testability.
 */
function getEncryptionKey(): string {
  return getAppEnv().platformSettings.encryptionKey;
}

/**
 * Ensure platform settings are seeded (creates if not exists)
 */
export async function ensurePlatformSettingsSeeded(): Promise<void> {
  const db = getDb();
  const env = getAppEnv();
  const seedValues = platformBuildSeedValues({
    mailer: {
      driver: env.mailer.driver,
      fromName: env.mailer.fromName,
      fromEmail: env.mailer.fromEmail,
      smtp: {
        host: env.mailer.smtp.host,
        port: env.mailer.smtp.port,
        user: env.mailer.smtp.user,
        password: env.mailer.smtp.password,
        secure: env.mailer.smtp.secure,
        tlsRejectUnauthorized: env.mailer.smtp.tlsRejectUnauthorized
      }
    }
  });
  const encryptionKey = getEncryptionKey();
  return platformEnsureSeeded(db, seedValues, encryptionKey);
}

/**
 * Get a single platform setting by key
 */
export async function getPlatformSetting(key: string): Promise<string | null> {
  const db = getDb();
  const encryptionKey = getEncryptionKey();
  return platformGetSetting(db, key, encryptionKey);
}

/**
 * Get all platform settings (masked for sensitive values)
 */
export async function getAllPlatformSettings(): Promise<
  Record<string, { value: string; is_set: boolean; is_sensitive: boolean }>
> {
  const db = getDb();
  return platformGetAllSettings(db);
}

/**
 * Set a platform setting (creates or updates)
 */
export async function setPlatformSetting(params: {
  key: string;
  value: string;
  updatedBy: number;
}): Promise<void> {
  const db = getDb();
  const encryptionKey = getEncryptionKey();
  return platformSetSetting(db, params, encryptionKey);
}

/**
 * Set multiple platform settings in a transaction
 */
export async function setBulkPlatformSettings(params: {
  settings: Record<string, string | null>;
  updatedBy: number;
}): Promise<void> {
  const db = getDb();
  const encryptionKey = getEncryptionKey();
  return platformBulkSetSettings(db, params, encryptionKey);
}

/**
 * Delete a platform setting
 */
export async function deletePlatformSetting(key: string): Promise<void> {
  const db = getDb();
  return platformDeleteSetting(db, key);
}

/**
 * Build platform settings seed values from environment.
 * Exported for testing purposes.
 */
export { platformBuildSeedValues as buildPlatformSettingsSeedValues };
