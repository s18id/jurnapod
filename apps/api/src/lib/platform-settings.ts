// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "./db";
import { sql } from "kysely";
import { getAppEnv } from "./env";
import { encrypt, decrypt, type EncryptedPayload } from "./encryption";

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

function buildPlatformSettingsSeedValues(env: ReturnType<typeof getAppEnv>): Record<string, string> {
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

export async function ensurePlatformSettingsSeeded(): Promise<void> {
  const db = getDb();
  const markerRows = await sql<{ key: string }>`
    SELECT \`key\` FROM platform_settings WHERE \`key\` = ${PLATFORM_SETTINGS_SEED_MARKER_KEY} LIMIT 1
  `.execute(db);

  if (markerRows.rows.length > 0) {
    return;
  }

  await db.transaction().execute(async (trx) => {
    const markerRowsInTx = await sql<{ key: string }>`
      SELECT \`key\` FROM platform_settings WHERE \`key\` = ${PLATFORM_SETTINGS_SEED_MARKER_KEY} LIMIT 1
    `.execute(trx);

    if (markerRowsInTx.rows.length > 0) {
      return;
    }

    const env = getAppEnv();
    const seedValues = buildPlatformSettingsSeedValues(env);

    for (const key of PLATFORM_SETTINGS_KEYS) {
      const value = seedValues[key] ?? "";
      if (key === "mailer.smtp.pass" && value.trim().length === 0) {
        continue;
      }

      const isSensitive = isSensitiveKey(key);
      let valueToStore = value;

      if (isSensitive) {
        const encrypted = encrypt(value, env.platformSettings.encryptionKey);
        valueToStore = JSON.stringify(encrypted);
      }

      await sql`
        INSERT IGNORE INTO platform_settings (\`key\`, value_json, is_sensitive, updated_by)
        VALUES (${key}, ${valueToStore}, ${isSensitive ? 1 : 0}, NULL)
      `.execute(trx);
    }

    await sql`
      INSERT IGNORE INTO platform_settings (\`key\`, value_json, is_sensitive, updated_by)
      VALUES (${PLATFORM_SETTINGS_SEED_MARKER_KEY}, "true", 0, NULL)
    `.execute(trx);
  });
}

/**
 * Get a single platform setting by key
 */
export async function getPlatformSetting(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await sql<{ key: string; value_json: string; is_sensitive: number }>`
    SELECT \`key\`, value_json, is_sensitive
    FROM platform_settings
    WHERE \`key\` = ${key}
    LIMIT 1
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }

  const row = rows.rows[0];
  
  if (row.is_sensitive === 1) {
    const env = getAppEnv();
    try {
      const payload = JSON.parse(row.value_json) as EncryptedPayload;
      return decrypt(payload, env.platformSettings.encryptionKey);
    } catch (error) {
      console.error(`Failed to decrypt sensitive setting: ${key}`, error);
      throw new Error(`Failed to decrypt sensitive setting: ${key}`);
    }
  }

  return row.value_json;
}

/**
 * Get all platform settings (masked for sensitive values)
 */
export async function getAllPlatformSettings(): Promise<Record<string, { value: string; is_set: boolean; is_sensitive: boolean }>> {
  const db = getDb();
  const rows = await sql<{ key: string; value_json: string; is_sensitive: number }>`
    SELECT \`key\`, value_json, is_sensitive
    FROM platform_settings
    ORDER BY \`key\` ASC
  `.execute(db);

  const settings: Record<string, { value: string; is_set: boolean; is_sensitive: boolean }> = {};

  for (const row of rows.rows) {
    const isSensitive = row.is_sensitive === 1;
    let value = row.value_json;

    if (isSensitive) {
      // Mask sensitive values in output
      value = "*****";
    }

    settings[row.key] = {
      value,
      is_set: true,
      is_sensitive: isSensitive
    };
  }

  return settings;
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
  const env = getAppEnv();

  await db.transaction().execute(async (trx) => {
    const isSensitive = isSensitiveKey(params.key);
    let valueToStore = params.value;

    // Encrypt sensitive values
    if (isSensitive) {
      const encrypted = encrypt(params.value, env.platformSettings.encryptionKey);
      valueToStore = JSON.stringify(encrypted);
    }

    // Upsert
    await sql`
      INSERT INTO platform_settings (\`key\`, value_json, is_sensitive, updated_by)
      VALUES (${params.key}, ${valueToStore}, ${isSensitive ? 1 : 0}, ${params.updatedBy})
      ON DUPLICATE KEY UPDATE
        value_json = VALUES(value_json),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
    `.execute(trx);
  });
}

/**
 * Set multiple platform settings in a transaction
 */
export async function setBulkPlatformSettings(params: {
  settings: Record<string, string | null>;
  updatedBy: number;
}): Promise<void> {
  const db = getDb();
  const env = getAppEnv();

  await db.transaction().execute(async (trx) => {
    for (const [key, value] of Object.entries(params.settings)) {
      if (key === "mailer.smtp.pass" && (value === "" || value === null)) {
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
        const encrypted = encrypt(value, env.platformSettings.encryptionKey);
        valueToStore = JSON.stringify(encrypted);
      }

      await sql`
        INSERT INTO platform_settings (\`key\`, value_json, is_sensitive, updated_by)
        VALUES (${key}, ${valueToStore}, ${isSensitive ? 1 : 0}, ${params.updatedBy})
        ON DUPLICATE KEY UPDATE
          value_json = VALUES(value_json),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP
      `.execute(trx);
    }
  });
}

/**
 * Delete a platform setting
 */
export async function deletePlatformSetting(key: string): Promise<void> {
  const db = getDb();
  await sql`
    DELETE FROM platform_settings WHERE \`key\` = ${key}
  `.execute(db);
}
