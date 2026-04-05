// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";
import {
  SETTINGS_REGISTRY,
  parseSettingValue,
  getSettingDefault,
  type SettingKey,
  type SettingValue,
  type SettingsRegistryEntry,
  InventoryCostingMethodSchema,
} from "@jurnapod/shared";

import type { SettingsPort } from "./port.js";
import { SettingValidationError, InvalidSettingsContextError } from "./port.js";
import { settingsCache } from "./cache.js";

/**
 * Kysely-based implementation of SettingsPort.
 * 
 * Dual-read pattern:
 * 1. Try typed tables (settings_strings, settings_numbers, settings_booleans)
 * 2. Fall back to legacy company_settings table
 * 3. On legacy read, lazy-migrate to typed table
 * 4. Return registry default if not found anywhere
 */
export class KyselySettingsAdapter implements SettingsPort {
  constructor(private readonly db: KyselySchema) {}

  async get<K extends SettingKey>(
    key: K,
    companyId: number,
    options?: { outletId?: number }
  ): Promise<SettingValue> {
    this.validateContext(companyId, options?.outletId);
    const value = await this.resolveInternal<SettingValue>(companyId, key, options?.outletId);
    return value as SettingValue;
  }

  async getMany<K extends SettingKey>(
    keys: readonly K[],
    companyId: number,
    options?: { outletId?: number }
  ): Promise<ReadonlyMap<K, SettingValue>> {
    this.validateContext(companyId, options?.outletId);

    const result = new Map<K, SettingValue>();

    for (const key of keys) {
      const value = await this.resolveInternal<SettingValue>(companyId, key, options?.outletId);
      result.set(key, value as SettingValue);
    }

    return result;
  }

  async resolve<T>(
    companyId: number,
    key: string,
    options?: { outletId?: number; defaultValue?: T }
  ): Promise<T> {
    this.validateContext(companyId, options?.outletId);

    // Check if this is a known SettingKey
    const knownKey = this.tryGetSettingKey(key);
    if (knownKey) {
      const value = await this.resolveInternal<SettingValue>(companyId, knownKey, options?.outletId);
      return value as T;
    }

    // Unknown key - try to resolve from legacy/typed tables, return default or provided default
    const rawValue = await this.getRawValue(companyId, key, options?.outletId);
    if (rawValue !== undefined) {
      return rawValue as T;
    }

    if (options?.defaultValue !== undefined) {
      return options.defaultValue;
    }

    // For unknown keys without defaults, return null
    return null as T;
  }

