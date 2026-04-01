// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "./db";
import { sql } from "kysely";
import { toRfc3339Required } from "@jurnapod/shared";

export type SettingValueType = "string" | "number" | "boolean";

export interface CompanySetting {
  id: number;
  company_id: number;
  outlet_id: number | null;
  key: string;
  value_type: SettingValueType;
  value: string | number | boolean | null;
  created_at: string;
  updated_at: string;
}

export interface CompanySettingWithValue extends Omit<CompanySetting, "value_json"> {
  value: string | number | boolean | null;
}

export class SettingNotFoundError extends Error {}
export class SettingValidationError extends Error {}
export class SettingKeyInvalidError extends Error {}

const VALID_VALUE_TYPES: SettingValueType[] = ["string", "number", "boolean"];
const VALID_KEY_REGEX = /^[a-z][a-z0-9_.]{0,62}[a-z0-9]$/;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 65535;

export interface ListSettingsParams {
  companyId: number;
  outletId?: number | null;
  search?: string;
}

export interface GetSettingParams {
  companyId: number;
  key: string;
  outletId?: number | null;
}

export interface SetSettingParams {
  companyId: number;
  key: string;
  value: string | number | boolean;
  valueType: SettingValueType;
  outletId?: number | null;
}

export interface DeleteSettingParams {
  companyId: number;
  key: string;
  outletId?: number | null;
}

function validateKey(key: string): void {
  if (!key || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new SettingKeyInvalidError(`Setting key must be 1-${MAX_KEY_LENGTH} characters`);
  }
  if (!VALID_KEY_REGEX.test(key)) {
    throw new SettingKeyInvalidError(
      "Setting key must start with lowercase letter, contain only lowercase letters, numbers, underscores, and dots, and end with letter or number"
    );
  }
}

function validateValueType(valueType: SettingValueType): void {
  if (!VALID_VALUE_TYPES.includes(valueType)) {
    throw new SettingValidationError(
      `Invalid value type. Must be one of: ${VALID_VALUE_TYPES.join(", ")}`
    );
  }
}

function validateValue(value: unknown, valueType: SettingValueType): void {
  switch (valueType) {
    case "string":
      if (typeof value !== "string") {
        throw new SettingValidationError("String value type requires a string");
      }
      if (value.length > MAX_VALUE_LENGTH) {
        throw new SettingValidationError(`Value exceeds maximum length of ${MAX_VALUE_LENGTH} characters`);
      }
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new SettingValidationError("Number value type requires a finite number");
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new SettingValidationError("Boolean value type requires a boolean");
      }
      break;
    default:
      throw new SettingValidationError(`Unknown value type: ${valueType}`);
  }
}

/**
 * List settings for a company, optionally filtered by outlet.
 * Returns settings from the new typed tables (settings_strings, settings_numbers, settings_booleans).
 */
