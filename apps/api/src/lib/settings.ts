// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDbPool } from "./db";
import type { RowDataPacket } from "mysql2";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";

export type SettingValueType = "string" | "number" | "boolean" | "json";

export interface CompanySetting {
  id: number;
  company_id: number;
  outlet_id: number | null;
  key: string;
  value_type: SettingValueType;
  value_json: string;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CompanySettingWithValue extends Omit<CompanySetting, "value_json"> {
  value: string | number | boolean | Record<string, unknown> | null;
}

export class SettingNotFoundError extends Error {}
export class SettingValidationError extends Error {}
export class SettingKeyInvalidError extends Error {}

const VALID_VALUE_TYPES: SettingValueType[] = ["string", "number", "boolean", "json"];
const VALID_KEY_REGEX = /^[a-z][a-z0-9_]{0,62}[a-z0-9]$/;
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
  value: string | number | boolean | Record<string, unknown>;
  valueType: SettingValueType;
  outletId?: number | null;
  actor: {
    userId: number;
    ipAddress: string;
  };
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
      "Setting key must start with lowercase letter, contain only lowercase letters, numbers, and underscores, and end with letter or number"
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

function serializeValue(value: unknown, valueType: SettingValueType): string {
  // Validate the value matches its declared type
  switch (valueType) {
    case "json":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new SettingValidationError("JSON value type requires a non-array object");
      }
      break;
    case "string":
      if (typeof value !== "string") {
        throw new SettingValidationError("String value type requires a string");
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

  // All values must be stored as valid JSON (database constraint)
  const jsonStr = JSON.stringify(value);
  
  if (jsonStr.length > MAX_VALUE_LENGTH) {
    throw new SettingValidationError(`Value exceeds maximum length of ${MAX_VALUE_LENGTH} characters`);
  }

  return jsonStr;
}

function deserializeValue(valueJson: string, valueType: SettingValueType): string | number | boolean | Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(valueJson);
    
    // Validate the parsed value matches the expected type
    switch (valueType) {
      case "string":
        return typeof parsed === "string" ? parsed : null;
      case "number":
        return typeof parsed === "number" ? parsed : null;
      case "boolean":
        return typeof parsed === "boolean" ? parsed : null;
      case "json":
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function listSettings(params: ListSettingsParams): Promise<CompanySettingWithValue[]> {
  const pool = getDbPool();
  const { companyId, outletId, search } = params;

  let query = `
    SELECT id, company_id, outlet_id, \`key\`, value_type, value_json,
           created_by_user_id, updated_by_user_id, created_at, updated_at
    FROM company_settings
    WHERE company_id = ?
  `;
  const queryParams: (number | string)[] = [companyId];

  if (outletId !== undefined) {
    if (outletId === null) {
      query += ` AND outlet_id IS NULL`;
    } else {
      query += ` AND (outlet_id = ? OR outlet_id IS NULL)`;
      queryParams.push(outletId);
    }
  }

  if (search && search.trim()) {
    query += ` AND \`key\` LIKE ?`;
    queryParams.push(`%${search.trim()}%`);
  }

  query += ` ORDER BY outlet_id DESC, \`key\` ASC`;

  const [rows] = await pool.execute<(CompanySetting & RowDataPacket)[]>(query, queryParams);

  return rows.map((row) => ({
    id: row.id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    key: row.key,
    value_type: row.value_type,
    value: deserializeValue(row.value_json, row.value_type),
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  }));
}

export async function getSetting(params: GetSettingParams): Promise<CompanySettingWithValue | null> {
  const pool = getDbPool();
  const { companyId, key, outletId } = params;

  let query = `
    SELECT id, company_id, outlet_id, \`key\`, value_type, value_json,
           created_by_user_id, updated_by_user_id, created_at, updated_at
    FROM company_settings
    WHERE company_id = ? AND \`key\` = ?
  `;
  const queryParams: (number | string)[] = [companyId, key];

  if (outletId === null) {
    query += ` AND outlet_id IS NULL`;
  } else if (outletId !== undefined) {
    query += ` AND (outlet_id = ? OR outlet_id IS NULL)`;
    queryParams.push(outletId);
  }

  query += ` LIMIT 1`;

  const [rows] = await pool.execute<(CompanySetting & RowDataPacket)[]>(query, queryParams);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    key: row.key,
    value_type: row.value_type,
    value: deserializeValue(row.value_json, row.value_type),
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

export async function setSetting(params: SetSettingParams): Promise<CompanySettingWithValue> {
  const pool = getDbPool();
  const { companyId, key, value, valueType, outletId, actor } = params;

  validateKey(key);
  validateValueType(valueType);

  const valueJson = serializeValue(value, valueType);

  let existingQuery = `SELECT id FROM company_settings WHERE company_id = ? AND \`key\` = ?`;
  const existingParams: (number | string | null)[] = [companyId, key];

  if (outletId === null) {
    existingQuery += ` AND outlet_id IS NULL`;
  } else if (outletId !== undefined) {
    existingQuery += ` AND (outlet_id = ? OR outlet_id IS NULL)`;
    existingParams.push(outletId);
  }

  const [existing] = await pool.execute<(CompanySetting & RowDataPacket)[]>(existingQuery, existingParams);

  if (existing.length > 0) {
    const settingId = existing[0].id;
    await pool.execute(
      `UPDATE company_settings SET value_type = ?, value_json = ?, updated_by_user_id = ?, updated_at = NOW() WHERE id = ?`,
      [valueType, valueJson, actor.userId, settingId]
    );
  } else {
    await pool.execute(
      `INSERT INTO company_settings (company_id, outlet_id, \`key\`, value_type, value_json, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [companyId, outletId ?? null, key, valueType, valueJson, actor.userId, actor.userId]
    );
  }

  const updated = await getSetting({ companyId, key, outletId });
  if (!updated) {
    throw new Error("Setting not found after upsert");
  }

  return updated;
}

export async function deleteSetting(params: DeleteSettingParams): Promise<void> {
  const pool = getDbPool();
  const { companyId, key, outletId } = params;

  let deleteQuery = `DELETE FROM company_settings WHERE company_id = ? AND \`key\` = ?`;
  const deleteParams: (number | string | null)[] = [companyId, key];

  if (outletId === null) {
    deleteQuery += ` AND outlet_id IS NULL`;
  } else if (outletId !== undefined) {
    deleteQuery += ` AND (outlet_id = ? OR outlet_id IS NULL)`;
    deleteParams.push(outletId);
  }

  const [result] = await pool.execute(deleteQuery, deleteParams);

  const affectedRows = (result as { affectedRows: number }).affectedRows;
  if (affectedRows === 0) {
    throw new SettingNotFoundError(`Setting '${key}' not found`);
  }
}

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
