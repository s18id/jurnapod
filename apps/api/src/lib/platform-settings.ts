// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";
import { encrypt, decrypt, isEncryptedPayload, type EncryptedPayload } from "./encryption";

export class PlatformSettingNotFoundError extends Error {}

type PlatformSettingRow = RowDataPacket & {
  id: number;
  key: string;
  value_json: string;
  is_sensitive: number;
  updated_at: Date;
  updated_by: number | null;
  created_at: Date;
};

/**
 * Sensitive setting keys (v1: only SMTP password)
 */
const SENSITIVE_KEYS = new Set(["mailer.smtp.pass"]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key);
}

/**
 * Get a single platform setting by key
 */
export async function getPlatformSetting(key: string): Promise<string | null> {
  const pool = getDbPool();
  const [rows] = await pool.execute<PlatformSettingRow[]>(
    `SELECT \`key\`, value_json, is_sensitive
     FROM platform_settings
     WHERE \`key\` = ?
     LIMIT 1`,
    [key]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  
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
  const pool = getDbPool();
  const [rows] = await pool.execute<PlatformSettingRow[]>(
    `SELECT \`key\`, value_json, is_sensitive
     FROM platform_settings
     ORDER BY \`key\` ASC`
  );

  const env = getAppEnv();
  const settings: Record<string, { value: string; is_set: boolean; is_sensitive: boolean }> = {};

  for (const row of rows) {
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
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const env = getAppEnv();

  try {
    await connection.beginTransaction();

    const isSensitive = isSensitiveKey(params.key);
    let valueToStore = params.value;

    // Encrypt sensitive values
    if (isSensitive) {
      const encrypted = encrypt(params.value, env.platformSettings.encryptionKey);
      valueToStore = JSON.stringify(encrypted);
    }

    // Upsert
    await connection.execute(
      `INSERT INTO platform_settings (\`key\`, value_json, is_sensitive, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         value_json = VALUES(value_json),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [params.key, valueToStore, isSensitive ? 1 : 0, params.updatedBy]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Set multiple platform settings in a transaction
 */
export async function setBulkPlatformSettings(params: {
  settings: Record<string, string>;
  updatedBy: number;
}): Promise<void> {
  const pool = getDbPool();
  const connection = await pool.getConnection();
  const env = getAppEnv();

  try {
    await connection.beginTransaction();

    for (const [key, value] of Object.entries(params.settings)) {
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

      await connection.execute(
        `INSERT INTO platform_settings (\`key\`, value_json, is_sensitive, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           value_json = VALUES(value_json),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
        [key, valueToStore, isSensitive ? 1 : 0, params.updatedBy]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Delete a platform setting
 */
export async function deletePlatformSetting(key: string): Promise<void> {
  const pool = getDbPool();
  await pool.execute(
    `DELETE FROM platform_settings WHERE \`key\` = ?`,
    [key]
  );
}