export async function listSettings(params: ListSettingsParams): Promise<CompanySettingWithValue[]> {
  const db = getDb();
  const { companyId, outletId, search } = params;

  const results: CompanySettingWithValue[] = [];

  // Query settings_strings
  let stringQuery = sql`
    SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
    FROM settings_strings
    WHERE company_id = ${companyId}
  `;

  if (outletId !== undefined) {
    if (outletId === null) {
      stringQuery = sql`${stringQuery} AND outlet_id IS NULL`;
    } else {
      stringQuery = sql`${stringQuery} AND (outlet_id = ${outletId} OR outlet_id IS NULL)`;
    }
  }

  if (search && search.trim()) {
    stringQuery = sql`${stringQuery} AND setting_key LIKE ${`%${search.trim()}%`}`;
  }

  // Order by outlet_id to list outlet-specific settings first, then company-wide
  stringQuery = sql`${stringQuery} ORDER BY CASE WHEN outlet_id IS NULL THEN 1 ELSE 0 END, outlet_id`;

  const stringRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`${stringQuery}`.execute(db);

  for (const row of stringRows.rows) {
    results.push({
      id: row.id,
      company_id: row.company_id,
      outlet_id: row.outlet_id,
      key: row.setting_key,
      value_type: "string",
      value: row.setting_value,
      created_at: toRfc3339Required(row.created_at),
      updated_at: toRfc3339Required(row.updated_at)
    });
  }

  // Query settings_numbers
  let numberQuery = sql`
    SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
    FROM settings_numbers
    WHERE company_id = ${companyId}
  `;

  if (outletId !== undefined) {
    if (outletId === null) {
      numberQuery = sql`${numberQuery} AND outlet_id IS NULL`;
    } else {
      numberQuery = sql`${numberQuery} AND (outlet_id = ${outletId} OR outlet_id IS NULL)`;
    }
  }

  if (search && search.trim()) {
    numberQuery = sql`${numberQuery} AND setting_key LIKE ${`%${search.trim()}%`}`;
  }

  const numberRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`${numberQuery}`.execute(db);

  for (const row of numberRows.rows) {
    results.push({
      id: row.id,
      company_id: row.company_id,
      outlet_id: row.outlet_id,
      key: row.setting_key,
      value_type: "number",
      value: row.setting_value !== null ? parseFloat(row.setting_value) : null,
      created_at: toRfc3339Required(row.created_at),
      updated_at: toRfc3339Required(row.updated_at)
    });
  }

  // Query settings_booleans
  let boolQuery = sql`
    SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
    FROM settings_booleans
    WHERE company_id = ${companyId}
  `;

  if (outletId !== undefined) {
    if (outletId === null) {
      boolQuery = sql`${boolQuery} AND outlet_id IS NULL`;
    } else {
      boolQuery = sql`${boolQuery} AND (outlet_id = ${outletId} OR outlet_id IS NULL)`;
    }
  }

  if (search && search.trim()) {
    boolQuery = sql`${boolQuery} AND setting_key LIKE ${`%${search.trim()}%`}`;
  }

  const boolRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: number; created_at: Date; updated_at: Date }>`${boolQuery}`.execute(db);

  for (const row of boolRows.rows) {
    results.push({
      id: row.id,
      company_id: row.company_id,
      outlet_id: row.outlet_id,
      key: row.setting_key,
      value_type: "boolean",
      value: row.setting_value === 1,
      created_at: toRfc3339Required(row.created_at),
      updated_at: toRfc3339Required(row.updated_at)
    });
  }

  return results;
}

/**
 * Get a single setting by key.
 * When outletId is provided as a number, returns outlet-specific setting if exists,
 * otherwise falls back to company-wide setting (outlet_id IS NULL).
 * When outletId is null/undefined, only queries company-wide settings.
 */
