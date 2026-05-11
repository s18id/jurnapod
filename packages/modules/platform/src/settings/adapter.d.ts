import type { KyselySchema } from "@jurnapod/db";
import { type SettingKey, type SettingValue } from "@jurnapod/shared";
import type { SettingsPort } from "./port.js";
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
export declare class KyselySettingsAdapter implements SettingsPort {
    private readonly db;
    constructor(db: KyselySchema);
    get<K extends SettingKey>(key: K, companyId: number, options?: {
        outletId?: number;
    }): Promise<SettingValue>;
    getMany<K extends SettingKey>(keys: readonly K[], companyId: number, options?: {
        outletId?: number;
    }): Promise<ReadonlyMap<K, SettingValue>>;
    resolve<T>(companyId: number, key: string, options?: {
        outletId?: number;
        defaultValue?: T;
    }): Promise<T>;
    private validateContext;
    private tryGetSettingKey;
    private resolveInternal;
    private getFromTypedTables;
    private queryTypedTable;
    private queryBooleanSetting;
    private queryNumberSetting;
    private queryEnumSetting;
    private getRawValue;
}
//# sourceMappingURL=adapter.d.ts.map