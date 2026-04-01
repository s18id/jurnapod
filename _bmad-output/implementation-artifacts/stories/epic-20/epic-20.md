# Epic 20: Schema Consolidation & JSON Normalization

**Status:** backlog  
**Epic Number:** 20  
**Story Count:** 10  
**Total Points:** TBD  
**Priority:** P1  
**Risk:** HIGH (multi-phase migration)  

---

## Overview

Goal: Reduce database from ~98 tables to ~82 tables by normalizing queried JSON columns and merging duplicate tables. This epic addresses long-standing schema technical debt that impacts query performance, maintainability, and type safety.

### Quick Wins (Execute First - LOW Risk)
- **20.5**: Auth throttle merge
- **20.9**: Legacy table drops
- **20.7**: Sync versions merge
- **20.8**: Data import count columns
- **20.3**: Feature flags normalization

### Medium Risk Phase
- **20.6**: Item variant EAV cleanup
- **20.2**: Module configuration normalization
- **20.4**: Mappings consolidation

### Final Phase (HIGH Risk - Execute Last)
- **20.1**: Settings system migration
- **20.10**: Final verification

---

## Tables Impact Summary

### New Tables (7)
| Table | Purpose |
|-------|---------|
| `settings_strings` | Key-value string settings (company_id, outlet_id NULL, key, value) |
| `settings_numbers` | Key-value numeric settings |
| `settings_booleans` | Key-value boolean settings |
| `account_mappings` | Unified account mappings (replaces 4 tables) |
| `payment_method_mappings` | Unified payment method mappings |
| `auth_throttles` | Unified auth throttling (replaces 2 tables) |
| `sync_versions` | Unified sync versioning (replaces 2 tables) |

### Tables to Alter (3)
| Table | Changes |
|-------|---------|
| `company_modules` | Add pos_*, inventory_*, sales_*, purchasing_* columns; drop config_json |
| `feature_flags` | Add rollout_percentage, target_segments, start_at, end_at; drop config_json |
| `data_imports` | Add total_rows, success_count, error_count, warning_count |

### Tables to Drop (16)
| Table | Replacement |
|-------|-------------|
| `company_settings` | settings_strings, settings_numbers, settings_booleans |
| `platform_settings` | settings_strings, settings_numbers, settings_booleans |
| `company_account_mappings` | account_mappings |
| `outlet_account_mappings` | account_mappings |
| `company_payment_method_mappings` | payment_method_mappings |
| `outlet_payment_method_mappings` | payment_method_mappings |
| `auth_login_throttles` | auth_throttles |
| `auth_password_reset_throttles` | auth_throttles |
| `item_variant_attributes` | item_variants.attributes JSON |
| `item_variant_attribute_values` | item_variants.attributes JSON |
| `item_variant_combinations` | item_variants.attributes JSON |
| `sync_data_versions` | sync_versions |
| `sync_tier_versions` | sync_versions |
| `analytics_insights` | (no replacement - unused) |
| `user_outlets` | (no replacement - unused) |
| `sync_operations` | (no replacement - unused) |

---

## Phase 1: Settings System Migration (HIGH Risk)

**Story: 20.1**  
**Risk: HIGH** - Settings touch all modules; execute last after patterns proven

Create three normalized settings tables with typed values:
- `settings_strings (company_id, outlet_id NULL, key, value, updated_at)`
- `settings_numbers (company_id, outlet_id NULL, key, value, updated_at)`
- `settings_booleans (company_id, outlet_id NULL, key, value, updated_at)`

Drop: `company_settings`, `platform_settings`

---

## Phase 2: Module Configuration (MEDIUM Risk)

**Story: 20.2**  
**Risk: MEDIUM**

Add explicit columns to `company_modules`:
- `pos_*`: pos_enabled, pos_offline_mode, pos_receipt_template, etc.
- `inventory_*`: inventory_enabled, inventory_warehouses, etc.
- `sales_*`: sales_enabled, sales_tax_mode, etc.
- `purchasing_*`: purchasing_enabled, purchasing_approval_workflow, etc.