export async function getSetting(params: GetSettingParams): Promise<CompanySettingWithValue | null> {
  const db = getDb();
  const { companyId, key, outletId } = params;

  // Helper to transform a row to CompanySettingWithValue
  const transformStringRow = (row: { id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }): CompanySettingWithValue => ({
    id: row.id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    key: row.setting_key,
    value_type: "string",
    value: row.setting_value,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  });

  const transformNumberRow = (row: { id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }): CompanySettingWithValue => ({
    id: row.id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    key: row.setting_key,
    value_type: "number",
    value: row.setting_value !== null ? parseFloat(row.setting_value) : null,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  });

  const transformBooleanRow = (row: { id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: number; created_at: Date; updated_at: Date }): CompanySettingWithValue => ({
    id: row.id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    key: row.setting_key,
    value_type: "boolean",
    value: row.setting_value === 1,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  });

  // Try strings first
  if (outletId === null) {
    // Only company-wide settings
    const rows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_strings
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (rows.rows.length > 0) return transformStringRow(rows.rows[0]);
  } else if (outletId !== undefined) {
    // Try outlet-specific first
    const outletRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_strings
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
      LIMIT 1
    `.execute(db);
    if (outletRows.rows.length > 0) return transformStringRow(outletRows.rows[0]);
    // Fallback to company-wide
    const companyRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_strings
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (companyRows.rows.length > 0) return transformStringRow(companyRows.rows[0]);
  } else {
    // outletId is undefined - only company-wide
    const rows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_strings
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (rows.rows.length > 0) return transformStringRow(rows.rows[0]);
  }

  // Try numbers
  if (outletId === null) {
    const rows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_numbers
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (rows.rows.length > 0) return transformNumberRow(rows.rows[0]);
  } else if (outletId !== undefined) {
    const outletRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_numbers
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
      LIMIT 1
    `.execute(db);
    if (outletRows.rows.length > 0) return transformNumberRow(outletRows.rows[0]);
    const companyRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_numbers
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (companyRows.rows.length > 0) return transformNumberRow(companyRows.rows[0]);
  } else {
    const rows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_numbers
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (rows.rows.length > 0) return transformNumberRow(rows.rows[0]);
  }

  // Try booleans
  if (outletId === null) {
    const rows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: number; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_booleans
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (rows.rows.length > 0) return transformBooleanRow(rows.rows[0]);
  } else if (outletId !== undefined) {
    const outletRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: number; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_booleans
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
      LIMIT 1
    `.execute(db);
    if (outletRows.rows.length > 0) return transformBooleanRow(outletRows.rows[0]);
    const companyRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: number; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_booleans
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (companyRows.rows.length > 0) return transformBooleanRow(companyRows.rows[0]);
  } else {
    const rows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: number; created_at: Date; updated_at: Date }>`
      SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
      FROM settings_booleans
      WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
      LIMIT 1
    `.execute(db);
    if (rows.rows.length > 0) return transformBooleanRow(rows.rows[0]);
  }

  return null;
}

/**
 * Set a setting value. Creates or updates based on existing value type.
 * Only updates exact matches (does not cascade to company-wide when setting outlet-specific).
 */
export async function setSetting(params: SetSettingParams): Promise<CompanySettingWithValue> {
  const { companyId, key, value, valueType, outletId } = params;

  validateKey(key);
  validateValueType(valueType);
  validateValue(value, valueType);

  // Check for exact match only (no cascade) to determine insert vs update
  const existingExact = await getSettingExact({ companyId, key, outletId });

  if (existingExact) {
    // If type changed, delete from old table and insert to new one
    if (existingExact.value_type !== valueType) {
      // Delete from old table
      await deleteFromTypedTable(companyId, key, existingExact.value_type, outletId);
      // Insert into new table
      await insertToTypedTable(companyId, key, value, valueType, outletId);
    } else {
      // Update in same table
      await updateTypedTable(companyId, key, value, valueType, outletId);
    }
  } else {
    // Insert into appropriate typed table
    await insertToTypedTable(companyId, key, value, valueType, outletId);
  }

  const updated = await getSettingExact({ companyId, key, outletId });
  if (!updated) {
    throw new Error("Setting not found after upsert");
  }

  return updated;
}

/**
 * Get setting by exact match only (no cascade to company-wide).
 * Internal helper for setSetting to avoid updating wrong scope.
 */
async function getSettingExact(params: GetSettingParams): Promise<CompanySettingWithValue | null> {
  const db = getDb();
  const { companyId, key, outletId } = params;

  // Try strings with exact match
  const stringRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
    SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
    FROM settings_strings
    WHERE company_id = ${companyId} AND setting_key = ${key} 
      AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
    LIMIT 1
  `.execute(db);

  if (stringRows.rows.length > 0) {
    const row = stringRows.rows[0];
    return {
      id: row.id,
      company_id: row.company_id,
      outlet_id: row.outlet_id,
      key: row.setting_key,
      value_type: "string",
      value: row.setting_value,
      created_at: toRfc3339Required(row.created_at),
      updated_at: toRfc3339Required(row.updated_at)
    };
  }

  // Try numbers with exact match
  const numberRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: string | null; created_at: Date; updated_at: Date }>`
    SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
    FROM settings_numbers
    WHERE company_id = ${companyId} AND setting_key = ${key}
      AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
    LIMIT 1
  `.execute(db);

  if (numberRows.rows.length > 0) {
    const row = numberRows.rows[0];
    return {
      id: row.id,
      company_id: row.company_id,
      outlet_id: row.outlet_id,
      key: row.setting_key,
      value_type: "number",
      value: row.setting_value !== null ? parseFloat(row.setting_value) : null,
      created_at: toRfc3339Required(row.created_at),
      updated_at: toRfc3339Required(row.updated_at)
    };
  }

  // Try booleans with exact match
  const boolRows = await sql<{ id: number; company_id: number; outlet_id: number | null; setting_key: string; setting_value: number; created_at: Date; updated_at: Date }>`
    SELECT id, company_id, outlet_id, setting_key, setting_value, created_at, updated_at
    FROM settings_booleans
    WHERE company_id = ${companyId} AND setting_key = ${key}
      AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
    LIMIT 1
  `.execute(db);

  if (boolRows.rows.length > 0) {
    const row = boolRows.rows[0];
    return {
      id: row.id,
      company_id: row.company_id,
      outlet_id: row.outlet_id,
      key: row.setting_key,
      value_type: "boolean",
      value: row.setting_value === 1,
      created_at: toRfc3339Required(row.created_at),
      updated_at: toRfc3339Required(row.updated_at)
    };
  }

  return null;
}

