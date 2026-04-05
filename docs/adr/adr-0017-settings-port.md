# ADR-0017: SettingsPort Architecture

**Date:** 2026-04-05
**Status:** Accepted
**Deciders:** Ahmad, Architect

## Context

Epic 32 (Financial Period Close) requires company settings accessible from module packages. Previously, some code (`fiscal-years.ts`, `inventory-costing`) directly queried the `company_settings` table with raw SQL.

The project already had typed settings tables from Epic 20 (`settings_strings`, `settings_numbers`, `settings_booleans`) but consumers hadn't migrated.

## Decision

We will implement `SettingsPort` in `modules-platform` with:

1. **Interface in `packages/modules/platform/src/settings/port.ts`**
2. **Kysely adapter with dual-read pattern**
3. **30-second TTL cache**
4. **Cascade resolution** (outlet → company → registry default)

### Interface

```typescript
export interface SettingsPort {
  get<K extends SettingKey>(
    key: K,
    companyId: number,
    options?: { outletId?: number }
  ): Promise<SettingValue<K>>;

  getMany<K extends SettingKey>(
    keys: readonly K[],
    companyId: number,
    options?: { outletId?: number }
  ): Promise<ReadonlyMap<K, SettingValue<K>>>;

  resolve<T>(
    companyId: number,
    key: string,
    options?: { outletId?: number; defaultValue?: T }
  ): Promise<T>;
}
```

### Dual-Read Pattern

1. Query typed tables (`settings_strings`, `settings_numbers`, `settings_booleans`) first
2. Fall back to legacy `company_settings` table
3. Lazy-migrate legacy values to typed tables on read
4. Return `SETTINGS_REGISTRY` default if not found anywhere

### Cascade Resolution

- **OUTLET_THEN_COMPANY_THEN_DEFAULT** — Default behavior
- **COMPANY_THEN_DEFAULT** — For non-scoped settings
- **DEFAULT_ONLY** — For deterministic test mode

### Caching

- 30-second TTL LRU cache
- Cache key: `${companyId}:${outletId ?? 'null'}:${key}`
- Invalidated on set/update

## Consequences

**Positive:**
- Module packages no longer need direct SQL to access settings
- Typed values prevent runtime parsing errors
- Cache reduces database load
- Legacy migration happens transparently

**Negative:**
- Additional abstraction layer
- Cache staleness (mitigated by 30s TTL)

**Neutral:**
- Migration path: dual-read allows gradual migration from `company_settings`