  private validateContext(companyId: number, outletId?: number): void {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new InvalidSettingsContextError(`Invalid companyId: ${companyId}`);
    }
    if (outletId !== undefined && (!Number.isInteger(outletId) || outletId <= 0)) {
      throw new InvalidSettingsContextError(`Invalid outletId: ${outletId}`);
    }
  }

  private tryGetSettingKey(key: string): SettingKey | undefined {
    // Check if key is a valid SettingKey
    if (key in SETTINGS_REGISTRY) {
      return key as SettingKey;
    }
    return undefined;
  }

  private async resolveInternal<T>(
    companyId: number,
    key: SettingKey,
    outletId?: number
  ): Promise<T> {
    // Check cache first
    const cached = settingsCache.get<T>(companyId, outletId, key);
    if (cached !== undefined) {
      return cached;
    }

    // Try typed tables first
    const typedValue = await this.getFromTypedTables<T>(companyId, key, outletId);
    if (typedValue !== undefined) {
      settingsCache.set(companyId, outletId, key, typedValue);
      return typedValue;
    }

    // Fall back to legacy company_settings
    const legacyValue = await this.getFromLegacyTable<T>(companyId, key, outletId);
    if (legacyValue !== undefined) {
      // Lazy migration: write to typed table
      await this.migrateToTypedTable(companyId, key, legacyValue, outletId);
      settingsCache.set(companyId, outletId, key, legacyValue);
      return legacyValue;
    }

    // Return registry default
    const defaultValue = getSettingDefault(key);
    settingsCache.set(companyId, outletId, key, defaultValue);
    return defaultValue as T;
  }

  private async getFromTypedTables<T>(
    companyId: number,
    key: SettingKey,
    outletId?: number
  ): Promise<T | undefined> {
    const registry = SETTINGS_REGISTRY[key];
    const { valueType } = registry;

    if (outletId !== undefined) {
      // Try outlet-specific first, then company-wide
      const outletValue = await this.queryTypedTable<T>(companyId, key, valueType, outletId);
      if (outletValue !== undefined) {
        return outletValue;
      }
    }

    // Try company-wide (outlet_id IS NULL)
    return this.queryTypedTable<T>(companyId, key, valueType, undefined);
  }

  private async queryTypedTable<T>(
    companyId: number,
    key: SettingKey,
    valueType: string,
    outletId: number | undefined
  ): Promise<T | undefined> {
    switch (valueType) {
      case "boolean":
        return this.queryBooleanSetting(companyId, key, outletId) as Promise<T | undefined>;
      case "int":
        return this.queryNumberSetting(companyId, key, outletId) as Promise<T | undefined>;
      case "enum":
        return this.queryEnumSetting(companyId, key, outletId) as Promise<T | undefined>;
      default:
        return undefined;
    }
  }

  private async queryBooleanSetting(
    companyId: number,
    key: SettingKey,
    outletId: number | undefined
  ): Promise<boolean | undefined> {
    const query = outletId !== undefined
      ? sql<{ setting_value: number }>`
          SELECT setting_value FROM settings_booleans
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
      : sql<{ setting_value: number }>`
          SELECT setting_value FROM settings_booleans
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
          LIMIT 1
        `;

    const rows = await query.execute(this.db);
    if (rows.rows.length === 0) {
      return undefined;
    }
    return rows.rows[0].setting_value === 1;
  }

  private async queryNumberSetting(
    companyId: number,
    key: SettingKey,
    outletId: number | undefined
  ): Promise<number | undefined> {
    const query = outletId !== undefined
      ? sql<{ setting_value: string }>`
          SELECT setting_value FROM settings_numbers
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
      : sql<{ setting_value: string }>`
          SELECT setting_value FROM settings_numbers
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
          LIMIT 1
        `;

    const rows = await query.execute(this.db);
    if (rows.rows.length === 0) {
      return undefined;
    }
    return parseFloat(rows.rows[0].setting_value);
  }

  private async queryEnumSetting(
    companyId: number,
    key: SettingKey,
    outletId: number | undefined
  ): Promise<string | undefined> {
    // Enum values are stored as strings in settings_strings
    const query = outletId !== undefined
      ? sql<{ setting_value: string }>`
          SELECT setting_value FROM settings_strings
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
      : sql<{ setting_value: string }>`
          SELECT setting_value FROM settings_strings
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
          LIMIT 1
        `;

    const rows = await query.execute(this.db);
    if (rows.rows.length === 0) {
      return undefined;
    }
    return rows.rows[0].setting_value;
  }

  private async getFromLegacyTable<T>(
    companyId: number,
    key: SettingKey,
    outletId?: number
  ): Promise<T | undefined> {
    // Query legacy company_settings table
    const query = outletId !== undefined
      ? sql<{ value_json: string; value_type: string }>`
          SELECT value_json, value_type FROM company_settings
          WHERE company_id = ${companyId} AND \`key\` = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
      : sql<{ value_json: string; value_type: string }>`
          SELECT value_json, value_type FROM company_settings
          WHERE company_id = ${companyId} AND \`key\` = ${key} AND outlet_id IS NULL
          LIMIT 1
        `;

    const rows = await query.execute(this.db);
    if (rows.rows.length === 0) {
      return undefined;
    }

    const row = rows.rows[0];
    const rawValue = row.value_json;

    // Parse JSON if needed
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(rawValue);
    } catch {
      // Not JSON - treat as string directly
      parsedValue = rawValue;
    }

    // Validate against registry schema
    try {
      return parseSettingValue(key, parsedValue) as T;
    } catch {
      // Validation failed - return default
      return undefined;
    }
  }

  private async getRawValue(
    companyId: number,
    key: string,
    outletId?: number
  ): Promise<unknown | undefined> {
    // First try typed tables (strings only for unknown keys)
    const stringQuery = outletId !== undefined
      ? sql<{ setting_value: string }>`
          SELECT setting_value FROM settings_strings
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
      : sql<{ setting_value: string }>`
          SELECT setting_value FROM settings_strings
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
          LIMIT 1
        `;

    const stringRows = await stringQuery.execute(this.db);
    if (stringRows.rows.length > 0) {
      return stringRows.rows[0].setting_value;
    }

    // Fall back to legacy
    const legacyQuery = outletId !== undefined
      ? sql<{ value_json: string }>`
          SELECT value_json FROM company_settings
          WHERE company_id = ${companyId} AND \`key\` = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
      : sql<{ value_json: string }>`
          SELECT value_json FROM company_settings
          WHERE company_id = ${companyId} AND \`key\` = ${key} AND outlet_id IS NULL
          LIMIT 1
        `;

    const legacyRows = await legacyQuery.execute(this.db);
    if (legacyRows.rows.length === 0) {
      return undefined;
    }

    const rawValue = legacyRows.rows[0].value_json;
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }

  private async migrateToTypedTable(
    companyId: number,
    key: SettingKey,
    value: unknown,
    outletId?: number
  ): Promise<void> {
    const registry = SETTINGS_REGISTRY[key];
    const { valueType } = registry;

    // Only migrate if value is valid for the type
    try {
      parseSettingValue(key, value);
    } catch {
      // Skip migration if value doesn't match schema
      return;
    }

    const effectiveOutletId = outletId ?? null;

    switch (valueType) {
      case "boolean":
        await sql`
          INSERT IGNORE INTO settings_booleans (company_id, outlet_id, setting_key, setting_value)
          VALUES (${companyId}, ${effectiveOutletId}, ${key}, ${value ? 1 : 0})
        `.execute(this.db);
        break;
      case "int":
        await sql`
          INSERT IGNORE INTO settings_numbers (company_id, outlet_id, setting_key, setting_value)
          VALUES (${companyId}, ${effectiveOutletId}, ${key}, ${String(value)})
        `.execute(this.db);
        break;
      case "enum":
        await sql`
          INSERT IGNORE INTO settings_strings (company_id, outlet_id, setting_key, setting_value)
          VALUES (${companyId}, ${effectiveOutletId}, ${key}, ${String(value)})
        `.execute(this.db);
        break;
    }
  }
}