/**
 * Delete a setting.
 */
export async function deleteSetting(params: DeleteSettingParams): Promise<void> {
  const { companyId, key, outletId } = params;

  // Try to find the setting to determine its type
  const existing = await getSetting(params);

  if (!existing) {
    throw new SettingNotFoundError(`Setting '${key}' not found`);
  }

  await deleteFromTypedTable(companyId, key, existing.value_type, outletId);
}

/**
 * Get resolved setting (cascade: outlet -> company level).
 */
export async function getResolvedSetting(companyId: number, key: string, outletId?: number): Promise<CompanySettingWithValue | null> {
  if (outletId) {
    const outletSetting = await getSetting({ companyId, key, outletId });
    if (outletSetting) {
      return outletSetting;
    }
  }

  const companySetting = await getSetting({ companyId, key, outletId: null });
  return companySetting;
}

// =============================================================================
// Internal helper functions
// =============================================================================

async function insertToTypedTable(
  companyId: number,
  key: string,
  value: string | number | boolean,
  valueType: SettingValueType,
  outletId: number | null | undefined
): Promise<void> {
  const db = getDb();

  switch (valueType) {
    case "string":
      await sql`
        INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value)
        VALUES (${companyId}, ${outletId ?? null}, ${key}, ${value as string})
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `.execute(db);
      break;
    case "number":
      await sql`
        INSERT INTO settings_numbers (company_id, outlet_id, setting_key, setting_value)
        VALUES (${companyId}, ${outletId ?? null}, ${key}, ${value as number})
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `.execute(db);
      break;
    case "boolean":
      await sql`
        INSERT INTO settings_booleans (company_id, outlet_id, setting_key, setting_value)
        VALUES (${companyId}, ${outletId ?? null}, ${key}, ${value ? 1 : 0})
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `.execute(db);
      break;
  }
}

async function updateTypedTable(
  companyId: number,
  key: string,
  value: string | number | boolean,
  valueType: SettingValueType,
  outletId: number | null | undefined
): Promise<void> {
  const db = getDb();

  switch (valueType) {
    case "string":
      await sql`
        UPDATE settings_strings 
        SET setting_value = ${value as string}
        WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
      `.execute(db);
      break;
    case "number":
      await sql`
        UPDATE settings_numbers 
        SET setting_value = ${value as number}
        WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
      `.execute(db);
      break;
    case "boolean":
      await sql`
        UPDATE settings_booleans 
        SET setting_value = ${value ? 1 : 0}
        WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
      `.execute(db);
      break;
  }
}

async function deleteFromTypedTable(
  companyId: number,
  key: string,
  valueType: SettingValueType,
  outletId: number | null | undefined
): Promise<void> {
  const db = getDb();

  switch (valueType) {
    case "string":
      await sql`
        DELETE FROM settings_strings 
        WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
      `.execute(db);
      break;
    case "number":
      await sql`
        DELETE FROM settings_numbers 
        WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
      `.execute(db);
      break;
    case "boolean":
      await sql`
        DELETE FROM settings_booleans 
        WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id ${outletId === null ? sql`IS NULL` : sql`= ${outletId}`}
      `.execute(db);
      break;
  }
}
