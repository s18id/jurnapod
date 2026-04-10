// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import { withTransactionRetry } from "@jurnapod/db";
import { encrypt, decrypt, type EncryptedPayload } from "./encryption.js";

export { type EncryptedPayload } from "./encryption.js";

// SettingsPort types and errors
export { type SettingsPort, SettingValidationError, InvalidSettingsContextError } from "./port.js";

// Cache
export { SettingsCache, settingsCache } from "./cache.js";

// Kysely adapter
export { KyselySettingsAdapter } from "./adapter.js";

export class PlatformSettingNotFoundError extends Error {}

/**
 * Sensitive setting keys (v1: only SMTP password)
 */
const SENSITIVE_KEYS = new Set(["mailer.smtp.pass"]);

export const PLATFORM_SETTINGS_SEED_MARKER_KEY = "platform.settings.seeded";

export const PLATFORM_SETTINGS_KEYS = [
  "mailer.driver",
  "mailer.from_name",
  "mailer.from_email",
  "mailer.smtp.host",
  "mailer.smtp.port",
  "mailer.smtp.user",
  "mailer.smtp.pass",
  "mailer.smtp.secure",
  "mailer.smtp.tls_reject_unauthorized"
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key);
}

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

export function buildPlatformSettingsSeedValues(env: PlatformSettingsSeedConfig): Record<string, string> {
  return {
    "mailer.driver": env.mailer.driver,
    "mailer.from_name": env.mailer.fromName,
    "mailer.from_email": env.mailer.fromEmail,
    "mailer.smtp.host": env.mailer.smtp.host,
    "mailer.smtp.port": String(env.mailer.smtp.port),
    "mailer.smtp.user": env.mailer.smtp.user,
    "mailer.smtp.pass": env.mailer.smtp.password,
    "mailer.smtp.secure": String(env.mailer.smtp.secure),
    "mailer.smtp.tls_reject_unauthorized": String(env.mailer.smtp.tlsRejectUnauthorized)
  };
}

/**
 * Platform settings are stored in settings_strings with NULL company_id and NULL outlet_id.
 * Sensitive values are encrypted before storage.
 */

/**
 * Ensure platform settings are seeded in the database.
 * Uses a seed marker to avoid re-seeding on every startup.
 */
export async function ensurePlatformSettingsSeeded(
  db: KyselySchema,
  seedValues: Record<string, string>,
  encryptionKey: string
): Promise<void> {
  const markerRows = await sql<{ setting_key: string }>`
    SELECT setting_key FROM settings_strings WHERE setting_key = ${PLATFORM_SETTINGS_SEED_MARKER_KEY} AND company_id IS NULL AND outlet_id IS NULL LIMIT 1
  `.execute(db);

  if (markerRows.rows.length > 0) {
    return;
  }

  await withTransactionRetry(db, async (trx) => {
    const markerRowsInTx = await sql<{ setting_key: string }>`
      SELECT setting_key FROM settings_strings WHERE setting_key = ${PLATFORM_SETTINGS_SEED_MARKER_KEY} AND company_id IS NULL AND outlet_id IS NULL LIMIT 1
    `.execute(trx);

    if (markerRowsInTx.rows.length > 0) {
      return;
    }

    for (const key of PLATFORM_SETTINGS_KEYS) {
      const value = seedValues[key] ?? "";
      if (key === "mailer.smtp.pass" && value.trim().length === 0) {
        continue;
      }

      const isSensitive = isSensitiveKey(key);
      let valueToStore = value;

      if (isSensitive) {
        const encrypted = encrypt(value, encryptionKey);
        valueToStore = JSON.stringify(encrypted);
      }

      await sql`
        INSERT IGNORE INTO settings_strings (company_id, outlet_id, setting_key, setting_value)
        VALUES (NULL, NULL, ${key}, ${valueToStore})
      `.execute(trx);
    }

    await sql`
      INSERT IGNORE INTO settings_strings (company_id, outlet_id, setting_key, setting_value)
      VALUES (NULL, NULL, ${PLATFORM_SETTINGS_SEED_MARKER_KEY}, "true")
    `.execute(trx);
  });
}

/**
 * Get a single platform setting by key
 */
export async function getPlatformSetting(
  db: KyselySchema,
  key: string,
  encryptionKey: string
): Promise<string | null> {
  const rows = await sql<{ setting_key: string; setting_value: string }>`
    SELECT setting_key, setting_value
    FROM settings_strings
    WHERE setting_key = ${key} AND company_id IS NULL AND outlet_id IS NULL
    LIMIT 1
  `.execute(db);

  if (rows.rows.length === 0) {
    // Fallback to old platform_settings table if new table is empty
    const legacyRows = await sql<{ key: string; value_json: string; is_sensitive: number }>`
      SELECT \`key\`, value_json, is_sensitive
      FROM platform_settings
      WHERE \`key\` = ${key}
      LIMIT 1
    `.execute(db);

    if (legacyRows.rows.length === 0) {
      return null;
    }

    const row = legacyRows.rows[0];
    if (row.is_sensitive === 1) {
      try {
        const payload = JSON.parse(row.value_json) as EncryptedPayload;
        return decrypt(payload, encryptionKey);
      } catch (error) {
        console.error(`Failed to decrypt sensitive setting: ${key}`, error);
        throw new Error(`Failed to decrypt sensitive setting: ${key}`);
      }
    }
    return row.value_json;
  }

  const row = rows.rows[0];

  // Check if this is a sensitive key that needs decryption
  if (isSensitiveKey(key)) {
    try {
      const payload = JSON.parse(row.setting_value) as EncryptedPayload;
      return decrypt(payload, encryptionKey);
    } catch (error) {
      console.error(`Failed to decrypt sensitive setting: ${key}`, error);
      throw new Error(`Failed to decrypt sensitive setting: ${key}`);
    }
  }

  return row.setting_value;
}

