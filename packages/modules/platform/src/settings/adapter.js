// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
import { sql } from "kysely";
import { SETTINGS_REGISTRY, getSettingDefault, } from "@jurnapod/shared";
import { InvalidSettingsContextError } from "./port.js";
import { settingsCache } from "./cache.js";
/**
 * Kysely-based implementation of SettingsPort.
 *
 * Uses typed settings tables only:
 * - settings_strings (string values)
 * - settings_numbers (numeric values)
 * - settings_booleans (boolean values)
 *
 * Falls back to registry defaults if not found in typed tables.
 */
export class KyselySettingsAdapter {
    db;
    constructor(db) {
        this.db = db;
    }
    async get(key, companyId, options) {
        this.validateContext(companyId, options?.outletId);
        const value = await this.resolveInternal(companyId, key, options?.outletId);
        return value;
    }
    async getMany(keys, companyId, options) {
        this.validateContext(companyId, options?.outletId);
        const result = new Map();
        for (const key of keys) {
            const value = await this.resolveInternal(companyId, key, options?.outletId);
            result.set(key, value);
        }
        return result;
    }
    async resolve(companyId, key, options) {
        this.validateContext(companyId, options?.outletId);
        // Check if this is a known SettingKey
        const knownKey = this.tryGetSettingKey(key);
        if (knownKey) {
            const value = await this.resolveInternal(companyId, knownKey, options?.outletId);
            return value;
        }
        // Unknown key - try to resolve from typed tables, return default or provided default
        const rawValue = await this.getRawValue(companyId, key, options?.outletId);
        if (rawValue !== undefined) {
            return rawValue;
        }
        if (options?.defaultValue !== undefined) {
            return options.defaultValue;
        }
        // For unknown keys without defaults, return null
        return null;
    }
    validateContext(companyId, outletId) {
        if (!Number.isInteger(companyId) || companyId <= 0) {
            throw new InvalidSettingsContextError(`Invalid companyId: ${companyId}`);
        }
        if (outletId !== undefined && (!Number.isInteger(outletId) || outletId <= 0)) {
            throw new InvalidSettingsContextError(`Invalid outletId: ${outletId}`);
        }
    }
    tryGetSettingKey(key) {
        // Check if key is a valid SettingKey
        if (key in SETTINGS_REGISTRY) {
            return key;
        }
        return undefined;
    }
    async resolveInternal(companyId, key, outletId) {
        // Check cache first
        const cached = settingsCache.get(companyId, outletId, key);
        if (cached !== undefined) {
            return cached;
        }
        // Try typed tables
        const typedValue = await this.getFromTypedTables(companyId, key, outletId);
        if (typedValue !== undefined) {
            settingsCache.set(companyId, outletId, key, typedValue);
            return typedValue;
        }
        // Return registry default
        const defaultValue = getSettingDefault(key);
        settingsCache.set(companyId, outletId, key, defaultValue);
        return defaultValue;
    }
    async getFromTypedTables(companyId, key, outletId) {
        const registry = SETTINGS_REGISTRY[key];
        const { valueType } = registry;
        if (outletId !== undefined) {
            // Try outlet-specific first, then company-wide
            const outletValue = await this.queryTypedTable(companyId, key, valueType, outletId);
            if (outletValue !== undefined) {
                return outletValue;
            }
        }
        // Try company-wide (outlet_id IS NULL)
        return this.queryTypedTable(companyId, key, valueType, undefined);
    }
    async queryTypedTable(companyId, key, valueType, outletId) {
        switch (valueType) {
            case "boolean":
                return this.queryBooleanSetting(companyId, key, outletId);
            case "int":
                return this.queryNumberSetting(companyId, key, outletId);
            case "enum":
                return this.queryEnumSetting(companyId, key, outletId);
            default:
                return undefined;
        }
    }
    async queryBooleanSetting(companyId, key, outletId) {
        const query = outletId !== undefined
            ? sql `
          SELECT setting_value FROM settings_booleans
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
            : sql `
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
    async queryNumberSetting(companyId, key, outletId) {
        const query = outletId !== undefined
            ? sql `
          SELECT setting_value FROM settings_numbers
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
            : sql `
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
    async queryEnumSetting(companyId, key, outletId) {
        // Enum values are stored as strings in settings_strings
        const query = outletId !== undefined
            ? sql `
          SELECT setting_value FROM settings_strings
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
            : sql `
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
    async getRawValue(companyId, key, outletId) {
        // Try typed tables (strings only for unknown keys)
        const stringQuery = outletId !== undefined
            ? sql `
          SELECT setting_value FROM settings_strings
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id = ${outletId}
          LIMIT 1
        `
            : sql `
          SELECT setting_value FROM settings_strings
          WHERE company_id = ${companyId} AND setting_key = ${key} AND outlet_id IS NULL
          LIMIT 1
        `;
        const stringRows = await stringQuery.execute(this.db);
        if (stringRows.rows.length > 0) {
            return stringRows.rows[0].setting_value;
        }
        return undefined;
    }
}
//# sourceMappingURL=adapter.js.map