FK constraints for account_id references.  
Drop `config_json` after migration.

---

## Phase 3: Feature Flags (LOW Risk - Quick Win)

**Story: 20.3**  
**Risk: LOW**

Add to `feature_flags`:
- `rollout_percentage (INT DEFAULT 100)`
- `target_segments (JSON)` - array of segment IDs
- `start_at (DATETIME)` - activation date
- `end_at (DATETIME)` - deactivation date

Drop `config_json`.

---

## Phase 4: Mappings Consolidation (MEDIUM Risk)

**Story: 20.4**  
**Risk: MEDIUM**

Create `account_mappings`:
```sql
company_id, outlet_id NULL, mapping_type_id, mapping_key, account_id, created_at, updated_at
```

Create `payment_method_mappings`:
```sql
company_id, outlet_id NULL, method_code, account_id, is_invoice_default, created_at, updated_at
```

Migrate data from 4 old tables, then drop:
- company_account_mappings
- outlet_account_mappings
- company_payment_method_mappings
- outlet_payment_method_mappings

---

## Phase 5: Auth Throttle Merge (LOW Risk - Quick Win)

**Story: 20.5**  
**Risk: LOW**

Create `auth_throttles`:
```sql
key_hash, throttle_type ENUM('login','password_reset'), failure_count, request_count, last_failed_at, last_ip, last_user_agent, created_at, updated_at
```

Migrate from:
- auth_login_throttles
- auth_password_reset_throttles

Drop old tables.

---

## Phase 6: Item Variant EAV Cleanup (MEDIUM Risk)

**Story: 20.6**  
**Risk: MEDIUM**

Alter `item_variants`:
- Add `attributes JSON` column

Migrate EAV data to JSON:
- `item_variant_attributes` → `item_variants.attributes`
- `item_variant_attribute_values` → `item_variants.attributes`
- `item_variant_combinations` → `item_variants.attributes`

Drop: `item_variant_attributes`, `item_variant_attribute_values`, `item_variant_combinations`

---

## Phase 7: Sync Versions Merge (LOW Risk - Quick Win)

**Story: 20.7**  
**Risk: LOW**

Create `sync_versions`:
```sql
company_id, tier NULL, current_version BIGINT, min_version BIGINT, updated_at
```

Migrate from:
- sync_data_versions
- sync_tier_versions

Drop old tables.

---

## Phase 8: Data Import Count Columns (LOW Risk - Quick Win)

**Story: 20.8**  
**Risk: LOW**

Add to `data_imports`:
- `total_rows INT`
- `success_count INT`
- `error_count INT`
- `warning_count INT`

Update `lib/import/batch-operations.ts` to populate counts.

---

## Phase 9: Legacy Table Drops (LOW Risk - Quick Win)

**Story: 20.9**  
**Risk: LOW**

Drop unused tables (verify no data first, archive if exists):
- `analytics_insights`
- `user_outlets`
- `sync_operations`

---

## Phase 10: Final Verification

**Story: 20.10**  
**Risk: MEDIUM**

- Full typecheck (`npm run typecheck -w @jurnapod/api`)
- Build verification (`npm run build -w @jurnapod/api`)
- Critical path tests (`npm run test:unit:critical -w @jurnapod/api`)
- Schema documentation update (`docs/schema/`)

---

## Dependencies

- All stories are independent except:
  - 20.1 (Settings) depends on 20.2-20.9 completing successfully
  - 20.10 depends on all previous stories completing

## Technical Notes

- All migrations must be idempotent/rerunnable
- Use `information_schema` checks for ADD COLUMN IF NOT EXISTS patterns
- MySQL 8.0+ and MariaDB compatible
- No breaking changes to external APIs
- Preserve audit trail for all migrated data