/**
 * Get all platform settings (masked for sensitive values)
 */
export async function getAllPlatformSettings(
  db: KyselySchema
): Promise<Record<string, { value: string; is_set: boolean; is_sensitive: boolean }>> {

  // First try the new settings_strings table
  const rows = await sql<{ setting_key: string; setting_value: string }>`
    SELECT setting_key, setting_value
    FROM settings_strings
    WHERE company_id IS NULL AND outlet_id IS NULL
    ORDER BY setting_key ASC
  `.execute(db);

  const settings: Record<string, { value: string; is_set: boolean; is_sensitive: boolean }> = {};

  for (const row of rows.rows) {
    const isSensitive = isSensitiveKey(row.setting_key);
    let value = row.setting_value;

    if (isSensitive) {
      // Mask sensitive values in output
      value = "*****";
    }

    settings[row.setting_key] = {
      value,
      is_set: true,
      is_sensitive: isSensitive
    };
  }

  // If new table is empty, fall back to legacy platform_settings table
  if (Object.keys(settings).length === 0) {
    const legacyRows = await sql<{ key: string; value_json: string; is_sensitive: number }>`
      SELECT \`key\`, value_json, is_sensitive
      FROM platform_settings
      ORDER BY \`key\` ASC
    `.execute(db);

    for (const row of legacyRows.rows) {
      const isSensitive = row.is_sensitive === 1;
      let value = row.value_json;

      if (isSensitive) {
        value = "*****";
      }

      settings[row.key] = {
        value,
        is_set: true,
        is_sensitive: isSensitive
      };
    }
  }

  return settings;
}

/**
 * Set a platform setting (creates or updates)
 */
export async function setPlatformSetting(
  db: KyselySchema,
  params: {
    key: string;
    value: string;
    updatedBy: number;
  },
  encryptionKey: string
): Promise<void> {

  await withTransactionRetry(db, async (trx) => {
    const isSensitive = isSensitiveKey(params.key);
    let valueToStore = params.value;

    // Encrypt sensitive values
    if (isSensitive) {
      const encrypted = encrypt(params.value, encryptionKey);
      valueToStore = JSON.stringify(encrypted);
    }

    // First try to update in new table
    await sql`
      UPDATE settings_strings
      SET setting_value = ${valueToStore}
      WHERE setting_key = ${params.key} AND company_id IS NULL AND outlet_id IS NULL
    `.execute(trx);

    // If no rows updated, insert
    const updated = await sql<{ cnt: number }>`
      SELECT COUNT(*) as cnt FROM settings_strings
      WHERE setting_key = ${params.key} AND company_id IS NULL AND outlet_id IS NULL
    `.execute(trx);

    if ((updated.rows[0]?.cnt ?? 0) === 0) {
      await sql`
        INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value)
        VALUES (NULL, NULL, ${params.key}, ${valueToStore})
      `.execute(trx);
    }
  });
}

/**
 * Set multiple platform settings in a transaction
 */
export async function setBulkPlatformSettings(
  db: KyselySchema,
  params: {
    settings: Record<string, string | null>;
    updatedBy: number;
  },
  encryptionKey: string
): Promise<void> {

  await withTransactionRetry(db, async (trx) => {
    for (const [key, value] of Object.entries(params.settings)) {
      if (key === "mailer.smtp.pass" && (value === "" || value === null)) {
        // Delete from both tables
        await sql`
          DELETE FROM settings_strings WHERE setting_key = ${key} AND company_id IS NULL AND outlet_id IS NULL
        `.execute(trx);
        await sql`
          DELETE FROM platform_settings WHERE \`key\` = ${key}
        `.execute(trx);
        continue;
      }
      if (value === null) {
        continue;
      }
      // Skip masked values (don't update if user sends "*****")
      if (value === "*****") {
        continue;
      }

      const isSensitive = isSensitiveKey(key);
      let valueToStore = value;

      if (isSensitive) {
        const encrypted = encrypt(value, encryptionKey);
        valueToStore = JSON.stringify(encrypted);
      }

      // Update or insert in new table
      await sql`
        UPDATE settings_strings
        SET setting_value = ${valueToStore}
        WHERE setting_key = ${key} AND company_id IS NULL AND outlet_id IS NULL
      `.execute(trx);

      const updated = await sql<{ cnt: number }>`
        SELECT COUNT(*) as cnt FROM settings_strings
        WHERE setting_key = ${key} AND company_id IS NULL AND outlet_id IS NULL
      `.execute(trx);

      if ((updated.rows[0]?.cnt ?? 0) === 0) {
        await sql`
          INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value)
          VALUES (NULL, NULL, ${key}, ${valueToStore})
        `.execute(trx);
      }
    }
  });
}

/**
 * Delete a platform setting
 */
export async function deletePlatformSetting(
  db: KyselySchema,
  key: string
): Promise<void> {

  // Delete from both tables for safety during migration period
  await sql`
    DELETE FROM settings_strings WHERE setting_key = ${key} AND company_id IS NULL AND outlet_id IS NULL
  `.execute(db);

  await sql`
    DELETE FROM platform_settings WHERE \`key\` = ${key}
  `.execute(db);
}
